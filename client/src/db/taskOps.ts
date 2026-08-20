import { db } from './index';
import { newRecord, notDeleted, softDelete, updateRecord } from './repository';
import { normalizeTaskText } from '../utils/taskText';
import { getLogicalDate } from '../utils/time';
import { shouldCreateRecurrence } from '../utils/recurrence';
import type { ProjectTask, RecurrenceRule, TimeBox } from '@shared/types';

/**
 * ProjectTask writes that need to live outside a single project's context.
 * `createProjectTask`/`deleteProjectTask`: Inbox sorting and the
 * cross-project Task Selection view both create/delete tasks in whichever
 * project the user picks, so they can't scope a `useProjectTasks(projectId)`
 * hook (that would mean instantiating one per task in a loop).
 * `spawnNextOccurrence`: shared by the two independent places a recurring
 * task can be marked complete (see its own doc comment). `toggleProjectTask`:
 * shared by every place a task's completion is flipped outside a scoped
 * `useProjectTasks` — same cross-project constraint as create/delete above.
 * `useProjectTasks` calls all four, so each rule (append-sortOrder,
 * soft-delete, spawn gating, completion flip) lives in exactly one place.
 */

/**
 * One past the highest `timeBoxOrder` among `orders` (assumed to be every
 * active task's order in some box), or `0` if `orders` is empty. Pure —
 * split out of `nextBoxOrder` below purely so this arithmetic can be unit
 * tested without a Dexie test double (no fake-indexeddb in this project's
 * test setup; see `taskOps.test.ts`).
 */
