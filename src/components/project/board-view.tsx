"use client";
import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ListTree, MessageSquare, Plus } from "lucide-react";
import { memo, useState, type KeyboardEvent, useId } from "react";
import { cn } from "@/lib/cn";
import type { TaskCard } from "@/server/tasks";
import { AssigneeChip, DoneToggle, DueChip, LabelChips, PriorityChip, StatusBadge } from "@/components/task/chips";
import type { BoardApi } from "./use-board";
import { SECTION_PREFIX, useSectionDnd } from "./use-section-dnd";
import { AddSection, QuickAdd, SectionHeader } from "./sections";

function CardBody({ task, canEdit, onToggleDone }: { task: TaskCard; canEdit: boolean; onToggleDone?: (t: TaskCard) => void }) {
  const done = task.status === "done";
  return (
    <>
      <div className="flex items-start gap-2">
        <DoneToggle status={task.status} title={task.title} disabled={!canEdit || !onToggleDone} onToggle={() => onToggleDone?.(task)} />
        <span className={cn("min-w-0 flex-1 break-words pt-0.5 text-sm", done && "text-muted line-through")}>{task.title}</span>
      </div>
      {(task.labels.length > 0 || task.priority !== "none" || (task.status !== "todo" && !done)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-7">
          <StatusBadge status={done ? "todo" : task.status} />
          <PriorityChip priority={task.priority} />
          <LabelChips labels={task.labels} max={3} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-3 pl-7">
        <DueChip due={task.dueDate} done={done} />
        {task.subtaskCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted" title="Sous-tâches terminées">
            <ListTree size={12} aria-hidden />
            {task.subtaskDoneCount}/{task.subtaskCount}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted" title="Commentaires">
            <MessageSquare size={12} aria-hidden />
            {task.commentCount}
          </span>
        )}
        <span className="flex-1" />
        <AssigneeChip user={task.assignee} />
      </div>
    </>
  );
}

const BoardCard = memo(function BoardCard({
  task,
  canEdit,
  selected,
  onOpen,
  onToggleDone,
  onKeyMove,
}: {
  task: TaskCard;
  canEdit: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleDone: (t: TaskCard) => void;
  onKeyMove: (id: string, dir: "up" | "down" | "prev" | "next") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canEdit });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.altKey && canEdit) {
      const map: Record<string, "up" | "down" | "prev" | "next"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "prev", ArrowRight: "next" };
      if (map[e.key]) {
        e.preventDefault();
        onKeyMove(task.id, map[e.key]!);
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-board-card="${task.id}"]`)?.focus());
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      return onOpen(task.id);
    }
    listeners?.onKeyDown?.(e);
  };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="listitem"
      aria-roledescription="carte déplaçable"
      aria-label={task.title}
      data-board-card={task.id}
      onClick={() => onOpen(task.id)}
      className={cn(
        "cursor-pointer rounded-lg border border-border bg-surface p-3 shadow-card hover:border-border-strong",
        selected && "ring-2 ring-ring",
        isDragging && "opacity-40",
      )}
    >
      <CardBody task={task} canEdit={canEdit} onToggleDone={onToggleDone} />
    </div>
  );
});

function Column({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: SECTION_PREFIX + id });
  return (
    <div ref={setNodeRef} role="list" className={cn("flex min-h-16 flex-col gap-2 rounded-lg p-1", isOver && "bg-primary-soft")}>
      {children}
    </div>
  );
}

const PAGE = 50;

export function BoardView({ board, canEdit, selectedId, onOpen }: { board: BoardApi; canEdit: boolean; selectedId: string | null; onOpen: (id: string) => void }) {
  const { project, tasks } = board.data;
  const dnd = useSectionDnd(board, project.sections, tasks);
  const dndId = useId();
  const [adding, setAdding] = useState<string | null>(null);
  // Pagination par colonne : au-delà de PAGE cartes, « Afficher plus » (rendu rapide des gros projets).
  const [limits, setLimits] = useState<Record<string, number>>({});
  const toggleDone = (t: TaskCard) => void board.updateTask(t.id, { status: t.status === "done" ? "todo" : "done" });

  return (
    <DndContext id={dndId} sensors={dnd.sensors} collisionDetection={dnd.collisionDetection} accessibility={dnd.accessibility} {...dnd.handlers}>
      <div className="flex h-full items-start gap-4 overflow-x-auto pb-6">
        {project.sections.map((s) => {
          const all = dnd.columns[s.id] ?? [];
          const limit = limits[s.id] ?? PAGE;
          const ids = all.length > limit ? all.slice(0, limit) : all;
          return (
            <section key={s.id} aria-label={`Colonne ${s.name}`} className="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-surface-2 p-2 sm:w-80">
              <div className="flex items-center gap-1 px-1 pb-2">
                <SectionHeader
                  section={s}
                  count={all.length}
                  canEdit={canEdit}
                  projectId={project.id}
                  board={board}
                  isLast={project.sections.length === 1}
                  className="min-w-0 flex-1"
                />
                {canEdit && (
                  <button
                    onClick={() => setAdding(s.id)}
                    className="rounded p-1 text-muted hover:bg-surface-hover hover:text-fg"
                    aria-label={`Ajouter une tâche dans « ${s.name} »`}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {adding === s.id && canEdit && (
                  <div className="mb-2 rounded-lg border border-border-strong bg-surface" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setAdding(null)}>
                    <QuickAdd autoFocus sectionName={s.name} placeholder="Titre de la tâche…" onCreate={(title) => void board.createTask(s.id, title, { afterTaskId: null })} />
                  </div>
                )}
                <SortableContext id={s.id} items={ids} strategy={verticalListSortingStrategy}>
                  <Column id={s.id}>
                    {ids.map((id) => {
                      const t = dnd.byId.get(id);
                      return t ? (
                        <BoardCard key={id} task={t} canEdit={canEdit} selected={selectedId === id} onOpen={onOpen} onToggleDone={toggleDone} onKeyMove={dnd.moveBy} />
                      ) : null;
                    })}
                    {ids.length === 0 && !adding && <p className="px-2 py-4 text-center text-xs text-muted">Déposez une tâche ici</p>}
                    {all.length > ids.length && (
                      <button
                        onClick={() => setLimits((l) => ({ ...l, [s.id]: limit + PAGE }))}
                        className="rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-primary-text hover:bg-surface-hover"
                      >
                        Afficher {Math.min(PAGE, all.length - ids.length)} cartes de plus ({all.length - ids.length} restantes)
                      </button>
                    )}
                  </Column>
                </SortableContext>
              </div>
              {canEdit && (
                <QuickAdd className="mt-1 hover:bg-surface-hover" sectionName={s.name} onCreate={(title) => void board.createTask(s.id, title)} />
              )}
            </section>
          );
        })}
        {canEdit && (
          <div className="w-72 shrink-0">
            <AddSection projectId={project.id} board={board} />
          </div>
        )}
      </div>
      <DragOverlay>
        {dnd.activeTask ? (
          <div className="w-72 rotate-1 rounded-lg border border-border bg-surface p-3 shadow-pop sm:w-80">
            <CardBody task={dnd.activeTask} canEdit={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
