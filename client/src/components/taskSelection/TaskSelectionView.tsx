import React, { useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAllProjectTasks, type TaskGroup } from '../../hooks/useAllProjectTasks';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { moveTaskToBox } from '../../hooks/useTaskBox';
import { useProjects } from '../../hooks/useProjects';
import { useReorderList } from '../../hooks/useReorderList';
import { useTranslation } from '../../i18n/useTranslation';
import type { TranslationKey } from '../../i18n/translations';
import { useProjectUIStore } from '../../stores/projectUIStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { normalizeTaskText } from '../../utils/taskText';
import { NEU } from '../../utils/shadows';
import { InfoTooltip } from '../ui/InfoTooltip';
import { BottomSheet } from '../ui/BottomSheet';
import { TaskTextArea } from '../ui/TaskTextArea';
import { StalenessCounter } from './StalenessCounter';
import { TaskGroupCard, type TaskSortMode } from './TaskGroupCard';
import { FolderGroupSection } from './FolderGroupSection';
import { SelectableTaskRow } from './SelectableTaskRow';
import { db } from '../../db';
import { createProjectTask, deleteProjectTask, moveTaskToProject, toggleProjectTask } from '../../db/taskOps';
import type { ProjectTask, TimeBox } from '@shared/types';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

type ViewMode = 'grouped' | 'flat';

/** Which time-box the list is scoped to — 'all' turns the filter off entirely. */
type BoxTab = TimeBox | 'all';

const BOX_TABS: BoxTab[] = ['today', 'week', 'later', 'someday', 'all'];

const BOX_TAB_LABEL_KEYS: Record<BoxTab, TranslationKey> = {
  today: 'taskSelection.boxToday',
  week: 'taskSelection.boxWeek',
  later: 'taskSelection.boxLater',
  someday: 'taskSelection.boxSomeday',
  all: 'taskSelection.boxAll',
};

function getStalenessScore(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / 86400000;
  return Math.round(ageDays * ageDays);
}

/**
 * Filters one project's task lists down to `boxTab` ('all' is a no-op).
 * Shared by the folder-grouped and flat-grouped render paths so the box-tab
 * rule (filter incomplete + completed by `timeBox`) is stated once.
 */
function filterGroupByBox(group: TaskGroup, boxTab: BoxTab): TaskGroup {
  if (boxTab === 'all') return group;
  return {
    project: group.project,
    incompleteTasks: group.incompleteTasks.filter((t) => t.timeBox === boxTab),
    completedTasks: group.completedTasks.filter((t) => t.timeBox === boxTab),
  };
}