export function nextOrderAfter(orders: number[]): number {
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

/**
 * Append position for a new/moved task at the end of `timeBox`'s manual
 * order, across all projects. Used by `createProjectTask`/
 * `spawnNextOccurrence` below, by `useTaskBox.moveTaskToBox`, and by
 * `useTaskRollover` for the box moves it applies.
 *
 * Deliberately `max(timeBoxOrder) + 1`, NOT a count of active tasks: a count
 * collides as soon as it no longer equals one-past-the-max, which happens
 * two ways —
 *  (a) a task moves OUT of the box, leaving a gap (e.g. orders [0, 1, 2],
 *      the order-1 task moves elsewhere → [0, 2]; the active count is now 2,
 *      which lands a new append ON the existing order-2 task instead of
 *      after it), and
 *  (b) soft-deleted rows: the v10 migration stamps a `timeBoxOrder` on
 *      every row, deleted or not, so a box's count of *active* rows can sit
 *      below its true max the moment anything in it has ever been deleted.
 * `max + 1` over active rows only is immune to both, since it reads the
 * actual high-water mark instead of inferring it from a count.
 */
export async function nextBoxOrder(timeBox: TimeBox): Promise<number> {
  const orders: number[] = [];
  await db.projectTasks
    .where('timeBox')
    .equals(timeBox)
    .filter((t) => !t.deletedAt)
    .each((t) => orders.push(t.timeBoxOrder));
  return nextOrderAfter(orders);
}

/**
 * Appends a new task to `projectId`'s active task list (sortOrder = current
 * active count) and to the end of `timeBox` (`timeBoxOrder` =
 * `nextBoxOrder(timeBox)`).
 *
 * `timeBox` defaults to `'someday'`, the uncommitted backlog: a task written
 * into a project — or sorted there out of the inbox — is captured, not yet
 * scheduled, and promoting it is a separate deliberate act. Only callers that
 * know better pass a box, and today only one does: `/tasks`' quick-add hands
 * over the box tab the user is looking at, so a task added under the 'week'
 * tab does not immediately vanish from the view that created it.
 */
export async function createProjectTask(
  projectId: string,
  title: string,
  recurrenceRule?: RecurrenceRule | null,
  timeBox: TimeBox = 'someday',
): Promise<ProjectTask> {
  const all = notDeleted(await db.projectTasks.where('projectId').equals(projectId).toArray());
  const timeBoxOrder = await nextBoxOrder(timeBox);
  const cleanTitle = normalizeTaskText(title);
  const task = newRecord({
    projectId,
    title: cleanTitle,
    sortOrder: all.length,
    isCompleted: false,
    completedAt: null,
    archivedAt: null,
    recurrenceRule: recurrenceRule ?? null,
    lastRecurredDate: null,
    timeBox,
    scheduledDate: null,
    timeBoxOrder,
  });
  await db.projectTasks.add(task);
  return task;
}

/** Soft-deletes a task. */
export async function deleteProjectTask(taskId: string): Promise<void> {
  await softDelete(db.projectTasks, taskId);
}

/** Moves a task into another project, appending it to that project's task order. */
export async function moveTaskToProject(taskId: string, targetProjectId: string): Promise<void> {
  const task = await db.projectTasks.get(taskId);
  if (!task || task.projectId === targetProjectId) return;

  const targetTasks = notDeleted(await db.projectTasks.where('projectId').equals(targetProjectId).toArray());
  await updateRecord(db.projectTasks, taskId, {
    projectId: targetProjectId,
    sortOrder: targetTasks.length,
  });
}

/**
 * Spawns the next occurrence of a completed recurring task, if one is due.
 *
 * Single implementation shared by the two independent triggers that can
 * complete a recurring task: `useProjectTasks.toggleTask` (interactive —
 * fires the moment the user checks it off) and `useRecurringTaskCheck` (a
 * periodic scan that catches tasks completed while the app wasn't running,
 * e.g. across an overnight sleep). Both call this instead of duplicating
 * the spawn logic. `task` only needs to be completed and carry a
 * `recurrenceRule` — its `isCompleted`/`completedAt` fields aren't read
 * here, so a pre-toggle snapshot is fine.
 *
 * No-ops (creates nothing, touches no `lastRecurredDate`) unless BOTH gates
 * pass:
 *  - `shouldCreateRecurrence`: is the next occurrence due on/before today?
 *    Recurrence is a calendar concept ("every Monday"), not the app's
 *    day-start-adjusted concept of "today" — so `today` here is the local
 *    calendar date via `getLogicalDate(0)` (dayStartHour 0 never
 *    decrements the date), independent of the user's `dayStartHour`
 *    setting.
 *  - title dedup: is there already an incomplete task with the same title
 *    in the same project? A secondary guard against double-spawns (e.g.
 *    both triggers racing), kept even though the due-date gate above now
 *    does most of the work.
 *
 * On success, stamps `lastRecurredDate` on BOTH the new task and the
 * original — the original's stamp is what the next call's
 * `shouldCreateRecurrence` check reads.
 *
 * The spawned occurrence inherits the completed task's `timeBox` (a
 * recurring task keeps recurring into whichever box its owner is using it
 * from) with a fresh, unpinned `scheduledDate` and a `timeBoxOrder`
 * appended to that box.
 */
export async function spawnNextOccurrence(task: ProjectTask): Promise<void> {
  if (!task.recurrenceRule) return;
  const today = getLogicalDate(0);
  if (!shouldCreateRecurrence(task.lastRecurredDate, task.recurrenceRule, today)) return;

  const existingIncomplete = await db.projectTasks
    .where('projectId')
    .equals(task.projectId)
    .filter((t) => !t.deletedAt && !t.isCompleted && t.title === task.title)
    .first();
  if (existingIncomplete) return;

  const all = notDeleted(
    await db.projectTasks.where('projectId').equals(task.projectId).toArray(),
  );
  const timeBoxOrder = await nextBoxOrder(task.timeBox);
  await db.projectTasks.add(newRecord({
    projectId: task.projectId,
    title: task.title,
    sortOrder: all.length,
    isCompleted: false,
    completedAt: null,
    archivedAt: null,
    recurrenceRule: task.recurrenceRule,
    lastRecurredDate: today,
    timeBox: task.timeBox,
    scheduledDate: null,
    timeBoxOrder,
  }));

  await updateRecord(db.projectTasks, task.id, { lastRecurredDate: today });
}

/**
 * Flips a task's completion, stamping/clearing `completedAt`, then spawns its
 * next recurrence if completing it made one due (see `spawnNextOccurrence`).
 * No-ops if the task doesn't exist (already deleted underneath the caller).
 *
 * Archive interplay: `archiveCompletedAfterDays === 0` means "archive
 * immediately", which the daily sweep (`useTaskRollover`) can't deliver — it
 * only runs at the next logical-day boundary — so that one case stamps
 * `archivedAt` right here, in the same update as the completion flip.
 * Un-completing clears `archivedAt` unconditionally (a resurfaced task fully
 * leaves the archive; invariant: archived ⇒ completed).
 */
export async function toggleProjectTask(taskId: string): Promise<void> {
  const task = await db.projectTasks.get(taskId);
  if (!task) return;
  const now = new Date().toISOString();
  const newCompleted = !task.isCompleted;
  const settings = newCompleted ? await db.settings.get('default') : undefined;
  const archiveImmediately =
    settings?.autoArchiveCompleted === true && settings.archiveCompletedAfterDays === 0;
  await db.projectTasks.update(taskId, {
    isCompleted: newCompleted,
    completedAt: newCompleted ? now : null,
    ...(newCompleted ? (archiveImmediately ? { archivedAt: now } : {}) : { archivedAt: null }),
    updatedAt: now,
  });
  // `task` is the pre-toggle snapshot; only its recurrence-related fields are
  // read, so it's still valid after the write above.
  if (newCompleted && task.recurrenceRule) {
    await spawnNextOccurrence(task);
  }
}
