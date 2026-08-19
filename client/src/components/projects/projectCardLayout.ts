import type { Project, ProjectCardFrame, ProjectFolder, ProjectGridLayout } from '@shared/types';

export const PROJECT_CARD_GAP_PX = 12;
export const PROJECT_CARD_ROW_PX = 72;

/** Distance from one card's top edge to the next one's, back when rows were a fixed step. */
const ROW_STEP_PX = PROJECT_CARD_ROW_PX + PROJECT_CARD_GAP_PX;

/**
 * Fractions that came out of cell arithmetic land on each other's edges, so a strict
 * comparison would report neighbours as overlapping. Anything thinner than this is contact,
 * not overlap.
 */
const TOUCH_EPSILON = 1e-6;

export interface ProjectGridSectionModel {
  folder: ProjectFolder | null;
  projects: Project[];
}

export interface ProjectCardFrameInput {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
}

/**
 * A rectangle in the retired cell grid. Frames are stored as fractions now; cells survive
 * only as the unit the board still snaps to and as the shape v1 layouts are read in.
 */
export interface ProjectGridCell {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

interface LegacyProjectGridLayout {
  version?: unknown;
  desktop?: Record<string, ProjectGridCell | undefined>;
}

export function getProjectGridColumnCount(width: number, viewport: 'mobile' | 'desktop'): number {
  if (viewport === 'mobile') return 2;
  if (width >= 1120) return 4;
  if (width >= 820) return 3;
  return 2;
}

export function emptyProjectGridLayout(): ProjectGridLayout {
  return { version: 2, cards: {}, folders: {} };
}

function toFinite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeProjectCardFrame(
  frame: ProjectCardFrameInput | undefined,
  columns: number,
): ProjectCardFrame {
  const minWidth = 1 / Math.max(1, columns);
  const w = clampNumber(toFinite(frame?.w, minWidth), minWidth, 1);
  return {
    x: clampNumber(toFinite(frame?.x, 0), 0, Math.max(0, 1 - w)),
    y: Math.max(0, toFinite(frame?.y, 0)),
    w,
    h: Math.max(PROJECT_CARD_ROW_PX, toFinite(frame?.h, PROJECT_CARD_ROW_PX)),
    z: Math.max(0, Math.round(toFinite(frame?.z, 0))),
  };
}

/** Snap a frame onto the cell grid the board still renders through. */
export function projectCardFrameToGridCell(frame: ProjectCardFrame, columns: number): ProjectGridCell {
  const cols = Math.max(1, columns);
  const colSpan = clampNumber(Math.round(frame.w * cols), 1, cols);
  return {
    col: clampNumber(Math.round(frame.x * cols), 0, cols - colSpan),
    row: Math.max(0, Math.round(frame.y / ROW_STEP_PX)),
    colSpan,
    rowSpan: Math.max(1, Math.round((frame.h + PROJECT_CARD_GAP_PX) / ROW_STEP_PX)),
  };
}

/** The exact inverse of {@link projectCardFrameToGridCell}, so v1 layouts migrate in place. */
export function projectCardFrameFromGridCell(
  cell: ProjectGridCell | undefined,
  columns: number,
  z: number,
): ProjectCardFrame {
  const cols = Math.max(1, columns);
  const colSpan = Math.max(1, Math.round(toFinite(cell?.colSpan, 1)));
  const rowSpan = Math.max(1, Math.round(toFinite(cell?.rowSpan, 1)));
  return sanitizeProjectCardFrame({
    x: Math.max(0, Math.round(toFinite(cell?.col, 0))) / cols,
    y: Math.max(0, Math.round(toFinite(cell?.row, 0))) * ROW_STEP_PX,
    w: colSpan / cols,
    h: rowSpan * PROJECT_CARD_ROW_PX + (rowSpan - 1) * PROJECT_CARD_GAP_PX,
    z,
  }, columns);
}

/**
 * True while `value` is a v1 layout that still carries placements. The caller rewrites it as
 * v2 rather than re-reading it, because the conversion needs the column count in effect when
 * the cells were written and that count is not part of the stored payload.
 */
export function isLegacyProjectGridLayout(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const legacy = value as LegacyProjectGridLayout;
  if (legacy.version !== 1) return false;
  return !!legacy.desktop && Object.keys(legacy.desktop).length > 0;
}

export function normalizeProjectGridLayout(
  value: ProjectGridLayout | null | undefined,
  columns: number,
): ProjectGridLayout {
  if (!value || typeof value !== 'object') return emptyProjectGridLayout();

  if (isLegacyProjectGridLayout(value)) {
    const cells = (value as unknown as LegacyProjectGridLayout).desktop ?? {};
    const next = emptyProjectGridLayout();
    Object.keys(cells).forEach((projectId, index) => {
      next.cards[projectId] = projectCardFrameFromGridCell(cells[projectId], columns, index);
    });
    return next;
  }

  if (value.version !== 2) return emptyProjectGridLayout();

  const next = emptyProjectGridLayout();
  for (const [projectId, frame] of Object.entries(value.cards ?? {})) {
    next.cards[projectId] = sanitizeProjectCardFrame(frame, columns);
  }
  for (const [folderId, frame] of Object.entries(value.folders ?? {})) {
    next.folders[folderId] = sanitizeProjectCardFrame(frame, columns);
  }
  return next;
}

export function groupProjectsForGrid(projects: Project[], folders: ProjectFolder[]): ProjectGridSectionModel[] {
  const activeProjects = projects.filter((p) => !p.isArchived);
  const byFolder = new Map<string | null, Project[]>();
  for (const project of activeProjects) {
    const folderId = project.folderId ?? null;
    const existing = byFolder.get(folderId);
    if (existing) existing.push(project);
    else byFolder.set(folderId, [project]);
  }

  const sections: ProjectGridSectionModel[] = [];
  for (const folder of folders) {
    const items = byFolder.get(folder.id);
    if (items?.length) sections.push({ folder, projects: items });
  }

  const unfiled = byFolder.get(null);
  if (unfiled?.length) sections.push({ folder: null, projects: unfiled });

  return sections;
}

export function projectCardFramesOverlap(a: ProjectCardFrame, b: ProjectCardFrame): boolean {
  return (
    a.x < b.x + b.w - TOUCH_EPSILON &&
    a.x + a.w > b.x + TOUCH_EPSILON &&
    a.y < b.y + b.h - TOUCH_EPSILON &&
    a.y + a.h > b.y + TOUCH_EPSILON
  );
}

function isOpen(frame: ProjectCardFrame, occupied: ProjectCardFrame[]): boolean {
  return !occupied.some((other) => projectCardFramesOverlap(frame, other));
}

export function placeProjectCardFrame(
  desired: ProjectCardFrame,
  occupied: ProjectCardFrame[],
  columns: number,
): ProjectCardFrame {
  const start = sanitizeProjectCardFrame(desired, columns);
  if (isOpen(start, occupied)) return start;

  const colStep = 1 / Math.max(1, columns);
  const startRow = Math.round(start.y / ROW_STEP_PX);

  for (let row = startRow; row < startRow + occupied.length + 24; row++) {
    for (let col = 0; col * colStep + start.w <= 1 + TOUCH_EPSILON; col++) {
      const candidate = { ...start, x: col * colStep, y: row * ROW_STEP_PX };
      if (isOpen(candidate, occupied)) return candidate;
    }
  }

  const bottom = occupied.reduce((max, frame) => Math.max(max, frame.y + frame.h), 0);
  return { ...start, x: 0, y: bottom + PROJECT_CARD_GAP_PX };
}

export function reconcileProjectGridLayout(
  projects: Project[],
  folders: ProjectFolder[],
  value: ProjectGridLayout | null | undefined,
  columns: number,
): ProjectGridLayout {
  const layout = normalizeProjectGridLayout(value, columns);
  const sections = groupProjectsForGrid(projects, folders);
  const next = emptyProjectGridLayout();
  next.folders = layout.folders;
  let stacking = 0;

  for (const section of sections) {
    const occupied: ProjectCardFrame[] = [];
    for (const project of section.projects) {
      const saved = layout.cards[project.id];
      const desired = sanitizeProjectCardFrame(
        saved ?? { x: 0, y: occupied.length * ROW_STEP_PX, w: 1 / Math.max(1, columns), h: PROJECT_CARD_ROW_PX, z: stacking },
        columns,
      );
      const placed = placeProjectCardFrame(desired, occupied, columns);
      occupied.push(placed);
      next.cards[project.id] = placed;
      stacking = Math.max(stacking, placed.z) + 1;
    }
  }

  return next;
}

export function updateProjectFrameInLayout(
  value: ProjectGridLayout | null | undefined,
  projectId: string,
  frame: ProjectCardFrame,
  columns: number,
): ProjectGridLayout {
  const layout = normalizeProjectGridLayout(value, columns);
  return {
    version: 2,
    cards: {
      ...layout.cards,
      [projectId]: frame,
    },
    folders: layout.folders,
  };
}
