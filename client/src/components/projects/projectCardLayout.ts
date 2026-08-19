import type { Project, ProjectCardFrame, ProjectFolder, ProjectGridLayout } from '@shared/types';

export const PROJECT_CARD_GAP_PX = 12;
export const PROJECT_CARD_ROW_PX = 72;

/** Nothing on the board may shrink past this; below it a card cannot show a name and an excerpt. */
export const MIN_CARD_WIDTH_PX = 160;
export const MIN_CARD_HEIGHT_PX = PROJECT_CARD_ROW_PX;

/** Size a card gets the first time the board places it. */
export const DEFAULT_CARD_WIDTH_PX = 240;
export const DEFAULT_CARD_HEIGHT_PX = 2 * PROJECT_CARD_ROW_PX + PROJECT_CARD_GAP_PX;

/** Breathing room inside a folder zone, and the strip its label occupies. */
export const ZONE_PADDING_PX = 12;
export const ZONE_LABEL_PX = 28;

/** Size a zone gets when a folder turns out not to have one — room for four default cards. */
export const DEFAULT_ZONE_WIDTH_PX = 2 * DEFAULT_CARD_WIDTH_PX + 3 * ZONE_PADDING_PX;
export const DEFAULT_ZONE_HEIGHT_PX = ZONE_LABEL_PX + 2 * (DEFAULT_CARD_HEIGHT_PX + ZONE_PADDING_PX);

/**
 * Cards always render above zones, so the two keep separate stacking counters and the card
 * layer is lifted clear of the zone layer at render time. Sharing one counter would let a
 * zone that was dragged recently cover the cards inside it.
 */
export const CARD_LAYER_BASE = 1000;

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
 * Brings the stored layout in line with what actually exists: stale entries are dropped,
 * every folder gets a zone, and every project gets a card.
 *
 * Saved frames come back untouched. Where a card sits is the user's answer and the board has
 * no opinion about overlap — and, crucially, no opinion about folders either: this function
 * never moves a card to agree with its `folderId`. Doing so would fight the drop that just
 * happened, because the card reaches its new zone a render before the `folderId` write comes
 * back through the live query. Reconciling the two directions is the hook's job, which can
 * tell an external folder change from one the board itself just made.
 */
export function reconcileProjectGridLayout(
  projects: Project[],
  folders: ProjectFolder[],
  value: ProjectGridLayout | null | undefined,
  boardWidth: number,
): ProjectGridLayout {
  const layout = normalizeProjectGridLayout(value, boardWidth);
  const next = emptyProjectGridLayout();
  const activeProjects = projects.filter((project) => !project.isArchived);

  let zoneStacking = 0;
  const unzoned: ProjectFolder[] = [];
  for (const folder of folders) {
    const saved = layout.folders[folder.id];
    if (saved) {
      next.folders[folder.id] = saved;
      zoneStacking = Math.max(zoneStacking, saved.z);
    } else {
      unzoned.push(folder);
    }
  }

  const placedZones = Object.values(next.folders);
  const zonesBelow = placedZones.length ? framesBottom(placedZones) + PROJECT_CARD_GAP_PX : 0;
  unzoned.forEach((folder, index) => {
    next.folders[folder.id] = appendFolderZoneFrame(index, zonesBelow, zoneStacking + 1 + index, boardWidth);
  });

  let cardStacking = 0;
  const unplaced: Project[] = [];
  for (const project of activeProjects) {
    const saved = layout.cards[project.id];
    if (saved) {
      next.cards[project.id] = saved;
      cardStacking = Math.max(cardStacking, saved.z);
    } else {
      unplaced.push(project);
    }
  }

  // A card the board has never placed goes inside its folder's zone, so geometry and
  // `folderId` start out agreeing rather than needing a correction on the first render.
  const zoneFill = new Map<string, number>();
  for (const project of activeProjects) {
    const folderId = project.folderId ?? null;
    if (!folderId || !next.cards[project.id]) continue;
    zoneFill.set(folderId, (zoneFill.get(folderId) ?? 0) + 1);
  }

  const loose = Object.values(next.cards).concat(Object.values(next.folders));
  const looseBelow = loose.length ? framesBottom(loose) + PROJECT_CARD_GAP_PX : 0;
  let unfiledIndex = 0;

  unplaced.forEach((project, index) => {
    const folderId = project.folderId ?? null;
    const zone = folderId ? next.folders[folderId] : undefined;
    const z = cardStacking + 1 + index;
    if (zone) {
      const slot = zoneFill.get(folderId as string) ?? 0;
      zoneFill.set(folderId as string, slot + 1);
      next.cards[project.id] = { ...placeCardInZone(zone, slot, boardWidth), z };
    } else {
      next.cards[project.id] = appendProjectCardFrame(unfiledIndex++, looseBelow, z, boardWidth);
    }
  });

  return next;
}

