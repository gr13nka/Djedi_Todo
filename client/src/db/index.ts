import Dexie, { type EntityTable } from 'dexie';
import type { Activity, DeviceSettings, TimeEntry, UserSettings, Project, ProjectTask, TodayTask, ProjectFolder, InboxItem, TimeBox, VaultBaseEntry } from '@shared/types';
import { DEFAULT_DEVICE_SETTINGS, DEFAULT_SETTINGS } from '@shared/constants';
import { classifyTimeBoxForMigration } from './migrations';
import { getLogicalDate } from '../utils/time';

const db = new Dexie('TimeTrackerDB') as Dexie & {
  activities: EntityTable<Activity, 'id'>;
  timeEntries: EntityTable<TimeEntry, 'id'>;
  settings: EntityTable<UserSettings, 'id'>;
  deviceSettings: EntityTable<DeviceSettings, 'id'>;
  projects: EntityTable<Project, 'id'>;
  projectTasks: EntityTable<ProjectTask, 'id'>;
  todayTasks: EntityTable<TodayTask, 'id'>;
  projectFolders: EntityTable<ProjectFolder, 'id'>;
  inboxItems: EntityTable<InboxItem, 'id'>;
  vaultBase: EntityTable<VaultBaseEntry, 'path'>;
};

db.version(1).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
});

db.version(2).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
});

db.version(3).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
});

db.version(4).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
});

db.version(5).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
});

db.version(6).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
}).upgrade(tx => {
  tx.table('projects').toCollection().modify(p => {
    if (p.folderId === undefined) p.folderId = null;
  });
  tx.table('projectTasks').toCollection().modify(t => {
    if (t.recurrenceRule === undefined) t.recurrenceRule = null;
    if (t.lastRecurredDate === undefined) t.lastRecurredDate = null;
  });
});

db.version(7).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
});

db.version(8).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
  mindMaps: 'id, deletedAt, updatedAt',
});

db.version(9).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
  mindMaps: 'id, deletedAt, updatedAt',
  pdfDocuments: 'id, isPinned, deletedAt, updatedAt',
});

db.version(10).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt, timeBox, scheduledDate',
  // Unchanged from v9 — re-declared (not just projectTasks) because the upgrade
  // below reads todayTasks (to classify) and writes settings (to stamp
  // lastRolloverDate), and a Dexie upgrade transaction can only touch tables
  // named in its own version's stores() call.
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
  mindMaps: 'id, deletedAt, updatedAt',
  pdfDocuments: 'id, isPinned, deletedAt, updatedAt',
}).upgrade(async tx => {
  const settingsRow = await tx.table('settings').get('default');
  const dayStartHour = settingsRow?.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour;
  const today = getLogicalDate(dayStartHour);

  // "In today's list" = a non-deleted TodayTask row for today's logical date —
  // the only signal the pre-box data model has for "the user picked this for
  // today". Preloaded as a Set so classifying each task is an O(1) lookup.
  const todayRows = await tx.table('todayTasks')
    .filter((t: TodayTask) => !t.deletedAt && t.date === today)
    .toArray();
  const inTodayListIds = new Set(todayRows.map((t: TodayTask) => t.projectTaskId));

  // Soft-deleted rows are included on purpose — they keep a valid timeBox
  // even though no view queries them, so nothing downstream has to special-case
  // a missing field on undelete or vault re-import.
  const tasks = await tx.table('projectTasks').toArray();
  tasks.sort((a, b) => (a.projectId === b.projectId ? a.sortOrder - b.sortOrder : (a.projectId < b.projectId ? -1 : 1)));

  const boxOrderCounters: Record<TimeBox, number> = { today: 0, week: 0, later: 0 };
  const reclassified = tasks.map(task => {
    const timeBox = classifyTimeBoxForMigration(task, inTodayListIds.has(task.id), today, dayStartHour);
    return { ...task, timeBox, scheduledDate: null, timeBoxOrder: boxOrderCounters[timeBox]++ };
  });
  if (reclassified.length) await tx.table('projectTasks').bulkPut(reclassified);

  // Stamped in the same transaction as the classification above: without it,
  // useTaskRollover() (added later) would see `lastRolloverDate` as unset and
  // immediately demote everything this migration just placed in 'today'.
  if (settingsRow) {
    await tx.table('settings').update('default', { lastRolloverDate: today });
  }
});

