"use client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AtSign, Inbox, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/fetch-json";
import { formatInstant, formatRelative } from "@/lib/dates";
import type { InboxItem } from "@/server/notifications";
import { markAllReadAction, setNotificationReadAction } from "@/app/actions/notifications";

type Page = { items: InboxItem[]; nextCursor: string | null };

export function InboxView({ initial }: { initial: Page }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ["inbox", unreadOnly],
    queryFn: ({ pageParam }) => fetchJson<Page>(`/api/boite?${new URLSearchParams({ ...(unreadOnly && { nonlues: "1" }), ...(pageParam && { avant: pageParam }) })}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: unreadOnly ? undefined : { pages: [initial], pageParams: [""] },
    refetchInterval: 30_000,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["inbox"] });
    void qc.invalidateQueries({ queryKey: ["unread-count"] });
  };

  const open = async (n: InboxItem) => {
    if (!n.read) await setNotificationReadAction(n.id, true);
    refresh();
    router.push(`/taches/${n.task.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold">Boîte de réception</h1>
        <div role="group" aria-label="Filtre" className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
          {[
            { v: false, label: "Toutes" },
            { v: true, label: "Non lues" },
          ].map((o) => (
            <button
              key={o.label}
              aria-pressed={unreadOnly === o.v}
              onClick={() => setUnreadOnly(o.v)}
              className={cn("rounded-md px-3 py-1", unreadOnly === o.v ? "bg-primary-soft font-semibold text-primary-text" : "text-muted")}
            >
              {o.label}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!items.some((i) => !i.read)}
          onClick={async () => {
            const r = await markAllReadAction();
            if (!r.ok) return toast.error(r.error);
            refresh();
          }}
        >
          Tout marquer comme lu
        </Button>
      </div>
      {items.length === 0 && !q.isFetching ? (
        <EmptyState icon={<Inbox size={28} />} title={unreadOnly ? "Aucune notification non lue" : "Votre boîte de réception est vide"}>
          Vous serez notifié ici quand on vous assigne une tâche ou qu&apos;on vous mentionne dans un commentaire.
        </EmptyState>
      ) : (
        <ul className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0", !n.read && "bg-primary-soft/60")}>
              <span className={cn("mt-0.5 rounded-full p-1.5", n.type === "mentioned" ? "bg-accent-soft text-accent-text" : "bg-info-soft text-primary-text")} aria-hidden>
                {n.type === "mentioned" ? <AtSign size={14} /> : <UserCheck size={14} />}
              </span>
              <button onClick={() => void open(n)} className="min-w-0 flex-1 text-left">
                <span className="block text-sm">
                  {!n.read && <span className="sr-only">Non lue : </span>}
                  <strong>{n.actorName ?? "Quelqu'un"}</strong> {n.type === "mentioned" ? "vous a mentionné dans" : "vous a assigné"}{" "}
                  <strong>{n.task.title}</strong>
                </span>
                {n.excerpt && <span className="mt-0.5 block truncate text-sm text-muted">« {n.excerpt} »</span>}
                <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span className="h-2 w-2 rounded-sm" style={{ background: n.task.projectColor }} aria-hidden />
                  {n.task.projectName} ·{" "}
                  <time dateTime={n.createdAt} title={formatInstant(n.createdAt)}>
                    {formatRelative(n.createdAt)}
                  </time>
                </span>
              </button>
              <button
                onClick={async () => {
                  const r = await setNotificationReadAction(n.id, !n.read);
                  if (!r.ok) return toast.error(r.error);
                  refresh();
                }}
                className="shrink-0 rounded px-2 py-1 text-xs text-primary-text hover:bg-surface-hover"
              >
                {n.read ? "Marquer non lue" : "Marquer lue"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            Afficher plus
          </Button>
        </div>
      )}
    </div>
  );
}
