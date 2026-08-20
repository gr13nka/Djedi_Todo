import type { ProjectTask } from '@shared/types';

export interface RolloverParams {
  /** Current logical date (`getLogicalDate(dayStartHour)`), as YYYY-MM-DD. */
  today: string;
  /** `settings.lastRolloverDate` — `null` before the v10 migration or first rollover. */
  lastRolloverDate: string | null;
  /**
   * Active (non-deleted) tasks only — soft-deleted rows keep a valid `timeBox`
   * for their own sake (see the v10 migration), but they're not part of any
   * box view and must never be resurrected into one by rollover. Callers
   * filter `!deletedAt` before calling.
   */
  tasks: Array<Pick<ProjectTask, 'id' | 'timeBox' | 'isCompleted' | 'scheduledDate'>>;
}

export interface RolloverResult {
  /** Task ids to move into `'week'` (demoted, were incomplete in `'today'`). */
  toWeek: string[];
  /** Task ids to move into `'later'` (demoted-completed, or promotion did not apply). */
  toLater: string[];
  /**
   * Task ids to move into `'today'` (promoted via a due `scheduledDate`).
   * Applying this result MUST also clear `scheduledDate` on these tasks —
   * see the function doc comment for why.
   */
  toToday: string[];
}

/**
 * Decides the one-time box move each active task needs at a logical-day
 * boundary. Pure and side-effect-free — `useTaskRollover()` is the only
 * caller, and owns turning this into actual Dexie writes (including the
 * `scheduledDate` clear this function's contract requires but can't itself
 * perform).
 *
 * Rules, applied in order:
 *  1. Idempotency guard: if `lastRolloverDate === today`, rollover already
 *     ran for this logical day — return all-empty. Without this, calling
 *     twice in the same day (e.g. two `visibilitychange` events) would
 *     demote a task the user only just promoted moments ago.
 *  2. Demote everything currently in `'today'`: incomplete → `'week'`,
 *     completed → `'later'`. Matches the v10 migration's same split, and is
 *     what keeps the today view clean without ever date-filtering it —
 *     rollover empties the box every day instead.
 *  3. Promote: a task with `scheduledDate !== null`, `scheduledDate <=
 *     today`, and `!isCompleted` moves to `'today'`. `<=` (not `===`) means
 *     a pin missed while the app was closed for several days still fires,
 *     exactly once, on the next run. The caller MUST clear `scheduledDate`
 *     when applying this move — without the clear, the task would still
 *     read `scheduledDate <= today` on the *next* rollover, get demoted back
 *     out of `'today'` by rule 2, and then immediately re-promoted by rule 3
 *     forever, never actually landing in the user's hands as a normal
 *     `'today'` task they can complete and have demoted like any other.
 *  4. Demote-before-promote: rules 2 and 3 are independent per task (a task
 *     already in `'today'` with its own due `scheduledDate` is impossible in
 *     practice — promotion clears `scheduledDate` — but a task in `'week'`
 *     or `'later'` with a due `scheduledDate` only ever hits rule 3). Either
 *     way, a task eligible for both nets into `toToday`, never `toWeek`.
 *  5. Tasks matching neither rule are left untouched (not present in any
 *     result array). This is what keeps `'someday'` a genuine backlog: rule 2
 *     only ever empties `'today'`, so nothing decays out of `'week'`,
 *     `'later'` or `'someday'` on its own — a task leaves those boxes only
 *     when the user moves it or its `scheduledDate` comes due.
 *
 * The caller stamps `lastRolloverDate = today` unconditionally after
 * applying — even when every result array is empty (e.g. `'today'` was
 * already empty and nothing had a due pin) — so today's logical date is
 * marked processed either way. Rerunning with the same `today` is then a
 * fixed point (rule 1 short-circuits it).
 */
export function computeRollover(params: RolloverParams): RolloverResult {
  const { today, lastRolloverDate, tasks } = params;

  const result: RolloverResult = { toWeek: [], toLater: [], toToday: [] };
  if (lastRolloverDate === today) return result;

  for (const task of tasks) {
    const isDuePromotion =
      task.scheduledDate !== null && task.scheduledDate <= today && !task.isCompleted;

    if (isDuePromotion) {
      result.toToday.push(task.id);
    } else if (task.timeBox === 'today') {
      if (task.isCompleted) {
        result.toLater.push(task.id);
      } else {
        result.toWeek.push(task.id);
      }
    }
  }

  return result;
}