function topOf(frames: ProjectCardFrame[]): number {
  return frames.reduce((top, frame) => Math.max(top, frame.z), 0) + 1;
}

/** One above every card, so a grabbed card comes to the front of its layer. */
export function topCardStackingOrder(layout: ProjectGridLayout): number {
  return topOf(Object.values(layout.cards));
}

/** One above every zone, so a grabbed zone comes to the front of its layer. */
export function topZoneStackingOrder(layout: ProjectGridLayout): number {
  return topOf(Object.values(layout.folders));
}

export function frameContainsPoint(frame: ProjectCardFrame, x: number, y: number): boolean {
  return x >= frame.x && x < frame.x + frame.w && y >= frame.y && y < frame.y + frame.h;
}

/**
 * Which folder a card at (x, y) belongs to.
 *
 * Membership is decided by the card's top-left corner and nothing else. Cards may overlap
 * zones and each other, so "how much of the card is inside" has no answer worth defending;
 * one point always has exactly one answer. Where zones overlap, the topmost one wins.
 */
export function folderZoneAtPoint(
  zones: Record<string, ProjectCardFrame>,
  x: number,
  y: number,
): string | null {
  let winner: string | null = null;
  let winnerZ = -Infinity;
  for (const [folderId, zone] of Object.entries(zones)) {
    if (!frameContainsPoint(zone, x, y)) continue;
    if (zone.z < winnerZ) continue;
    winner = folderId;
    winnerZ = zone.z;
  }
  return winner;
}

/** Slot `index` inside a zone, packed left to right under the zone's label. */
export function placeCardInZone(
  zone: ProjectCardFrame,
  index: number,
  boardWidth: number,
): ProjectCardFrame {
  const width = boardWidthOrDefault(boardWidth);
  const padding = ZONE_PADDING_PX / width;
  const innerX = zone.x + padding;
  const innerWidth = Math.max(padding, zone.w - 2 * padding);
  const cardWidth = Math.min(DEFAULT_CARD_WIDTH_PX / width, innerWidth);
  const perRow = Math.max(1, Math.floor(innerWidth / cardWidth));
  return sanitizeProjectCardFrame({
    x: innerX + (index % perRow) * cardWidth,
    y: zone.y + ZONE_LABEL_PX + Math.floor(index / perRow) * (DEFAULT_CARD_HEIGHT_PX + ZONE_PADDING_PX),
    w: cardWidth,
    h: DEFAULT_CARD_HEIGHT_PX,
    z: 0,
  }, boardWidth);
}

/** Where a folder that has no zone yet gets one: a row of zones below everything placed. */
export function appendFolderZoneFrame(
  index: number,
  below: number,
  z: number,
  boardWidth: number,
): ProjectCardFrame {
  const width = boardWidthOrDefault(boardWidth);
  const w = Math.min(1, DEFAULT_ZONE_WIDTH_PX / width);
  const perRow = Math.max(1, Math.floor(1 / w));
  return sanitizeProjectCardFrame({
    x: (index % perRow) * w,
    y: below + Math.floor(index / perRow) * (DEFAULT_ZONE_HEIGHT_PX + PROJECT_CARD_GAP_PX),
    w,
    h: DEFAULT_ZONE_HEIGHT_PX,
    z,
  }, boardWidth);
}

/** The one writer into a layout: merges frame patches over what is already stored. */
export function applyFramesToLayout(
  value: ProjectGridLayout | null | undefined,
  patch: { cards?: Record<string, ProjectCardFrame>; folders?: Record<string, ProjectCardFrame> },
  boardWidth: number,
): ProjectGridLayout {
  const layout = normalizeProjectGridLayout(value, boardWidth);
  return {
    version: 2,
    cards: { ...layout.cards, ...patch.cards },
    folders: { ...layout.folders, ...patch.folders },
  };
}
