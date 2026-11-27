"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { generateKeyBetween } from "fractional-indexing";
import { toast } from "sonner";
import { fetchJson } from "@/lib/fetch-json";
import type { ActionResult } from "@/lib/errors";
import type { ProjectDetail } from "@/server/projects";
import type { TaskCard, TaskDetail } from "@/server/tasks";
import type { UpdateTaskInput } from "@/lib/validation/tasks";
import { createTaskAction, moveTaskAction, setTaskArchivedAction, updateTaskAction } from "@/app/actions/tasks";

export type BoardData = { project: ProjectDetail; tasks: TaskCard[] };
export const boardKey = (projectId: string) => ["board", projectId] as const;
export const taskKey = (taskId: string) => ["task", taskId] as const;

/** Clé de tri approximative côté client (affichage immédiat) ; le serveur renvoie la clé réelle. */
function clientKey(prev: string | null, next: string | null): string {
  try {
    return generateKeyBetween(prev, next && prev && next <= prev ? null : next);
  } catch {
    return (prev ?? "a0") + "V";
  }
}

function sortTasks(tasks: TaskCard[], sectionOrder: Map<string, number>) {
  return [...tasks].sort(
    (a, b) =>
      (sectionOrder.get(a.sectionId) ?? 0) - (sectionOrder.get(b.sectionId) ?? 0) ||
      (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1),
  );
}

