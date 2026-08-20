import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { ProjectTask, TimeBox } from '@shared/types';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { TranslationKey } from '../../i18n/translations';
import { clampSwipeOffset, resolveTaskSwipe } from '../../utils/taskSwipe';
import { normalizeTaskText } from '../../utils/taskText';
import { ContextMenu } from '../ui/ContextMenu';
import { CompletionBurst, useCompletionBurst } from '../ui/CompletionBurst';
import { TaskTextArea } from '../ui/TaskTextArea';
import type { ReorderRowProps } from '../../hooks/useReorderList';

/** Canonical box order; each row offers the three entries that aren't its current box. */
const MOVE_TARGETS: TimeBox[] = ['today', 'week', 'later', 'someday'];
const MOVE_LABEL_KEYS: Record<TimeBox, TranslationKey> = {
  today: 'taskSelection.toToday',
  week: 'taskSelection.toWeek',
  later: 'taskSelection.toLater',
  someday: 'taskSelection.toSomeday',
};

interface SelectableTaskRowProps {
  task: ProjectTask;
  /** Moves the task to any box; the row offers the two boxes it is not currently in. */
  onMoveToBox: (taskId: string, target: TimeBox) => void;
  onMoveToProject?: (task: ProjectTask) => void;
  onToggleComplete: () => void;
  onDelete: () => void;
  onRename?: (title: string) => void;
  /** Present when this row takes part in drag-to-reorder. */
  reorder?: ReorderRowProps;
  projectInfo?: { name: string; color: string; icon?: string };
  swipeEnabled?: boolean;
}

function getStalenessScore(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / 86400000;
  return Math.round(ageDays * ageDays);
}

const DragDotsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted">
    <circle cx="5" cy="3" r="1.2" />
    <circle cx="11" cy="3" r="1.2" />
    <circle cx="5" cy="8" r="1.2" />
    <circle cx="11" cy="8" r="1.2" />
    <circle cx="5" cy="13" r="1.2" />
    <circle cx="11" cy="13" r="1.2" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const FolderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const ArchiveIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="4" rx="1" />
    <path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" />
    <path d="M10 12h4" />
  </svg>
);

function getStalenessColor(score: number, fixed: boolean): string {
  if (fixed) return 'text-text-muted';
  if (score < 9) return 'text-green-500';
  if (score < 49) return 'text-amber-500';
  return 'text-red-500';
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('button, input, textarea, select, [contenteditable="true"], [data-no-swipe="true"]'),
  );
}

