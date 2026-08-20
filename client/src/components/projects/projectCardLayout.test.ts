import { describe, expect, it } from 'vitest';
import type { Project, ProjectFolder, ProjectGridLayout } from '@shared/types';
import {
  DEFAULT_CARD_HEIGHT_PX,
  MIN_CARD_HEIGHT_PX,
  MIN_CARD_WIDTH_PX,
  PROJECT_CARD_GAP_PX,
  PROJECT_CARD_ROW_PX,
  appendProjectCardFrame,
  framesBottom,
  groupProjectsForGrid,
  isLegacyProjectGridLayout,
  legacyGridColumnCount,
  normalizeProjectGridLayout,
  projectCardFrameFromGridCell,
  MOBILE_COLUMN_COUNT,
  ZONE_LABEL_PX,
  estimateMobileCardHeight,
  adjustBoardZoom,
  layoutMasonryColumns,
  mobileExcerptCharsPerLine,
  sanitizeBoardZoom,
  folderZoneAtPoint,
  frameContainsPoint,
  placeCardInZone,
  reconcileProjectGridLayout,
  sanitizeProjectCardFrame,
  topCardStackingOrder,
  topZoneStackingOrder,
} from './projectCardLayout';

const ROW_STEP = PROJECT_CARD_ROW_PX + PROJECT_CARD_GAP_PX;
/** A board this wide read v1 cells as three columns, which several cases below rely on. */
const BOARD = 960;

const emptyLayout = (): ProjectGridLayout => ({ version: 2, cards: {}, folders: {} });

const makeProject = (id: string, sortOrder: number, folderId: string | null = null): Project => ({
  id,
  name: id,
  description: '',
  color: '#2BA89E',
  icon: '',
  sortOrder,
  isArchived: false,
  folderId,
  linkedActivityId: null,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
  deletedAt: null,
  deviceId: 'test',
});

const makeFolder = (id: string, sortOrder: number): ProjectFolder => ({
  id,
  name: id,
  color: '#E04848',
  sortOrder,
  parentFolderId: null,
  isExpanded: true,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
  deletedAt: null,
  deviceId: 'test',
});

