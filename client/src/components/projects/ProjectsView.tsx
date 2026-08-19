import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useProjects } from '../../hooks/useProjects';
import { useActivities } from '../../hooks/useActivities';
import { useFolders } from '../../hooks/useFolders';
import { useProjectTasks } from '../../hooks/useProjectTasks';
import { useProjectUIStore } from '../../stores/projectUIStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTranslation } from '../../i18n/useTranslation';
import { NEU } from '../../utils/shadows';
import { db } from '../../db';
import { FileTree } from './FileTree';
import { ProjectGrid } from './ProjectGrid';
import { ProjectTabs } from './ProjectTabs';
import { ProjectDraftEditor } from './ProjectDraftEditor';
import { ProjectTaskList } from './ProjectTaskList';
import { AddProjectModal } from './AddProjectModal';
import { AddFolderModal } from './AddFolderModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useProjectTypography } from '../settings/projectTypography';

const MIN_TREE_SIDEBAR = 160;
const MAX_TREE_SIDEBAR = 400;
const MIN_GRID_SIDEBAR = 280;
const MAX_GRID_SIDEBAR = 640;
const MIN_TASK_PANEL = 200;
const MAX_TASK_PANEL = 500;
const MIN_TASK_PANEL_HEIGHT = 80;
const MAX_TASK_PANEL_HEIGHT_RATIO = 0.7;

