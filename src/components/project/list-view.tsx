"use client";
import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GripVertical, ListTree, MessageSquare } from "lucide-react";
import { memo, useCallback, useEffect, useId, useMemo, type KeyboardEvent, type RefObject } from "react";
import { cn } from "@/lib/cn";
import type { SectionView } from "@/server/projects";
import type { TaskCard } from "@/server/tasks";
import { AssigneeChip, DoneToggle, DueChip, LabelChips, PriorityChip, StatusBadge } from "@/components/task/chips";
import type { BoardApi } from "./use-board";
import { SECTION_PREFIX, useSectionDnd } from "./use-section-dnd";
import { AddSection, QuickAdd, SectionHeader } from "./sections";

/** Événement global : placer le curseur dans l'ajout rapide de la première section. */
export const QUICK_ADD_EVENT = "mitc:quick-add";

type Item =
  | { kind: "header"; key: string; section: SectionView; count: number; isLast: boolean }
  | { kind: "task"; key: string; id: string; sectionId: string; first: boolean; last: boolean }
  | { kind: "add"; key: string; section: SectionView; first: boolean; hasTasks: boolean }
  | { kind: "empty"; key: string; sectionId: string }
  | { kind: "gap"; key: string }
  | { kind: "add-section"; key: string };

const SIZE: Record<Item["kind"], number> = { header: 40, task: 44, add: 44, empty: 44, gap: 24, "add-section": 48 };

type Dir = "up" | "down" | "prev" | "next";
type RowProps = {
  task: TaskCard;
  canEdit: boolean;
  selected: boolean;
  first: boolean;
  last: boolean;
  onOpen: (id: string) => void;
  onToggleDone: (t: TaskCard) => void;
  onKeyMove: (id: string, dir: Dir) => void;
  onNavigate: (id: string, delta: 1 | -1) => void;
};

const TaskRow = memo(function TaskRow({ task, canEdit, selected, first, last, onOpen, onToggleDone, onKeyMove, onNavigate }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canEdit });
  const done = task.status === "done";
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.altKey && canEdit) {
      const map: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "prev", ArrowRight: "next" };
      if (map[e.key]) {
        e.preventDefault();
        return onKeyMove(task.id, map[e.key]!);
      }
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      return onNavigate(task.id, e.key === "ArrowDown" ? 1 : -1);
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
        "group flex h-11 cursor-pointer items-center gap-2 border-x border-b border-border bg-surface px-2 text-sm hover:bg-surface-hover focus-visible:relative focus-visible:z-10",
        first && "rounded-t-lg border-t",
        last && "rounded-b-lg",
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

function DroppableHeader({ sectionId, children }: { sectionId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: SECTION_PREFIX + sectionId });
  return (
    <div ref={setNodeRef} className={cn("flex h-full items-end rounded-md px-2 pb-1", isOver && "bg-primary-soft")}>
      {children}
    </div>
  );
}

/** Focus d'un élément susceptible de ne pas être encore monté (liste virtualisée). */
function focusWhenMounted(selector: string, tries = 12) {
  const el = document.querySelector<HTMLElement>(selector);
  if (el) el.focus();
  else if (tries > 0) requestAnimationFrame(() => focusWhenMounted(selector, tries - 1));
}

/**
 * Vue Liste virtualisée : seules les lignes visibles sont montées (500 tâches et plus restent
 * fluides). Sections, ajout rapide et glisser-déposer (souris, tactile, clavier) conservés.
 */
