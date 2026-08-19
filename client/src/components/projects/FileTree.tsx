import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useFolders } from '../../hooks/useFolders';
import { useProjects } from '../../hooks/useProjects';
import { useProjectsBoard } from '../../hooks/useProjectsBoard';
import { useProjectUIStore } from '../../stores/projectUIStore';
import { useTranslation } from '../../i18n/useTranslation';
import { NEU } from '../../utils/shadows';
import { AddProjectModal } from './AddProjectModal';
import { AddFolderModal } from './AddFolderModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { InlineTextEdit } from '../ui/InlineTextEdit';
import { useProjectTypography } from '../settings/projectTypography';
import { startDrag, useDropTarget } from '../../hooks/useDragGesture';
import type { ProjectFolder, Project } from '@shared/types';

interface ContextMenuState {
  x: number;
  y: number;
  project: Project;
}

export function FileTree() {
  const { t } = useTranslation();
  const { folders, createFolder, updateFolder, deleteFolder, toggleExpanded } = useFolders();
  const { projects, createProject, deleteProject, moveProject, updateProject } = useProjects();
  const { facts: boardFacts, idleSignalsVisible } = useProjectsBoard(projects);
  const openCounts = useMemo(
    () => Object.fromEntries(Object.entries(boardFacts).map(([id, fact]) => [id, fact.openCount])),
    [boardFacts],
  );
  const { projectListFontPx } = useProjectTypography();
  const openTab = useProjectUIStore((s) => s.openTab);
  const closeTab = useProjectUIStore((s) => s.closeTab);
  const activeTabId = useProjectUIStore((s) => s.activeTabId);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [addProjectFolderId, setAddProjectFolderId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<Project | null>(null);
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const activeProjects = projects.filter((p) => !p.isArchived);
  const inactiveProjects = projects.filter((p) => p.isArchived);
  const visibleProjects = showInactive ? projects : activeProjects;

  const projectsByFolder = (folderId: string) =>
    visibleProjects.filter((p) => p.folderId === folderId);

  const unfiledProjects = visibleProjects.filter((p) => !p.folderId);

  const handleNewFolder = async (data: { name: string; color: string }) => {
    await createFolder(data.name, data.color);
  };

  const handleDeleteFolder = (id: string) => {
    setConfirmDeleteFolderId(id);
  };

  const handleRenameFolder = (id: string, name: string) => {
    updateFolder(id, { name });
    setRenamingFolderId(null);
  };

  const handleAddProject = async (data: { name: string; color: string; icon?: string }) => {
    const p = await createProject({ ...data, folderId: addProjectFolderId });
    openTab(p.id);
  };

  const handleContextMenu = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, project });
  };

  // `ContextMenu` closes itself after an item runs, so none of these do.
  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    const project = contextMenu?.project;
    if (!project) return [];
    const items: ContextMenuItem[] = [];
    if (project.folderId) {
      items.push({ label: t('projects.moveToRoot'), onClick: () => moveProject(project.id, null) });
    }
    items.push({
      label: project.isArchived ? t('projects.activate') : t('projects.deactivate'),
      onClick: () => updateProject(project.id, { isArchived: !project.isArchived }),
    });
    items.push({
      label: t('projects.delete'),
      onClick: () => setConfirmDeleteProject(project),
      danger: true,
    });
    return items;
  }, [contextMenu?.project, moveProject, t, updateProject]);

  /**
   * Dragging a project row. The row is a `<button>`, so the press has to become
   * a drag without ever looking like a click — the drag channel holds the press
   * until it has moved, then swallows the click the mouse emits on release.
   */
  const startProjectDrag = useCallback(
    (project: Project) => (e: React.PointerEvent<HTMLElement>) => {
      startDrag(e, {
        ghost: { label: project.name, color: project.color, icon: project.icon || undefined },
        payload: { kind: 'project', projectId: project.id },
      });
    },
    [],
  );

  /**
   * Everything in the tree that is not a folder row means "no folder" — a
   * project row, the gap below the list, the unfiled divider. Registered on the
   * scroll container, so the folder rows nested inside it win wherever they
   * overlap and this catches the rest.
   */
  const { ref: rootDropRef, isOver: isDragOverRoot } = useDropTarget({
    accepts: (drag) => drag.spec.payload?.kind === 'project',
    onDrop: (drag) => {
      const payload = drag.spec.payload;
      if (payload?.kind === 'project') moveProject(payload.projectId, null);
    },
  });

  return (
    <div className="flex flex-col h-full">
      {/* Action buttons at top */}
      <div className="flex gap-1 px-1.5 py-1.5 border-b border-border justify-start">
        <button
          onClick={() => setShowAddFolder(true)}
          className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-secondary rounded-md transition-colors"
          style={{ boxShadow: NEU.raisedSm }}
          title={t('folders.newFolder')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-secondary rounded-md transition-colors"
          style={{ boxShadow: NEU.raisedSm }}
          title={t('projects.newProject')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </button>
        {inactiveProjects.length > 0 && (
          <button
            onClick={() => setShowInactive((s) => !s)}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ml-auto ${
              showInactive ? 'text-accent' : 'text-text-muted hover:text-text-secondary'
            }`}
            style={{ boxShadow: showInactive ? NEU.pressedSm : NEU.raisedSm }}
            title={t('projects.showInactive')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        )}
      </div>

      {/* Scrollable tree */}
      <div
        ref={rootDropRef}
        className={`flex-1 overflow-y-auto pt-1 px-1 ${isDragOverRoot ? 'bg-accent/10' : ''} transition-colors`}
      >
        {folders.map((folder) => (
          <FolderRow
            key={folder.id}
            folder={folder}
            projects={projectsByFolder(folder.id)}
            openCounts={openCounts}
            showStalled={idleSignalsVisible}
            fontPx={projectListFontPx}
            activeTabId={activeTabId}
            onToggle={() => toggleExpanded(folder.id)}
            onProjectClick={openTab}
            onDelete={() => handleDeleteFolder(folder.id)}
            renaming={renamingFolderId === folder.id}
            renameLabel={t('common.rename')}
            onStartRename={() => setRenamingFolderId(folder.id)}
            onRename={(name) => handleRenameFolder(folder.id, name)}
            onCancelRename={() => setRenamingFolderId(null)}
            onContextMenu={handleContextMenu}
            onProjectPointerDown={startProjectDrag}
            onMoveProject={moveProject}
          />
        ))}

        {unfiledProjects.length > 0 && folders.length > 0 && (
          <div className="flex items-center gap-2 px-2 my-1">
            <div className="flex-1 h-px bg-text-muted/15" />
            <span className="text-[9px] uppercase tracking-wider text-text-muted/50">
              {t('folders.unfiled')}
            </span>
            <div className="flex-1 h-px bg-text-muted/15" />
          </div>
        )}

        {unfiledProjects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            fontPx={projectListFontPx}
            isActive={project.id === activeTabId}
            openCount={openCounts[project.id] ?? 0}
            showStalled={idleSignalsVisible}
            onClick={() => openTab(project.id)}
            onContextMenu={(e) => handleContextMenu(e, project)}
            onPointerDown={startProjectDrag(project)}
          />
        ))}
      </div>

      <ContextMenu
        items={contextMenuItems}
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        onClose={() => setContextMenu(null)}
      />

      <AddFolderModal
        open={showAddFolder}
        onClose={() => setShowAddFolder(false)}
        onAdd={handleNewFolder}
      />

      <AddProjectModal
        open={showAddProject}
        onClose={() => setShowAddProject(false)}
        onAdd={handleAddProject}
        usedColors={projects.map((p) => p.color)}
      />

      <ConfirmModal
        open={!!confirmDeleteProject}
        onClose={() => setConfirmDeleteProject(null)}
        onConfirm={() => {
          if (confirmDeleteProject) {
            closeTab(confirmDeleteProject.id);
            deleteProject(confirmDeleteProject.id);
          }
        }}
        title={t('projects.delete')}
        message={t('projects.deleteConfirm')}
      />

      <ConfirmModal
        open={!!confirmDeleteFolderId}
        onClose={() => setConfirmDeleteFolderId(null)}
        onConfirm={() => {
          if (confirmDeleteFolderId) {
            deleteFolder(confirmDeleteFolderId);
          }
        }}
        title={t('folders.delete')}
        message={t('folders.deleteConfirm')}
      />
    </div>
  );
}

function FolderRow({
  folder,
  projects,
  openCounts,
  showStalled,
  fontPx,
  activeTabId,
  onToggle,
  onProjectClick,
  onDelete,
  renaming,
  renameLabel,
  onStartRename,
  onRename,
  onCancelRename,
  onContextMenu,
  onProjectPointerDown,
  onMoveProject,
}: {
  folder: ProjectFolder;
  projects: Project[];
  /** Incomplete task count per project id, for the rows this folder renders. */
  openCounts: Record<string, number>;
  showStalled: boolean;
  fontPx: number;
  activeTabId: string | null;
  onToggle: () => void;
  onProjectClick: (id: string) => void;
  onDelete: () => void;
  renaming: boolean;
  renameLabel: string;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onContextMenu: (e: React.MouseEvent, project: Project) => void;
  onProjectPointerDown: (project: Project) => (e: React.PointerEvent<HTMLElement>) => void;
  onMoveProject: (projectId: string, folderId: string | null) => void;
}) {
  // The header row is the drop target, not this whole subtree: dropping a
  // project onto one of the folder's own child rows means "no folder", the same
  // as it did when the drop attribute sat here.
  const { ref: folderDropRef, isOver } = useDropTarget({
    accepts: (drag) => drag.spec.payload?.kind === 'project',
    onDrop: (drag) => {
      const payload = drag.spec.payload;
      if (payload?.kind === 'project') onMoveProject(payload.projectId, folder.id);
    },
  });

  return (
    <div>
      <div
        ref={folderDropRef}
        className={`flex items-center gap-1 px-1.5 py-[3px] rounded-md cursor-pointer group transition-colors ${
          isOver ? 'bg-accent/15' : 'hover:bg-bg-elevated/50'
        }`}
        onClick={onToggle}
      >
        <motion.span
          animate={{ rotate: folder.isExpanded ? 90 : 0 }}
          transition={{ duration: 0.12 }}
          className="text-[9px] text-text-muted w-3 h-3 flex items-center justify-center shrink-0"
        >
          &#9654;
        </motion.span>
        <span
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: folder.color }}
        />
        {renaming ? (
          <InlineTextEdit
            value={folder.name}
            editing={renaming}
            onCommit={onRename}
            onCancel={onCancelRename}
            className="min-w-0 flex-1 text-text-primary truncate"
            style={{ fontSize: `${fontPx}px` }}
          />
        ) : (
          <span className="flex-1 text-text-primary truncate" style={{ fontSize: `${fontPx}px` }}>
            {folder.name}
          </span>
        )}
        <span className="text-[10px] text-text-muted/60 tabular-nums">
          {projects.length}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          className="can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 text-text-muted hover:text-text-secondary text-[10px] ml-0.5 transition-opacity"
          title={renameLabel}
          aria-label={renameLabel}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 text-text-muted hover:text-red text-[11px] ml-0.5 transition-opacity"
        >
          &times;
        </button>
      </div>

      <AnimatePresence initial={false}>
        {folder.isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden"
          >
            <div className="pl-3">
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  fontPx={fontPx}
                  isActive={project.id === activeTabId}
                  openCount={openCounts[project.id] ?? 0}
                  showStalled={showStalled}
                  onClick={() => onProjectClick(project.id)}
                  onContextMenu={(e) => onContextMenu(e, project)}
                  onPointerDown={onProjectPointerDown(project)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProjectRow({
  project,
  fontPx,
  isActive,
  openCount,
  showStalled,
  onClick,
  onContextMenu,
  onPointerDown,
}: {
  project: Project;
  fontPx: number;
  isActive: boolean;
  /** Incomplete tasks left; 0 means no next action is formulated. */
  openCount: number;
  /** Whether the no-next-action dot is shown; the board's idle-signals switch governs it. */
  showStalled: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  // An archived project is finished, not stalled — the marker would be an accusation.
  const stalled = showStalled && openCount === 0 && !project.isArchived;
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      className={`w-full flex items-center gap-1.5 px-1.5 py-[3px] rounded-md text-left transition-colors ${
        isActive ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-elevated/30'
      } ${project.isArchived ? 'opacity-50' : ''}`}
    >
      {project.icon ? (
        <span className="text-[14px] shrink-0 leading-none">{project.icon}</span>
      ) : (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: project.color }}
        />
      )}
      <span className="truncate" style={{ fontSize: `${fontPx}px` }}>{project.name}</span>
      {stalled ? (
        <span
          className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-red"
          title={t('projects.noNextAction')}
          aria-label={t('projects.noNextAction')}
        />
      ) : (
        <span className="ml-auto shrink-0 text-[10px] text-text-muted/60 tabular-nums">
          {openCount}
        </span>
      )}
    </button>
  );
}