export function useBoard(projectId: string, initial: BoardData) {
  const qc = useQueryClient();
  const key = boardKey(projectId);
  const inflight = useRef(0);
  const chains = useRef(new Map<string, Promise<unknown>>());

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchJson<BoardData>(`/api/projets/${projectId}/tableau`),
    initialData: initial,
    // Polling léger du tableau ouvert (lot 1, pas de temps réel) ; suspendu pendant une écriture.
    refetchInterval: () => (inflight.current > 0 ? false : 15_000),
    refetchIntervalInBackground: false,
  });

  const data = query.data;
  const sectionOrder = useMemo(() => new Map(data.project.sections.map((s, i) => [s.id, i])), [data.project.sections]);

  const patchTask = useCallback(
    (taskId: string, fn: (t: TaskCard) => TaskCard) => {
      qc.setQueryData<BoardData>(key, (d) => (d ? { ...d, tasks: sortTasks(d.tasks.map((t) => (t.id === taskId ? fn(t) : t)), sectionOrder) } : d));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, projectId, sectionOrder],
  );

  const currentVersion = useCallback(
    (taskId: string) => qc.getQueryData<BoardData>(key)?.tasks.find((t) => t.id === taskId)?.version ?? qc.getQueryData<TaskDetail>(taskKey(taskId))?.version,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, projectId],
  );

  /** Les écritures d'une même tâche sont sérialisées : chacune part avec la version à jour. */
  const enqueue = useCallback(<T,>(taskId: string, run: () => Promise<T>): Promise<T> => {
    const prev = chains.current.get(taskId) ?? Promise.resolve();
    const next = prev.then(run, run);
    chains.current.set(taskId, next.catch(() => undefined));
    return next;
  }, []);

  const handleFailure = useCallback(
    (r: Extract<ActionResult<unknown>, { ok: false }>, fallback: string) => {
      toast.error(r.error || fallback);
      void qc.invalidateQueries({ queryKey: key });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, projectId],
  );

  const begin = async () => {
    inflight.current++;
    await qc.cancelQueries({ queryKey: key });
  };
  const end = () => {
    inflight.current--;
  };

  const updateTask = useCallback(
    async (taskId: string, patch: UpdateTaskInput, optimistic: Partial<TaskCard> = {}) => {
      await begin();
      patchTask(taskId, (t) => ({ ...t, ...(patch as Partial<TaskCard>), ...optimistic }));
      qc.setQueryData<TaskDetail>(taskKey(taskId), (d) => (d ? { ...d, ...(patch as Partial<TaskDetail>), ...(optimistic as Partial<TaskDetail>) } : d));
      const r = await enqueue(taskId, async () => {
        const v = currentVersion(taskId);
        if (!v) return { ok: false as const, error: "Tâche introuvable.", code: "not_found" as const };
        return updateTaskAction(taskId, v, patch);
      });
      end();
      if (!r.ok) {
        handleFailure(r, "La modification n'a pas pu être enregistrée.");
        void qc.invalidateQueries({ queryKey: taskKey(taskId) });
        return false;
      }
      patchTask(taskId, (t) => ({ ...t, version: r.data.version }));
      qc.setQueryData<TaskDetail>(taskKey(taskId), (d) => (d ? { ...d, version: r.data.version } : d));
      void qc.invalidateQueries({ queryKey: taskKey(taskId) });
      void qc.invalidateQueries({ queryKey: ["my-tasks"] });
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchTask, enqueue, currentVersion, handleFailure, qc],
  );

  /** Déplace une tâche juste après `afterTaskId` (null = en tête) dans `sectionId`. */
  const moveTask = useCallback(
    async (taskId: string, sectionId: string, afterTaskId: string | null) => {
      const d = qc.getQueryData<BoardData>(key);
      if (!d) return;
      const column = d.tasks.filter((t) => t.sectionId === sectionId && t.id !== taskId);
      const idx = afterTaskId ? column.findIndex((t) => t.id === afterTaskId) : -1;
      const prevKey = idx >= 0 ? column[idx]!.sortKey : null;
      const nextKey = column[idx + 1]?.sortKey ?? null;
      await begin();
      patchTask(taskId, (t) => ({ ...t, sectionId, sortKey: clientKey(prevKey, nextKey) }));
      const r = await enqueue(taskId, async () => {
        const v = currentVersion(taskId);
        if (!v) return { ok: false as const, error: "Tâche introuvable.", code: "not_found" as const };
        return moveTaskAction(taskId, v, { projectId, sectionId, afterTaskId });
      });
      end();
      if (!r.ok) return handleFailure(r, "Le déplacement n'a pas pu être enregistré.");
      patchTask(taskId, (t) => ({ ...t, sortKey: r.data.sortKey, version: r.data.version }));
      qc.setQueryData<TaskDetail>(taskKey(taskId), (dd) => (dd ? { ...dd, version: r.data.version, sectionId } : dd));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, projectId, patchTask, enqueue, currentVersion, handleFailure],
  );

  const createTask = useCallback(
    async (sectionId: string, title: string, opts: { afterTaskId?: string | null; assignee?: { id: string; name: string } | null } = {}) => {
      const id = crypto.randomUUID();
      const d = qc.getQueryData<BoardData>(key);
      const column = d?.tasks.filter((t) => t.sectionId === sectionId) ?? [];
      let sortKey: string;
      if (opts.afterTaskId === undefined) sortKey = clientKey(column.at(-1)?.sortKey ?? null, null);
      else if (opts.afterTaskId === null) sortKey = clientKey(null, column[0]?.sortKey ?? null);
      else {
        const i = column.findIndex((t) => t.id === opts.afterTaskId);
        sortKey = clientKey(column[i]?.sortKey ?? null, column[i + 1]?.sortKey ?? null);
      }
      const card: TaskCard = {
        id,
        title,
        status: "todo",
        priority: "none",
        startDate: null,
        dueDate: null,
        assignee: opts.assignee ?? null,
        labels: [],
        subtaskCount: 0,
        subtaskDoneCount: 0,
        commentCount: 0,
        sectionId,
        sortKey,
        version: 0,
        archived: false,
      };
      await begin();
      qc.setQueryData<BoardData>(key, (dd) => (dd ? { ...dd, tasks: sortTasks([...dd.tasks, card], sectionOrder) } : dd));
      const r = await enqueue(id, () =>
        createTaskAction({ projectId, sectionId, title, clientId: id, afterTaskId: opts.afterTaskId, assigneeId: opts.assignee?.id ?? null }),
      );
      end();
      if (!r.ok) {
        handleFailure(r, "La tâche n'a pas pu être créée.");
        return null;
      }
      patchTask(id, (t) => ({ ...t, sortKey: r.data.sortKey, version: r.data.version }));
      void qc.invalidateQueries({ queryKey: ["my-tasks"] });
      return id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, projectId, sectionOrder, enqueue, patchTask, handleFailure],
  );

  /** Archivage réversible : toast « Annuler » plutôt qu'une confirmation. */
  const archiveTask = useCallback(
    async (taskId: string, title: string) => {
      const before = qc.getQueryData<BoardData>(key)?.tasks.find((t) => t.id === taskId);
      await begin();
      qc.setQueryData<BoardData>(key, (d) => (d ? { ...d, tasks: d.tasks.filter((t) => t.id !== taskId) } : d));
      const r = await enqueue(taskId, () => setTaskArchivedAction(taskId, true));
      end();
      if (!r.ok) return handleFailure(r, "L'archivage a échoué.");
      toast(`« ${title.length > 40 ? title.slice(0, 40) + "…" : title} » archivée`, {
        action: {
          label: "Annuler",
          onClick: async () => {
            const u = await setTaskArchivedAction(taskId, false);
            if (!u.ok) return toast.error(u.error);
            if (before) qc.setQueryData<BoardData>(key, (d) => (d ? { ...d, tasks: sortTasks([...d.tasks, { ...before, version: u.data.version }], sectionOrder) } : d));
            void qc.invalidateQueries({ queryKey: key });
          },
        },
      });
      void qc.invalidateQueries({ queryKey: ["my-tasks"] });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, projectId, sectionOrder, enqueue, handleFailure],
  );

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc, key]);

  return { data, isFetching: query.isFetching, updateTask, moveTask, createTask, archiveTask, refresh, setData: (fn: (d: BoardData) => BoardData) => qc.setQueryData<BoardData>(key, (d) => (d ? fn(d) : d)) };
}

export type BoardApi = ReturnType<typeof useBoard>;
