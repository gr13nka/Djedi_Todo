import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, ProjectCardFrame, ProjectFolder, ProjectGridLayout } from '@shared/types';
import {
  DEFAULT_CARD_HEIGHT_PX,
  emptyProjectGridLayout,
  framesBottom,
  groupProjectsForGrid,
  isLegacyProjectGridLayout,
  normalizeProjectGridLayout,
  reconcileProjectGridLayout,
  sanitizeProjectCardFrame,
  topStackingOrder,
  updateProjectFrameInLayout,
} from './projectCardLayout';

type ProjectGridViewport = 'mobile' | 'desktop';
type InteractionKind = 'move' | 'resize';

interface ActiveInteraction {
  kind: InteractionKind;
  projectId: string;
  pointerId: number;
  startX: number;
  startY: number;
  startFrame: ProjectCardFrame;
  moved: boolean;
}

export interface ProjectGridCardModel {
  project: Project;
  rootProps: ProjectCardRootProps;
  resizeHandleProps: ProjectResizeHandleProps;
  frame: ProjectCardFrame;
  isDragging: boolean;
  isResizing: boolean;
}

export interface ProjectCardRootProps {
  role: 'button';
  tabIndex: number;
  style: React.CSSProperties;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export interface ProjectResizeHandleProps {
  type: 'button';
  'aria-label': string;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
}

export interface ProjectGridSection {
  folder: ProjectFolder | null;
  /** Height in pixels the section's canvas needs to contain its cards. */
  height: number;
  cards: ProjectGridCardModel[];
}

interface UseProjectCardLayoutOptions {
  projects: Project[];
  folders: ProjectFolder[];
  value: ProjectGridLayout | null | undefined;
  onChange: (next: ProjectGridLayout) => void | Promise<void>;
  viewport: ProjectGridViewport;
  editable: boolean;
  onActivate: (projectId: string) => void;
}

const DRAG_THRESHOLD_PX = 4;

/** Stand-in for a card the layout has not placed yet; reconcile replaces it on the next pass. */
const FALLBACK_FRAME: ProjectCardFrame = { x: 0, y: 0, w: 0.25, h: DEFAULT_CARD_HEIGHT_PX, z: 0 };

function sameLayout(a: ProjectGridLayout, b: ProjectGridLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useProjectCardLayout({
  projects,
  folders,
  value,
  onChange,
  viewport,
  editable,
  onActivate,
}: UseProjectCardLayoutOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<ActiveInteraction | null>(null);
  const draftRef = useRef<ProjectGridLayout>(value ?? emptyProjectGridLayout());
  const suppressClickRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [draftLayout, setDraftLayout] = useState<ProjectGridLayout>(value ?? emptyProjectGridLayout());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<InteractionKind | null>(null);

  // Every geometry call is against the board's measured width; there is no column grid left.
  const boardWidth = containerWidth;

  useEffect(() => {
    const next = value ?? emptyProjectGridLayout();
    draftRef.current = next;
    setDraftLayout(next);
  }, [value]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateWidth = () => setContainerWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const arrangedLayout = useMemo(
    () => reconcileProjectGridLayout(projects, folders, draftLayout, boardWidth),
    [projects, folders, draftLayout, boardWidth],
  );

  // Cells convert to fractions only against the column count they were written under, and
  // that count is not part of the stored payload — it is whatever the board is wide enough
  // for right now. So a v1 layout is rewritten as v2 at the first measured desktop render,
  // while the board is still the width it was when those cells were saved. Waiting for the
  // next drag would migrate against whatever width the board has by then.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    if (viewport !== 'desktop' || containerWidth <= 0) return;
    if (!isLegacyProjectGridLayout(value)) return;
    migratedRef.current = true;
    void onChange(normalizeProjectGridLayout(value, boardWidth));
  }, [boardWidth, containerWidth, onChange, value, viewport]);

  const commitLayout = useCallback((next: ProjectGridLayout) => {
    draftRef.current = next;
    setDraftLayout(next);
  }, []);

  /** Width the frame's fractions are measured against — the section the card is laid out in. */
  const getBoardWidth = useCallback((target: HTMLElement) => {
    const section = target.closest('[data-project-grid-section]') as HTMLElement | null;
    return section?.clientWidth || containerRef.current?.clientWidth || boardWidth || 1;
  }, [boardWidth]);

  const beginInteraction = useCallback((
    kind: InteractionKind,
    projectId: string,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (!editable || viewport !== 'desktop') return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const saved = arrangedLayout.cards[projectId] ?? FALLBACK_FRAME;
    // Overlap is allowed, so the card being touched has to come to the front — otherwise a
    // card dragged under another one disappears behind it with no way back.
    const frame = { ...saved, z: topStackingOrder(arrangedLayout) };
    activeRef.current = {
      kind,
      projectId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startFrame: frame,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveProjectId(projectId);
    setActiveKind(kind);
  }, [arrangedLayout, editable, viewport]);

  const updateInteraction = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - active.startX;
    const deltaY = event.clientY - active.startY;
    if (!active.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
    active.moved = true;

    // The pointer moves in pixels; the frame stores width as a fraction of the board.
    const width = getBoardWidth(event.currentTarget);
    const fractionDelta = deltaX / width;

    const desired = active.kind === 'move'
      ? {
          ...active.startFrame,
          x: active.startFrame.x + fractionDelta,
          y: active.startFrame.y + deltaY,
        }
      : {
          ...active.startFrame,
          w: active.startFrame.w + fractionDelta,
          h: active.startFrame.h + deltaY,
        };

    const nextFrame = sanitizeProjectCardFrame(desired, width);
    commitLayout(updateProjectFrameInLayout(draftRef.current, active.projectId, nextFrame, width));
  }, [commitLayout, getBoardWidth]);

  const endInteraction = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (active.moved) {
      suppressClickRef.current = true;
      const next = reconcileProjectGridLayout(projects, folders, draftRef.current, boardWidth);
      commitLayout(next);
      void onChange(next);
    }

    activeRef.current = null;
    setActiveProjectId(null);
    setActiveKind(null);
  }, [boardWidth, commitLayout, folders, onChange, projects]);

  const sections = useMemo<ProjectGridSection[]>(() => {
    const grouped = groupProjectsForGrid(projects, folders);
    return grouped.map((section) => ({
      folder: section.folder,
      // An absolutely-placed card no longer stretches its container, so the canvas has to be
      // told how tall the cards in it reach.
      height: framesBottom(
        section.projects.map((project) => arrangedLayout.cards[project.id] ?? FALLBACK_FRAME),
      ),
      cards: section.projects.map((project) => {
        const frame = arrangedLayout.cards[project.id] ?? FALLBACK_FRAME;
        const isDragging = activeProjectId === project.id && activeKind === 'move';
        const isResizing = activeProjectId === project.id && activeKind === 'resize';
        const desktopStyle: React.CSSProperties = viewport === 'desktop'
          ? {
              position: 'absolute',
              left: `${frame.x * 100}%`,
              top: frame.y,
              width: `${frame.w * 100}%`,
              height: frame.h,
              zIndex: frame.z,
            }
          : {};

        return {
          project,
          frame,
          isDragging,
          isResizing,
          rootProps: {
            role: 'button',
            tabIndex: 0,
            style: desktopStyle,
            onPointerDown: (event) => beginInteraction('move', project.id, event),
            onPointerMove: updateInteraction,
            onPointerUp: endInteraction,
            onPointerCancel: endInteraction,
            onClick: () => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onActivate(project.id);
            },
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onActivate(project.id);
              }
            },
          },
          resizeHandleProps: {
            type: 'button',
            'aria-label': 'Resize project card',
            onPointerDown: (event) => beginInteraction('resize', project.id, event),
            onPointerMove: updateInteraction,
            onPointerUp: endInteraction,
            onPointerCancel: endInteraction,
            onClick: (event) => event.stopPropagation(),
          },
        };
      }),
    }));
  }, [activeKind, activeProjectId, arrangedLayout.cards, beginInteraction, endInteraction, folders, onActivate, projects, updateInteraction, viewport]);

  const resetLayout = useCallback((projectId?: string) => {
    const current = { ...draftRef.current.cards };
    if (projectId) delete current[projectId];
    else {
      for (const key of Object.keys(current)) delete current[key];
    }
    const next = reconcileProjectGridLayout(
      projects,
      folders,
      { version: 2, cards: current, folders: draftRef.current.folders },
      boardWidth,
    );
    if (!sameLayout(next, draftRef.current)) {
      commitLayout(next);
      void onChange(next);
    }
  }, [boardWidth, commitLayout, folders, onChange, projects]);

  return {
    containerProps: {
      ref: containerRef,
    },
    sections,
    resetLayout,
  };
}