export function ListView({
  board,
  canEdit,
  selectedId,
  onOpen,
  scrollRef,
}: {
  board: BoardApi;
  canEdit: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { project, tasks } = board.data;
  const dnd = useSectionDnd(board, project.sections, tasks);
  const dndId = useId();
  const toggleDone = useCallback((t: TaskCard) => void board.updateTask(t.id, { status: t.status === "done" ? "todo" : "done" }), [board]);

  const items = useMemo(() => {
    const out: Item[] = [];
    project.sections.forEach((s, si) => {
      const ids = dnd.columns[s.id] ?? [];
      if (si > 0) out.push({ kind: "gap", key: `gap-${s.id}` });
      out.push({ kind: "header", key: `h-${s.id}`, section: s, count: ids.length, isLast: project.sections.length === 1 });
      ids.forEach((id, i) =>
        out.push({ kind: "task", key: id, id, sectionId: s.id, first: i === 0, last: i === ids.length - 1 && !canEdit }),
      );
      if (canEdit) out.push({ kind: "add", key: `add-${s.id}`, section: s, first: si === 0, hasTasks: ids.length > 0 });
      else if (!ids.length) out.push({ kind: "empty", key: `empty-${s.id}`, sectionId: s.id });
    });
    if (canEdit) out.push({ kind: "gap", key: "gap-end" }, { kind: "add-section", key: "add-section" });
    return out;
  }, [project.sections, dnd.columns, canEdit]);

  // React Compiler n'est pas activé : l'avertissement « incompatible-library » ne s'applique pas ici.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => SIZE[items[i]!.kind],
    getItemKey: (i) => items[i]!.key,
    overscan: 12,
    initialRect: { width: 1200, height: 900 },
  });

  const indexOf = useCallback((pred: (it: Item) => boolean) => items.findIndex(pred), [items]);
  const taskOrder = useMemo(() => items.flatMap((it) => (it.kind === "task" ? [it.id] : [])), [items]);

  const onNavigate = useCallback(
    (id: string, delta: 1 | -1) => {
      const next = taskOrder[taskOrder.indexOf(id) + delta];
      if (!next) return;
      virtualizer.scrollToIndex(indexOf((it) => it.kind === "task" && it.id === next), { align: "auto" });
      focusWhenMounted(`[data-task-row="${next}"]`);
    },
    [taskOrder, virtualizer, indexOf],
  );

  const onKeyMove = useCallback(
    (id: string, dir: Dir) => {
      dnd.moveBy(id, dir);
      requestAnimationFrame(() => {
        const i = indexOf((it) => it.kind === "task" && it.id === id);
        if (i >= 0) virtualizer.scrollToIndex(i, { align: "auto" });
        focusWhenMounted(`[data-task-row="${id}"]`);
      });
    },
    [dnd, indexOf, virtualizer],
  );

  useEffect(() => {
    const onQuickAdd = () => {
      const i = indexOf((it) => it.kind === "add" && it.first);
      if (i < 0) return;
      virtualizer.scrollToIndex(i, { align: "center" });
      focusWhenMounted("#quick-add-first");
    };
    window.addEventListener(QUICK_ADD_EVENT, onQuickAdd);
    return () => window.removeEventListener(QUICK_ADD_EVENT, onQuickAdd);
  }, [indexOf, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const pos = (start: number, size: number) => ({ position: "absolute" as const, top: start, left: 0, right: 0, height: size });

  return (
    <DndContext id={dndId} sensors={dnd.sensors} collisionDetection={dnd.collisionDetection} accessibility={dnd.accessibility} {...dnd.handlers}>
      <div className="relative pb-24" style={{ height: virtualizer.getTotalSize() + 96 }}>
        {project.sections.map((s) => (
          <SortableContext key={s.id} id={s.id} items={dnd.columns[s.id] ?? []} strategy={verticalListSortingStrategy}>
            <div role="list" aria-label={`Tâches de la section ${s.name}`}>
              {virtualItems.map((v) => {
                const it = items[v.index];
                if (!it || it.kind !== "task" || it.sectionId !== s.id) return null;
                const t = dnd.byId.get(it.id);
                if (!t) return null;
                return (
                  <div key={v.key} style={pos(v.start, v.size)}>
                    <TaskRow
                      task={t}
                      canEdit={canEdit}
                      selected={selectedId === t.id}
                      first={it.first}
                      last={it.last}
                      onOpen={onOpen}
                      onToggleDone={toggleDone}
                      onKeyMove={onKeyMove}
                      onNavigate={onNavigate}
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
        ))}
        {virtualItems.map((v) => {
          const it = items[v.index];
          if (!it || it.kind === "task" || it.kind === "gap") return null;
          if (it.kind === "header")
            return (
              <section key={v.key} style={pos(v.start, v.size)} aria-label={`Section ${it.section.name}`}>
                <DroppableHeader sectionId={it.section.id}>
                  <SectionHeader section={it.section} count={it.count} canEdit={canEdit} projectId={project.id} board={board} isLast={it.isLast} className="w-full" />
                </DroppableHeader>
              </section>
            );
          if (it.kind === "add")
            return (
              <div key={v.key} style={pos(v.start, v.size)}>
                <QuickAdd
                  className={cn("h-11 rounded-b-lg border-x border-b border-border bg-surface", !it.hasTasks && "rounded-t-lg border-t")}
                  sectionName={it.section.name}
                  inputId={it.first ? "quick-add-first" : undefined}
                  onCreate={(title) => void board.createTask(it.section.id, title)}
                />
              </div>
            );
          if (it.kind === "empty")
            return (
              <p key={v.key} style={pos(v.start, v.size)} className="flex items-center rounded-lg border border-dashed border-border px-3 text-sm text-muted">
                Aucune tâche dans cette section.
              </p>
            );
          return (
            <div key={v.key} style={pos(v.start, v.size)}>
              <AddSection projectId={project.id} board={board} className="max-w-sm" />
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {dnd.activeTask ? (
          <div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm shadow-pop">
            <GripVertical size={14} className="text-muted" aria-hidden />
            <span className="truncate">{dnd.activeTask.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