// Settings-only migration: no new indexes, but existing vaults need explicit
// values so a later sync exports the new appearance and tracking preferences.
db.version(11).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt, timeBox, scheduledDate',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
  mindMaps: 'id, deletedAt, updatedAt',
  pdfDocuments: 'id, isPinned, deletedAt, updatedAt',
}).upgrade(async tx => {
  const settings = await tx.table('settings').get('default');
  if (!settings) return;
  await tx.table('settings').update('default', {
    timeTrackingVisible: settings.timeTrackingVisible ?? DEFAULT_SETTINGS.timeTrackingVisible,
    projectListFontOverridePx: settings.projectListFontOverridePx ?? null,
    projectNoteFontOverridePx: settings.projectNoteFontOverridePx ?? null,
    theme: settings.theme === 'dark' ? 'gruvbox-dark' : (settings.theme === 'notion' || settings.theme === 'neu-light' ? 'light' : settings.theme),
  });
});

// Settings-only migration: switch the existing install base to the new
// editorial default and make the preference explicit for vault sync.
db.version(12).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt, timeBox, scheduledDate',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
  mindMaps: 'id, deletedAt, updatedAt',
  pdfDocuments: 'id, isPinned, deletedAt, updatedAt',
}).upgrade(async tx => {
  const settings = await tx.table('settings').get('default');
  if (!settings) return;
  await tx.table('settings').update('default', {
    fontFamily: DEFAULT_DEVICE_SETTINGS.fontFamily,
  });
});

// Split preferences that describe this installation from settings that belong
// to the shared vault. Existing values are retained locally, while future
// vault imports can no longer overwrite paths, appearance, or navigation.
db.version(13).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  deviceSettings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt, timeBox, scheduledDate',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
  mindMaps: 'id, deletedAt, updatedAt',
  pdfDocuments: 'id, isPinned, deletedAt, updatedAt',
}).upgrade(async tx => {
  const settings = await tx.table('settings').get('default') as Record<string, unknown> | undefined;
  if (!settings) return;

  const device: Record<string, unknown> = { id: 'default', ...DEFAULT_DEVICE_SETTINGS };
  for (const key of Object.keys(DEFAULT_DEVICE_SETTINGS)) {
    if (settings[key] != null) device[key] = settings[key];
    delete settings[key];
  }
  await tx.table('deviceSettings').put(device);
  await tx.table('settings').put(settings);
});

// Record what each vault file looked like at the last agreed sync, so a
// Syncthing conflict copy can be merged three-way instead of one side
// winning wholesale. Starts empty: with no base recorded, the first merge
// after this upgrade unions both sides rather than inferring deletions.
db.version(14).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  deviceSettings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt, timeBox, scheduledDate',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
  mindMaps: 'id, deletedAt, updatedAt',
  pdfDocuments: 'id, isPinned, deletedAt, updatedAt',
  vaultBase: 'path',
});

// Generalize the old mobile-only project grid preference into a device-local
// project card grid setting and initialize the desktop card layout container.
db.version(15).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  deviceSettings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt, timeBox, scheduledDate',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
  mindMaps: 'id, deletedAt, updatedAt',
  pdfDocuments: 'id, isPinned, deletedAt, updatedAt',
  vaultBase: 'path',
}).upgrade(async tx => {
  const raw = await tx.table('deviceSettings').get('default') as Record<string, unknown> | undefined;
  if (!raw) return;

  // Both retired flags picked between a board and a list; there is only the board now.
  const next = { ...raw };
  delete next.mobileProjectGrid;
  delete next.projectGridEnabled;

  await tx.table('deviceSettings').put({
    ...next,
    projectGridLayout: raw.projectGridLayout ?? DEFAULT_DEVICE_SETTINGS.projectGridLayout,
  });
});

