import { db } from '../db';
import { notDeleted, softDelete } from '../db/repository';
import { useEntity } from './useEntity';
import type { Project } from '@shared/types';

const bySortOrder = (a: Project, b: Project) => a.sortOrder - b.sortOrder;

export function useProjects() {
  const { items: projects, create, update, remove } = useEntity<Project>(db.projects, {
    sort: bySortOrder,
  });

  const createProject = async (data: { name: string; color: string; icon?: string; description?: string; folderId?: string | null; linkedActivityId?: string | null }) => {
    const all = notDeleted(await db.projects.toArray());
    return create({
      name: data.name,
      description: data.description ?? '',
      color: data.color,
      icon: data.icon ?? '',
      sortOrder: all.length,
      isArchived: false,
      folderId: data.folderId ?? null,
      linkedActivityId: data.linkedActivityId ?? null,
    });
  };

  const moveProject = (id: string, folderId: string | null) => update(id, { folderId });

  // One drop on the board can refile several projects at once — a resized folder zone pushes
  // some cards out while pulling others in. One transaction, so the board is never read
  // half-refiled.
  const moveProjects = async (moves: Array<{ id: string; folderId: string | null }>) => {
    if (!moves.length) return;
    await db.transaction('rw', db.projects, async () => {
      for (const move of moves) {
        await update(move.id, { folderId: move.folderId });
      }
    });
  };

  const updateProject = (
    id: string,
    patch: Partial<Pick<Project, 'name' | 'description' | 'color' | 'icon' | 'isArchived' | 'folderId' | 'linkedActivityId'>>,
  ) => update(id, patch);

  // Cascade: soft-delete the project, then its tasks — one transaction so
  // the app never observes a project deleted with orphaned tasks still active.
  const deleteProject = async (id: string) => {
    await db.transaction('rw', [db.projects, db.projectTasks], async () => {
      await remove(id);
      const tasks = await db.projectTasks.where('projectId').equals(id).toArray();
      for (const task of tasks) {
        if (!task.deletedAt) {
          await softDelete(db.projectTasks, task.id);
        }
      }
    });
  };

  const reorderProjects = async (orderedIds: string[]) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await update(orderedIds[i], { sortOrder: i });
    }
  };

  return {
    projects,
    createProject,
    updateProject,
    deleteProject,
    moveProject,
    moveProjects,
    reorderProjects,
  };
}
