export interface Activity {
  id: string;
  name: string;
  color: string;
  dailyBudgetMinutes: number;
  isBreak: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
}

export interface TimeEntry {
  id: string;
  activityId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  isManual: boolean;
  date: string; // YYYY-MM-DD logical day
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
}

export type NavPosition = 'left' | 'bottom' | 'dropdown';

export type AppFont = 'source-serif-4' | 'ibm-plex-sans' | 'nunito-sans' | 'departure-mono';

/**
 * Shared settings: every field the app persists to Dexie's `settings` table
 * and mirrors to the vault's `settings.json`. Device-specific preferences
 * deliberately live in `DeviceSettings` below and are never exported.
 *
 * `id`/`updatedAt`/`deviceId` are the Dexie row envelope for this singleton
 * row — see `PersistedSettings` for the roster without them. Unlike every
 * other table, the settings row has no `createdAt`/`deletedAt`: it's a
 * fixed-id singleton, not a soft-deletable envelope record (see
 * `db/seed.ts`).
 */
export interface UserSettings {
  id: string;
  dayStartHour: number;
  dayEndHour: number;
  timezone: string;
  maxTasksPerProject: number;
  /** Whether the sweep auto-archives completed tasks after `archiveCompletedAfterDays`. */
  autoArchiveCompleted: boolean;
  /** Logical days a completed task stays in working views before archiving; `0` = immediately on completion. */
  archiveCompletedAfterDays: number;
  /** Whether the sweep auto-soft-deletes archived tasks after `deleteArchivedAfterDays`. */
  autoDeleteArchived: boolean;
  /** Logical days after `archivedAt` (not completion) before an archived task is soft-deleted. */
  deleteArchivedAfterDays: number;
  pointsCounterVisible: boolean;
  /** Whether the time-tracking UI is available. Existing time data is preserved. */
  timeTrackingVisible: boolean;
  /** Logical date (YYYY-MM-DD) the box-rollover last ran; `null` before the v10 migration or first rollover. Guards `useTaskRollover()` idempotency. */
  lastRolloverDate: string | null;
  updatedAt: string;
  deviceId: string;
}

/** The settings roster minus the Dexie row envelope — what `DEFAULT_SETTINGS` supplies and `SettingsState` persists. */
export type PersistedSettings = Omit<UserSettings, 'id' | 'updatedAt' | 'deviceId'>;

/**
 * The content of one vault file as this device last agreed on it — written
 * after every accepted read and every successful write. It is the common
 * ancestor that lets `vault/threeWayMerge.ts` reconcile a Syncthing conflict
 * copy without resurrecting deleted text: absent a base, "deleted there" and
 * "added here" are the same observation.
 *
 * Device-local on purpose, and deliberately absent from `vaultLayout` — a
 * synced base would be rewritten by the very peer it is meant to be compared
 * against, which is exactly the ancestor a three-way merge cannot use.
 */
export interface VaultBaseEntry {
  /** Vault-relative path, e.g. `projects/Name (019ab)/project.md`. */
  path: string;
  content: string;
  recordedAt: string;
}

/**
 * Preferences tied to this installation rather than the shared vault. These
 * are stored in Dexie's `deviceSettings` table, so Syncthing can never move a
 * vault path or overwrite a device's presentation/navigation choices.
 */
export interface DeviceSettings {
  id: string;
  barStyle: BarStyle;
  darkMode: boolean; // legacy mirror of `theme`, never set independently
  theme: ThemeMode;
  language: Language;
  navPosition: NavPosition;
  accentColor: string;
  fontFamily: AppFont;
  uiZoom: number;
  projectListFontOverridePx: number | null;
  projectNoteFontOverridePx: number | null;
  pointsColorFixed: boolean;
  hiddenNavTabs: string[];
  navTabOrder: string[];
  dropdownFabCorner: string;
  customThemeColors: CustomThemeColors;
  vaultEnabled: boolean;
  vaultPath: string;
  vaultSetupDone: boolean;
  recentVaults: Array<{ path: string; name: string; lastOpened: string }>;
  bottomNavTabs: string[];
  bottomNavScrollable: boolean;
  bottomNavPages: string[][];
  projectGridLayout: ProjectGridLayout;
  /** Shows both board idle-day counts and the tree's no-next-action dots. */
  boardIdleSignalsVisible: boolean;
  /** Board zoom factor. Scales the canvas visually; the stored frames never change. */
  boardZoom: number;
  /** Pane sizes on /projects, in pixels. Device-local, like the board layout they sit beside. */
  projectSidebarWidth: number;
  projectTaskPaneWidth: number;
  projectTaskPaneHeight: number;
  taskSelectionDesktopSwipeEnabled: boolean;
}

