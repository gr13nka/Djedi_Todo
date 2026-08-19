import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, ProjectCardFrame, ProjectFolder, ProjectGridLayout } from '@shared/types';
import {
  CARD_LAYER_BASE,
  DEFAULT_CARD_HEIGHT_PX,
  PROJECT_CARD_GAP_PX,
  ZONE_LABEL_PX,
  applyFramesToLayout,
  appendProjectCardFrame,
  emptyProjectGridLayout,
  folderZoneAtPoint,
  framesBottom,
  frameContainsPoint,
  groupProjectsForGrid,
  isLegacyProjectGridLayout,
  normalizeProjectGridLayout,
  placeCardInZone,
  reconcileProjectGridLayout,
  sanitizeProjectCardFrame,
  topCardStackingOrder,
  topZoneStackingOrder,
} from './projectCardLayout';

type ProjectGridViewport = 'mobile' | 'desktop';
type InteractionKind = 'move' | 'resize' | 'zone-move' | 'zone-resize';

interface ActiveInteraction {
  kind: InteractionKind;
  /** Project id for a card, folder id for a zone. */
  targetId: string;
  pointerId: number;
  startX: number;
  startY: number;
  startFrame: ProjectCardFrame;
  /** Cards riding along with a zone being moved, at the frames they started from. */
  passengers: Array<{ projectId: string; frame: ProjectCardFrame }>;
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

export interface ProjectZoneModel {
  folder: ProjectFolder;
  frame: ProjectCardFrame;
  style: React.CSSProperties;
  rootProps: ProjectZoneRootProps;
  resizeHandleProps: ProjectResizeHandleProps;
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

export interface ProjectZoneRootProps {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
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

export interface ProjectFolderMove {
  projectId: string;
  folderId: string | null;
}

export interface ProjectGridSection {
  folder: ProjectFolder | null;
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
  /** Called when a drop puts cards in different folders than the ones they record. */
  onFolderChange: (moves: ProjectFolderMove[]) => void | Promise<void>;
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
  onFolderChange,
}: UseProjectCardLayoutOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<ActiveInteraction | null>(null);
  const draftRef = useRef<ProjectGridLayout>(value ?? emptyProjectGridLayout());
  const suppressClickRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [draftLayout, setDraftLayout] = useState<ProjectGridLayout>(value ?? emptyProjectGridLayout());
  const [activeId, setActiveId] = useState<string | null>(null);
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

  /**
   * Folder changes the board has asked for but not yet seen come back through the live query.
   * A card in here is skipped by the correction below, which would otherwise yank it back to
   * its old zone for the one render between the drop and the write landing.
   */
  const pendingFolderRef = useRef(new Map<string, string | null>());

  const requestFolderChanges = useCallback((moves: ProjectFolderMove[]) => {
    if (!moves.length) return;
    for (const move of moves) pendingFolderRef.current.set(move.projectId, move.folderId);
    void onFolderChange(moves);
  }, [onFolderChange]);

  /** Membership as the board reads it: the zone under each card's top-left corner. */
  const folderIdForFrame = useCallback((frame: ProjectCardFrame, layout: ProjectGridLayout) => {
    return folderZoneAtPoint(layout.folders, frame.x, frame.y);
  }, []);

