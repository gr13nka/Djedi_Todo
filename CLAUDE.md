# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Client-only productivity app: activity time tracking, projects/tasks with folders and time-boxing (today/week/later), inbox quick-capture, analytics, a staleness counter. Offline-first — Dexie (IndexedDB) is the only database. There is no backend server: the pre-refactor Express/REST-sync stack was deleted (`server/` and `client/src/sync/` no longer exist). The only sync mechanism left is Vault sync (Tauri-only, Obsidian-style file sync).

**Tech Stack**: React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4, Zustand 5, Dexie 4 (IndexedDB), Motion (animations), Recharts, React Router 7 | Tauri v2 (desktop + Android) | Vitest (194 tests) | Shared types in `/shared/`

> **History**: `.planning/research/*.md` describe the codebase **before** the 2026-07 trim refactor — they still document habits, mind maps, Pomodoro, task timer, notes, PDF documents, fatigue check, review page, REST sync, gamification/XP, and 11 themes, all of which are now deleted. Treat them as historical background only, never as current fact. The refactor plan (what was cut and why) is at `docs/superpowers/plans/2026-07-21-refactor-trim-and-restructure.md`.

## Commands

```bash
# Client dev (port 5173)
cd client && npm run dev

# Typecheck
cd client && npx tsc --noEmit

# Build (typecheck via tsc -b, then bundle)
cd client && npm run build      # → client/dist/

# Tests (vitest, node environment, src/**/*.test.ts)
cd client && npm run test       # one-shot
cd client && npm run test:watch

# Tauri desktop dev/build
cd client && npm run tauri:dev
cd client && npm run tauri:build

# Android: one-time local SDK/NDK setup, then build/install a debug APK
./setup-android-build-tools.sh
./build-android.sh
# Contributor guide: docs/android-build-and-install.md

# Linux: build, install for the current user, and launch
./build-linux.sh
# Contributor guide: docs/linux-build-and-install.md

# macOS: build .app and install to /Applications
./build-macos.sh
```

No linter is configured. `client/tsconfig.json` has `noUnusedLocals`/`noUnusedParameters` off, so deleting a feature's call sites does not surface newly-dead code via typecheck — grep for it manually (see Tooling notes).

## Iteration completion

At the end of each completed implementation iteration, present the verification result and ask the user whether they want a commit and a push. Do not create either by default. A direct request to commit and/or push for the current iteration is explicit authorization and does not need to be asked again.

## Tooling notes

- **Serena MCP hangs in this repo.** Do not use it (`find_symbol`, `get_symbols_overview`, etc.). Use plain `Read`/`Grep`/`Glob` instead.
- **Plain `grep` output is truncated by the `rtk` shell hook.** For an exhaustive search (e.g. confirming zero remaining references after a deletion), use `rtk proxy grep ...` to bypass the filter.

## File Structure

