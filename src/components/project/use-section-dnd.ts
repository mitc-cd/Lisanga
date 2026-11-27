"use client";
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import type { SectionView } from "@/server/projects";
import type { TaskCard } from "@/server/tasks";
import type { BoardApi } from "./use-board";

export const SECTION_PREFIX = "section:";

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Pour déplacer une tâche, appuyez sur Espace. Utilisez les flèches pour la déplacer, Espace pour la déposer, Échap pour annuler. Raccourcis alternatifs : Alt + flèches.",
};

export function useSectionDnd(board: BoardApi, sections: SectionView[], tasks: TaskCard[]) {
  const base = useMemo(() => {
    const cols: Record<string, string[]> = Object.fromEntries(sections.map((s) => [s.id, [] as string[]]));
    for (const t of tasks) cols[t.sectionId]?.push(t.id);
    return cols;
  }, [sections, tasks]);
  const [override, setOverride] = useState<Record<string, string[]> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const columns = override ?? base;
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const sectionName = (id: string) => sections.find((s) => s.id === id)?.name ?? "";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const findContainer = (id: string, cols = columns): string | undefined => {
    if (id.startsWith(SECTION_PREFIX)) return id.slice(SECTION_PREFIX.length);
    return Object.keys(cols).find((k) => cols[k]!.includes(id));
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOverride(base);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setOverride((cols) => {
      const c = cols ?? base;
      const from = findContainer(String(active.id), c);
      const to = findContainer(String(over.id), c);
      if (!from || !to || from === to) return c;
      const fromItems = c[from]!.filter((id) => id !== active.id);
      const toItems = [...c[to]!];
      const overIndex = toItems.indexOf(String(over.id));
      toItems.splice(overIndex >= 0 ? overIndex : toItems.length, 0, String(active.id));
      return { ...c, [from]: fromItems, [to]: toItems };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const c = override ?? base;
    setActiveId(null);
    setOverride(null);
    if (!over) return;
    const id = String(active.id);
    const container = findContainer(id, c);
    if (!container) return;
    let items = c[container]!;
    const overIndex = items.indexOf(String(over.id));
    const fromIndex = items.indexOf(id);
    if (overIndex >= 0 && overIndex !== fromIndex) items = arrayMove(items, fromIndex, overIndex);
    const finalIndex = items.indexOf(id);
    const afterTaskId = finalIndex > 0 ? items[finalIndex - 1]! : null;
    const original = byId.get(id);
    const origCol = base[original?.sectionId ?? ""] ?? [];
    const origAfter = origCol[origCol.indexOf(id) - 1] ?? null;
    if (original?.sectionId === container && origAfter === afterTaskId) return;
    void board.moveTask(id, container, afterTaskId);
  };

  const onDragCancel = () => {
    setActiveId(null);
    setOverride(null);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Tâche « ${byId.get(String(active.id))?.title ?? ""} » saisie.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `La tâche n'est au-dessus d'aucune zone.`;
      const sec = findContainer(String(over.id));
      const col = sec ? columns[sec] ?? [] : [];
      const pos = col.indexOf(String(active.id)) + 1;
      return `Section « ${sec ? sectionName(sec) : ""} »${pos > 0 ? `, position ${pos} sur ${col.length}` : ""}.`;
    },
    onDragEnd: ({ active, over }) =>
      over ? `Tâche « ${byId.get(String(active.id))?.title ?? ""} » déposée dans « ${sectionName(findContainer(String(over.id)) ?? "")} ».` : "Déplacement annulé.",
    onDragCancel: () => "Déplacement annulé.",
  };

  /** Déplacements au clavier (Alt + flèches), sans glisser. */
  const moveBy = (taskId: string, dir: "up" | "down" | "prev" | "next") => {
    const sec = findContainer(taskId, base);
    if (!sec) return;
    const col = base[sec]!;
    const i = col.indexOf(taskId);
    if (dir === "up" && i > 0) void board.moveTask(taskId, sec, i >= 2 ? col[i - 2]! : null);
    else if (dir === "down" && i < col.length - 1) void board.moveTask(taskId, sec, col[i + 1]!);
    else if (dir === "prev" || dir === "next") {
      const si = sections.findIndex((s) => s.id === sec);
      const target = sections[dir === "prev" ? si - 1 : si + 1];
      if (target) void board.moveTask(taskId, target.id, base[target.id]?.at(-1) ?? null);
    }
  };

  return {
    columns,
    activeTask: activeId ? byId.get(activeId) ?? null : null,
    sensors,
    collisionDetection: closestCorners,
    handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel },
    accessibility: { announcements, screenReaderInstructions },
    byId,
    moveBy,
  };
}