  /**
   * `folderId` is the synced truth and the coordinates are local, so a folder change made
   * anywhere else — the tree, the phone, a vault sync — has to pull the card into the zone
   * that now owns it. Without this the board would keep showing a card inside a folder it no
   * longer belongs to.
   */
  useEffect(() => {
    if (viewport !== 'desktop' || boardWidth <= 0) return;

    const pending = pendingFolderRef.current;
    const corrections: Record<string, ProjectCardFrame> = {};
    const zoneFill = new Map<string | null, number>();

    for (const project of projects) {
      if (project.isArchived) continue;
      const folderId = project.folderId ?? null;
      zoneFill.set(folderId, (zoneFill.get(folderId) ?? 0) + 1);
    }

    for (const project of projects) {
      if (project.isArchived) continue;
      const folderId = project.folderId ?? null;

      if (pending.has(project.id)) {
        if (pending.get(project.id) === folderId) pending.delete(project.id);
        continue;
      }

      const frame = arrangedLayout.cards[project.id];
      if (!frame) continue;
      if (folderIdForFrame(frame, arrangedLayout) === folderId) continue;

      const zone = folderId ? arrangedLayout.folders[folderId] : undefined;
      if (zone) {
        const slot = Object.keys(corrections).length;
        corrections[project.id] = { ...placeCardInZone(zone, slot, boardWidth), z: frame.z, w: frame.w, h: frame.h };
      } else {
        // Unfiled now: drop it clear of every zone rather than leave it sitting inside one.
        const below = framesBottom(Object.values(arrangedLayout.folders));
        corrections[project.id] = {
          ...appendProjectCardFrame(Object.keys(corrections).length, below + PROJECT_CARD_GAP_PX, frame.z, boardWidth),
          w: frame.w,
          h: frame.h,
        };
      }
    }

    if (!Object.keys(corrections).length) return;
    const next = applyFramesToLayout(draftRef.current, { cards: corrections }, boardWidth);
    commitLayout(next);
    void onChange(next);
  }, [arrangedLayout, boardWidth, commitLayout, folderIdForFrame, onChange, projects, viewport]);

  /** Width the frame's fractions are measured against. */
  const getBoardWidth = useCallback(() => {
    return containerRef.current?.clientWidth || boardWidth || 1;
  }, [boardWidth]);

  const beginInteraction = useCallback((
    kind: InteractionKind,
    targetId: string,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (!editable || viewport !== 'desktop') return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const isZone = kind === 'zone-move' || kind === 'zone-resize';
    const saved = (isZone ? arrangedLayout.folders[targetId] : arrangedLayout.cards[targetId]) ?? FALLBACK_FRAME;
    // Overlap is allowed, so whatever is being touched has to come to the front of its layer;
    // otherwise something dragged underneath disappears with no way to get it back.
    const startFrame = {
      ...saved,
      z: isZone ? topZoneStackingOrder(arrangedLayout) : topCardStackingOrder(arrangedLayout),
    };

    // Moving a zone carries its cards, so that repositioning a frame never silently rewrites
    // which folder those cards are in.
    const passengers = kind === 'zone-move'
      ? Object.entries(arrangedLayout.cards)
          .filter(([, frame]) => frameContainsPoint(saved, frame.x, frame.y))
          .map(([projectId, frame]) => ({ projectId, frame }))
      : [];

    activeRef.current = {
      kind,
      targetId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startFrame,
      passengers,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveId(targetId);
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
    const width = getBoardWidth();
    const fractionDelta = deltaX / width;
    const moving = active.kind === 'move' || active.kind === 'zone-move';

    const desired = moving
      ? { ...active.startFrame, x: active.startFrame.x + fractionDelta, y: active.startFrame.y + deltaY }
      : { ...active.startFrame, w: active.startFrame.w + fractionDelta, h: active.startFrame.h + deltaY };
    const nextFrame = sanitizeProjectCardFrame(desired, width);

    const cards: Record<string, ProjectCardFrame> = {};
    const zones: Record<string, ProjectCardFrame> = {};
    if (active.kind === 'move' || active.kind === 'resize') {
      cards[active.targetId] = nextFrame;
    } else {
      zones[active.targetId] = nextFrame;
      for (const passenger of active.passengers) {
        cards[passenger.projectId] = sanitizeProjectCardFrame({
          ...passenger.frame,
          x: passenger.frame.x + (nextFrame.x - active.startFrame.x),
          y: passenger.frame.y + (nextFrame.y - active.startFrame.y),
        }, width);
      }
    }

    commitLayout(applyFramesToLayout(draftRef.current, { cards, folders: zones }, width));
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

      // Geometry decides membership, so every drop is read back the same way — whether a card
      // was dragged into a zone or a zone was dragged around cards. Passengers keep their
      // folder for free: they moved with the zone, so they are still inside it.
      const moves: ProjectFolderMove[] = [];
      for (const project of projects) {
        if (project.isArchived) continue;
        const frame = next.cards[project.id];
        if (!frame) continue;
        const derived = folderIdForFrame(frame, next);
        if (derived === (project.folderId ?? null)) continue;
        moves.push({ projectId: project.id, folderId: derived });
      }
      requestFolderChanges(moves);
    }

    activeRef.current = null;
    setActiveId(null);
    setActiveKind(null);
  }, [boardWidth, commitLayout, folderIdForFrame, folders, onChange, projects, requestFolderChanges]);