export function TaskSelectionView() {
  const { t } = useTranslation();
  const { groups, folderGroups } = useAllProjectTasks();
  const { projects, reorderProjects } = useProjects();
  const taskSelectionDesktopSwipeEnabled = useSettingsStore((s) => s.taskSelectionDesktopSwipeEnabled);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<TaskSortMode>('custom');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const isDesktop = useMediaQuery('(min-width: 768px)');
  // Default 'week': the daily flip-through-and-promote habit this view
  // exists for — /today already owns the today-only view.
  const [boxTab, setBoxTab] = useState<BoxTab>('week');

  // Quick add task state
  const [addingTask, setAddingTask] = useState(false);
  // Draft lives in the store so navigating away from /tasks and back does not
  // discard it — same reason as the project task list.
  const newTaskTitle = useProjectUIStore((s) => s.quickAddDraft);
  const setNewTaskTitle = useProjectUIStore((s) => s.setQuickAddDraft);
  const [newTaskProjectId, setNewTaskProjectId] = useState('');
  const addInputRef = useRef<HTMLTextAreaElement>(null);

  // Flat view custom order override (only 'custom' sort mode uses it)
  const [flatOrder, setFlatOrder] = useState<string[] | null>(null);

  // Flat view completed section
  const [flatCompletedCollapsed, setFlatCompletedCollapsed] = useState(true);
  const [projectMoveTask, setProjectMoveTask] = useState<ProjectTask | null>(null);

  const swipeRowsEnabled = !isDesktop || taskSelectionDesktopSwipeEnabled;

  // Switching box tab drops any in-progress custom flat order — the same
  // reasoning as `handleSortMode` below: a manual order captured against one
  // tab's visible rows doesn't carry meaning once a different set of rows is
  // showing.
  const handleBoxTab = useCallback((tab: BoxTab) => {
    setBoxTab(tab);
    setFlatOrder(null);
  }, []);

  // Build project lookup for flat view
  const projectMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string; icon: string }>();
    for (const g of groups) {
      map.set(g.project.id, { name: g.project.name, color: g.project.color, icon: g.project.icon ?? '' });
    }
    return map;
  }, [groups]);

  // All incomplete tasks for flat view, filtered to the active box tab ('all' = no filter)
  const allIncompleteTasks = useMemo(() => {
    const tasks: ProjectTask[] = [];
    for (const g of groups) {
      tasks.push(...g.incompleteTasks);
    }
    return boxTab === 'all' ? tasks : tasks.filter((t) => t.timeBox === boxTab);
  }, [groups, boxTab]);

  // All completed tasks for flat view, same box filter
  const allCompletedTasks = useMemo(() => {
    const tasks: ProjectTask[] = [];
    for (const g of groups) {
      tasks.push(...g.completedTasks);
    }
    return boxTab === 'all' ? tasks : tasks.filter((t) => t.timeBox === boxTab);
  }, [groups, boxTab]);

  // Grouped view: same box filter applied per-project, then drop projects
  // left with no matching incomplete tasks (their completed tasks, if any,
  // go with them — a project section that's entirely inactive for this box
  // isn't worth showing on it).
  const boxFilteredGroups = useMemo(() => {
    const filtered = groups.map((g) => filterGroupByBox(g, boxTab));
    return boxTab === 'all' ? filtered : filtered.filter((g) => g.incompleteTasks.length > 0);
  }, [groups, boxTab]);

  const boxFilteredFolderGroups = useMemo(() => {
    return folderGroups
      .map((fg) => ({
        folder: fg.folder,
        projects: fg.projects
          .map((g) => filterGroupByBox(g, boxTab))
          .filter((g) => boxTab === 'all' || g.incompleteTasks.length > 0),
      }))
      .filter((fg) => fg.projects.length > 0);
  }, [folderGroups, boxTab]);

  // Sorted flat tasks
  const sortedFlatTasks = useMemo(() => {
    const tasks = [...allIncompleteTasks];
    switch (sortMode) {
      case 'points':
        return tasks.sort((a, b) => getStalenessScore(b.createdAt) - getStalenessScore(a.createdAt));
      case 'created-asc':
        return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case 'created-desc':
        return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      case 'custom': {
        if (flatOrder) {
          const orderMap = new Map(flatOrder.map((id, i) => [id, i]));
          return tasks.sort((a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999));
        }
        return tasks;
      }
      default:
        return tasks;
    }
  }, [allIncompleteTasks, sortMode, flatOrder]);

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const toggleProject = useCallback((projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  // Project drag/drop (grouped mode, no folders). Sourced from
  // `boxFilteredGroups`, not raw `groups` — drag is only enabled in 'custom'
  // sort (below), and in that mode `sortedGroups` is exactly
  // `boxFilteredGroups`, so row indices this hook computes line up with what
  // the box tab actually has on screen.
  const projectReorder = useReorderList({
    items: boxFilteredGroups,
    getId: (g) => g.project.id,
    getLabel: (g) => g.project.name,
    onReorder: reorderProjects,
  });

  // Flat view drag/drop — reordering only sets the local override; it isn't persisted.
  const flatReorder = useReorderList({
    items: sortedFlatTasks,
    getId: (t: ProjectTask) => t.id,
    getLabel: (t: ProjectTask) => t.title,
    onReorder: setFlatOrder,
  });

  const sortedGroups = useMemo(() => {
    if (sortMode === 'created') {
      return [...boxFilteredGroups].sort((a, b) => a.project.createdAt.localeCompare(b.project.createdAt));
    }
    return boxFilteredGroups;
  }, [boxFilteredGroups, sortMode]);

  const hasFolders = folderGroups.some((fg) => fg.folder !== null);

  // Grouped-mode drag (project rows here, and TaskGroupCard's internal task
  // rows) is only meaningful when the FULL task set is on screen — under a
  // filtered box tab, a drag would renumber just the visible subset over the
  // global sortOrder/timeBoxOrder, interleaving oddly with the hidden rows
  // once the filter is lifted. ANDed with `sortMode === 'custom'` at each use
  // site (project-row drag below, and inside TaskGroupCard for task drag).
  const groupDragEnabled = boxTab === 'all';

  // Quick add task. The new task lands in the box the user is currently
  // looking at, so it doesn't disappear the moment it's created; the 'all'
  // tab implies no box, so it falls back to `createProjectTask`'s default.
  const handleAddTask = async () => {
    const title = normalizeTaskText(newTaskTitle);
    if (!title || !newTaskProjectId) return;
    await createProjectTask(
      newTaskProjectId,
      title,
      null,
      boxTab === 'all' ? 'someday' : boxTab,
    );
    setNewTaskTitle('');
    addInputRef.current?.focus();
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTask();
    } else if (e.key === 'Escape') {
      setAddingTask(false);
      setNewTaskTitle('');
    }
  };

  // Non-archived projects for the picker
  const availableProjects = useMemo(
    () => projects.filter((p) => !p.isArchived),
    [projects],
  );

  const projectMoveTargets = useMemo(
    () => availableProjects.filter((p) => p.id !== projectMoveTask?.projectId),
    [availableProjects, projectMoveTask?.projectId],
  );

  const handleMoveTaskToProject = async (targetProjectId: string) => {
    if (!projectMoveTask) return;
    await moveTaskToProject(projectMoveTask.id, targetProjectId);
    setProjectMoveTask(null);
  };

  // Set default project when opening add bar
  const openAddBar = () => {
    setAddingTask(true);
    if (!newTaskProjectId && availableProjects.length > 0) {
      setNewTaskProjectId(availableProjects[0].id);
    }
    setTimeout(() => addInputRef.current?.focus(), 50);
  };

  // Reset flat order when switching sort modes
  const handleSortMode = (mode: TaskSortMode) => {
    setSortMode(mode);
    if (mode !== 'custom') setFlatOrder(null);
  };

  // Grouped sort mode (only custom/created for grouped view)
  const groupedSortMode: TaskSortMode = sortMode === 'custom' || sortMode === 'created' ? sortMode : 'custom';

  // Available sort options based on view mode
  const sortOptions: { value: TaskSortMode; label: string }[] = useMemo(() => {
    if (viewMode === 'flat') {
      return [
        { value: 'custom', label: t('taskSelection.sortCustom') },
        { value: 'points', label: t('taskSelection.sortPoints') },
        { value: 'created-desc', label: t('taskSelection.sortNewest') },
        { value: 'created-asc', label: t('taskSelection.sortOldest') },
      ];
    }
    return [
      { value: 'custom', label: t('taskSelection.sortCustom') },
      { value: 'created', label: t('taskSelection.sortCreated') },
    ];
  }, [viewMode, t]);

  return (
    <div>
      {/* Header row: title + points */}
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t('taskSelection.title')}
        </h1>
        <InfoTooltip
          text={t('taskSelection.tooltip')}
        />
        <StalenessCounter />
      </div>

      {/* Box tab row: which time-box to show, layered above the view/sort controls */}
      <div className="flex flex-wrap items-center gap-0.5 mb-2">
        {BOX_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => handleBoxTab(tab)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              boxTab === tab
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {t(BOX_TAB_LABEL_KEYS[tab])}
          </button>
        ))}
      </div>

      {/* Controls row: view toggle + sort dropdown */}
      <div className="flex items-center gap-2 mb-4">
        {/* View mode toggle */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'grouped'
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {t('taskSelection.viewGrouped')}
          </button>
          <button
            onClick={() => setViewMode('flat')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'flat'
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {t('taskSelection.viewFlat')}
          </button>
        </div>

        {/* Sort dropdown */}
        <select
          value={viewMode === 'grouped' ? groupedSortMode : sortMode}
          onChange={(e) => handleSortMode(e.target.value as TaskSortMode)}
          className="ml-auto text-xs bg-bg-primary text-text-primary border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-accent appearance-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            paddingRight: '24px',
          }}
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Quick add task bar */}
      {availableProjects.length > 0 && (
        <div className="mb-4">
          {addingTask ? (
            <div
              className="flex w-full flex-col gap-2 rounded-2xl bg-bg-card p-2.5 sm:flex-row sm:items-start"
              style={{ boxShadow: NEU.pressed }}
            >
              <TaskTextArea
                textareaRef={addInputRef}
                value={newTaskTitle}
                onValueChange={setNewTaskTitle}
                onCommit={handleAddTask}
                onKeyDown={handleAddKeyDown}
                placeholder={t('taskSelection.addTask')}
                focusOnMount
                className="min-h-10 flex-1 px-2.5 py-2 text-sm leading-5 text-text-primary placeholder:text-text-muted"
              />
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
                <select
                  value={newTaskProjectId}
                  onChange={(e) => setNewTaskProjectId(e.target.value)}
                  className="max-w-[180px] rounded-xl bg-transparent px-2 py-1 text-xs text-text-secondary focus:outline-none sm:max-w-[140px]"
                  style={{ boxShadow: NEU.pressedSm }}
                >
                  {!newTaskProjectId && (
                    <option value="">{t('taskSelection.selectProject')}</option>
                  )}
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddTask}
                  disabled={!normalizeTaskText(newTaskTitle) || !newTaskProjectId}
                  className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl text-accent transition-opacity disabled:opacity-40"
                  style={{ boxShadow: NEU.raisedSm }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button
                  onClick={() => { setAddingTask(false); setNewTaskTitle(''); }}
                  className="flex-shrink-0 rounded-xl px-1 text-sm text-text-muted transition-colors hover:text-text-secondary focus:outline-none"
                >
                  &times;
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={openAddBar}
              className="flex min-h-[60px] w-full items-center gap-2 rounded-2xl bg-bg-card px-4 py-2.5 text-left text-sm text-text-muted transition-colors hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              style={{ boxShadow: NEU.pressed }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('taskSelection.addTask')}
            </button>
          )}
        </div>
      )}

      {viewMode === 'flat' ? (
        /* ---- FLAT VIEW ---- */
        <motion.div
          className="-mx-2 -my-2 flex flex-col gap-3 px-2 py-2"
          variants={container}
          initial="hidden"
          animate="show"
          {...flatReorder.containerProps}
        >
          {sortedFlatTasks.map((task, i) => {
            const rowProps = flatReorder.getRowProps(i);
            return (
              <motion.div key={task.id} variants={item}>
                <SelectableTaskRow
                  task={task}
                  onMoveToBox={moveTaskToBox}
                  onToggleComplete={() => toggleProjectTask(task.id)}
                  onDelete={() => deleteProjectTask(task.id)}
                  onRename={async (title) => {
                    await db.projectTasks.update(task.id, {
                      title,
                      updatedAt: new Date().toISOString(),
                    });
                  }}
                  reorder={sortMode === 'custom' ? rowProps : undefined}
                  projectInfo={projectMap.get(task.projectId)}
                  swipeEnabled={swipeRowsEnabled}
                  onMoveToProject={setProjectMoveTask}
                />
              </motion.div>
            );
          })}

          {/* Completed section */}
          {allCompletedTasks.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setFlatCompletedCollapsed((p) => !p)}
                className="flex items-center gap-2 py-2 px-1 text-xs text-text-muted hover:text-text-secondary transition-colors w-full"
              >
                <svg
                  className="w-3 h-3 transition-transform duration-200"
                  style={{ transform: flatCompletedCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
                <span>{t('taskSelection.completed')}</span>
                <span className="tabular-nums">{allCompletedTasks.length}</span>
              </button>
              <AnimatePresence initial={false}>
                {!flatCompletedCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    {allCompletedTasks.map((task) => (
                      <SelectableTaskRow
                        key={task.id}
                        task={task}
                        onMoveToBox={moveTaskToBox}
                        onToggleComplete={() => toggleProjectTask(task.id)}
                        onDelete={() => deleteProjectTask(task.id)}
                        onRename={async (title) => {
                          await db.projectTasks.update(task.id, {
                            title,
                            updatedAt: new Date().toISOString(),
                          });
                        }}
                        projectInfo={projectMap.get(task.projectId)}
                        swipeEnabled={swipeRowsEnabled}
                        onMoveToProject={setProjectMoveTask}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      ) : (
        /* ---- GROUPED VIEW ---- */
        <motion.div
          className="flex flex-col gap-4"
          variants={container}
          initial="hidden"
          animate="show"
          {...projectReorder.containerProps}
        >
          {hasFolders ? (
            boxFilteredFolderGroups.map((folderGroup) => {
              const folderId = folderGroup.folder?.id ?? '__unfiled__';
              return (
                <motion.div key={folderId} variants={item}>
                  <FolderGroupSection
                    folder={folderGroup.folder}
                    isCollapsed={collapsedFolders.has(folderId)}
                    onToggle={() => toggleFolder(folderId)}
                    projectCount={folderGroup.projects.length}
                  >
                    {folderGroup.projects.map((group) => (
                      <TaskGroupCard
                        key={group.project.id}
                        project={group.project}
                        tasks={group.incompleteTasks}
                        completedTasks={group.completedTasks}
                        onMoveToBox={moveTaskToBox}
                        onMoveToProject={setProjectMoveTask}
                        swipeEnabled={swipeRowsEnabled}
                        sortMode={groupedSortMode}
                        dragEnabled={groupDragEnabled}
                        isCollapsed={collapsedProjects.has(group.project.id)}
                        onToggleCollapse={() => toggleProject(group.project.id)}
                      />
                    ))}
                  </FolderGroupSection>
                </motion.div>
              );
            })
          ) : (
            sortedGroups.map((group, i) => {
              const rowProps = projectReorder.getRowProps(i);
              return (
                <motion.div key={group.project.id} variants={item}>
                  <TaskGroupCard
                    project={group.project}
                    tasks={group.incompleteTasks}
                    completedTasks={group.completedTasks}
                    onMoveToBox={moveTaskToBox}
                    onMoveToProject={setProjectMoveTask}
                    swipeEnabled={swipeRowsEnabled}
                    sortMode={groupedSortMode}
                    dragEnabled={groupDragEnabled}
                    isCollapsed={collapsedProjects.has(group.project.id)}
                    onToggleCollapse={() => toggleProject(group.project.id)}
                    projectReorder={rowProps}
                  />
                </motion.div>
              );
            })
          )}
        </motion.div>
      )}

      {groups.length === 0 && (
        <div className="text-center text-text-muted text-sm py-12">
          {t('taskSelection.empty')}
        </div>
      )}

      <BottomSheet
        open={projectMoveTask !== null}
        onClose={() => setProjectMoveTask(null)}
        title={t('taskSelection.moveProjectTitle')}
      >
        <div className="flex flex-col gap-1 px-2">
          {projectMoveTargets.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => handleMoveTaskToProject(project.id)}
              className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated/50"
            >
              {project.icon ? (
                <span className="text-base leading-none">{project.icon}</span>
              ) : (
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
              )}
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </button>
          ))}
          {projectMoveTargets.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-text-muted">
              {t('taskSelection.noProjectTargets')}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
