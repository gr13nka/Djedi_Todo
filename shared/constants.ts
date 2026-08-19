import type { PersistedDeviceSettings, PersistedSettings } from './types';

export const ACTIVITY_COLORS = [
  '#E04848', // coral red
  '#2BA89E', // teal
  '#2E96B0', // ocean blue
  '#4CB85A', // green
  '#B06AB3', // plum
  '#D4A017', // amber
  '#9B59B6', // purple
  '#D4873A', // burnt orange
] as const;

export const PROJECT_COLORS = [
  '#D94F5C', // pomegranate
  '#F47B3A', // tangerine
  '#D8A11D', // marigold
  '#86A83D', // olive
  '#35A66B', // fern
  '#13A69A', // jade
  '#258FB8', // lagoon
  '#4D73D9', // cornflower
  '#7562D8', // iris
  '#A957C7', // orchid
  '#D65B93', // raspberry
  '#C66B4E', // terracotta
  '#8A7B32', // brass
  '#4E956F', // eucalyptus
  '#2B7B78', // peacock
  '#516E9F', // denim
  '#8B633F', // walnut
  '#6D667F', // slate violet
] as const;

export const DEFAULT_CUSTOM_THEME_COLORS = {
  bgPrimary: '#1a1a2e',
  bgCard: '#16213e',
  bgElevated: '#1a3a5c',
  textPrimary: '#eaeaea',
  textSecondary: '#a0a0b0',
  textMuted: '#5a5a6e',
  accent: '#e94560',
  accentFg: '#ffffff',
  green: '#27ae60',
  red: '#e74c3c',
  barTrack: '#1a3a5c',
  border: '#1a3a5c',
};

// `satisfies PersistedSettings` is the enforcement: a field added to (or
// removed from) `UserSettings` in shared/types.ts without a matching default
// here is a compile error, not a silent runtime reset. Keeps the `as const`
// literal types below (not widened to the interface's field types).
export const DEFAULT_SETTINGS = {
  dayStartHour: 6,
  dayEndHour: 2,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  maxTasksPerProject: 5,
  autoArchiveCompleted: true,
  archiveCompletedAfterDays: 1,
  autoDeleteArchived: false,
  deleteArchivedAfterDays: 30,
  pointsCounterVisible: true,
  timeTrackingVisible: true,
  lastRolloverDate: null as string | null,
} satisfies PersistedSettings;

// Device-only preferences are intentionally separate from DEFAULT_SETTINGS:
// the latter is exactly what can appear in a vault's settings.json.
export const DEFAULT_DEVICE_SETTINGS = {
  barStyle: 'thick-linear' as const,
  darkMode: false,
  theme: 'light' as const,
  language: 'en' as const,
  navPosition: 'left' as const,
  accentColor: '',
  fontFamily: 'source-serif-4' as const,
  uiZoom: 110,
  projectListFontOverridePx: null as number | null,
  projectNoteFontOverridePx: null as number | null,
  pointsColorFixed: false,
  hiddenNavTabs: [] as string[],
  navTabOrder: [] as string[],
  dropdownFabCorner: 'bottom-right' as const,
  customThemeColors: DEFAULT_CUSTOM_THEME_COLORS,
  vaultEnabled: false,
  vaultPath: '',
  vaultSetupDone: false,
  recentVaults: [] as Array<{ path: string; name: string; lastOpened: string }>,
  bottomNavTabs: ['/inbox', '/projects', '/tasks', '/today', '/settings'] as string[],
  bottomNavScrollable: false,
  bottomNavPages: [
    ['/', '/today', '/projects', '/inbox'],
    ['/tasks', '/settings'],
  ] as string[][],
  projectGridLayout: {
    version: 2,
    cards: {},
    folders: {},
  },
  boardIdleSignalsVisible: false,
  boardZoom: 1,
  projectSidebarWidth: 220,
  projectTaskPaneWidth: 288,
  projectTaskPaneHeight: 240,
  taskSelectionDesktopSwipeEnabled: false,
} satisfies PersistedDeviceSettings;

export const BREAK_ACTIVITY = {
  name: 'Break',
  dailyBudgetMinutes: 60,
  isBreak: true,
};

export const OVERFILL = {
  normalMax: 1.0,
  warningMax: 1.5,
  warningColor: '#C0792E',
  dangerColor: '#C0392B',
} as const;

export const API_PREFIX = '/api';