describe('project card layout', () => {
  it('reads v1 cells against the column count that board width implied', () => {
    expect(legacyGridColumnCount(700)).toBe(2);
    expect(legacyGridColumnCount(900)).toBe(3);
    expect(legacyGridColumnCount(1200)).toBe(4);
  });

  it('groups active projects by folder with unfiled projects last', () => {
    const folder = makeFolder('folder-a', 0);
    const archived = { ...makeProject('archived', 3), isArchived: true };

    const sections = groupProjectsForGrid([
      makeProject('unfiled', 0),
      makeProject('filed', 1, folder.id),
      archived,
    ], [folder]);

    expect(sections.map((section) => section.folder?.id ?? null)).toEqual([folder.id, null]);
    expect(sections.flatMap((section) => section.projects.map((project) => project.id))).toEqual(['filed', 'unfiled']);
  });

  it('clamps a saved frame into the board it is read against', () => {
    expect(sanitizeProjectCardFrame({ x: 3, y: -4, w: 9, h: 4, z: -2 }, BOARD)).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: MIN_CARD_HEIGHT_PX,
      z: 0,
    });
  });

  it('keeps a card from shrinking below the pixel minimum', () => {
    const frame = sanitizeProjectCardFrame({ x: 0.5, y: 10, w: 0.001, h: 1, z: 0 }, BOARD);

    expect(frame.w * BOARD).toBeCloseTo(MIN_CARD_WIDTH_PX);
    expect(frame.h).toBe(MIN_CARD_HEIGHT_PX);
  });

  it('migrates a v1 cell layout into fractions of the columns it was saved under', () => {
    const legacy = {
      version: 1,
      desktop: {
        a: { col: 0, row: 0, colSpan: 2, rowSpan: 1 },
        b: { col: 2, row: 1, colSpan: 1, rowSpan: 2 },
      },
    } as unknown as ProjectGridLayout;

    expect(isLegacyProjectGridLayout(legacy)).toBe(true);

    const migrated = normalizeProjectGridLayout(legacy, BOARD);

    expect(migrated.version).toBe(2);
    expect(migrated.folders).toEqual({});
    expect(migrated.cards.a.x).toBeCloseTo(0);
    expect(migrated.cards.a.w).toBeCloseTo(2 / 3);
    expect(migrated.cards.a.h).toBe(PROJECT_CARD_ROW_PX);
    expect(migrated.cards.b.x).toBeCloseTo(2 / 3);
    expect(migrated.cards.b.w).toBeCloseTo(1 / 3);
    expect(migrated.cards.b.y).toBe(ROW_STEP);
    expect(migrated.cards.b.h).toBe(2 * PROJECT_CARD_ROW_PX + PROJECT_CARD_GAP_PX);
  });

  it('does not treat an empty or already-migrated layout as legacy', () => {
    expect(isLegacyProjectGridLayout({ version: 1, desktop: {} })).toBe(false);
    expect(isLegacyProjectGridLayout({ version: 2, cards: {}, folders: {} })).toBe(false);
    expect(isLegacyProjectGridLayout(null)).toBe(false);
  });

  it('keeps folder zones while normalizing card frames', () => {
    const layout: ProjectGridLayout = {
      version: 2,
      cards: { a: { x: 0, y: 0, w: 0.5, h: 100, z: 1 } },
      folders: { f: { x: 0.25, y: 12, w: 0.5, h: 200, z: 0 } },
    };

    const next = normalizeProjectGridLayout(layout, BOARD);

    expect(next.cards.a).toEqual({ x: 0, y: 0, w: 0.5, h: 100, z: 1 });
    expect(next.folders.f).toEqual({ x: 0.25, y: 12, w: 0.5, h: 200, z: 0 });
  });

  it('leaves overlapping cards where the user put them', () => {
    const projects = [makeProject('a', 0), makeProject('b', 1)];
    const overlapping = { x: 0.1, y: 20, w: 0.5, h: 200, z: 3 };
    const layout: ProjectGridLayout = {
      version: 2,
      cards: {
        a: { x: 0, y: 0, w: 0.5, h: 200, z: 1 },
        b: overlapping,
      },
      folders: {},
    };

    const next = reconcileProjectGridLayout(projects, [], layout, BOARD);

    expect(next.cards.b).toEqual(overlapping);
    expect(next.cards.a).toEqual({ x: 0, y: 0, w: 0.5, h: 200, z: 1 });
  });

  it('drops stale entries and places an unplaced project below the placed ones', () => {
    const projects = [makeProject('a', 0), makeProject('b', 1)];
    const layout: ProjectGridLayout = {
      version: 2,
      cards: {
        stale: { x: 0, y: 0, w: 0.25, h: 100, z: 0 },
        a: { x: 0, y: 0, w: 0.25, h: 300, z: 5 },
      },
      folders: {},
    };

    const next = reconcileProjectGridLayout(projects, [], layout, BOARD);

    expect(Object.keys(next.cards).sort()).toEqual(['a', 'b']);
    expect(next.cards.b.y).toBeGreaterThanOrEqual(300);
    expect(next.cards.b.z).toBeGreaterThan(next.cards.a.z);
  });

  it('packs never-placed cards left to right rather than stacking them', () => {
    const first = appendProjectCardFrame(0, 0, 0, BOARD);
    const second = appendProjectCardFrame(1, 0, 1, BOARD);

    expect(first.x).toBe(0);
    expect(first.y).toBe(0);
    expect(first.h).toBe(DEFAULT_CARD_HEIGHT_PX);
    expect(second.y).toBe(0);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.x).toBeGreaterThanOrEqual(first.x + first.w);
  });

  it('starts a new row once a row of default cards is full', () => {
    const perRow = Math.floor(BOARD / 240);
    const wrapped = appendProjectCardFrame(perRow, 0, 0, BOARD);

    expect(wrapped.x).toBe(0);
    expect(wrapped.y).toBe(DEFAULT_CARD_HEIGHT_PX + PROJECT_CARD_GAP_PX);
  });

  it('measures the board by its lowest frame and stacks above every frame in it', () => {
    expect(framesBottom([])).toBe(0);
    expect(framesBottom([
      { x: 0, y: 10, w: 0.2, h: 100, z: 0 },
      { x: 0.5, y: 40, w: 0.2, h: 80, z: 0 },
    ])).toBe(120);

    const layout: ProjectGridLayout = {
      version: 2,
      cards: { a: { x: 0, y: 0, w: 0.2, h: 80, z: 2 } },
      folders: { f: { x: 0, y: 0, w: 0.5, h: 200, z: 7 } },
    };
    // Cards and zones stack on separate layers, so a recently dragged zone cannot cover cards.
    expect(topCardStackingOrder(layout)).toBe(3);
    expect(topZoneStackingOrder(layout)).toBe(8);
  });

  it('decides folder membership by the top-left corner alone', () => {
    const zone = { x: 0.1, y: 100, w: 0.4, h: 200, z: 0 };

    expect(frameContainsPoint(zone, 0.1, 100)).toBe(true);
    expect(frameContainsPoint(zone, 0.5, 300)).toBe(false);
    // A card whose corner is outside is out, however much of its body overlaps.
    expect(folderZoneAtPoint({ f: zone }, 0.09, 150)).toBeNull();
    expect(folderZoneAtPoint({ f: zone }, 0.2, 150)).toBe('f');
  });

  it('gives the topmost zone the card when zones overlap', () => {
    const zones = {
      under: { x: 0, y: 0, w: 0.6, h: 300, z: 1 },
      over: { x: 0.1, y: 50, w: 0.4, h: 200, z: 4 },
    };

    expect(folderZoneAtPoint(zones, 0.2, 100)).toBe('over');
    expect(folderZoneAtPoint(zones, 0.05, 100)).toBe('under');
  });

  it('places a card inside the zone it is filed under, below the label', () => {
    const zone = { x: 0.1, y: 100, w: 0.5, h: 400, z: 0 };
    const placed = placeCardInZone(zone, 0, BOARD);

    expect(placed.x).toBeGreaterThan(zone.x);
    expect(placed.y).toBe(zone.y + ZONE_LABEL_PX);
    expect(folderZoneAtPoint({ f: zone }, placed.x, placed.y)).toBe('f');
  });

  it('gives every folder a zone and puts a new filed card inside its own', () => {
    const folder = makeFolder('folder-a', 0);
    const projects = [makeProject('filed', 0, folder.id)];

    const next = reconcileProjectGridLayout(projects, [folder], emptyLayout(), BOARD);

    expect(next.folders[folder.id]).toBeDefined();
    const card = next.cards.filed;
    expect(folderZoneAtPoint(next.folders, card.x, card.y)).toBe(folder.id);
  });

  it('sends each card to the column that is currently shortest', () => {
    const columns = layoutMasonryColumns(
      [{ id: 'a', height: 200 }, { id: 'b', height: 40 }, { id: 'c', height: 40 }, { id: 'd', height: 40 }],
      MOBILE_COLUMN_COUNT,
    );

    // 'a' is tall, so the right column takes the next three rather than squaring off.
    expect(columns[0].map((item) => item.id)).toEqual(['a']);
    expect(columns[1].map((item) => item.id)).toEqual(['b', 'c', 'd']);
  });

  it('puts the first two cards side by side when nothing is taller yet', () => {
    const columns = layoutMasonryColumns(
      [{ id: 'a', height: 100 }, { id: 'b', height: 100 }, { id: 'c', height: 100 }],
      MOBILE_COLUMN_COUNT,
    );

    expect(columns[0].map((item) => item.id)).toEqual(['a', 'c']);
    expect(columns[1].map((item) => item.id)).toEqual(['b']);
  });

  it('grows a card with its note but stops before it owns the screen', () => {
    const perLine = mobileExcerptCharsPerLine(180);
    const empty = estimateMobileCardHeight('', perLine);
    const short = estimateMobileCardHeight('x'.repeat(perLine * 2), perLine);
    const huge = estimateMobileCardHeight('x'.repeat(perLine * 500), perLine);

    expect(short).toBeGreaterThan(empty);
    expect(huge).toBeGreaterThan(short);
    expect(huge).toBeLessThan(empty + 9 * 16);
  });

  it('counts a card\'s own line breaks when estimating its height', () => {
    const perLine = mobileExcerptCharsPerLine(180);
    const oneLine = estimateMobileCardHeight('раз два', perLine);
    const threeLines = estimateMobileCardHeight('раз\nдва\nтри', perLine);

    // Same length either way; the breaks are what make it taller.
    expect(threeLines).toBeGreaterThan(oneLine);
  });

  it('never divides by a zero-width column', () => {
    expect(mobileExcerptCharsPerLine(0)).toBeGreaterThan(0);
    expect(layoutMasonryColumns([{ height: 10 }], 0)).toHaveLength(1);
  });

  it('steps the zoom and refuses to leave its range', () => {
    expect(adjustBoardZoom(1, 1)).toBeCloseTo(1.1);
    expect(adjustBoardZoom(1, -1)).toBeCloseTo(0.9);
    expect(adjustBoardZoom(2, 1)).toBe(2);
    expect(adjustBoardZoom(0.5, -1)).toBe(0.5);
    // A stored value from anywhere is clamped rather than trusted.
    expect(sanitizeBoardZoom(99)).toBe(2);
    expect(sanitizeBoardZoom(0)).toBe(0.5);
    expect(sanitizeBoardZoom(undefined)).toBe(1);
    expect(sanitizeBoardZoom(Number.NaN)).toBe(1);
  });

  it('never moves a placed card to agree with its folder — that is the hook\'s call', () => {
    const folder = makeFolder('folder-a', 0);
    const outside = { x: 0.75, y: 900, w: 0.2, h: 100, z: 1 };
    const projects = [makeProject('filed', 0, folder.id)];
    const layout: ProjectGridLayout = {
      version: 2,
      cards: { filed: outside },
      folders: { [folder.id]: { x: 0, y: 0, w: 0.5, h: 300, z: 0 } },
    };

    const next = reconcileProjectGridLayout(projects, [folder], layout, BOARD);

    expect(next.cards.filed).toEqual(outside);
  });
});