```
client/src/
├── App.tsx                  # Router (6 routes), starts settings load, task rollover, recurring-task check, backspace guard, vault auto-enable
├── main.tsx / index.css
├── components/
│   ├── activities/          # ActivityCard, ActivityForm, ActivityList, ActivityMenu
│   ├── analytics/           # DailyView, WeeklyView, MonthlyView, StreaksView — rendered inside SettingsPage, not a route
│   ├── inbox/                # InboxView
│   ├── layout/               # AppShell, Sidebar, BottomNav, DesktopBottomNav, DropdownNav, navItems.tsx (shared nav registry: icons + ALL_NAV_ITEMS + NAV_ITEM_MAP)
│   ├── progress/             # ProgressBar, CircularBar, SegmentedBar, ThickLinearBar
│   ├── projects/             # ProjectsView, ProjectTabs, ProjectTaskList, TaskItem, FileTree, RecurrenceEditor, ProjectDraftEditor, ProjectGrid (the board), ProjectSelector, projectCardLayout.ts + useProjectCardLayout.ts (live here, not hooks/), folder/project modals
│   ├── settings/             # ThemeToggle, CustomThemeEditor, BarStylePicker, NavPositionPicker, BottomNavSettings, LanguagePicker, VaultSettings, + 6 more
│   ├── taskSelection/        # TaskSelectionView (box tabs), TaskGroupCard, FolderGroupSection, SelectableTaskRow, StalenessCounter
│   ├── timer/                # TimerDisplay, ManualEntry
│   ├── today/                # TodayTaskCard
│   └── ui/                   # Button, Card, Input, Modal, ConfirmModal, ConfirmDialog, BottomSheet, ContextMenu, InfoTooltip, RotaryDial, EmojiPicker, FolderBrowserModal, InlineTextEdit, VaultSetupModal, Toggle, CompletionBurst, CelebrationConfetti, TaskTextArea
├── db/
│   ├── index.ts              # Dexie schema (v17) + clearAllTables/snapshotAllTables/restoreFromSnapshot (vault-switch only)
│   ├── repository.ts         # Single owner of the record envelope + soft delete (newRecord/updateRecord/softDelete/notDeleted)
│   ├── taskOps.ts            # Cross-project ProjectTask ops: create/delete/toggle, box-order bookkeeping, recurrence spawn
│   ├── rollover.ts           # computeRollover — pure box-move rules, no I/O
│   ├── migrations.ts         # classifyTimeBoxForMigration — v10 upgrade's one-shot classifier
│   └── seed.ts
├── hooks/                    # 23 hooks — see Key Patterns
├── i18n/                     # translations.ts (en, ru only), useTranslation.ts
├── pages/                    # HomePage, ProjectsPage, TaskSelectionPage, TodayPage, InboxPage, SettingsPage — one per route
├── stores/                   # timerStore, settingsStore, projectUIStore (+ inline useSidebarStore in Sidebar.tsx)
├── theme/                    # themes.ts (PREBUILT_THEMES data), applyTheme.ts
├── vault/                    # vaultStore, vaultSync, vaultLayout.ts, vaultKinds.ts, serializers.ts, conflictResolver/threeWayMerge/vaultBase, tauriBackend/memoryBackend/platform, writeQueue/writeGuard/pollingWatcher/fileIndex (Tauri-only file sync)
├── utils/                    # uuid, time, colors, shadows, recurrence, markdown, taskDnd, taskSwipe, taskText, todayReorder, textUndo
└── workers/                  # timer.worker.ts (only worker left — no Pomodoro worker)
shared/
├── types.ts                  # All entity interfaces; UserSettings is the single settings roster
└── constants.ts               # DEFAULT_SETTINGS (satisfies PersistedSettings), ACTIVITY_COLORS, DEFAULT_CUSTOM_THEME_COLORS
```

There is no `server/` directory and no root `package.json` — this is a client-only repo now.

## Architecture

- **Offline-first, client-only**: Dexie (IndexedDB) is the only database. No REST sync, no Express server, no Docker — all deleted in the 2026-07-21 refactor.
- **Vault sync** (Tauri-only): Obsidian-style file sync, the sole remaining sync system. Built on two single-owner registries:
  - `vault/vaultLayout.ts` — the only place that knows an entity kind's directory, filename shape, and Dexie table. Four shapes (`perEntityFile`, `perEntityDir`, `perDateFile`, `singleton`) cover all 8 synced kinds: activities, projects, projectTasks, timeEntries (time-log), todayTasks, inbox, settings, folders.
  - `vault/vaultKinds.ts` — one `VaultKind` object per layout entry, giving `collectFiles`/`discoverPaths`/`parseFile`/`mergeRow`/`gatherWriteSet` uniformly so `vaultSync.ts`'s four fan-outs (export/import/write/external-change) stay generic loops instead of per-kind switches. **Adding a vault-synced entity kind = one `vaultLayout.ts` entry + one `vaultKinds.ts` object.**
  - Note: `todayTasks` is still round-tripped by vault sync (for backward compatibility with pre-refactor vault files) but the app itself never creates new rows in it — `/today` is now driven entirely by `ProjectTask.timeBox` (see Time-boxing below).