export type PersistedDeviceSettings = Omit<DeviceSettings, 'id'>;

/**
 * One rectangle on the projects board — a project card, or (from v2 on) a folder zone.
 *
 * Horizontal geometry is a fraction of the board's width while vertical geometry is in
 * pixels. A fraction keeps an arrangement intact when the window is resized; a height in
 * pixels is the honest unit for "how much of the note excerpt does this card show".
 */
export interface ProjectCardFrame {
  /** Left edge, as a fraction of board width (0..1). */
  x: number;
  /** Top edge, in pixels from the top of the board. */
  y: number;
  /** Width, as a fraction of board width (0..1]. */
  w: number;
  /** Height, in pixels. */
  h: number;
  /** Stacking order among overlapping frames; the one touched last sits highest. */
  z: number;
}

export interface ProjectGridLayout {
  version: 2;
  /** Card rectangles keyed by project id. */
  cards: Record<string, ProjectCardFrame>;
  /** Folder-zone rectangles keyed by folder id; filled once zones land. */
  folders: Record<string, ProjectCardFrame>;
}

export type BarStyle = 'thick-linear' | 'segmented' | 'circular';

export type ThemeMode =
  | 'light'
  | 'wax-light' | 'wax-dark'
  | 'gruvbox-dark' | 'gruvbox-light'
  | 'everforest-dark' | 'everforest-light'
  | 'catppuccin-mocha' | 'catppuccin-latte'
  | 'nord'
  | 'solarized-dark' | 'solarized-light'
  | 'dracula'
  | 'custom';

export interface CustomThemeColors {
  bgPrimary: string;
  bgCard: string;
  bgElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentFg: string;
  green: string;
  red: string;
  barTrack: string;
  border: string;
}

export type Language = 'en' | 'ru';

export interface TimerState {
  activeEntryId: string | null;
  activeActivityId: string | null;
  startedAt: string | null;
  elapsed: number; // seconds
  isRunning: boolean;
}

export interface ProjectFolder {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  parentFolderId: string | null;
  isExpanded: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
  isArchived: boolean;
  folderId: string | null;
  linkedActivityId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
}

/**
 * Which task box a task currently lives in, in descending order of commitment:
 * 'today' and 'week' are active work, 'later' is committed but not this week,
 * and 'someday' is the uncommitted backlog every newly-created task starts in.
 * Only 'today' is emptied automatically (see `computeRollover`).
 */
export type TimeBox = 'today' | 'week' | 'later' | 'someday';

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  isCompleted: boolean;
  completedAt: string | null;
  /** Set when the auto-archive sweep (or immediate mode) hides a completed task from working views; cleared on un-complete/restore. */
  archivedAt: string | null;
  recurrenceRule: RecurrenceRule | null;
  lastRecurredDate: string | null;
  /** Which box (today/week/later/someday) the task currently lives in. */
  timeBox: TimeBox;
  /** Optional pin to a logical date (YYYY-MM-DD); not the default workflow — most tasks flow through the boxes unpinned. */
  scheduledDate: string | null;
  /** Manual order within the current box (cross-project — distinct from `sortOrder`, which is per-project). */
  timeBoxOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
}

export interface TodayTask {
  id: string;
  projectTaskId: string;
  projectId: string;
  sortOrder: number;
  isCompleted: boolean;
  completedAt: string | null;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
}

export interface InboxItem {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
}
