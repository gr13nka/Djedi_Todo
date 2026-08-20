import React, { useRef } from 'react';
import { motion } from 'motion/react';
import type { Project, ProjectFolder, ProjectGridLayout } from '@shared/types';
import { useTranslation } from '../../i18n/useTranslation';
import { NEU } from '../../utils/shadows';
import { useProjectCardLayout } from './useProjectCardLayout';
import type { ProjectFolderMove, ProjectGridCardModel } from './useProjectCardLayout';
import type { ProjectBoardFacts } from '../../hooks/useProjectsBoard';
import {
  MAX_BOARD_ZOOM,
  MIN_BOARD_ZOOM,
  MOBILE_COLUMN_COUNT,
  adjustBoardZoom,
  sanitizeBoardZoom,
  PROJECT_CARD_ROW_PX,
  estimateMobileCardHeight,
  layoutMasonryColumns,
  mobileExcerptCharsPerLine,
} from './projectCardLayout';

/** Room kept under the lowest card so a card can always be dragged further down. */
const BOARD_TRAILING_SPACE_PX = PROJECT_CARD_ROW_PX;

interface ProjectGridActions {
  openProject: (projectId: string) => void;
  requestAddProject: (folderId: string | null) => void;
  requestAddFolder: () => void;
  requestDeleteProject: (projectId: string) => void;
  /** Cards dropped inside a zone (or clear of every zone) are filed accordingly. */
  moveProjectsToFolders: (moves: ProjectFolderMove[]) => void | Promise<void>;
}

interface ProjectGridProps {
  projects: Project[];
  folders: ProjectFolder[];
  /** What each card says beyond its name, keyed by project id. */
  facts?: Record<string, ProjectBoardFacts>;
  idleSignalsVisible?: boolean;
  onToggleIdleSignals?: () => void;
  boardZoom?: number;
  onZoomChange?: (next: number) => void;
  layout: ProjectGridLayout;
  onLayoutChange: (next: ProjectGridLayout) => void | Promise<void>;
  viewport: 'mobile' | 'desktop';
  activeProjectId?: string | null;
  editable?: boolean;
  fontPx: number;
  /** Size of the note excerpt on a card — the same figure the note itself is set in. */
  notePx: number;
  actions: ProjectGridActions;
}

function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  );
}

function FolderPlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