  const cards = useMemo<ProjectGridCardModel[]>(() => {
    return projects.filter((project) => !project.isArchived).map((project) => {
      const frame = arrangedLayout.cards[project.id] ?? FALLBACK_FRAME;
      const isDragging = activeId === project.id && activeKind === 'move';
      const isResizing = activeId === project.id && activeKind === 'resize';
      const desktopStyle: React.CSSProperties = viewport === 'desktop'
        ? {
            position: 'absolute',
            left: `${frame.x * 100}%`,
            top: frame.y,
            width: `${frame.w * 100}%`,
            height: frame.h,
            zIndex: CARD_LAYER_BASE + frame.z,
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
    });
  }, [activeId, activeKind, arrangedLayout.cards, beginInteraction, endInteraction, onActivate, projects, updateInteraction, viewport]);

  const zones = useMemo<ProjectZoneModel[]>(() => {
    if (viewport !== 'desktop') return [];
    return folders
      .filter((folder) => arrangedLayout.folders[folder.id])
      .map((folder) => {
        const frame = arrangedLayout.folders[folder.id];
        return {
          folder,
          frame,
          isDragging: activeId === folder.id && activeKind === 'zone-move',
          isResizing: activeId === folder.id && activeKind === 'zone-resize',
          style: {
            position: 'absolute',
            left: `${frame.x * 100}%`,
            top: frame.y,
            width: `${frame.w * 100}%`,
            height: frame.h,
            zIndex: frame.z,
          },
          rootProps: {
            onPointerDown: (event) => beginInteraction('zone-move', folder.id, event),
            onPointerMove: updateInteraction,
            onPointerUp: endInteraction,
            onPointerCancel: endInteraction,
          },
          resizeHandleProps: {
            type: 'button',
            'aria-label': 'Resize folder zone',
            onPointerDown: (event) => beginInteraction('zone-resize', folder.id, event),
            onPointerMove: updateInteraction,
            onPointerUp: endInteraction,
            onPointerCancel: endInteraction,
            onClick: (event) => event.stopPropagation(),
          },
        };
      });
  }, [activeId, activeKind, arrangedLayout.folders, beginInteraction, endInteraction, folders, updateInteraction, viewport]);

  const boardHeight = useMemo(() => {
    const frames = [...Object.values(arrangedLayout.cards), ...Object.values(arrangedLayout.folders)];
    return framesBottom(frames);
  }, [arrangedLayout]);

  /** Folder grouping, which the narrow board still lays out by. */
  const sections = useMemo<ProjectGridSection[]>(() => {
    const byId = new Map(cards.map((card) => [card.project.id, card]));
    return groupProjectsForGrid(projects, folders).map((section) => ({
      folder: section.folder,
      cards: section.projects.map((project) => byId.get(project.id)).filter(Boolean) as ProjectGridCardModel[],
    }));
  }, [cards, folders, projects]);

  const resetLayout = useCallback((projectId?: string) => {
    const current = { ...draftRef.current.cards };
    const zoneFrames = projectId ? draftRef.current.folders : {};
    if (projectId) delete current[projectId];
    else {
      for (const key of Object.keys(current)) delete current[key];
    }
    const next = reconcileProjectGridLayout(
      projects,
      folders,
      { version: 2, cards: current, folders: zoneFrames },
      boardWidth,
    );
    if (!sameLayout(next, draftRef.current)) {
      commitLayout(next);
      void onChange(next);
    }
  }, [boardWidth, commitLayout, folders, onChange, projects]);

  return {
    containerProps: { ref: containerRef },
    cards,
    zones,
    boardHeight,
    sections,
    zoneLabelHeight: ZONE_LABEL_PX,
    resetLayout,
  };
}
