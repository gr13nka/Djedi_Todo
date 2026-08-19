import React, { useRef } from 'react';
import { motion } from 'motion/react';
import type { Project, ProjectFolder, ProjectGridLayout } from '@shared/types';
import { useTranslation } from '../../i18n/useTranslation';
import { NEU } from '../../utils/shadows';
import { useProjectCardLayout } from './useProjectCardLayout';
import type { ProjectFolderMove, ProjectGridCardModel } from './useProjectCardLayout';
import type { ProjectBoardFacts } from '../../hooks/useProjectsBoard';
import { PROJECT_CARD_ROW_PX } from './projectCardLayout';

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
  layout: ProjectGridLayout;
  onLayoutChange: (next: ProjectGridLayout) => void | Promise<void>;
  viewport: 'mobile' | 'desktop';
  variant?: 'mobile-picker' | 'desktop-sidebar';
  activeProjectId?: string | null;
  editable?: boolean;
  fontPx: number;
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
  layout,
  onLayoutChange,
  viewport,
  variant = viewport === 'desktop' ? 'desktop-sidebar' : 'mobile-picker',
  activeProjectId = null,
  editable = false,
  fontPx,
  actions,
}: ProjectGridProps) {
  const { t } = useTranslation();
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDesktop = viewport === 'desktop';
  const grid = useProjectCardLayout({
    projects,
    folders,
    value: layout,
    onChange: onLayoutChange,
    viewport,
    editable: editable && isDesktop,
    onActivate: actions.openProject,
    onFolderChange: actions.moveProjectsToFolders,
  });

  const clearLongPress = () => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const showUnfiledTitle = grid.sections.length > 1;

  const isSidebar = variant === 'desktop-sidebar';

  return (
    <div
      {...grid.containerProps}
      className={`flex-1 min-h-0 overflow-y-auto ${isSidebar ? 'p-2' : 'p-3 md:p-4'}`}
    >
      {isDesktop && (
        <div className={`mb-3 flex items-center ${isSidebar ? 'justify-end' : 'justify-between'} gap-2`}>
          {!isSidebar && (
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted/70">
              {t('projects.title')}
            </span>
          )}
          <div className="flex items-center gap-1.5">
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
          <div
            data-project-board
            className="relative min-w-0"
            style={{ height: grid.boardHeight + BOARD_TRAILING_SPACE_PX }}
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
                facts={facts[card.project.id]}
                isActive={card.project.id === activeProjectId}
                onRequestDelete={() => actions.requestDeleteProject(card.project.id)}
                onLongPressStart={undefined}
                onLongPressEnd={clearLongPress}
              />
            ))}
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

              <div className="grid grid-cols-2 gap-3">
                {section.cards.map((card) => (
                  <ProjectCardTile
                    key={card.project.id}
                    card={card}
                    desktop={false}
                    editable={false}
                    fontPx={fontPx}
                    facts={facts[card.project.id]}
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
  );
}

function ProjectCardTile({
  card,
  desktop,
  editable,
  fontPx,
  facts,
  isActive,
  onRequestDelete,
  onLongPressStart,
  onLongPressEnd,
}: {
  card: ProjectGridCardModel;
  desktop: boolean;
  editable: boolean;
  fontPx: number;
  facts?: ProjectBoardFacts;
  isActive: boolean;
  onRequestDelete: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd: () => void;
}) {
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
        <p className="min-h-0 flex-1 overflow-hidden text-[12px] leading-snug text-text-muted">
          {facts.excerpt}
        </p>
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
