"use client";
import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListTree, MessageSquare } from "lucide-react";
import { memo, type KeyboardEvent, useId } from "react";
import { cn } from "@/lib/cn";
import type { TaskCard } from "@/server/tasks";
import { AssigneeChip, DoneToggle, DueChip, LabelChips, PriorityChip, StatusBadge } from "@/components/task/chips";
import type { BoardApi } from "./use-board";
import { SECTION_PREFIX, useSectionDnd } from "./use-section-dnd";
import { AddSection, QuickAdd, SectionHeader } from "./sections";

type RowProps = {
  task: TaskCard;
  canEdit: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleDone: (t: TaskCard) => void;
  onKeyMove: (id: string, dir: "up" | "down" | "prev" | "next") => void;
};

function focusSibling(current: HTMLElement, delta: number) {
  const rows = [...document.querySelectorAll<HTMLElement>("[data-task-row]")];
  rows[rows.indexOf(current) + delta]?.focus();
}

const TaskRow = memo(function TaskRow({ task, canEdit, selected, onOpen, onToggleDone, onKeyMove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canEdit });
  const done = task.status === "done";
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.altKey && canEdit) {
      const map: Record<string, "up" | "down" | "prev" | "next"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "prev", ArrowRight: "next" };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        onKeyMove(task.id, dir);
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-task-row="${task.id}"]`)?.focus());
        return;
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      return focusSibling(e.currentTarget, 1);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      return focusSibling(e.currentTarget, -1);
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
      role="listitem"
      tabIndex={0}
      aria-roledescription="tâche déplaçable"
      aria-label={`${task.title}${done ? ", terminée" : ""}`}
      data-task-row={task.id}
      onClick={() => onOpen(task.id)}
      className={cn(
        "group flex min-h-11 cursor-pointer items-center gap-2 border-b border-border bg-surface px-2 py-1.5 text-sm [content-visibility:auto] [contain-intrinsic-size:auto_44px] hover:bg-surface-hover focus-visible:z-10",
        selected && "bg-primary-soft",
        isDragging && "opacity-40",
      )}
    >
      {canEdit && <GripVertical size={14} className="shrink-0 text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />}
      <DoneToggle status={task.status} title={task.title} disabled={!canEdit} onToggle={() => onToggleDone(task)} />
      <span className={cn("min-w-0 flex-1 truncate", done && "text-muted line-through")}>{task.title}</span>
      <span className="hidden items-center gap-2 sm:flex">
        <StatusBadge status={task.status === "done" ? "todo" : task.status} />
        <LabelChips labels={task.labels} max={2} />
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
        <PriorityChip priority={task.priority} />
      </span>
      <span className="w-20 text-right">
        <DueChip due={task.dueDate} done={done} />
      </span>
      <span className="flex w-6 justify-end">
        <AssigneeChip user={task.assignee} />
      </span>
    </div>
  );
});

function SectionDrop({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: SECTION_PREFIX + id });
  return (
    <div ref={setNodeRef} role="list" className={cn("min-h-2 rounded-lg", isOver && "bg-primary-soft/50")}>
      {children}
    </div>
  );
}

export function ListView({
  board,
  canEdit,
  selectedId,
  onOpen,
}: {
  board: BoardApi;
  canEdit: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const { project, tasks } = board.data;
  const dnd = useSectionDnd(board, project.sections, tasks);
  const dndId = useId();
  const toggleDone = (t: TaskCard) => void board.updateTask(t.id, { status: t.status === "done" ? "todo" : "done" });

  return (
    <DndContext id={dndId} sensors={dnd.sensors} collisionDetection={dnd.collisionDetection} accessibility={dnd.accessibility} {...dnd.handlers}>
      <div className="space-y-6 pb-24">
        {project.sections.map((s, i) => {
          const ids = dnd.columns[s.id] ?? [];
          return (
            <section key={s.id} aria-label={`Section ${s.name}`}>
              <SectionHeader
                section={s}
                count={ids.length}
                canEdit={canEdit}
                projectId={project.id}
                board={board}
                isLast={project.sections.length === 1}
                className="mb-1 px-2"
              />
              <div className="overflow-hidden rounded-lg border border-border">
                <SortableContext id={s.id} items={ids} strategy={verticalListSortingStrategy}>
                  <SectionDrop id={s.id}>
                    {ids.map((id) => {
                      const t = dnd.byId.get(id);
                      return t ? (
                        <TaskRow
                          key={id}
                          task={t}
                          canEdit={canEdit}
                          selected={selectedId === id}
                          onOpen={onOpen}
                          onToggleDone={toggleDone}
                          onKeyMove={dnd.moveBy}
                        />
                      ) : null;
                    })}
                  </SectionDrop>
                </SortableContext>
                {canEdit && (
                  <QuickAdd
                    className="bg-surface"
                    sectionName={s.name}
                    inputId={i === 0 ? "quick-add-first" : undefined}
                    onCreate={(title) => void board.createTask(s.id, title)}
                  />
                )}
              </div>
            </section>
          );
        })}
        {canEdit && <AddSection projectId={project.id} board={board} className="max-w-sm" />}
      </div>
      <DragOverlay>
        {dnd.activeTask ? (
          <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm shadow-pop">
            <GripVertical size={14} className="text-muted" aria-hidden />
            <span className="truncate">{dnd.activeTask.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
