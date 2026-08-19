import { describe, expect, it } from 'vitest';
import type { Project, ProjectFolder, ProjectGridLayout } from '@shared/types';
import {
  PROJECT_CARD_GAP_PX,
  PROJECT_CARD_ROW_PX,
  getProjectGridColumnCount,
  groupProjectsForGrid,
  isLegacyProjectGridLayout,
  normalizeProjectGridLayout,
  placeProjectCardFrame,
  projectCardFrameFromGridCell,
  projectCardFrameToGridCell,
  reconcileProjectGridLayout,
  sanitizeProjectCardFrame,
} from './projectCardLayout';

const ROW_STEP = PROJECT_CARD_ROW_PX + PROJECT_CARD_GAP_PX;

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
  it('uses two columns on mobile and scales desktop columns by width', () => {
    expect(getProjectGridColumnCount(360, 'mobile')).toBe(2);
    expect(getProjectGridColumnCount(700, 'desktop')).toBe(2);
    expect(getProjectGridColumnCount(900, 'desktop')).toBe(3);
    expect(getProjectGridColumnCount(1200, 'desktop')).toBe(4);
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
    expect(sanitizeProjectCardFrame({ x: 3, y: -4, w: 9, h: 4, z: -2 }, 3)).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: PROJECT_CARD_ROW_PX,
      z: 0,
    });
  });

  it('round-trips a frame through the cell grid it snaps to', () => {
    const cell = { col: 1, row: 2, colSpan: 2, rowSpan: 3 };
    const frame = projectCardFrameFromGridCell(cell, 4, 0);

    expect(frame.x).toBeCloseTo(0.25);
    expect(frame.w).toBeCloseTo(0.5);
    expect(frame.y).toBe(2 * ROW_STEP);
    expect(frame.h).toBe(3 * PROJECT_CARD_ROW_PX + 2 * PROJECT_CARD_GAP_PX);
    expect(projectCardFrameToGridCell(frame, 4)).toEqual(cell);
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

    const migrated = normalizeProjectGridLayout(legacy, 3);

    expect(migrated.version).toBe(2);
    expect(migrated.folders).toEqual({});
    expect(migrated.cards.a.x).toBeCloseTo(0);
    expect(migrated.cards.a.w).toBeCloseTo(2 / 3);
    expect(migrated.cards.b.x).toBeCloseTo(2 / 3);
    expect(migrated.cards.b.y).toBe(ROW_STEP);
    expect(migrated.cards.b.h).toBe(2 * PROJECT_CARD_ROW_PX + PROJECT_CARD_GAP_PX);
    // The picture is unchanged: every migrated frame snaps back onto the cell it came from.
    expect(projectCardFrameToGridCell(migrated.cards.a, 3)).toEqual({ col: 0, row: 0, colSpan: 2, rowSpan: 1 });
    expect(projectCardFrameToGridCell(migrated.cards.b, 3)).toEqual({ col: 2, row: 1, colSpan: 1, rowSpan: 2 });
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

    const next = normalizeProjectGridLayout(layout, 4);

    expect(next.cards.a).toEqual({ x: 0, y: 0, w: 0.5, h: 100, z: 1 });
    expect(next.folders.f).toEqual({ x: 0.25, y: 12, w: 0.5, h: 200, z: 0 });
  });

  it('places a moved frame into the next open cell when it would collide', () => {
    const occupied = projectCardFrameFromGridCell({ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, 2, 0);
    const placed = placeProjectCardFrame(
      projectCardFrameFromGridCell({ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, 2, 1),
      [occupied],
      2,
    );

    expect(projectCardFrameToGridCell(placed, 2)).toEqual({ col: 1, row: 0, colSpan: 1, rowSpan: 1 });
  });

  it('treats frames that share an edge as neighbours, not as an overlap', () => {
    const left = projectCardFrameFromGridCell({ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, 3, 0);
    const right = projectCardFrameFromGridCell({ col: 1, row: 0, colSpan: 1, rowSpan: 1 }, 3, 1);

    expect(placeProjectCardFrame(right, [left], 3)).toEqual(right);
  });

  it('reconciles stale entries and appends missing projects without overlap', () => {
    const projects = [makeProject('a', 0), makeProject('b', 1), makeProject('c', 2)];
    const layout: ProjectGridLayout = {
      version: 2,
      cards: {
        stale: projectCardFrameFromGridCell({ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, 3, 0),
        a: projectCardFrameFromGridCell({ col: 0, row: 0, colSpan: 2, rowSpan: 1 }, 3, 1),
        b: projectCardFrameFromGridCell({ col: 1, row: 0, colSpan: 2, rowSpan: 1 }, 3, 2),
      },
      folders: {},
    };

    const next = reconcileProjectGridLayout(projects, [], layout, 3);

    expect(Object.keys(next.cards).sort()).toEqual(['a', 'b', 'c']);
    expect(projectCardFrameToGridCell(next.cards.a, 3)).toEqual({ col: 0, row: 0, colSpan: 2, rowSpan: 1 });
    expect(next.cards.b.y).toBeGreaterThanOrEqual(ROW_STEP);
    expect(next.cards.c).toBeDefined();
  });
});