export function SelectableTaskRow({
  task,
  onMoveToBox,
  onMoveToProject,
  onToggleComplete,
  onDelete,
  onRename,
  reorder,
  projectInfo,
  swipeEnabled = false,
}: SelectableTaskRowProps) {
  const isCompleted = task.isCompleted;
  const isInToday = task.timeBox === 'today';
  const canSwipe = swipeEnabled && !isCompleted;
  const stalenessVisible = useSettingsStore((s) => s.pointsCounterVisible);
  const colorFixed = useSettingsStore((s) => s.pointsColorFixed);
  const { t } = useTranslation();

  const score = useMemo(() => getStalenessScore(task.createdAt), [task.createdAt]);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(task.title);
  const [burst, fireBurst] = useCompletionBurst();
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const wheelTimer = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const pointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    baseX: number;
    mode: 'pending' | 'horizontal' | 'vertical';
  } | null>(null);

  useEffect(() => {
    offsetRef.current = offsetX;
  }, [offsetX]);

  useEffect(() => {
    if (!renaming) setRenameValue(task.title);
  }, [renaming, task.title]);

  useEffect(() => {
    return () => {
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    };
  }, []);

  // Celebrate only the incomplete -> complete direction of the toggle.
  const handleToggleComplete = () => {
    if (!isCompleted) fireBurst();
    onToggleComplete();
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const startRenaming = useCallback(() => {
    if (!onRename || isCompleted) return;
    setRenameValue(task.title);
    setRenaming(true);
  }, [isCompleted, onRename, task.title]);

  const cancelRenaming = useCallback(() => {
    setRenameValue(task.title);
    setRenaming(false);
  }, [task.title]);

  const commitRenaming = useCallback(() => {
    if (!onRename) return;
    const trimmed = normalizeTaskText(renameValue);
    if (trimmed && trimmed !== task.title) onRename(trimmed);
    setRenameValue(trimmed || task.title);
    setRenaming(false);
  }, [onRename, renameValue, task.title]);

  const contextMenuItems = useMemo(() => {
    const items: { label: string; onClick: () => void; danger?: boolean }[] = [];
    if (onRename) {
      items.push({ label: t('common.rename'), onClick: startRenaming });
    }
    items.push({ label: t('common.delete'), onClick: onDelete, danger: true });
    return items;
  }, [t, onDelete, onRename, startRenaming]);

  const settleSwipe = useCallback((offset: number) => {
    if (!canSwipe) {
      setOffsetX(0);
      return;
    }
    const width = rowRef.current?.offsetWidth ?? 360;
    const resolution = resolveTaskSwipe(offset, width);
    setIsSwiping(false);
    setOffsetX(resolution.restingX);
    if (resolution.commit) {
      window.setTimeout(() => {
        onMoveToBox(task.id, resolution.commit as TimeBox);
        setOffsetX(0);
      }, 130);
    }
  }, [canSwipe, onMoveToBox, task.id]);

  const moveToBoxAndClose = (target: TimeBox) => {
    onMoveToBox(task.id, target);
    setOffsetX(0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canSwipe || isInteractiveTarget(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointerRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offsetRef.current,
      mode: 'pending',
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== e.pointerId) return;

    const dx = e.clientX - pointer.startX;
    const dy = e.clientY - pointer.startY;
    if (pointer.mode === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      pointer.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'horizontal' : 'vertical';
    }
    if (pointer.mode === 'vertical') return;

    e.preventDefault();
    suppressClickRef.current = true;
    setIsSwiping(true);
    setOffsetX(clampSwipeOffset(pointer.baseX + dx, rowRef.current?.offsetWidth ?? 360));
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== e.pointerId) return;
    pointerRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (pointer.mode === 'horizontal') {
      settleSwipe(offsetRef.current);
    } else {
      setIsSwiping(false);
    }
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!canSwipe || Math.abs(e.deltaX) < 8 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    const next = clampSwipeOffset(offsetRef.current - e.deltaX, rowRef.current?.offsetWidth ?? 360);
    setIsSwiping(true);
    setOffsetX(next);
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => settleSwipe(offsetRef.current), 120);
  };

  return (
    <div className="relative">
      {reorder?.isDragOver === 'above' && (
        <div className="absolute -top-[2px] left-8 right-3 h-[2px] rounded-full bg-accent z-20" />
      )}

      {/* `data-reorder-id` sits here, not on the row below it: the row below is
          translated by the swipe gesture, and its box would report wherever the
          swipe left it rather than where the row sits in the list. */}
      <div
        ref={rowRef}
        data-reorder-id={reorder?.rowId}
        className={`relative rounded-lg ${renaming ? 'z-30 overflow-visible' : 'overflow-hidden'} ${
          reorder?.isDragging ? 'opacity-40' : ''
        }`}
      >
        {canSwipe && (
          <div className="absolute inset-0 grid grid-cols-2 rounded-lg border border-border bg-bg-elevated/70">
            <div className="flex items-center gap-1.5 px-2">
              <button
                type="button"
                onClick={() => moveToBoxAndClose('today')}
                className="flex h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium text-green hover:bg-green/10"
              >
                <CalendarIcon />
                {t('taskSelection.boxToday')}
              </button>
              <button
                type="button"
                onClick={() => moveToBoxAndClose('week')}
                className="flex h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium text-accent hover:bg-accent/10"
              >
                <CalendarIcon />
                {t('taskSelection.boxWeek')}
              </button>
            </div>
            <div className="flex items-center justify-end gap-1.5 px-2">
              <button
                type="button"
                onClick={() => onMoveToProject?.(task)}
                disabled={!onMoveToProject}
                className="flex h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium text-text-secondary hover:bg-bg-card/70 disabled:opacity-40"
              >
                <FolderIcon />
                {t('taskSelection.toProject')}
              </button>
              <button
                type="button"
                onClick={() => moveToBoxAndClose('later')}
                className="flex h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium text-text-muted hover:bg-bg-card/70"
              >
                <ArchiveIcon />
                {t('taskSelection.boxLater')}
              </button>
            </div>
          </div>
        )}

        <div
          className={`group/row relative flex items-center gap-3 rounded-lg border bg-bg-card ${
            renaming
              ? 'my-1 min-h-[112px] border-accent/50 px-4 py-4 shadow-[0_14px_34px_rgba(31,41,55,0.18),inset_0_0_0_1px_rgba(255,255,255,0.06)]'
              : 'min-h-[84px] border-border px-2.5 py-2.5'
          } ${
            isCompleted
              ? 'opacity-50'
              : isInToday && !renaming
                ? 'shadow-[inset_3px_0_0_var(--color-green)]'
                : 'hover:bg-bg-card'
          } ${isSwiping ? '' : 'transition-[transform,box-shadow,border-color,min-height,padding,margin] duration-200 ease-out'}`}
          style={{
            transform: `translate3d(${offsetX}px, 0, 0)`,
            zIndex: renaming ? 30 : undefined,
            touchAction: canSwipe ? 'pan-y' : undefined,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onClickCapture={handleClickCapture}
          onClick={(e) => {
            if (!isInteractiveTarget(e.target)) startRenaming();
          }}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
        >
          {reorder && !isCompleted && (
            <span
              // The grip, not the row, starts the drag: the row already owns a
              // horizontal swipe gesture and both would claim the same press.
              data-no-swipe="true"
              onPointerDown={reorder.onPointerDown}
              className="cursor-grab active:cursor-grabbing select-none flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity"
            >
              <DragDotsIcon />
            </span>
          )}

          <button
            onClick={handleToggleComplete}
            className="relative flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-[5px] border-2 transition-colors hover:border-green hover:bg-green/10"
            style={{
              borderColor: isCompleted ? 'var(--color-green)' : 'var(--color-text-muted)',
              backgroundColor: isCompleted ? 'var(--color-green)' : 'transparent',
            }}
          >
            <CompletionBurst burst={burst} />
            {isCompleted && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          <div className="flex-1 min-w-0">
            {projectInfo && (
              <div className="flex items-center gap-1.5 mb-0.5">
                {projectInfo.icon ? (
                  <span className="text-[12px] flex-shrink-0 leading-none">{projectInfo.icon}</span>
                ) : (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: projectInfo.color }} />
                )}
                <span className="text-[11px] text-text-muted truncate">{projectInfo.name}</span>
              </div>
            )}
            {renaming && onRename ? (
              <TaskTextArea
                value={renameValue}
                onValueChange={setRenameValue}
                onCommit={commitRenaming}
                onCancel={cancelRenaming}
                onBlur={commitRenaming}
                focusOnMount
                data-no-swipe="true"
                className="text-base leading-snug text-text-primary"
              />
            ) : (
              <span
                onClick={startRenaming}
                className={`block leading-snug break-words [overflow-wrap:anywhere] ${renaming ? 'text-base' : 'text-[15px]'} ${
                  isCompleted
                    ? 'line-through text-text-muted'
                    : isInToday
                      ? 'text-text-primary'
                      : 'text-text-secondary'
                }`}
              >
                {task.title}
              </span>
            )}
          </div>

          {stalenessVisible && !renaming && !isCompleted && score > 0 && (
            <span className={`flex-shrink-0 text-xs font-medium tabular-nums ${getStalenessColor(score, colorFixed)}`}>
              {score}
            </span>
          )}

          {!canSwipe && !renaming && !isCompleted && (
            <div className="flex-shrink-0 flex items-center gap-1 transition-opacity can-hover:opacity-0 can-hover:group-hover/row:opacity-100 focus-within:opacity-100">
              {MOVE_TARGETS.filter((target) => target !== task.timeBox).map((target) => (
                <button
                  key={target}
                  onClick={() => onMoveToBox(task.id, target)}
                  className="flex items-center justify-center h-6 px-2 rounded-full text-[11px] font-medium whitespace-nowrap text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                >
                  {t(MOVE_LABEL_KEYS[target])}
                </button>
              ))}
            </div>
          )}
        </div>

        <ContextMenu items={contextMenuItems} position={ctxMenu} onClose={closeCtxMenu} />
      </div>

      {reorder?.isDragOver === 'below' && (
        <div className="absolute -bottom-[2px] left-8 right-3 h-[2px] rounded-full bg-accent z-20" />
      )}
    </div>
  );
}
