"use client";
import { useSyncedState } from "@/lib/hooks/use-synced-state";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Check, ChevronRight, Link2, Plus, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/fetch-json";
import { formatInstant } from "@/lib/dates";
import { PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS, STATUS_ORDER, type TaskPriority, type TaskStatus } from "@/lib/labels";
import type { LabelView, TaskDetail } from "@/server/tasks";
import type { UpdateTaskInput } from "@/lib/validation/tasks";
import { createLabelAction, createTaskAction, setTaskArchivedAction, updateTaskAction } from "@/app/actions/tasks";
import { boardKey, taskKey, type BoardApi } from "@/components/project/use-board";
import { AssigneeChip, DoneToggle, DueChip, RichText } from "./chips";
import { CommentsSection } from "./comments";
import { ActivityList } from "./activity";

export function TaskPanel({
  taskId,
  onClose,
  onOpenTask,
  board,
  allLabels,
}: {
  taskId: string;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  board?: BoardApi;
  allLabels: LabelView[];
}) {
  const qc = useQueryClient();
  const { data: task, error, isLoading } = useQuery({
    queryKey: taskKey(taskId),
    queryFn: () => fetchJson<TaskDetail>(`/api/taches/${taskId}`),
    refetchInterval: 20_000,
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    headingRef.current?.focus();
  }, [taskId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role=dialog]")) return;
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inBoard = !!board?.data.tasks.some((t) => t.id === taskId);

  /** Mise à jour optimiste ; via le tableau si la tâche y figure (les deux vues restent synchronisées). */
  const update = useCallback(
    async (patch: UpdateTaskInput, optimistic: Partial<TaskDetail> = {}) => {
      if (board && inBoard) {
        const { labels, ...rest } = optimistic;
        await board.updateTask(taskId, patch, { ...(rest as object), ...(labels ? { labels } : {}) });
        return;
      }
      qc.setQueryData<TaskDetail>(taskKey(taskId), (d) => (d ? { ...d, ...(patch as Partial<TaskDetail>), ...optimistic } : d));
      const run = async () => {
        const v = qc.getQueryData<TaskDetail>(taskKey(taskId))?.version;
        if (!v) return;
        const r = await updateTaskAction(taskId, v, patch);
        if (!r.ok) toast.error(r.error);
        else qc.setQueryData<TaskDetail>(taskKey(taskId), (d) => (d ? { ...d, version: r.data.version } : d));
        void qc.invalidateQueries({ queryKey: taskKey(taskId) });
        void qc.invalidateQueries({ queryKey: ["my-tasks"] });
        if (task) void qc.invalidateQueries({ queryKey: boardKey(task.project.id) });
        if (task?.parent) void qc.invalidateQueries({ queryKey: taskKey(task.parent.id) });
      };
      chain.current = chain.current.then(run, run);
      await chain.current;
    },
    [board, inBoard, qc, taskId, task],
  );

  const archive = async (archived: boolean) => {
    if (!task) return;
    if (archived && board && inBoard) {
      onClose();
      return board.archiveTask(taskId, task.title);
    }
    const r = await setTaskArchivedAction(taskId, archived);
    if (!r.ok) return toast.error(r.error);
    toast.success(archived ? "Tâche archivée." : "Tâche restaurée.", archived ? { action: { label: "Annuler", onClick: () => void archive(false) } } : undefined);
    void qc.invalidateQueries({ queryKey: taskKey(taskId) });
    void qc.invalidateQueries({ queryKey: boardKey(task.project.id) });
    void qc.invalidateQueries({ queryKey: ["my-tasks"] });
    if (task.parent) void qc.invalidateQueries({ queryKey: taskKey(task.parent.id) });
  };

  return (
    <aside
      aria-label="Détail de la tâche"
      className="fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-surface shadow-pop sm:w-[480px] lg:w-[560px]"
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
        {task && (
          <nav aria-label="Fil d'Ariane" className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted">
            <Link href={`/projets/${task.project.id}`} className="truncate hover:underline">
              {task.project.name}
            </Link>
            {task.parent && (
              <>
                <ChevronRight size={12} aria-hidden />
                <button className="truncate hover:underline" onClick={() => onOpenTask(task.parent!.id)}>
                  {task.parent.title}
                </button>
              </>
            )}
          </nav>
        )}
        {!task && <span className="flex-1" />}
        {task && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copier le lien de la tâche"
            title="Copier le lien"
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/taches/${task.id}`).then(() => toast.success("Lien copié."))}
          >
            <Link2 size={18} />
          </Button>
        )}
        {task?.canEdit && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={task.archived ? "Restaurer la tâche" : "Archiver la tâche"}
            title={task.archived ? "Restaurer" : "Archiver"}
            onClick={() => void archive(!task.archived)}
          >
            {task.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label="Fermer le panneau (Échap)" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isLoading && <Spinner className="mt-10 w-full justify-center" />}
        {error && (
          <div className="mt-10 text-center">
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
              Tâche introuvable
            </h2>
            <p className="mt-2 text-sm text-muted">Cette tâche n&apos;existe pas ou vous n&apos;y avez pas accès.</p>
          </div>
        )}
        {task && (
          <TaskBody
            task={task}
            update={update}
            headingRef={headingRef}
            onOpenTask={onOpenTask}
            allLabels={allLabels}
            refresh={() => {
              void qc.invalidateQueries({ queryKey: taskKey(taskId) });
              void qc.invalidateQueries({ queryKey: boardKey(task.project.id) });
            }}
          />
        )}
      </div>
    </aside>
  );
}

function TaskBody({
  task,
  update,
  headingRef,
  onOpenTask,
  allLabels,
  refresh,
}: {
  task: TaskDetail;
  update: (p: UpdateTaskInput, o?: Partial<TaskDetail>) => Promise<void>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onOpenTask: (id: string) => void;
  allLabels: LabelView[];
  refresh: () => void;
}) {
  const ro = !task.canEdit;
  const [title, setTitle] = useSyncedState(task.title);
  const fieldRow = "grid grid-cols-[110px_1fr] items-center gap-2 text-sm";
  const control = "h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-border-strong focus:border-border-strong disabled:hover:border-transparent";

  return (
    <div className="space-y-6">
      {task.archived && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">Cette tâche est archivée. {task.canEdit && "Utilisez le bouton de restauration en haut pour la réactiver."}</p>
      )}
      {ro && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Lecture seule : vous n&apos;êtes pas contributeur de ce projet.</p>}
      <div className="flex items-start gap-2">
        <div className="pt-1.5">
          <DoneToggle status={task.status} title={task.title} disabled={ro} onToggle={() => void update({ status: task.status === "done" ? "todo" : "done" })} />
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">
          {task.title}
        </h2>
        <textarea
          value={title}
          readOnly={ro}
          aria-label="Titre de la tâche"
          rows={1}
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") setTitle(task.title);
          }}
          onBlur={() => {
            const t = title.trim();
            if (!t) return setTitle(task.title);
            if (t !== task.title) void update({ title: t });
          }}
          className={cn(
            "field-sizing-content min-h-9 w-full resize-none rounded-md border border-transparent bg-transparent px-1 py-1 text-xl font-semibold leading-snug",
            !ro && "hover:border-border-strong focus:border-border-strong",
          )}
        />
      </div>

      <div className="space-y-1">
        <div className={fieldRow}>
          <label htmlFor="f-status" className="text-muted">
            Statut
          </label>
          <select id="f-status" disabled={ro} value={task.status} onChange={(e) => void update({ status: e.target.value as TaskStatus })} className={control}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldRow}>
          <label htmlFor="f-assignee" className="text-muted">
            Responsable
          </label>
          <div className="flex items-center gap-2">
            <AssigneeChip user={task.assignee} />
            <select
              id="f-assignee"
              disabled={ro}
              value={task.assignee?.id ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const u = task.assignable.find((a) => a.id === id) ?? null;
                void update({ assigneeId: id }, { assignee: u });
              }}
              className={control}
            >
              <option value="">Non assignée</option>
              {task.assignee && !task.assignable.some((a) => a.id === task.assignee!.id) && (
                <option value={task.assignee.id} disabled>
                  {task.assignee.name}
                  {task.assignee.deactivated ? " (désactivé)" : ""}
                </option>
              )}
              {task.assignable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={fieldRow}>
          <label htmlFor="f-due" className="text-muted">
            Échéance
          </label>
          <div className="flex items-center gap-2">
            <input
              id="f-due"
              type="date"
              disabled={ro}
              value={task.dueDate ?? ""}
              min={task.startDate ?? undefined}
              onChange={(e) => void update({ dueDate: e.target.value || null })}
              className={control}
            />
            <DueChip due={task.dueDate} done={task.status === "done"} className="shrink-0" />
          </div>
        </div>
        <div className={fieldRow}>
          <label htmlFor="f-start" className="text-muted">
            Début
          </label>
          <input
            id="f-start"
            type="date"
            disabled={ro}
            value={task.startDate ?? ""}
            max={task.dueDate ?? undefined}
            onChange={(e) => void update({ startDate: e.target.value || null })}
            className={control}
          />
        </div>
        <div className={fieldRow}>
          <label htmlFor="f-priority" className="text-muted">
            Priorité
          </label>
          <select id="f-priority" disabled={ro} value={task.priority} onChange={(e) => void update({ priority: e.target.value as TaskPriority })} className={control}>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldRow}>
          <span className="text-muted" id="f-labels">
            Étiquettes
          </span>
          <LabelPicker task={task} ro={ro} allLabels={allLabels} onChange={(labels) => void update({ labelIds: labels.map((l) => l.id) }, { labels })} />
        </div>
      </div>

      <Description task={task} ro={ro} onSave={(description) => void update({ description })} />

      {!task.parent && <Subtasks task={task} ro={ro} onOpenTask={onOpenTask} refresh={refresh} />}

      <CommentsSection task={task} />

      <section aria-labelledby="hist-title">
        <h3 id="hist-title" className="mb-2 text-sm font-semibold">
          Historique
        </h3>
        <ActivityList task={task} />
        <p className="mt-3 text-xs text-muted">
          Créée {task.createdBy ? `par ${task.createdBy.name} ` : ""}le {formatInstant(task.createdAt)}
        </p>
      </section>
    </div>
  );
}

function Description({ task, ro, onSave }: { task: TaskDetail; ro: boolean; onSave: (d: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useSyncedState(task.description, !editing);
  const save = () => {
    setEditing(false);
    if (value !== task.description) onSave(value);
  };
  return (
    <section aria-labelledby="desc-title">
      <h3 id="desc-title" className="mb-2 text-sm font-semibold">
        Description
      </h3>
      {editing ? (
        <div>
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
              if (e.key === "Escape") {
                setValue(task.description);
                setEditing(false);
              }
            }}
            maxLength={20000}
            aria-label="Description"
            aria-describedby="desc-hint"
            className="field-sizing-content min-h-32 w-full rounded-lg border border-border-strong bg-surface p-3 text-sm"
          />
          <p id="desc-hint" className="mt-1 text-xs text-muted">
            Mise en forme : **gras**, *italique*, listes avec « - », liens. Enregistrement automatique en quittant le champ.
          </p>
        </div>
      ) : task.description ? (
        <div
          role={ro ? undefined : "button"}
          tabIndex={ro ? undefined : 0}
          aria-label={ro ? undefined : "Modifier la description"}
          onClick={(e) => !ro && !(e.target as HTMLElement).closest("a") && setEditing(true)}
          onKeyDown={(e) => !ro && e.key === "Enter" && setEditing(true)}
          className={cn("rounded-lg border border-transparent p-2", !ro && "cursor-text hover:border-border")}
        >
          <RichText text={task.description} />
        </div>
      ) : ro ? (
        <p className="text-sm text-muted">Aucune description.</p>
      ) : (
        <button onClick={() => setEditing(true)} className="w-full rounded-lg border border-dashed border-border-strong p-3 text-left text-sm text-muted hover:bg-surface-hover">
          Ajouter une description…
        </button>
      )}
    </section>
  );
}

function LabelPicker({ task, ro, allLabels, onChange }: { task: TaskDetail; ro: boolean; allLabels: LabelView[]; onChange: (l: LabelView[]) => void }) {
  const [q, setQ] = useState("");
  const [extra, setExtra] = useState<LabelView[]>([]);
  const all = [...allLabels, ...extra.filter((e) => !allLabels.some((a) => a.id === e.id))];
  const selected = new Set(task.labels.map((l) => l.id));
  const filtered = all.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (l: LabelView) => onChange(selected.has(l.id) ? task.labels.filter((x) => x.id !== l.id) : [...task.labels, l]);
  return (
    <Popover.Root>
      <Popover.Trigger
        disabled={ro}
        aria-labelledby="f-labels"
        className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-transparent px-2 py-1 text-left hover:border-border-strong disabled:hover:border-transparent"
      >
        {task.labels.length === 0 && <span className="text-sm text-muted">{ro ? "Aucune" : "Ajouter…"}</span>}
        {task.labels.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden />
            {l.name}
          </span>
        ))}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-64 rounded-lg border border-border bg-surface p-2 shadow-pop">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher ou créer…"
            aria-label="Rechercher ou créer une étiquette"
            maxLength={50}
            className="mb-2 h-8 w-full rounded border border-border-strong bg-surface px-2 text-sm"
            onKeyDown={async (e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const exact = all.find((l) => l.name.toLowerCase() === q.trim().toLowerCase());
              if (exact) return toggle(exact);
              if (!q.trim()) return;
              const r = await createLabelAction(q.trim());
              if (!r.ok) return toast.error(r.error);
              setExtra((x) => [...x, r.data]);
              setQ("");
              onChange([...task.labels, r.data]);
            }}
          />
          <ul className="max-h-56 overflow-y-auto" aria-label="Étiquettes">
            {filtered.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => toggle(l)}
                  aria-pressed={selected.has(l.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} aria-hidden />
                  <span className="flex-1">{l.name}</span>
                  {selected.has(l.id) && <Check size={14} aria-hidden />}
                </button>
              </li>
            ))}
            {q.trim() && !all.some((l) => l.name.toLowerCase() === q.trim().toLowerCase()) && (
              <li className="px-2 py-1.5 text-xs text-muted">
                <Tag size={12} className="mr-1 inline" aria-hidden />
                Entrée pour créer « {q.trim()} »
              </li>
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Subtasks({ task, ro, onOpenTask, refresh }: { task: TaskDetail; ro: boolean; onOpenTask: (id: string) => void; refresh: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const done = task.subtasks.filter((s) => s.status === "done").length;
  const toggle = async (s: TaskDetail["subtasks"][number]) => {
    const status = s.status === "done" ? "todo" : "done";
    qc.setQueryData<TaskDetail>(taskKey(task.id), (d) => (d ? { ...d, subtasks: d.subtasks.map((x) => (x.id === s.id ? { ...x, status } : x)) } : d));
    const r = await updateTaskAction(s.id, s.version, { status });
    if (!r.ok) toast.error(r.error);
    refresh();
    void qc.invalidateQueries({ queryKey: ["my-tasks"] });
  };
  return (
    <section aria-labelledby="sub-title">
      <h3 id="sub-title" className="mb-2 text-sm font-semibold">
        Sous-tâches {task.subtasks.length > 0 && <span className="font-normal text-muted">({done}/{task.subtasks.length})</span>}
      </h3>
      <ul className="divide-y divide-border rounded-lg border border-border empty:hidden">
        {task.subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-2 py-1.5">
            <DoneToggle status={s.status} title={s.title} disabled={ro} onToggle={() => void toggle(s)} />
            <button onClick={() => onOpenTask(s.id)} className={cn("min-w-0 flex-1 truncate text-left text-sm hover:underline", s.status === "done" && "text-muted line-through")}>
              {s.title}
            </button>
            <DueChip due={s.dueDate} done={s.status === "done"} />
            <AssigneeChip user={s.assignee} size={20} />
          </li>
        ))}
      </ul>
      {!ro && (
        <div className="mt-2 flex items-center gap-2 rounded-lg px-2 hover:bg-surface-hover">
          <Plus size={16} className="text-muted" aria-hidden />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={500}
            placeholder="Ajouter une sous-tâche…"
            aria-label="Ajouter une sous-tâche (Entrée pour valider)"
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted"
            onKeyDown={async (e) => {
              if (e.key !== "Enter" || !value.trim()) return;
              e.preventDefault();
              const t = value.trim();
              setValue("");
              const id = crypto.randomUUID();
              qc.setQueryData<TaskDetail>(taskKey(task.id), (d) =>
                d ? { ...d, subtasks: [...d.subtasks, { id, title: t, status: "todo", dueDate: null, assignee: null, version: 1 }] } : d,
              );
              const r = await createTaskAction({ projectId: task.project.id, parentTaskId: task.id, title: t, clientId: id });
              if (!r.ok) toast.error(r.error);
              refresh();
            }}
          />
        </div>
      )}
    </section>
  );
}