// Device-local task-selection gesture preference. No new indexes; existing
// installs just need the explicit default in deviceSettings.
db.version(16).stores({
  activities: 'id, name, sortOrder, deletedAt, updatedAt',
  timeEntries: 'id, activityId, date, startedAt, endedAt, deletedAt, updatedAt',
  settings: 'id',
  deviceSettings: 'id',
  habits: 'id, name, sortOrder, deletedAt, updatedAt',
  habitEntries: 'id, habitId, date, deletedAt, updatedAt, [habitId+date]',
  notes: 'id, isPinned, deletedAt, updatedAt',
  pomodoroPresets: 'id, name, sortOrder, deletedAt, updatedAt',
  projects: 'id, name, folderId, sortOrder, isArchived, deletedAt, updatedAt',
  projectTasks: 'id, projectId, sortOrder, isCompleted, deletedAt, updatedAt, timeBox, scheduledDate',
  todayTasks: 'id, projectTaskId, projectId, date, isCompleted, deletedAt, updatedAt',
  projectFolders: 'id, name, parentFolderId, sortOrder, deletedAt, updatedAt',
  inboxItems: 'id, deletedAt, updatedAt',
  mindMaps: 'id, deletedAt, updatedAt',
  pdfDocuments: 'id, isPinned, deletedAt, updatedAt',
  vaultBase: 'path',
}).upgrade(async tx => {
  const raw = await tx.table('deviceSettings').get('default') as Record<string, unknown> | undefined;
  if (!raw) return;
  await tx.table('deviceSettings').put({
    ...raw,
    taskSelectionDesktopSwipeEnabled: typeof raw.taskSelectionDesktopSwipeEnabled === 'boolean'
      ? raw.taskSelectionDesktopSwipeEnabled
      : DEFAULT_DEVICE_SETTINGS.taskSelectionDesktopSwipeEnabled,
  });
});

// Drop the six legacy stores left behind by the 2026-07 feature trim. A
// stores() call is a delta — unmentioned tables carry over unchanged, and
// `null` physically deletes the object store; the full re-declaration seen in
// earlier versions is only required when a version has an .upgrade()
// transaction (it can only touch tables named in its own stores() call), which
// v17 doesn't. Any pre-refactor rows still sitting in these stores are
// intentionally and irreversibly discarded — no code has been able to read
// them since the features were deleted.
db.version(17).stores({
  habits: null,
  habitEntries: null,
  notes: null,
  pomodoroPresets: null,
  mindMaps: null,
  pdfDocuments: null,
});

/**
 * Hard-deletes every vault-synced row — the app's only sanctioned
 * exception to the no-hard-deletes/`deletedAt` rule. Irreversible on its
 * own; only ever called from `vaultStore.switchVault`, immediately after
 * `snapshotAllTables()`, so the caller can `restoreFromSnapshot` if the
 * switch fails partway through. Never call this without a snapshot to
 * fall back to.
 */
export async function clearAllTables() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      if (table.name === 'deviceSettings') continue;
      await table.clear();
    }
  });
}

export async function snapshotAllTables(): Promise<Map<string, any[]>> {
  const snapshot = new Map<string, any[]>();
  for (const table of db.tables) {
    if (table.name === 'deviceSettings') continue;
    snapshot.set(table.name, await table.toArray());
  }
  return snapshot;
}

/**
 * Wipes every table and bulk-restores rows from a prior
 * `snapshotAllTables()` — the rollback half of the `clearAllTables` /
 * vault-switch exception to no-hard-deletes. Only called from
 * `vaultStore.switchVault`'s catch block, to undo a `clearAllTables` whose
 * subsequent import failed. Not a general-purpose backup/restore API.
 */
export async function restoreFromSnapshot(snapshot: Map<string, any[]>): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      if (table.name === 'deviceSettings') continue;
      await table.clear();
    }
    for (const table of db.tables) {
      if (table.name === 'deviceSettings') continue;
      const rows = snapshot.get(table.name);
      if (rows?.length) await table.bulkPut(rows);
    }
  });
}

export { db };