export function ProjectGrid({
  projects,
  folders,
  facts = {},
  idleSignalsVisible = false,
  onToggleIdleSignals,
  boardZoom = 1,
  onZoomChange,
  layout,
  onLayoutChange,
  viewport,
  activeProjectId = null,
  editable = false,
  fontPx,
  notePx,
  actions,
}: ProjectGridProps) {
  const { t } = useTranslation();
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDesktop = viewport === 'desktop';
  // Zoom applies to the wide canvas only; the narrow board is a reading layout with no
  // coordinates of its own to scale.
  const zoom = isDesktop ? sanitizeBoardZoom(boardZoom) : 1;
  const grid = useProjectCardLayout({
    projects,
    folders,
    value: layout,
    onChange: onLayoutChange,
    viewport,
    editable: editable && isDesktop,
    onActivate: actions.openProject,
    zoom,
    onFolderChange: actions.moveProjectsToFolders,
  });

  const clearLongPress = () => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const showUnfiledTitle = grid.sections.length > 1;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4">
      {isDesktop && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted/70">
            {t('projects.title')}
          </span>
          <div className="flex items-center gap-1.5">
            {onZoomChange && (
              <div className="flex items-center rounded-lg" style={{ boxShadow: NEU.raisedSm }}>
                <button
                  type="button"
                  onClick={() => onZoomChange(adjustBoardZoom(zoom, -1))}
                  disabled={zoom <= MIN_BOARD_ZOOM}
                  className="h-7 w-6 flex items-center justify-center rounded-l-lg text-text-muted hover:text-accent disabled:opacity-40 transition-colors"
                  title={t('projects.zoomOut')}
                  aria-label={t('projects.zoomOut')}
                >
                  &minus;
                </button>
                <button
                  type="button"
                  onClick={() => onZoomChange(1)}
                  className="h-7 px-1 text-[11px] text-text-muted hover:text-accent tabular-nums transition-colors"
                  title={t('projects.zoomReset')}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => onZoomChange(adjustBoardZoom(zoom, 1))}
                  disabled={zoom >= MAX_BOARD_ZOOM}
                  className="h-7 w-6 flex items-center justify-center rounded-r-lg text-text-muted hover:text-accent disabled:opacity-40 transition-colors"
                  title={t('projects.zoomIn')}
                  aria-label={t('projects.zoomIn')}
                >
                  +
                </button>
              </div>
            )}
            {onToggleIdleSignals && (
              <button
                type="button"
                onClick={onToggleIdleSignals}
                aria-pressed={idleSignalsVisible}
                className={`h-7 px-2 flex items-center gap-1.5 rounded-lg text-[11px] transition-colors ${
                  idleSignalsVisible ? 'text-accent' : 'text-text-muted hover:text-text-secondary'
                }`}
                style={{ boxShadow: idleSignalsVisible ? NEU.pressedSm : NEU.raisedSm }}
                title={t('projects.idleSignals')}
              >
                <HourglassIcon />
                <span className="hidden sm:inline">{t('projects.idleSignals')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={actions.requestAddFolder}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:text-accent transition-colors"
              style={{ boxShadow: NEU.raisedSm }}
              title={t('folders.newFolder')}
            >
              <FolderPlusIcon />
            </button>
            <button
              type="button"
              onClick={() => actions.requestAddProject(null)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:text-accent transition-colors"
              style={{ boxShadow: NEU.raisedSm }}
              title={t('projects.newProject')}
            >
              <PlusIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => grid.resetLayout()}
              className="h-7 px-2 rounded-lg text-[11px] text-text-muted hover:text-text-secondary transition-colors"
              style={{ boxShadow: NEU.raisedSm }}
            >
              {t('settings.reset')}
            </button>
          </div>
        </div>
      )}

      <div {...grid.containerProps}>
      {grid.cards.length === 0 ? (
        <div className={isDesktop ? 'max-w-xs' : 'grid grid-cols-2 gap-3'}>
          <AddProjectTile
            desktop={isDesktop}
            onClick={() => actions.requestAddProject(null)}
            label={t('projects.newTitle')}
          />
        </div>
      ) : isDesktop ? (
        <div className="flex flex-col gap-4">
          {/* One canvas: zones are rectangles behind the cards, in the same coordinate space. */}
          {/* The outer box reserves the scaled height, because a transform does not affect
              layout and the page would otherwise refuse to scroll to the bottom of a
              zoomed-in board. The inner box is the canvas, sized in board coordinates. */}
          <div style={{ height: (grid.boardHeight + BOARD_TRAILING_SPACE_PX) * zoom }}>
          <div
            data-project-board
            className="relative min-w-0"
            style={{
              width: `${100 / zoom}%`,
              height: grid.boardHeight + BOARD_TRAILING_SPACE_PX,
              transformOrigin: '0 0',
              transform: `scale(${zoom})`,
            }}
          >
            {grid.zones.map((zone) => (
              <div
                key={zone.folder.id}
                {...zone.rootProps}
                style={{
                  ...zone.style,
                  borderColor: `${zone.folder.color}66`,
                  backgroundColor: `${zone.folder.color}0F`,
                }}
                className={`group/zone rounded-2xl border-2 border-dashed ${
                  editable ? 'cursor-grab touch-none active:cursor-grabbing' : ''
                } ${zone.isDragging || zone.isResizing ? 'opacity-90' : ''}`}
              >
                <div
                  className="flex items-center gap-2 px-3"
                  style={{ height: grid.zoneLabelHeight }}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: zone.folder.color }} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-muted/70 truncate">
                    {zone.folder.name}
                  </span>
                </div>

                {editable && (
                  <button
                    {...zone.resizeHandleProps}
                    data-project-card-action
                    className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-md text-text-muted/70 transition-opacity hover:text-text-secondary can-hover:opacity-0 can-hover:group-hover/zone:opacity-100 focus-visible:opacity-100 cursor-nwse-resize"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M4 10h6V4" />
                      <path d="M7 10h3V7" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {grid.cards.map((card) => (
              <ProjectCardTile
                key={card.project.id}
                card={card}
                desktop
                editable={editable}
                fontPx={fontPx}
                notePx={notePx}
                facts={facts[card.project.id]}
                idleSignalsVisible={idleSignalsVisible}
                isActive={card.project.id === activeProjectId}
                onRequestDelete={() => actions.requestDeleteProject(card.project.id)}
                onLongPressStart={undefined}
                onLongPressEnd={clearLongPress}
              />
            ))}
          </div>
          </div>

          <div className="max-w-xs">
            <AddProjectTile
              desktop
              onClick={() => actions.requestAddProject(null)}
              label={t('projects.newTitle')}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grid.sections.map((section) => (
            <section key={section.folder?.id ?? '__unfiled'} className="min-w-0">
              {(section.folder || showUnfiledTitle) && (
                <div className="mb-2 flex items-center gap-2">
                  {section.folder && (
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: section.folder.color }} />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-muted/70">
                    {section.folder?.name ?? t('folders.unfiled')}
                  </span>
                </div>
              )}

              <div className="flex items-start gap-3">
                {masonryColumns(section.cards, facts, grid.boardWidth).map((column, index) => (
                  <div key={index} className="flex min-w-0 flex-1 flex-col gap-3">
                    {column.map(({ card }) => (
                      <ProjectCardTile
                        key={card.project.id}
                        card={card}
                        desktop={false}
                        editable={false}
                        fontPx={fontPx}
                        notePx={notePx}
                        facts={facts[card.project.id]}
                        idleSignalsVisible={idleSignalsVisible}
                        isActive={card.project.id === activeProjectId}
                        onRequestDelete={() => actions.requestDeleteProject(card.project.id)}
                        onLongPressStart={() => {
                          longPressTimerRef.current = setTimeout(() => {
                            actions.requestDeleteProject(card.project.id);
                          }, 600);
                        }}
                        onLongPressEnd={clearLongPress}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <AddProjectTile
              desktop={false}
              onClick={() => actions.requestAddProject(null)}
              label={t('projects.newTitle')}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * Narrow-board layout for one folder's cards.
 *
 * Reading order comes from where the cards sit on the wide board, so an arrangement made on
 * the computer still shapes what the phone shows first. Only the ordering carries over —
 * positions and sizes are device-local and are deliberately not applied here.
 */
function masonryColumns(
  cards: ProjectGridCardModel[],
  facts: Record<string, ProjectBoardFacts>,
  boardWidth: number,
) {
  const charsPerLine = mobileExcerptCharsPerLine((boardWidth || 360) / MOBILE_COLUMN_COUNT);
  const ordered = [...cards]
    .sort((a, b) => (a.frame.y - b.frame.y) || (a.frame.x - b.frame.x))
    .map((card) => ({
      card,
      height: estimateMobileCardHeight(facts[card.project.id]?.excerpt ?? '', charsPerLine),
    }));
  return layoutMasonryColumns(ordered, MOBILE_COLUMN_COUNT);
}

function ProjectCardTile({
  card,
  desktop,
  editable,
  fontPx,
  notePx,
  facts,
  idleSignalsVisible,
  isActive,
  onRequestDelete,
  onLongPressStart,
  onLongPressEnd,
}: {
  card: ProjectGridCardModel;
  desktop: boolean;
  editable: boolean;
  fontPx: number;
  notePx: number;
  facts?: ProjectBoardFacts;
  idleSignalsVisible: boolean;
  isActive: boolean;
  onRequestDelete: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd: () => void;
}) {
  const { t } = useTranslation();
  const { style, ...rootProps } = card.rootProps;
  return (
    <motion.article
      {...rootProps}
      whileTap={desktop ? undefined : { scale: 0.96 }}
      onContextMenu={(event) => {
        event.preventDefault();
        onRequestDelete();
      }}
      onTouchStart={onLongPressStart}
      onTouchEnd={onLongPressEnd}
      onTouchMove={onLongPressEnd}
      className={`group relative flex flex-col items-start gap-1.5 overflow-hidden rounded-2xl p-3 text-left outline-none transition-[box-shadow,opacity,transform,background-color] focus-visible:ring-2 focus-visible:ring-accent ${
        isActive ? 'bg-bg-elevated text-text-primary' : 'bg-bg-card'
      } ${
        desktop && editable ? 'cursor-grab touch-none active:cursor-grabbing' : ''
      } ${card.isDragging || card.isResizing ? 'opacity-80' : ''}`}
      style={{
        ...style,
        boxShadow: card.isDragging || card.isResizing
          ? NEU.modal
          : (isActive ? NEU.pressedSm : NEU.raised),
      }}
    >
      <div className="flex items-center gap-2 w-full min-w-0">
        {card.project.icon ? (
          <span className="text-lg leading-none shrink-0">{card.project.icon}</span>
        ) : (
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: card.project.color }} />
        )}
        <span className="font-medium text-text-primary truncate" style={{ fontSize: `${fontPx}px` }}>
          {card.project.name}
        </span>
        {!!facts?.openCount && (
          <span className="ml-auto shrink-0 text-[11px] text-text-muted tabular-nums">
            {facts.openCount}
          </span>
        )}
      </div>

      {/* No clamp: the card's own height is what decides how much of the note is readable,
          which is the whole reason a card can be resized. */}
      {!!facts?.excerpt && (
        <p
          className="min-h-0 flex-1 overflow-hidden whitespace-pre-line leading-snug text-text-muted"
          style={{ fontSize: `${notePx}px` }}
        >
          {facts.excerpt}
        </p>
      )}

      {/* Deliberately uncoloured: red on this screen means "no next action". */}
      {idleSignalsVisible && !!facts && (
        <span className="shrink-0 text-[11px] text-text-muted tabular-nums">
          {facts.idleDays > 0
            ? `${facts.idleDays} ${t('projects.idleDaysShort')}`
            : t('projects.idleDaysToday')}
        </span>
      )}

      {desktop && editable && (
        <button
          {...card.resizeHandleProps}
          data-project-card-action
          className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-md text-text-muted/70 transition-opacity hover:text-text-secondary can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 cursor-nwse-resize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 10h6V4" />
            <path d="M7 10h3V7" />
          </svg>
        </button>
      )}
    </motion.article>
  );
}

function AddProjectTile({
  desktop,
  onClick,
  label,
}: {
  desktop: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={desktop ? undefined : { scale: 0.96 }}
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border p-3 text-text-muted transition-colors hover:border-accent/50 hover:text-accent"
      style={desktop ? { minHeight: PROJECT_CARD_ROW_PX } : undefined}
    >
      <PlusIcon size={20} />
      <span className="text-xs">{label}</span>
    </motion.button>
  );
}
