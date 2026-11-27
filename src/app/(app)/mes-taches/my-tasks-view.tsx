"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus } from "lucide-react";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/fetch-json";
import { DUE_BUCKET_LABELS, DUE_BUCKET_ORDER, dueBucket, todayIso, type DueBucket } from "@/lib/dates";
import { PRIORITY_RANK, STATUS_LABELS, type TaskStatus } from "@/lib/labels";
import type { LabelView, MyTask } from "@/server/tasks";
import { createTaskAction, updateTaskAction } from "@/app/actions/tasks";
import { DoneToggle, DueChip, LabelChips, PriorityChip, StatusBadge } from "@/components/task/chips";
import { TaskPanel } from "@/components/task/task-panel";
import { useActor } from "@/components/shell/providers";

type Sort = "due" | "priority" | "project";
const PROJECT_PREF = "mitc:mes-taches:projet";

export function MyTasksView({ initial, labels, editableProjects }: { initial: MyTask[]; labels: LabelView[]; editableProjects: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const actor = useActor();
  const [showDone, setShowDone] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | TaskStatus>("");
  const [sort, setSort] = useState<Sort>("due");
  const [newTitle, setNewTitle] = useState("");
  const [targetProject, setTargetProject] = useState(editableProjects[0]?.id ?? "");
  const openId = sp.get("tache");

  useEffect(() => {
    // Préférence locale (navigateur) lue après le montage pour éviter un écart d'hydratation.
    try {
      const saved = localStorage.getItem(PROJECT_PREF);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture d'un système externe (localStorage)
      if (saved && editableProjects.some((p) => p.id === saved)) setTargetProject(saved);
    } catch {}
  }, [editableProjects]);

  const { data: tasks } = useQuery({
    queryKey: ["my-tasks", showDone],
    queryFn: () => fetchJson<MyTask[]>(`/api/mes-taches${showDone ? "?terminees=1" : ""}`),
    initialData: showDone ? undefined : initial,
    placeholderData: (prev) => prev,
  });

  const setTaskParam = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set("tache", id);
      else next.delete("tache");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, pathname, router],
  );

  const projects = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks ?? []) m.set(t.project.id, t.project.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [tasks]);

  const today = todayIso();
  const groups = useMemo(() => {
    const list = (tasks ?? []).filter((t) => (!projectFilter || t.project.id === projectFilter) && (!statusFilter || t.status === statusFilter));
    const sorted = [...list].sort((a, b) => {
      if (sort === "priority") return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9");
      if (sort === "project") return a.project.name.localeCompare(b.project.name, "fr") || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9");
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
    const g = new Map<DueBucket, MyTask[]>(DUE_BUCKET_ORDER.map((b) => [b, []]));
    for (const t of sorted) g.get(t.status === "done" ? "none" : dueBucket(t.dueDate, today))!.push(t);
    return g;
  }, [tasks, projectFilter, statusFilter, sort, today]);

  const toggleDone = async (t: MyTask) => {
    const status = t.status === "done" ? "todo" : "done";
    qc.setQueryData<MyTask[]>(["my-tasks", showDone], (d) => d?.map((x) => (x.id === t.id ? { ...x, status } : x)));
    const r = await updateTaskAction(t.id, t.version, { status });
    if (!r.ok) toast.error(r.error);
    else if (status === "done")
      toast(`« ${t.title.slice(0, 40)} » terminée`, {
        action: {
          label: "Annuler",
          onClick: async () => {
            const u = await updateTaskAction(t.id, r.data.version, { status: t.status });
            if (!u.ok) toast.error(u.error);
            void qc.invalidateQueries({ queryKey: ["my-tasks"] });
          },
        },
      });
    void qc.invalidateQueries({ queryKey: ["my-tasks"] });
    void qc.invalidateQueries({ queryKey: ["task", t.id] });
  };

  const create = async () => {
    const title = newTitle.trim();
    if (!title || !targetProject) return;
    setNewTitle("");
    const r = await createTaskAction({ projectId: targetProject, title, assigneeId: actor.id });
    if (!r.ok) return void toast.error(r.error);
    toast.success("Tâche créée et assignée à vous.");
    void qc.invalidateQueries({ queryKey: ["my-tasks"] });
  };

  const total = tasks?.length ?? 0;

  return (
    <div className={cn("mx-auto max-w-4xl px-4 py-6 sm:px-6", openId && "sm:mr-[480px] lg:mr-[560px] xl:mx-auto")}>
      <h1 className="text-2xl font-semibold">Mes tâches</h1>
      {editableProjects.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-card">
          <Plus size={16} className="ml-1 text-muted" aria-hidden />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void create())}
            maxLength={500}
            placeholder="Nouvelle tâche pour moi… (Entrée)"
            aria-label="Titre de la nouvelle tâche (Entrée pour créer)"
            className="h-9 min-w-48 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <label htmlFor="mt-project" className="sr-only">
            Projet de la nouvelle tâche
          </label>
          <Select
            id="mt-project"
            className="h-9 w-auto max-w-56"
            value={targetProject}
            onChange={(e) => {
              setTargetProject(e.target.value);
              try {
                localStorage.setItem(PROJECT_PREF, e.target.value);
              } catch {}
            }}
          >
            {editableProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="f-proj" className="sr-only">
          Filtrer par projet
        </label>
        <Select id="f-proj" className="h-9 w-auto" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">Tous les projets</option>
          {projects.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <label htmlFor="f-status" className="sr-only">
          Filtrer par statut
        </label>
        <Select id="f-status" className="h-9 w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | TaskStatus)}>
          <option value="">Tous les statuts</option>
          {(["todo", "in_progress", "blocked"] as TaskStatus[]).concat(showDone ? ["done"] : []).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <label htmlFor="f-sort" className="sr-only">
          Trier
        </label>
        <Select id="f-sort" className="h-9 w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="due">Trier par échéance</option>
          <option value="priority">Trier par priorité</option>
          <option value="project">Trier par projet</option>
        </Select>
        <label className="ml-auto flex items-center gap-2">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-4 w-4" />
          Afficher les tâches terminées (7 derniers jours)
        </label>
      </div>

      {total === 0 ? (
        <EmptyState icon={<CheckCircle2 size={28} />} title="Rien à faire pour l'instant">
          Les tâches qui vous sont assignées apparaîtront ici, regroupées par échéance.
          {editableProjects.length > 0 ? " Ajoutez-en une ci-dessus pour vous-même." : " "}
          {editableProjects.length === 0 && (
            <Link href="/projets" className="text-primary-text underline">
              Parcourir les projets
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="mt-6 space-y-6">
          {DUE_BUCKET_ORDER.map((b) => {
            const list = groups.get(b)!;
            if (!list.length) return null;
            return (
              <section key={b} aria-labelledby={`grp-${b}`}>
                <h2 id={`grp-${b}`} className={cn("mb-2 text-sm font-semibold", b === "overdue" && "text-danger")}>
                  {b === "none" && showDone ? "Sans date / terminées" : DUE_BUCKET_LABELS[b]} <span className="font-normal text-muted">({list.length})</span>
                </h2>
                <ul className="overflow-hidden rounded-lg border border-border bg-surface">
                  {list.map((t) => (
                    <li
                      key={t.id}
                      className={cn("flex min-h-11 cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0 hover:bg-surface-hover", openId === t.id && "bg-primary-soft")}
                      onClick={() => setTaskParam(t.id)}
                    >
                      <DoneToggle status={t.status} title={t.title} disabled={!t.canEdit} onToggle={() => void toggleDone(t)} />
                      <button
                        className={cn("min-w-0 flex-1 truncate text-left text-sm", t.status === "done" && "text-muted line-through")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTaskParam(t.id);
                        }}
                      >
                        {t.parentTitle && <span className="text-muted">{t.parentTitle} › </span>}
                        {t.title}
                      </button>
                      <span className="hidden items-center gap-2 sm:flex">
                        <StatusBadge status={t.status === "done" ? "todo" : t.status} />
                        <LabelChips labels={t.labels} max={2} />
                        <PriorityChip priority={t.priority} />
                      </span>
                      <span className="hidden max-w-40 items-center gap-1 truncate text-xs text-muted md:inline-flex">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: t.project.color }} aria-hidden />
                        {t.project.name}
                      </span>
                      <span className="w-20 text-right">
                        <DueChip due={t.dueDate} done={t.status === "done"} />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {openId && <TaskPanel key={openId} taskId={openId} onClose={() => setTaskParam(null)} onOpenTask={(id) => setTaskParam(id)} allLabels={labels} />}
    </div>
  );
}