- **Conflict resolution** (`vault/conflictResolver.ts` + `vault/threeWayMerge.ts` + `vault/vaultBase.ts`): a file-syncing peer such as Syncthing cannot merge — when two devices edit one file while disconnected it keeps the loser as `<stem>.sync-conflict-<date>-<time>-<device><ext>` and the app, reading only the main file, never sees those edits again. `resolveConflicts()` runs before each import (from `vaultStore.enable`/`syncNow`, against the **real** backend — the memory scan used for import is read-only and cannot delete the copies), merges each copy into its target, and removes it.
  - Merging is **three-way**, against the base recorded in `vaultBase` on every accepted read and every write. A base is required to tell "the other device deleted this" from "I added this"; with no base recorded the merge unions both sides instead, which over-keeps rather than loses.
  - Structured rows merge by `id` + `updatedAt` (the same LWW rule `mergeEntity` applies, so a conflict copy can never resolve differently than a clean sync would). A kind that sets `textField` also merges that field paragraph-wise — `PROJECTS_KIND.textField = 'description'`, because two devices appending to a project note produce two equally valid bodies and LWW would discard one wholesale. A kind that can lose individual rows while its file survives (`PROJECT_TASKS_KIND`) supplies `softDeleteRow`.
  - **Never stamp `Date.now()` into serialized output.** `serializeProjectTasksFile` used to, which made `tasks.md` differ byte-for-byte on every export, bumped its mtime, and had the sync layer propagate a change that never happened — manufacturing conflicts in which the *stale* side won because its re-export carried the *fresher* mtime. `TauriVaultBackend.writeFile` now also skips writes whose content already matches on disk, for the same reason.
- **Data layer single owners**:
  - `db/repository.ts` — the record envelope (`id`/`createdAt`/`updatedAt`/`deletedAt`/`deviceId`) and soft-delete convention, used by every table.
  - `hooks/useEntity.ts` — generic reactive CRUD for a flat table with the standard envelope (not-deleted filter + sort + create/update/remove wired through the repository). Bespoke hooks (`useProjectTasks`, `useTaskBox`, etc.) exist only where per-parent queries or cascades don't fit this shape.
  - `db/taskOps.ts` — cross-project `ProjectTask` writes (create/delete/toggle, recurrence spawn) that can't be scoped to one project's hook.
  - `db/rollover.ts` + `hooks/useTaskRollover.ts` — the daily time-box rollover (pure rule function + the Dexie transaction/idempotency-guard that applies it).
  - `db/migrations.ts` — one-shot classification logic used only by the Dexie v10 upgrade.
- **Settings — split rosters**: `UserSettings`/`DEFAULT_SETTINGS` are the shared behavior settings mirrored to `settings.json`; `DeviceSettings`/`DEFAULT_DEVICE_SETTINGS` hold vault paths, appearance, language, and navigation in a local Dexie row. `settingsStore.load()` combines both records for the UI and `update()` routes each field to its owning table. The theme migration remains local (`darkMode`, retired palettes, and retired languages), while side-effecting concerns retain their named actions.
- **Theming — single data table**: `theme/themes.ts` defines each prebuilt theme's 12 color tokens once (`PREBUILT_THEMES`); `theme/applyTheme.ts` is the only code that writes them onto `<html>` as inline CSS custom properties. `useThemeColors.ts` (Recharts palette) and `ThemeToggle.tsx` (swatch UI) both read `PREBUILT_THEMES` instead of hardcoding colors.
- **Projects board** (`components/projects/projectCardLayout.ts` + `useProjectCardLayout.ts` + `ProjectGrid.tsx`):
  - A frame is `{x, y, w, h, z}` — `x`/`w` are **fractions of board width**, `y`/`h` are **pixels**. Fractions survive a window resize; a pixel height is what decides how much note excerpt a card shows. Stored in `DeviceSettings.projectGridLayout` (v2: `cards` + `folders`), device-local, never vault-synced.
  - **v1 layouts** (`{col,row,colSpan,rowSpan}`) are migrated lazily-but-eagerly: the hook rewrites them as v2 at the first *measured desktop* render, because cells only convert against the column count they were written under and that count is not in the payload. `legacyGridColumnCount` exists solely for this.
  - **No collision avoidance anywhere.** Cards and zones may overlap; whatever was touched last comes to the front of its layer (cards and zones have separate `z` counters, `CARD_LAYER_BASE` lifts cards clear of zones).
  - **Folder membership is geometric**: the zone under a card's **top-left corner** owns it, topmost zone wins. Recomputed after every drop. Moving a zone carries the cards inside it; resizing does not.
  - `reconcileProjectGridLayout` deliberately **never** moves a card to agree with its `folderId` — it cannot tell a stale position from a fresh drop, and a drop reaches the new zone a render before the `folderId` write returns. `useProjectCardLayout` does that correction instead, skipping cards whose folder write is still in flight. This is what makes the phone→desktop refile path work.
  - **Narrow viewports** get a two-column greedy masonry (`layoutMasonryColumns`), ordered by the wide board's `y`. Positions are *not* editable there: the layout is device-local, so a drag could never reach the desktop.
  - `hooks/useProjectsBoard.ts` owns the per-project figures — note excerpt (`stripMarkdown`), open count, and idle days. Idle days comes from task `createdAt`/`completedAt`, **never** `Project.updatedAt`, which is bumped by renames, bulk reorders and vault LWW row replacement.
