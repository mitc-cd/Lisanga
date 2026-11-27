"use client";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, FolderKanban, FolderPlus, Inbox, Keyboard, ListPlus, Search, Settings, SquareCheck, User } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { STATUS_LABELS, type TaskStatus } from "@/lib/labels";
import type { SearchResults } from "@/server/search";
import { useActor } from "./providers";

type ProjectLite = { id: string; name: string; color: string; canEdit: boolean };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({
  open,
  onOpenChange,
  projects,
  onShowShortcuts,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: ProjectLite[];
  onShowShortcuts: () => void;
}) {
  const router = useRouter();
  const actor = useActor();
  const [q, setQ] = useState("");
  const [page, setPage] = useState<"root" | "pick-project">("root");
  const dq = useDebounced(q.trim(), 200);
  const { data, isFetching } = useQuery({
    queryKey: ["search", dq],
    queryFn: () => fetchJson<SearchResults>(`/api/recherche?q=${encodeURIComponent(dq)}`),
    enabled: open && page === "root" && dq.length >= 2,
  });

  const close = () => {
    onOpenChange(false);
    setQ("");
    setPage("root");
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const editable = projects.filter((p) => p.canEdit);
  const item = "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-primary-soft aria-selected:text-fg";
  const group = "px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted";

  return (
    <D.Root open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content className="fixed left-1/2 top-[10vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop">
          <D.Title className="sr-only">Palette de commandes</D.Title>
          <D.Description className="sr-only">Tapez pour rechercher une tâche ou un projet, ou choisissez une action.</D.Description>
          <Command label="Palette de commandes" shouldFilter={page === "pick-project" || dq.length < 2} loop>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search size={18} className="text-muted" aria-hidden />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder={page === "pick-project" ? "Dans quel projet ?" : "Rechercher une tâche, un projet, une action…"}
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted"
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !q && page !== "root") setPage("root");
                }}
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
                {isFetching ? "Recherche…" : "Aucun résultat."}
              </Command.Empty>
              {page === "pick-project" ? (
                <Command.Group heading="Créer une tâche dans…" className={group}>
                  {editable.map((p) => (
                    <Command.Item key={p.id} value={p.name} className={item} onSelect={() => go(`/projets/${p.id}?nouvelle=1`)}>
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
                      {p.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : (
                <>
                  {dq.length >= 2 && data && (
                    <>
                      {data.tasks.length > 0 && (
                        <Command.Group heading="Tâches" className={group}>
                          {data.tasks.map((t) => (
                            <Command.Item key={t.id} value={`task-${t.id}`} className={item} onSelect={() => go(`/taches/${t.id}`)}>
                              <SquareCheck size={16} className="shrink-0 text-muted" aria-hidden />
                              <span className="min-w-0 flex-1 truncate">
                                {t.title}
                                {t.archived && <span className="ml-1 text-xs text-muted">(archivée)</span>}
                              </span>
                              <span className="shrink-0 text-xs text-muted">
                                {t.projectName} · {STATUS_LABELS[t.status as TaskStatus]}
                              </span>
                            </Command.Item>
                          ))}
                        </Command.Group>
                      )}
                      {data.projects.length > 0 && (
                        <Command.Group heading="Projets" className={group}>
                          {data.projects.map((p) => (
                            <Command.Item key={p.id} value={`project-${p.id}`} className={item} onSelect={() => go(`/projets/${p.id}`)}>
                              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
                              {p.name}
                              {p.archived && <span className="text-xs text-muted">(archivé)</span>}
                            </Command.Item>
                          ))}
                        </Command.Group>
                      )}
                    </>
                  )}
                  {dq.length < 2 && (
                    <>
                      <Command.Group heading="Créer" className={group}>
                        {editable.length > 0 && (
                          <Command.Item value="nouvelle tâche créer" className={item} onSelect={() => { setQ(""); setPage("pick-project"); }}>
                            <ListPlus size={16} aria-hidden /> Nouvelle tâche…
                          </Command.Item>
                        )}
                        {actor.orgRole !== "viewer" && (
                          <Command.Item value="nouveau projet créer" className={item} onSelect={() => go("/projets?nouveau=1")}>
                            <FolderPlus size={16} aria-hidden /> Nouveau projet
                          </Command.Item>
                        )}
                      </Command.Group>
                      <Command.Group heading="Aller à" className={group}>
                        <Command.Item value="mes tâches" className={item} onSelect={() => go("/mes-taches")}>
                          <CheckCircle2 size={16} aria-hidden /> Mes tâches
                        </Command.Item>
                        <Command.Item value="boîte de réception notifications" className={item} onSelect={() => go("/boite")}>
                          <Inbox size={16} aria-hidden /> Boîte de réception
                        </Command.Item>
                        <Command.Item value="projets" className={item} onSelect={() => go("/projets")}>
                          <FolderKanban size={16} aria-hidden /> Projets
                        </Command.Item>
                        {projects.slice(0, 8).map((p) => (
                          <Command.Item key={p.id} value={`projet ${p.name}`} className={item} onSelect={() => go(`/projets/${p.id}`)}>
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
                            {p.name}
                          </Command.Item>
                        ))}
                        <Command.Item value="profil sessions déconnexion" className={item} onSelect={() => go("/profil")}>
                          <User size={16} aria-hidden /> Mon profil
                        </Command.Item>
                        {actor.orgRole === "admin" && (
                          <Command.Item value="administration paramètres membres" className={item} onSelect={() => go("/admin/parametres")}>
                            <Settings size={16} aria-hidden /> Administration
                          </Command.Item>
                        )}
                        <Command.Item value="raccourcis clavier aide" className={item} onSelect={() => { close(); onShowShortcuts(); }}>
                          <Keyboard size={16} aria-hidden /> Raccourcis clavier
                        </Command.Item>
                      </Command.Group>
                    </>
                  )}
                </>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
