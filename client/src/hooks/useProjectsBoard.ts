import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { Project, ProjectTask } from '@shared/types';
import { db } from '../db';
import { useSettingsStore } from '../stores/settingsStore';
import { stripMarkdown } from '../utils/markdown';

const MS_PER_DAY = 86_400_000;

/** Longer than any card can show; the cap only keeps a huge note out of the DOM. */
const EXCERPT_CHAR_LIMIT = 400;

/**
 * Idle days is a whole-day figure, so it only has to survive midnight passing. A minute
 * ticker — the shape `useStalenessScore` needs for a continuously drifting score — would
 * recompute this one 1439 times for every change it could actually show.
 */
const IDLE_RECOMPUTE_MS = 3_600_000;

export interface ProjectTaskActivity {
  /** Incomplete tasks left in the project. */
  openCount: number;
  /** Most recent moment a task was created or completed, in ms; 0 when there are none. */
  lastActivityMs: number;
}

export interface ProjectBoardFacts {
  /** The note with its markdown stripped and its line breaks collapsed. */
  excerpt: string;
  openCount: number;
  /** Days since the project last saw a task created or completed. */
  idleDays: number;
}

function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Folds the whole task table into per-project figures in one pass.
 *
 * One pass and a fold, rather than a query per project: `projectTasks` has no composite
 * `[projectId+isCompleted]` index, so per-project queries would each scan anyway.
 */
export function foldProjectTaskActivity(tasks: ProjectTask[]): Record<string, ProjectTaskActivity> {
  const activity: Record<string, ProjectTaskActivity> = {};
  for (const task of tasks) {
    let entry = activity[task.projectId];
    if (!entry) {
      entry = { openCount: 0, lastActivityMs: 0 };
      activity[task.projectId] = entry;
    }
    if (!task.isCompleted) entry.openCount += 1;
    const touched = Math.max(toMs(task.createdAt), toMs(task.completedAt));
    if (touched > entry.lastActivityMs) entry.lastActivityMs = touched;
  }
  return activity;
}

export function projectExcerpt(description: string | null | undefined): string {
  const text = stripMarkdown(description ?? '').replace(/\s+/g, ' ').trim();
  return text.length > EXCERPT_CHAR_LIMIT ? `${text.slice(0, EXCERPT_CHAR_LIMIT)}…` : text;
}

export function daysSince(momentMs: number, nowMs: number): number {
  if (!momentMs) return 0;
  return Math.max(0, Math.floor((nowMs - momentMs) / MS_PER_DAY));
}

/**
 * The three things a project card says about a project beyond its name, for every project at
 * once: what the note opens with, how much is left, and how long since anything happened.
 *
 * "How long since anything happened" is measured from task `createdAt`/`completedAt` and
 * deliberately not from `Project.updatedAt`, which is bumped by things that are not work:
 * renaming or recolouring a project, a bulk reorder writing every row, and vault sync
 * replacing a row wholesale under last-writer-wins.
 */
export function useProjectsBoard(projects: Project[]) {
  const activity = useLiveQuery(
    () => db.projectTasks.filter((task) => !task.deletedAt).toArray().then(foldProjectTaskActivity),
    [],
  );
  const [now, setNow] = useState(() => Date.now());
  const idleDaysVisible = useSettingsStore((s) => s.boardIdleDaysVisible);
  const updateSettings = useSettingsStore((s) => s.update);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), IDLE_RECOMPUTE_MS);
    return () => clearInterval(interval);
  }, []);

  const facts = useMemo(() => {
    const facts: Record<string, ProjectBoardFacts> = {};
    for (const project of projects) {
      const entry = activity?.[project.id];
      // A project that never had a task is idle since it was created, not since epoch.
      const lastActivity = entry?.lastActivityMs || toMs(project.createdAt);
      facts[project.id] = {
        excerpt: projectExcerpt(project.description),
        openCount: entry?.openCount ?? 0,
        idleDays: daysSince(lastActivity, now),
      };
    }
    return facts;
  }, [activity, now, projects]);

  const toggleIdleDays = () => {
    updateSettings({ boardIdleDaysVisible: !idleDaysVisible });
  };

  return { facts, idleDaysVisible, toggleIdleDays };
}