- **Time-boxing** (replaces the old date-scoped `todayTasks` table): every `ProjectTask` carries `timeBox` (`'today' | 'week' | 'later'`), an optional `scheduledDate` pin, and a cross-project `timeBoxOrder`. `hooks/useTaskBox.ts` is the live-query + move/reorder/toggle surface for one box; `/today` (`TodayPage`) is `useTaskBox('today')`, and `/tasks` (`TaskSelectionView`) has box tabs (`today`/`week`/`later`/`all`, defaulting to **week**). `hooks/useTaskRollover.ts` runs `db/rollover.ts`'s `computeRollover()` on mount and on tab-visibility-regain: it demotes everything left in `'today'` (incomplete → `week`, completed → `later`) and promotes any task whose `scheduledDate` is due, all inside one Dexie transaction that also stamps `settings.lastRolloverDate` (the idempotency guard).
- **Routing**: React Router 7, 6 routes, `AnimatePresence` page transitions (y-slide + fade, 200ms).
- **Navigation**: three modes via `navPosition` (`'left'` sidebar / `'bottom'` desktop bar / `'dropdown'` FAB+menu). Nav item data (icons, routes, labels) lives once in `components/layout/navItems.tsx` (`ALL_NAV_ITEMS` + `NAV_ITEM_MAP`); tab visibility/order/reorder/context-menu logic lives in `hooks/useNavTabs.ts`; the four components (`Sidebar.tsx`, `BottomNav.tsx`, `DesktopBottomNav.tsx`, `DropdownNav.tsx`) and `BottomNavSettings.tsx` only render. Adding or changing a nav item = `navItems.tsx` + translations. `BottomNav` additionally filters by its own `bottomNavTabs`/`bottomNavPages` settings, and has two layouts (classic 4-tabs-+-More vs. a scrollable paged variant), switched by the `bottomNavScrollable` setting.
- **Workers**: only `timer.worker.ts` remains (module-level singleton, survives HMR/StrictMode). No Pomodoro worker.
- **Soft deletes**: every entity uses `deletedAt`; never hard-deleted except the vault's whole-vault `clearAllTables`/`restoreFromSnapshot` pair (`db/index.ts`), used only around a vault switch.
- **Logical date**: `getLogicalDate(dayStartHour, reference?)` (`utils/time.ts`) builds the date from **local** date components (not `toISOString()`, which is UTC) after rolling back one day if the local hour is before `dayStartHour`. Used for `TimeEntry.date`, rollover's `today`, and recurrence-completion dating.

## Routes

| Path | Page Component | Notes |
|------|---------------|-------|
| `/` | `HomePage` | Timer + activity list |
| `/projects` | `ProjectsPage` | Wide + full-bleed. Opens on the **board**; a card opens that project's editor |
| `/tasks` | `TaskSelectionPage` | Wide. All tasks by project/folder; box tabs (today/week/later/all), default **week** |
| `/today` | `TodayPage` | The `'today'` time-box; focus mode overlay |
| `/inbox` | `InboxPage` | Quick-capture inbox |
| `/settings` | `SettingsPage` | Settings tab (7 sections) + Analytics tab (daily/weekly/monthly/streaks sub-tabs) |

**Layout classes** in `AppShell.tsx`: `WIDE_PAGES` = `/projects`, `/tasks`, `/settings` (`max-w-6xl`). `FULL_BLEED_PAGES` = `/projects` only (no padding/max-width).

> There is no `/habits`, `/mindmap`, `/notes`, `/analytics`, or `/review` route — those pages were deleted. Analytics lives inside `/settings` as a tab, not its own route.

