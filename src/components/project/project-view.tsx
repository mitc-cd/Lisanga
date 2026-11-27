"use client";
import { useSyncedState } from "@/lib/hooks/use-synced-state";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Columns3, Globe, List, Lock, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { LabelView } from "@/server/tasks";
import { joinProjectAction, setProjectArchivedAction, updateProjectAction } from "@/app/actions/projects";
import { TaskPanel } from "@/components/task/task-panel";
import { useBoard, type BoardData } from "./use-board";
import { ListView } from "./list-view";
import { BoardView } from "./board-view";

export function ProjectView({ initial, labels, isExternal }: { initial: BoardData; labels: LabelView[]; isExternal: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const board = useBoard(initial.project.id, initial);
  const { project, tasks } = board.data;
  const view = sp.get("vue") === "tableau" ? "tableau" : "liste";
  const openId = sp.get("tache");
  const [pending, start] = useTransition();

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      next.delete("nouvelle");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, pathname, router],
  );
  const openTask = useCallback((id: string) => setParams({ tache: id }), [setParams]);
  const closeTask = useCallback(() => {
    const id = openId;
    setParams({ tache: null });
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-task-row="${id}"],[data-board-card="${id}"]`)?.focus());
  }, [setParams, openId]);

  /** Place le curseur dans l'ajout rapide de la première section (vue Liste). */
  const focusQuickAdd = useCallback(() => {
    if (view === "tableau") setParams({ vue: null });
    const tryFocus = (n: number) => {
      const el = document.getElementById("quick-add-first");
      if (el) el.focus();
      else if (n > 0) setTimeout(() => tryFocus(n - 1), 50);
    };
    tryFocus(10);
  }, [view, setParams]);

  useEffect(() => {
    if (sp.get("nouvelle") === "1" && project.canEdit) focusQuickAdd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "n" && project.canEdit) {
        e.preventDefault();
        focusQuickAdd();
      } else if (k === "l") setParams({ vue: null });
      else if (k === "b") setParams({ vue: "tableau" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project.canEdit, focusQuickAdd, setParams]);

  const [name, setName] = useSyncedState(project.name);
  const canRename = project.canManage && !project.archived;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-surface px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-4 w-4 shrink-0 rounded" style={{ background: project.color }} aria-hidden />
          {canRename ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Nom du projet"
              maxLength={200}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onBlur={async () => {
                const n = name.trim();
                if (!n || n === project.name) return setName(project.name);
                const r = await updateProjectAction(project.id, project.version, { name: n });
                if (!r.ok) {
                  toast.error(r.error);
                  setName(project.name);
                }
                void board.refresh();
                router.refresh();
              }}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold hover:border-border-strong focus:border-border-strong sm:text-2xl"
            />
          ) : (
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold sm:text-2xl">{project.name}</h1>
          )}
          {canRename && <h1 className="sr-only">{project.name}</h1>}
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
            {project.visibility === "private" ? <Lock size={12} aria-hidden /> : <Globe size={12} aria-hidden />}
            {project.visibility === "private" ? "Privé" : "Visible par l'organisation"}
          </span>
          <Link href={`/projets/${project.id}/parametres`} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm hover:bg-surface-hover" aria-label={`Membres du projet (${project.members.length})`}>
            <span className="flex -space-x-1.5">
              {project.members.slice(0, 4).map((m) => (
                <Avatar key={m.userId} name={m.name} id={m.userId} size={24} className="ring-2 ring-surface" />
              ))}
            </span>
            <Users size={16} className="ml-1 text-muted" aria-hidden />
            <span className="text-muted">{project.members.length}</span>
          </Link>
          {!project.isMember && project.visibility === "organization" && !isExternal && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await joinProjectAction(project.id);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success("Vous avez rejoint le projet.");
                  void board.refresh();
                  router.refresh();
                })
              }
            >
              Rejoindre le projet
            </Button>
          )}
          {project.canEdit && (
            <Button size="sm" onClick={focusQuickAdd} aria-keyshortcuts="N">
              <Plus size={16} aria-hidden /> Ajouter une tâche
            </Button>
          )}
        </div>
        {project.description && <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted">{project.description}</p>}
        <nav aria-label="Vues du projet" className="mt-3 flex gap-1">
          {[
            { id: "liste", label: "Liste", icon: <List size={16} aria-hidden />, key: "L" },
            { id: "tableau", label: "Tableau", icon: <Columns3 size={16} aria-hidden />, key: "B" },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setParams({ vue: v.id === "liste" ? null : v.id })}
              aria-current={view === v.id ? "page" : undefined}
              aria-keyshortcuts={v.key}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
                view === v.id ? "border-primary font-semibold text-primary-text" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      {project.archived && (
        <div role="status" className="flex flex-wrap items-center gap-3 border-b border-accent bg-accent-soft px-6 py-2 text-sm">
          Ce projet est archivé : il est en lecture seule.
          {project.canManage && (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const r = await setProjectArchivedAction(project.id, false);
                if (!r.ok) return toast.error(r.error);
                toast.success("Projet restauré.");
                void board.refresh();
                router.refresh();
              }}
            >
              Restaurer le projet
            </Button>
          )}
        </div>
      )}
      {!project.canEdit && !project.archived && (
        <div role="status" className="border-b border-border bg-surface-2 px-6 py-2 text-xs text-muted">
          Accès en lecture seule{!project.isMember && project.visibility === "organization" ? " : rejoignez le projet pour contribuer." : "."}
        </div>
      )}

      <div className={cn("min-h-0 flex-1 overflow-auto p-4 sm:p-6", openId && "sm:pr-[500px] lg:pr-[580px]")}>
        {tasks.length === 0 && !project.canEdit ? (
          <EmptyState title="Aucune tâche pour l'instant">Les contributeurs de ce projet n&apos;ont pas encore créé de tâche.</EmptyState>
        ) : (
          <>
            {tasks.length === 0 && (
              <p className="mb-4 rounded-lg border border-dashed border-border-strong bg-surface p-4 text-sm text-muted">
                Projet vide : tapez le titre d&apos;une tâche dans « Ajouter une tâche… » puis Entrée. Seul le titre est obligatoire.
              </p>
            )}
            {view === "tableau" ? (
              <BoardView board={board} canEdit={project.canEdit} selectedId={openId} onOpen={openTask} />
            ) : (
              <ListView board={board} canEdit={project.canEdit} selectedId={openId} onOpen={openTask} />
            )}
          </>
        )}
      </div>
      {openId && <TaskPanel key={openId} taskId={openId} onClose={closeTask} onOpenTask={openTask} board={board} allLabels={labels} />}
    </div>
  );
}