export function ProjectsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projects, createProject, updateProject, deleteProject, moveProjects } = useProjects();
  const { activities } = useActivities();
  const timeTrackingVisible = useSettingsStore((s) => s.timeTrackingVisible);
  const { projectListFontPx } = useProjectTypography();
  const { folders, createFolder } = useFolders();
  const inboxCount = useLiveQuery(
    () => db.inboxItems.filter((i) => !i.deletedAt).count(),
    [],
  );
  // Open-task count per project for the card badge. Completed (and therefore
  // archived) tasks are excluded — the badge answers "how much is left here".
  const taskCounts = useLiveQuery(
    () => db.projectTasks.filter(t => !t.deletedAt && !t.isCompleted).toArray().then(tasks => {
      const counts: Record<string, number> = {};
      for (const task of tasks) {
        counts[task.projectId] = (counts[task.projectId] ?? 0) + 1;
      }
      return counts;
    }),
    [],
  );
  const activeTabId = useProjectUIStore((s) => s.activeTabId);
  // Tasks dragged out of the task panel into the description are soft-deleted
  // through the same cascade every other deletion uses — useProjectTasks owns
  // that logic, including its transaction.
  const { deleteTask: deleteProjectTask } = useProjectTasks(activeTabId);
  const openTabs = useProjectUIStore((s) => s.openTabs);
  const openTab = useProjectUIStore((s) => s.openTab);
  const setActiveTab = useProjectUIStore((s) => s.setActiveTab);
  const clearActiveTab = useProjectUIStore((s) => s.clearActiveTab);
  const closeTab = useProjectUIStore((s) => s.closeTab);
  const sidebarCollapsed = useProjectUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useProjectUIStore((s) => s.toggleSidebar);
  const splitDirection = useProjectUIStore((s) => s.splitDirection);
  const setSplitDirection = useProjectUIStore((s) => s.setSplitDirection);
  const navPosition = useSettingsStore((s) => s.navPosition);
  const projectGridEnabled = useSettingsStore((s) => s.projectGridEnabled);
  const projectGridLayout = useSettingsStore((s) => s.projectGridLayout);
  const updateSettings = useSettingsStore((s) => s.update);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [gridDeleteProject, setGridDeleteProject] = useState<typeof projects[0] | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [addProjectFolderId, setAddProjectFolderId] = useState<string | null>(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Mobile bottom sheet state (persisted in store to survive navigation)
  const sheetHeight = useProjectUIStore((s) => s.mobileSheetHeight);
  const setSheetHeight = useProjectUIStore((s) => s.setMobileSheetHeight);
  const [isDragging, setIsDragging] = useState(false);
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ y: number; height: number } | null>(null);
  const didDragRef = useRef(false);

  // Auto-open first project when no tab is active. Mobile grid mode remains a
  // picker; desktop grid mode is just an alternate sidebar, so the editor stays open.
  useEffect(() => {
    if (!isDesktop && projectGridEnabled) return;
    if (activeTabId || projects.length === 0) return;
    openTab(projects[0].id);
  }, [projects, activeTabId, openTab, isDesktop, projectGridEnabled]);

  // Resizable sidebar width
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarMin = projectGridEnabled ? MIN_GRID_SIDEBAR : MIN_TREE_SIDEBAR;
  const sidebarMax = projectGridEnabled ? MAX_GRID_SIDEBAR : MAX_TREE_SIDEBAR;
  const effectiveSidebarWidth = Math.min(sidebarMax, Math.max(sidebarMin, sidebarWidth));

  // Resizable task panel width (vertical split)
  const [taskPanelWidth, setTaskPanelWidth] = useState(288);
  const taskDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Resizable task panel height (horizontal split)
  const [taskPanelHeight, setTaskPanelHeight] = useState(240);
  const taskHeightDragRef = useRef<{ startY: number; startHeight: number; maxHeight: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const cutDescriptionRef = useRef<((start: number, end: number) => void) | null>(null);
  const registerCut = useCallback((cut: (start: number, end: number) => void) => {
    cutDescriptionRef.current = cut;
  }, []);
  const cutDescriptionRange = useCallback((start: number, end: number) => {
    cutDescriptionRef.current?.(start, end);
  }, []);


  const hasBottomNav = !isDesktop && navPosition !== 'dropdown';
  const activeProject = projects.find((p) => p.id === activeTabId) ?? null;
  const hasActiveProject = !!activeProject;

  // Map open tab IDs to project objects for mobile selector
  const openProjects = openTabs.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as typeof projects;

  const handleDelete = () => {
    if (!activeProject) return;
    setShowDeleteConfirm(true);
  };

  // All resize/drag handles use pointer capture on the handle element itself:
  // setPointerCapture guarantees pointerup/pointercancel delivery even when the
  // pointer is released outside the window, so the body cursor/userSelect
  // overrides can never leak (the old window-mouseup approach lost the mouseup
  // off-window and left text selection disabled globally).
  const handleSidebarPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sidebarDragRef.current = { startX: e.clientX, startWidth: effectiveSidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [effectiveSidebarWidth]);

  const handleSidebarPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = sidebarDragRef.current;
    if (!drag) return;
    const newWidth = Math.min(sidebarMax, Math.max(sidebarMin, drag.startWidth + (e.clientX - drag.startX)));
    setSidebarWidth(newWidth);
  }, [sidebarMax, sidebarMin]);

  const handleSidebarPointerEnd = useCallback(() => {
    if (!sidebarDragRef.current) return;
    sidebarDragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleTaskPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    taskDragRef.current = { startX: e.clientX, startWidth: taskPanelWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [taskPanelWidth]);

  const handleTaskPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = taskDragRef.current;
    if (!drag) return;
    // Dragging left increases task panel width
    const newWidth = Math.min(MAX_TASK_PANEL, Math.max(MIN_TASK_PANEL, drag.startWidth - (e.clientX - drag.startX)));
    setTaskPanelWidth(newWidth);
  }, []);

  const handleTaskPointerEnd = useCallback(() => {
    if (!taskDragRef.current) return;
    taskDragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Initialize mobile sheet height on first render / resize
  useEffect(() => {
    if (isDesktop) return;
    const container = mobileContainerRef.current;
    if (!container) return;
    // Only initialize when null; on resize, clamp to valid range
    if (useProjectUIStore.getState().mobileSheetHeight === null) {
      setSheetHeight(container.clientHeight * 0.5);
    }
    const ro = new ResizeObserver(() => {
      const current = useProjectUIStore.getState().mobileSheetHeight;
      if (current === null) {
        setSheetHeight(container.clientHeight * 0.5);
      } else {
        const clamped = Math.min(container.clientHeight * 0.85, Math.max(48, current));
        if (clamped !== current) setSheetHeight(clamped);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [isDesktop, hasActiveProject]); // re-run when project loads (container appears)

  const handleSheetTap = useCallback(() => {
    const container = mobileContainerRef.current;
    if (!container) return;
    const containerH = container.clientHeight;
    const current = useProjectUIStore.getState().mobileSheetHeight;
    if (current === null) return;
    const snapPoints = [48, containerH * 0.5, containerH * 0.85];
    const nearestIdx = snapPoints.reduce((bestIdx, sp, idx) =>
      Math.abs(sp - current) < Math.abs(snapPoints[bestIdx] - current) ? idx : bestIdx, 0);
    const nextIdx = (nearestIdx + 1) % snapPoints.length;
    setSheetHeight(snapPoints[nextIdx]);
  }, [setSheetHeight]);

  const handleSheetTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStartRef.current = { y: touch.clientY, height: sheetHeight ?? 0 };
    didDragRef.current = false;
    setIsDragging(true);
  }, [sheetHeight]);

  const handleSheetTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragStartRef.current || !mobileContainerRef.current) return;
    const touch = e.touches[0];
    const deltaY = dragStartRef.current.y - touch.clientY; // up = positive
    if (Math.abs(deltaY) > 5) didDragRef.current = true;
    const containerH = mobileContainerRef.current.clientHeight;
    const newHeight = Math.min(
      containerH * 0.85,
      Math.max(48, dragStartRef.current.height + deltaY),
    );
    setSheetHeight(newHeight);
  }, []);

  const handleSheetTouchEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
    if (!didDragRef.current) {
      handleSheetTap();
      return;
    }
    const container = mobileContainerRef.current;
    if (!container || sheetHeight === null) return;
    const containerH = container.clientHeight;
    const snapPoints = [48, containerH * 0.5, containerH * 0.85];
    const nearest = snapPoints.reduce((a, b) =>
      Math.abs(b - sheetHeight) < Math.abs(a - sheetHeight) ? b : a,
    );
    setSheetHeight(nearest);
  }, [sheetHeight, handleSheetTap]);

  // Pointer path is mouse/pen only — touch bails out here so the dedicated
  // onTouch* handlers above keep owning touch drags and nothing double-fires.
  const handleSheetPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = { y: e.clientY, height: sheetHeight ?? 0 };
    didDragRef.current = false;
    setIsDragging(true);
    document.body.style.cursor = 'grab';
    document.body.style.userSelect = 'none';
  }, [sheetHeight]);

  const handleSheetPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (!dragStartRef.current || !mobileContainerRef.current) return;
    const deltaY = dragStartRef.current.y - e.clientY;
    if (Math.abs(deltaY) > 5) didDragRef.current = true;
    const containerH = mobileContainerRef.current.clientHeight;
    const newHeight = Math.min(
      containerH * 0.85,
      Math.max(48, dragStartRef.current.height + deltaY),
    );
    setSheetHeight(newHeight);
  }, [setSheetHeight]);

  const handleSheetPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (!dragStartRef.current) return;
    setIsDragging(false);
    dragStartRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (!didDragRef.current) {
      handleSheetTap();
      return;
    }
    const container = mobileContainerRef.current;
    if (!container) return;
    const containerH = container.clientHeight;
    const current = useProjectUIStore.getState().mobileSheetHeight;
    if (current === null) return;
    const snapPoints = [48, containerH * 0.5, containerH * 0.85];
    const nearest = snapPoints.reduce((a, b) =>
      Math.abs(b - current) < Math.abs(a - current) ? b : a,
    );
    setSheetHeight(nearest);
  }, [handleSheetTap, setSheetHeight]);

  const handleSheetPointerCancel = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (!dragStartRef.current) return;
    setIsDragging(false);
    dragStartRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleTaskHeightPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const containerHeight = contentRef.current?.clientHeight ?? 600;
    taskHeightDragRef.current = {
      startY: e.clientY,
      startHeight: taskPanelHeight,
      maxHeight: containerHeight * MAX_TASK_PANEL_HEIGHT_RATIO,
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [taskPanelHeight]);

  const handleTaskHeightPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = taskHeightDragRef.current;
    if (!drag) return;
    // Dragging up increases task panel height
    const newHeight = Math.min(drag.maxHeight, Math.max(MIN_TASK_PANEL_HEIGHT, drag.startHeight - (e.clientY - drag.startY)));
    setTaskPanelHeight(newHeight);
  }, []);

  const handleTaskHeightPointerEnd = useCallback(() => {
    if (!taskHeightDragRef.current) return;
    taskHeightDragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  return (
    <div
      className={`flex overflow-hidden ${
        isDesktop ? 'h-screen-safe' :
        hasBottomNav ? 'h-mobile-with-nav' : 'h-mobile-full'
      }`}
    >
      {/* Mobile tree drawer overlay */}
      <AnimatePresence>
        {mobileTreeOpen && (
          <motion.div
            className="fixed inset-0 z-20 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileTreeOpen(false)}
          >
            <div className="absolute inset-0 bg-black/20" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* File tree sidebar - desktop: resizable, collapsible */}
      {!sidebarCollapsed && (
        <div
          className="hidden md:flex shrink-0 flex-col bg-bg-primary border-r border-border relative select-none"
          style={{ width: effectiveSidebarWidth }}
        >
          <div className="px-3 pt-3 pb-1">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted/70">
              {t('projects.title')}
            </h2>
          </div>
          {projectGridEnabled ? (
            <ProjectGrid
              viewport="desktop"
              variant="desktop-sidebar"
              activeProjectId={activeTabId}
              editable
              projects={projects}
              folders={folders}
              taskCounts={taskCounts ?? {}}
              fontPx={projectListFontPx}
              layout={projectGridLayout}
              onLayoutChange={(next) => updateSettings({ projectGridLayout: next })}
              actions={{
                openProject: openTab,
                requestAddProject: (folderId) => {
                  setAddProjectFolderId(folderId);
                  setShowAddProject(true);
                },
                requestAddFolder: () => setShowAddFolder(true),
                requestDeleteProject: (projectId) => {
                  const project = projects.find((p) => p.id === projectId);
                  if (project) setGridDeleteProject(project);
                },
                moveProjectsToFolders: (moves) =>
                  moveProjects(moves.map((move) => ({ id: move.projectId, folderId: move.folderId }))),
              }}
            />
          ) : (
            <FileTree />
          )}
          {/* Resize handle */}
          <div
            onPointerDown={handleSidebarPointerDown}
            onPointerMove={handleSidebarPointerMove}
            onPointerUp={handleSidebarPointerEnd}
            onPointerCancel={handleSidebarPointerEnd}
            className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors z-10"
          />
        </div>
      )}

      {/* File tree sidebar - mobile drawer */}
      <AnimatePresence>
        {mobileTreeOpen && (
          <motion.div
            className="fixed top-0 left-0 bottom-0 z-20 w-[87.5vw] bg-bg-primary md:hidden flex flex-col text-[15px]"
            style={{ boxShadow: NEU.sidebarRight }}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <div className="px-4 pb-1" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-text-muted/70">
                {t('projects.title')}
              </h2>
            </div>
            <FileTree />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right panel - tabs + content, fills all remaining space */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div
          className="flex md:hidden items-center gap-2 border-b border-border px-2 py-1.5 shrink-0 bg-bg-primary select-none"
          style={{ paddingTop: 'calc(0.375rem + env(safe-area-inset-top, 0px))' }}
        >
          {projectGridEnabled && activeProject ? (
            /* Grid mode: editor bar — back + name + hamburger */
            <>
              <button
                onClick={clearActiveTab}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted shrink-0"
                style={{ boxShadow: NEU.raisedSm }}
                title={t('projects.back')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="flex-1 text-text-primary font-medium truncate" style={{ fontSize: `${projectListFontPx}px` }}>
                {activeProject.icon ? `${activeProject.icon} ` : ''}{activeProject.name}
              </span>
              <button
                onClick={() => setMobileTreeOpen(!mobileTreeOpen)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted shrink-0"
                style={{ boxShadow: NEU.raisedSm }}
              >
                {mobileTreeOpen ? '✕' : '☰'}
              </button>
            </>
          ) : projectGridEnabled && !activeProject ? (
            /* Grid mode: grid title bar */
            <>
              <span className="flex-1 text-sm text-text-primary font-medium">{t('projects.title')}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowAddFolder(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-accent transition-colors"
                  style={{ boxShadow: NEU.raisedSm }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setAddProjectFolderId(null);
                    setShowAddProject(true);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-accent transition-colors"
                  style={{ boxShadow: NEU.raisedSm }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                {(inboxCount ?? 0) > 0 && (
                  <button
                    onClick={() => navigate('/inbox?mode=sort')}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-accent transition-colors"
                    title={t('projects.sortInbox')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                    </svg>
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Sidemenu mode (default): hamburger + select dropdown */
            <>
              <button
                onClick={() => setMobileTreeOpen(!mobileTreeOpen)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted shrink-0"
                style={{ boxShadow: NEU.raisedSm }}
              >
                {mobileTreeOpen ? '✕' : '☰'}
              </button>
              {openProjects.length > 0 ? (
                <select
                  value={activeTabId ?? ''}
                  onChange={(e) => setActiveTab(e.target.value)}
                  className="flex-1 min-w-0 bg-bg-primary text-text-primary rounded-lg px-2 py-1 border border-border appearance-none truncate"
                  style={{ boxShadow: NEU.pressedSm, fontSize: `${projectListFontPx}px` }}
                >
                  {openProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ${p.name}` : p.name}</option>
                  ))}
                </select>
              ) : (
                <span className="flex-1 text-sm text-text-muted truncate">{t('projects.title')}</span>
              )}
              <div className="flex items-center gap-1 shrink-0">
                {(inboxCount ?? 0) > 0 && (
                  <button
                    onClick={() => navigate('/inbox?mode=sort')}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-accent transition-colors"
                    title={t('projects.sortInbox')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                    </svg>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Desktop tab bar - hidden on mobile */}
        <div className="group/topbar hidden md:flex items-center border-b border-border px-2 py-1 shrink-0 bg-bg-primary select-none">
          {/* Sidebar toggle button (desktop only) */}
          <button
            onClick={toggleSidebar}
            className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-secondary rounded transition-colors shrink-0 mr-1"
            title={t('projects.toggleSidebar')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              {sidebarCollapsed ? (
                <polyline points="14 9 17 12 14 15" />
              ) : (
                <polyline points="17 9 14 12 17 15" />
              )}
            </svg>
          </button>

          <ProjectTabs />

          <div className="flex items-center gap-1 ml-auto pl-2 shrink-0">
            {/* Sort Inbox button */}
            {(inboxCount ?? 0) > 0 && (
              <button
                onClick={() => navigate('/inbox?mode=sort')}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium text-text-muted hover:text-accent transition-colors"
                title={t('projects.sortInbox')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
                {t('projects.sortInbox')} ({inboxCount})
              </button>
            )}

            {/* Split direction toggle (desktop only) */}
            <button
              onClick={() => setSplitDirection(splitDirection === 'vertical' ? 'horizontal' : 'vertical')}
              className="hidden lg:flex w-6 h-6 items-center justify-center text-text-muted hover:text-text-secondary rounded transition-opacity can-hover:opacity-0 can-hover:group-hover/topbar:opacity-100 focus-visible:opacity-100"
              title={splitDirection === 'vertical' ? t('projects.splitHorizontal') : t('projects.splitVertical')}
            >
              {splitDirection === 'vertical' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="12" y1="3" x2="12" y2="21" />
                </svg>
              )}
            </button>

            {activeProject && (
              <button
                onClick={handleDelete}
                className="text-[11px] text-text-muted hover:text-red transition-opacity can-hover:opacity-0 can-hover:group-hover/topbar:opacity-100 focus-visible:opacity-100"
              >
                {t('projects.delete')}
              </button>
            )}
          </div>
        </div>

        {/* Content area */}
        {activeProject ? (
          isDesktop ? (
            /* Desktop: split pane layout */
            <motion.div
              ref={contentRef}
              key={activeProject.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className={`flex-1 flex min-h-0 overflow-hidden ${
                splitDirection === 'vertical' ? 'flex-row' : 'flex-col'
              }`}
            >
              {/* Editor panel */}
              <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-3">
                <ProjectDraftEditor
                  projectId={activeProject.id}
                  title={activeProject.name}
                  description={activeProject.description}
                  color={activeProject.color}
                  icon={activeProject.icon ?? ''}
                  onSaveProject={(data) => updateProject(activeProject.id, data)}
                  onSave={(description) => updateProject(activeProject.id, { description })}
                  {...(timeTrackingVisible ? {
                    linkedActivityId: activeProject.linkedActivityId ?? null,
                    onLinkActivity: (activityId: string | null) => updateProject(activeProject.id, { linkedActivityId: activityId }),
                    activities,
                  } : {})}
                  onConsumeTask={deleteProjectTask}
                  onRegisterCut={registerCut}
                />
              </div>
              {/* Task panel resize handle — desktop only */}
              {splitDirection === 'vertical' ? (
                <div
                  onPointerDown={handleTaskPointerDown}
                  onPointerMove={handleTaskPointerMove}
                  onPointerUp={handleTaskPointerEnd}
                  onPointerCancel={handleTaskPointerEnd}
                  className="w-1 shrink-0 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors border-l border-border"
                />
              ) : (
                <div
                  onPointerDown={handleTaskHeightPointerDown}
                  onPointerMove={handleTaskHeightPointerMove}
                  onPointerUp={handleTaskHeightPointerEnd}
                  onPointerCancel={handleTaskHeightPointerEnd}
                  className="h-1 shrink-0 cursor-row-resize hover:bg-accent/30 active:bg-accent/50 transition-colors border-t border-border"
                />
              )}
              {/* Task panel */}
              <div
                className="overflow-y-auto p-3 select-none"
                style={
                  splitDirection === 'vertical'
                    ? { width: taskPanelWidth, flexShrink: 0 }
                    : { height: taskPanelHeight, flexShrink: 0 }
                }
              >
                <ProjectTaskList projectId={activeProject.id} onCutDescriptionRange={cutDescriptionRange} />
              </div>
            </motion.div>
          ) : (
            /* Mobile: editor + draggable bottom sheet */
            <motion.div
              ref={mobileContainerRef}
              key={activeProject.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {/* Editor — fills space above sheet */}
              <div style={{ flex: 1, minHeight: '15%' }} className="overflow-y-auto p-3">
                <ProjectDraftEditor
                  projectId={activeProject.id}
                  title={activeProject.name}
                  description={activeProject.description}
                  color={activeProject.color}
                  icon={activeProject.icon ?? ''}
                  onSaveProject={(data) => updateProject(activeProject.id, data)}
                  onSave={(description) => updateProject(activeProject.id, { description })}
                  {...(timeTrackingVisible ? {
                    linkedActivityId: activeProject.linkedActivityId ?? null,
                    onLinkActivity: (activityId: string | null) => updateProject(activeProject.id, { linkedActivityId: activityId }),
                    activities,
                  } : {})}
                  onConsumeTask={deleteProjectTask}
                  onRegisterCut={registerCut}
                />
              </div>

              {/* Bottom sheet */}
              <div
                style={{
                  height: sheetHeight ?? 0,
                  transition: isDragging ? 'none' : 'height 0.3s ease-out',
                }}
                className="shrink-0 flex flex-col bg-bg-card rounded-t-2xl border-t border-border select-none"
              >
                {/* Drag handle */}
                <div
                  onTouchStart={handleSheetTouchStart}
                  onTouchMove={handleSheetTouchMove}
                  onTouchEnd={handleSheetTouchEnd}
                  onPointerDown={handleSheetPointerDown}
                  onPointerMove={handleSheetPointerMove}
                  onPointerUp={handleSheetPointerUp}
                  onPointerCancel={handleSheetPointerCancel}
                  className="flex justify-center py-3 cursor-grab touch-none"
                >
                  <div className="w-12 h-1.5 rounded-full bg-text-muted/40" />
                </div>
                {/* Task list — scrollable */}
                <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
                  <ProjectTaskList projectId={activeProject.id} onCutDescriptionRange={cutDescriptionRange} />
                </div>
              </div>
            </motion.div>
          )
        ) : !isDesktop && projectGridEnabled ? (
          <ProjectGrid
            viewport="mobile"
            variant="mobile-picker"
            activeProjectId={activeTabId}
            editable={false}
            projects={projects}
            folders={folders}
            taskCounts={taskCounts ?? {}}
            fontPx={projectListFontPx}
            layout={projectGridLayout}
            onLayoutChange={(next) => updateSettings({ projectGridLayout: next })}
            actions={{
              openProject: openTab,
              requestAddProject: (folderId) => {
                setAddProjectFolderId(folderId);
                setShowAddProject(true);
              },
              requestAddFolder: () => setShowAddFolder(true),
              requestDeleteProject: (projectId) => {
                const project = projects.find((p) => p.id === projectId);
                if (project) setGridDeleteProject(project);
              },
              moveProjectsToFolders: (moves) =>
                moveProjects(moves.map((move) => ({ id: move.projectId, folderId: move.folderId }))),
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            {t('projects.empty')}
          </div>
        )}
      </div>

      {/* Modals for project grid */}
      <AddFolderModal
        open={showAddFolder}
        onClose={() => setShowAddFolder(false)}
        onAdd={async (data) => { await createFolder(data.name, data.color); }}
      />
      <AddProjectModal
        open={showAddProject}
        onClose={() => {
          setShowAddProject(false);
          setAddProjectFolderId(null);
        }}
        usedColors={projects.map((p) => p.color)}
        onAdd={async (data) => {
          const p = await createProject({ ...data, folderId: addProjectFolderId });
          openTab(p.id);
          setAddProjectFolderId(null);
        }}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          if (activeProject) {
            closeTab(activeProject.id);
            deleteProject(activeProject.id);
          }
        }}
        title={t('projects.delete')}
        message={t('projects.deleteConfirm')}
      />

      {/* Grid long-press/context delete */}
      <ConfirmModal
        open={!!gridDeleteProject}
        onClose={() => setGridDeleteProject(null)}
        onConfirm={() => {
          if (gridDeleteProject) {
            closeTab(gridDeleteProject.id);
            deleteProject(gridDeleteProject.id);
            setGridDeleteProject(null);
          }
        }}
        title={t('projects.delete')}
        message={t('projects.deleteConfirm')}
      />
    </div>
  );
}