## Database

**Dexie (client-only) — schema version 17.** 10 tables are declared: `activities`, `timeEntries`, `settings`, `deviceSettings`, `projects`, `projectTasks`, `todayTasks`, `projectFolders`, `inboxItems`, `vaultBase`.

- **Active**: `activities`, `timeEntries`, `settings`, `projects`, `projectTasks`, `projectFolders`, `inboxItems`.
- **Device-local (never vault-synced)**: `deviceSettings` (vault paths, appearance, language, navigation) and `vaultBase` (added in v14 — the last-agreed content of each vault file, keyed by path; the common ancestor for conflict merging). Neither has a `vaultLayout` entry, which is what keeps them off the vault.
- **Legacy stores dropped**: schema v17 (2026-08) dropped the six retired-legacy stores (`habits`, `habitEntries`, `notes`, `pomodoroPresets`, `mindMaps`, `pdfDocuments`) outright — a delta `.stores()` call with nulls; any pre-refactor rows were discarded, since no code could read them anyway.
- **`todayTasks`**: no longer written by the app's own UI (superseded by `timeBox` on `projectTasks`), but still declared and still round-tripped by vault sync for backward compatibility with vaults written by older builds.

All records carry: `id` (UUID v7), `createdAt`, `updatedAt`, `deletedAt`, `deviceId` — except the `settings` row, a fixed-id (`'default'`) singleton with no `createdAt`/`deletedAt`.

**v10 migration** (`db/index.ts` + `db/migrations.ts`): adds `timeBox`/`scheduledDate` indexes to `projectTasks`; a one-shot `classifyTimeBoxForMigration` assigns every pre-existing task `'today'` or `'later'` (never `'week'` — no historical signal for it) based on whether it was in the old `todayTasks` list, and stamps `settings.lastRolloverDate` in the same transaction so `useTaskRollover` doesn't immediately re-demote what the migration just placed in `'today'`.

## Stores

3 Zustand stores in `client/src/stores/` + 1 inline store in `Sidebar.tsx`:

| Store | Purpose | Persistence |
|-------|---------|-------------|
| `timerStore` | Active timer lifecycle: `start()`/`stop()`/`tick()`/`restore()`. `restore()` only resumes a timer this device started (ignores a running entry synced from another device — clock skew renders as negative elapsed). | Dexie `timeEntries` |
| `settingsStore` | Combined shared and device-local settings + `loaded` + theme/accent/zoom/nav-tab actions | Dexie `settings` + local `deviceSettings` singleton rows |
| `projectUIStore` | Project editor UI: open tabs, active tab, sidebar collapse, split direction, per-project task drafts, quick-add draft | Ephemeral |
| `useSidebarStore` (in `Sidebar.tsx`) | `collapsed` toggle | Ephemeral |

No Pomodoro store, no Task Timer store, no Mind Map UI store — those features are gone.

## Theming System

