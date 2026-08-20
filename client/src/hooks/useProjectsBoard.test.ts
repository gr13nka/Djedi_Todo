import { describe, expect, it } from 'vitest';
import type { ProjectTask } from '@shared/types';
import { daysSince, foldProjectTaskActivity, projectExcerpt } from './useProjectsBoard';

const DAY = 86_400_000;

const makeTask = (overrides: Partial<ProjectTask> & { projectId: string }): ProjectTask => ({
  id: `task-${overrides.projectId}-${overrides.createdAt ?? '0'}`,
  title: 'task',
  sortOrder: 0,
  isCompleted: false,
  completedAt: null,
  archivedAt: null,
  recurrenceRule: null,
  lastRecurredDate: null,
  timeBox: 'week',
  scheduledDate: null,
  timeBoxOrder: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
  deviceId: 'test',
  ...overrides,
});

describe('project board facts', () => {
  it('counts only incomplete tasks as open', () => {
    const activity = foldProjectTaskActivity([
      makeTask({ projectId: 'a' }),
      makeTask({ projectId: 'a', createdAt: '2026-08-02T00:00:00.000Z' }),
      makeTask({ projectId: 'a', createdAt: '2026-08-03T00:00:00.000Z', isCompleted: true, completedAt: '2026-08-04T00:00:00.000Z' }),
      makeTask({ projectId: 'b' }),
    ]);

    expect(activity.a.openCount).toBe(2);
    expect(activity.b.openCount).toBe(1);
  });

  it('takes the latest of created and completed as the last activity', () => {
    const activity = foldProjectTaskActivity([
      makeTask({ projectId: 'a', createdAt: '2026-08-10T00:00:00.000Z' }),
      makeTask({
        projectId: 'a',
        createdAt: '2026-08-01T00:00:00.000Z',
        isCompleted: true,
        completedAt: '2026-08-20T00:00:00.000Z',
      }),
    ]);

    expect(activity.a.lastActivityMs).toBe(Date.parse('2026-08-20T00:00:00.000Z'));
  });

  it('reports no activity for a project with no tasks at all', () => {
    expect(foldProjectTaskActivity([]).a).toBeUndefined();
  });

  it('measures idle days in whole days and never goes negative', () => {
    const now = Date.parse('2026-08-19T12:00:00.000Z');

    expect(daysSince(now - 3 * DAY, now)).toBe(3);
    expect(daysSince(now - DAY / 2, now)).toBe(0);
    expect(daysSince(now + DAY, now)).toBe(0);
    // No recorded moment is "unknown", not "idle since 1970".
    expect(daysSince(0, now)).toBe(0);
  });

  it('strips markdown but keeps the line structure the note was written in', () => {
    const excerpt = projectExcerpt('# Заголовок\n\nНадо **выяснить** сроки\n- у Ивана');

    expect(excerpt).toBe('Заголовок\n\nНадо выяснить сроки\nу Ивана');
  });

  it('collapses spaces inside a line and long gaps between them, but not the breaks', () => {
    expect(projectExcerpt('раз   два\t\tтри')).toBe('раз два три');
    expect(projectExcerpt('раз   \n   два')).toBe('раз\nдва');
    expect(projectExcerpt('раз\n\n\n\n\nдва')).toBe('раз\n\nдва');
  });

  it('treats an empty or missing note as no excerpt', () => {
    expect(projectExcerpt('')).toBe('');
    expect(projectExcerpt(null)).toBe('');
    expect(projectExcerpt('   \n  ')).toBe('');
  });

  it('caps a long note rather than laying all of it out', () => {
    const excerpt = projectExcerpt('a'.repeat(1000));

    expect(excerpt.length).toBeLessThan(1000);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
