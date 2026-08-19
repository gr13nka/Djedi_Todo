import type { Project, ProjectCardFrame, ProjectFolder, ProjectGridLayout } from '@shared/types';

export const PROJECT_CARD_GAP_PX = 12;
export const PROJECT_CARD_ROW_PX = 72;

/** Nothing on the board may shrink past this; below it a card cannot show a name and an excerpt. */
export const MIN_CARD_WIDTH_PX = 160;
export const MIN_CARD_HEIGHT_PX = PROJECT_CARD_ROW_PX;

/** Size a card gets the first time the board places it. */
export const DEFAULT_CARD_WIDTH_PX = 240;
export const DEFAULT_CARD_HEIGHT_PX = 2 * PROJECT_CARD_ROW_PX + PROJECT_CARD_GAP_PX;

/** Distance from one card's top edge to the next one's in the retired cell grid. */
const ROW_STEP_PX = PROJECT_CARD_ROW_PX + PROJECT_CARD_GAP_PX;

/** Board width assumed while the container has not been measured yet. */
const UNMEASURED_BOARD_WIDTH_PX = 960;

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

/** A rectangle in the retired cell grid; only v1 layouts are still read in this shape. */
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

/**
 * Column count of the retired cell grid, kept only so a v1 layout converts against the same
 * count it was written under. The live board has no columns.
 */
export function legacyGridColumnCount(width: number): number {
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

function boardWidthOrDefault(boardWidth: number): number {
  return boardWidth > 0 ? boardWidth : UNMEASURED_BOARD_WIDTH_PX;
}

/** The pixel minimum expressed against this board, so `w` can stay a fraction. */
function minWidthFraction(boardWidth: number): number {
  return Math.min(1, MIN_CARD_WIDTH_PX / boardWidthOrDefault(boardWidth));
}

export function sanitizeProjectCardFrame(
  frame: ProjectCardFrameInput | undefined,
  boardWidth: number,
): ProjectCardFrame {
  const minWidth = minWidthFraction(boardWidth);
  const w = clampNumber(toFinite(frame?.w, minWidth), minWidth, 1);
  return {
    x: clampNumber(toFinite(frame?.x, 0), 0, Math.max(0, 1 - w)),
    y: Math.max(0, toFinite(frame?.y, 0)),
    w,
    h: Math.max(MIN_CARD_HEIGHT_PX, toFinite(frame?.h, DEFAULT_CARD_HEIGHT_PX)),
    z: Math.max(0, Math.round(toFinite(frame?.z, 0))),
  };
}

/** Reads one v1 cell as a frame. The column count is the one those cells were written under. */
export function projectCardFrameFromGridCell(
  cell: ProjectGridCell | undefined,
  columns: number,
  z: number,
  boardWidth: number,
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
  }, boardWidth);
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
  boardWidth: number,
): ProjectGridLayout {
  if (!value || typeof value !== 'object') return emptyProjectGridLayout();

  if (isLegacyProjectGridLayout(value)) {
    const cells = (value as unknown as LegacyProjectGridLayout).desktop ?? {};
    const columns = legacyGridColumnCount(boardWidthOrDefault(boardWidth));
    const next = emptyProjectGridLayout();
    Object.keys(cells).forEach((projectId, index) => {
      next.cards[projectId] = projectCardFrameFromGridCell(cells[projectId], columns, index, boardWidth);
    });
    return next;
  }

  if (value.version !== 2) return emptyProjectGridLayout();

  const next = emptyProjectGridLayout();
  for (const [projectId, frame] of Object.entries(value.cards ?? {})) {
    next.cards[projectId] = sanitizeProjectCardFrame(frame, boardWidth);
  }
  for (const [folderId, frame] of Object.entries(value.folders ?? {})) {
    next.folders[folderId] = sanitizeProjectCardFrame(frame, boardWidth);
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

/**
 * Where a card the board has never placed goes: packed left to right in rows of the default
 * size, below everything already placed. Cards may overlap once dragged, but arriving on top
 * of an existing one would read as a bug rather than as a choice.
 */
export function appendProjectCardFrame(
  index: number,
  below: number,
  z: number,
  boardWidth: number,
): ProjectCardFrame {
  const width = boardWidthOrDefault(boardWidth);
  const w = Math.min(1, DEFAULT_CARD_WIDTH_PX / width);
  const perRow = Math.max(1, Math.floor(1 / w));
  const column = index % perRow;
  const row = Math.floor(index / perRow);
  return sanitizeProjectCardFrame({
    x: column * w,
    y: below + row * (DEFAULT_CARD_HEIGHT_PX + PROJECT_CARD_GAP_PX),
    w,
    h: DEFAULT_CARD_HEIGHT_PX,
    z,
  }, boardWidth);
}

/** Bottom edge of the lowest frame in `frames`, or 0 when there are none. */
export function framesBottom(frames: ProjectCardFrame[]): number {
  return frames.reduce((bottom, frame) => Math.max(bottom, frame.y + frame.h), 0);
}

/**
 * Brings the stored layout in line with the projects that actually exist: stale entries are
 * dropped, and a project without a frame gets one. Saved frames are returned untouched —
 * where a card sits is the user's answer, and the board no longer has an opinion about
 * overlap.
 */
export function reconcileProjectGridLayout(
  projects: Project[],
  folders: ProjectFolder[],
  value: ProjectGridLayout | null | undefined,
  boardWidth: number,
): ProjectGridLayout {
  const layout = normalizeProjectGridLayout(value, boardWidth);
  const sections = groupProjectsForGrid(projects, folders);
  const next = emptyProjectGridLayout();
  next.folders = layout.folders;

  for (const section of sections) {
    const placed: ProjectCardFrame[] = [];
    const unplaced: Project[] = [];
    let stacking = 0;

    for (const project of section.projects) {
      const saved = layout.cards[project.id];
      if (saved) {
        placed.push(saved);
        next.cards[project.id] = saved;
        stacking = Math.max(stacking, saved.z);
      } else {
        unplaced.push(project);
      }
    }

    const below = placed.length ? framesBottom(placed) + PROJECT_CARD_GAP_PX : 0;
    unplaced.forEach((project, index) => {
      next.cards[project.id] = appendProjectCardFrame(index, below, stacking + 1 + index, boardWidth);
    });
  }

  return next;
}

/** One above every frame currently in the layout, so a grabbed card comes to the front. */
export function topStackingOrder(layout: ProjectGridLayout): number {
  const frames = [...Object.values(layout.cards), ...Object.values(layout.folders)];
  return frames.reduce((top, frame) => Math.max(top, frame.z), 0) + 1;
}

export function updateProjectFrameInLayout(
  value: ProjectGridLayout | null | undefined,
  projectId: string,
  frame: ProjectCardFrame,
  boardWidth: number,
): ProjectGridLayout {
  const layout = normalizeProjectGridLayout(value, boardWidth);
  return {
    version: 2,
    cards: {
      ...layout.cards,
      [projectId]: frame,
    },
    folders: layout.folders,
  };
}