3 themes: `light`, `dark` (both data objects in `theme/themes.ts`'s `PREBUILT_THEMES`), and `custom` (user-defined, colors in `settingsStore.customThemeColors`). Down from 11 pre-refactor.

- `ThemeColors`/`CustomThemeColors` share the same 12-field shape; `THEME_COLOR_CSS_VARS` (`theme/themes.ts`) is the single map from field name to CSS custom property.
- `theme/applyTheme.ts`'s `applyTheme()` is the only place that writes those properties onto `<html>` (inline styles, not a CSS class per theme) — it also toggles the `dark`/`custom` marker classes that `index.css`'s remaining shadow rules select on.
- `useThemeColors()` / `useIsDark()` (`hooks/useThemeColors.ts`) and `ThemeToggle.tsx`'s swatches both read `PREBUILT_THEMES` directly — neither hardcodes a color.
- `BarStyle` still has 3 values (`thick-linear`, `segmented`, `circular`) — unrelated to theme, unchanged.

### How to Add a New Prebuilt Theme (now 2 files)

1. **`client/src/theme/themes.ts`** — add an entry to `PREBUILT_THEMES` with the 12 `ThemeColors` fields and a `labelKey`.
2. **`client/src/i18n/translations.ts`** — add that `labelKey` (e.g. `'settings.themeMyTheme'`) to both `en` and `ru`.

`ThemeToggle.tsx`, `applyTheme.ts`, and `useThemeColors.ts` all consume `PREBUILT_THEMES` already — no other file needs touching, and `settingsStore.load()`'s theme-migration branch only needs updating if you ever *remove* a theme.

### Custom Theme (User-Defined)

Unchanged in spirit: `CustomThemeEditor.tsx` shows 12 color pickers, stored in `settingsStore.customThemeColors` (Dexie-persisted). `setCustomColors()`/`setTheme('custom')` route through `applyTheme('custom', colors)`, the same function prebuilt themes use.

## Key Patterns

- **Hover-reveal**: secondary controls hide until hover ONLY behind the `can-hover:` variant (`index.css` `@custom-variant`, `(hover:hover) and (pointer:fine)`). Canonical recipe: `transition-opacity can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100` (`focus-within:` when the hidden element wraps the focusable). Never write a bare `opacity-0 group-hover:opacity-100` — it makes the control unreachable on touch (Android/Tauri).
- **Hook pattern**: `hooks/useEntity.ts` gives flat tables reactive CRUD for free (not-deleted filter, sort, create/update/remove via `db/repository.ts`). A hook that needs per-parent scoping or cascades (e.g. `useProjectTasks`, `useTaskBox`) stays bespoke on top of the same repository primitives instead of using `useEntity` directly.
- **Cascade soft deletes**: still handled in hooks, not the DB (e.g. deleting a project soft-deletes its tasks). `db/repository.ts` deliberately does not own cross-table cascades.
- **Recurrence spawn**: `db/taskOps.ts`'s `spawnNextOccurrence()` is the single implementation shared by both triggers that can complete a recurring task — the interactive toggle (`useProjectTasks`/`useTaskBox`'s `toggleProjectTask`) and the background catch-up scan (`useRecurringTaskCheck`, for tasks completed while the app wasn't running).
- **Staleness counter** (`hooks/useStalenessScore.ts`): sum of every incomplete task's age² in days, recomputed every minute; higher is worse. Setting names (`pointsCounterVisible`, `pointsColorFixed`) are legacy from when this was a points/gamification feature — kept as-is, no gamification/XP system remains anywhere in the code.
- **Settings pipeline**: add a field to `UserSettings` (`shared/types.ts`) → add its default to `DEFAULT_SETTINGS` (`shared/constants.ts`, enforced by `satisfies PersistedSettings`) → build UI in `components/settings/` calling `settingsStore.getState().update({ myField: value })` or a dedicated action. No separate "handle missing field in `load()`" step is needed unless the new field needs a non-default migration — `pickKnownSettings` + the `...DEFAULT_SETTINGS` spread already covers "missing".
- **Worker singleton**: `useTimer` keeps `timer.worker.ts` as a module-level singleton to survive HMR/StrictMode double-mounts.
- **Drag-and-drop**: `utils/taskDnd.ts` + `hooks/useReorderList.ts` are the shared primitives behind every draggable list (project tasks, box tabs, task selection rows) — payload encode/decode, copy-vs-move modifier detection, and the drag-index/hit-test bookkeeping for row reordering.
- **Note undo**: `utils/textUndo.ts` — pure undo/redo history with 500ms typing coalescing, module-level per-project Map; wired into `ProjectDraftEditor`.
- **Animation springs**: `stiffness: 400, damping: 25–30` standard; toggle thumb `500/30`.

## Features

- **Activity Time Tracking**: core timer (`HomePage`), manual entry, daily budgets.
- **Projects & Tasks**: folder hierarchy, tabbed project editor (`ProjectsView`/`ProjectTabs`), recurrence (daily/weekly/monthly), drag-reorder, `maxTasksPerProject` limit.
- **Projects board** (`/projects` landing view): free-placed, freely-sized, overlapping project cards showing a note excerpt, laid out on one canvas with folder zones behind them. Nothing is auto-opened — the board is what the route shows until a card is clicked.
- **Time-boxing**: today/week/later boxes on every task (`ProjectTask.timeBox`), manual promote/demote, optional `scheduledDate` pin, automatic daily rollover. Replaces the old date-scoped Today List.
- **Task archive**: completed → `archivedAt` stamped after `archiveCompletedAfterDays` logical days (0 = at completion; `autoArchiveCompleted`, default on/1 day) → soft-deleted `deleteArchivedAfterDays` days after archival (`autoDeleteArchived`, default off). The sweep runs in the daily rollover; recurring tasks are never auto-deleted. Archived tasks live in a collapsed Archive section of the project task list with restore (clears `archivedAt`) and delete.
- **Inbox**: quick-capture, sort into projects, soft-delete with an explicit undelete ("Undo") path.
- **Analytics**: daily/weekly/monthly summaries + per-activity streaks (Recharts), embedded as a tab inside `/settings` (not its own route).
- **Staleness Counter**: quadratic incomplete-task-age score, visibility toggle (`pointsCounterVisible`).
- **Vault Sync** (Tauri-only): Obsidian-style file sync for activities, projects, projectTasks, timeEntries, todayTasks (legacy round-trip only), inbox, folders, and shared behavior settings. Vault paths plus appearance and navigation are device-local. Blocks app rendering on non-web Tauri platforms until local vault setup is completed (`VaultSetupModal`).

**Deleted in the 2026-07 refactor** (do not re-introduce without checking the refactor plan): habits, habit tracking, mind maps, Pomodoro, task timer, notes ("Ideas"), PDF documents, fatigue check, review page, REST sync + Express server, gamification/XP, procrastination checker, timer notifications, 8 of 11 themes, 3 of 5 languages (zh/es/pt).

## i18n

2 languages: `en`, `ru` (`shared/types.ts`'s `Language` union). `TranslationKey` is derived as `keyof typeof en` and exported from `i18n/translations.ts`; `ru` is typed as `Record<TranslationKey, string>`, so a key missing from `ru` is a compile error. Add new keys to **both** blocks. `settingsStore.load()` falls back a saved `zh`/`es`/`pt` row to `'en'`.

## How to Add...

### New Page

1. **`client/src/pages/MyPage.tsx`** — page component.
2. **`client/src/App.tsx`** — add the `<Route>`.
3. **`AppShell.tsx`** — add to `WIDE_PAGES`/`FULL_BLEED_PAGES` if needed.
4. **`components/layout/navItems.tsx`** — add one entry to `ALL_NAV_ITEMS` (icon + labelKey); the four nav components and `BottomNavSettings` pick it up automatically.
5. **`i18n/translations.ts`** — add `'nav.mypage'` to both `en` and `ru`.

### New Dexie Table

1. **`shared/types.ts`** — entity interface (`id`/`createdAt`/`updatedAt`/`deletedAt`/`deviceId`).
2. **`client/src/db/index.ts`** — bump the version, add a `.stores({...})` call (reuse the previous version's unchanged tables verbatim — Dexie upgrade transactions can only touch tables named in their own version's call).
3. **`client/src/hooks/useMyData.ts`** — wrap `hooks/useEntity.ts` if it's a flat table, or write a bespoke hook on `db/repository.ts` primitives otherwise.
4. **`client/src/db/seed.ts`** — optional default data.
5. If vault-synced: add a `vault/vaultLayout.ts` entry + a `vault/vaultKinds.ts` object (see Architecture above).

### New Settings Field

1. **`shared/types.ts`** — add the field to `UserSettings`.
2. **`shared/constants.ts`** — add its default to `DEFAULT_SETTINGS` (the `satisfies PersistedSettings` check fails to compile if you forget).
3. Build UI in `components/settings/` calling `update({ myField })` or a dedicated action.
4. **`i18n/translations.ts`** — labels in both `en`/`ru` if the UI needs them.

### New Translation Keys

Add to both `en` and `ru` blocks in `i18n/translations.ts`. `TranslationKey` is derived from `en`; `ru`'s `Record<TranslationKey, string>` annotation makes a missing key a type error.

## Deep Documentation (historical — pre-refactor)

`.planning/research/*.md` (FEATURE_INTERACTIONS, DATA_FLOWS, COMPONENT_CATALOG, DEPENDENCIES_AND_PITFALLS, SUMMARY) describe the codebase **before** the 2026-07-21 trim refactor. They are useful for historical "why did this exist" context but actively wrong about current routes, tables, stores, and features — do not trust them for present-tense facts. For what changed and why, read `docs/superpowers/plans/2026-07-21-refactor-trim-and-restructure.md`.
