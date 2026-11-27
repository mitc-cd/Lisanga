"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Alert, Avatar, Card } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PROJECT_ROLE_LABELS, type ProjectRole } from "@/lib/permissions";
import type { MemberView } from "@/server/projects";
import { removeProjectMemberAction, setProjectArchivedAction, setProjectMemberAction, updateProjectAction } from "@/app/actions/projects";

type Confirm = { title: string; description: string; label: string; danger?: boolean; run: () => void } | null;

export function ProjectSettings({
  project,
  members,
  canManage,
  canReadContent,
  selfId,
  directory,
}: {
  project: { id: string; name: string; visibility: "organization" | "private"; archived: boolean; version: number; description: string };
  members: MemberView[];
  canManage: boolean;
  canReadContent: boolean;
  selfId: string;
  directory: { id: string; name: string; email: string; orgRole: string; status: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const memberIds = new Set(members.map((m) => m.userId));
  const candidates = directory.filter((d) => !memberIds.has(d.id));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(success);
      after?.();
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        {canReadContent ? (
          <Link href={`/projets/${project.id}`} className="inline-flex items-center gap-1 text-sm text-primary-text hover:underline">
            <ArrowLeft size={14} aria-hidden /> Retour au projet
          </Link>
        ) : (
          <Link href="/admin/projets" className="inline-flex items-center gap-1 text-sm text-primary-text hover:underline">
            <ArrowLeft size={14} aria-hidden /> Retour à l&apos;administration des projets
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-semibold">{project.name}</h1>
        {!canReadContent && (
          <Alert tone="info" className="mt-3">
            Projet privé dont vous n&apos;êtes pas membre : en tant qu&apos;administrateur, vous gérez ses membres sans accéder à son contenu.
          </Alert>
        )}
      </div>

      <Card>
        <h2 className="border-b border-border px-5 py-3 text-lg font-semibold">Membres ({members.length})</h2>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Avatar name={m.name} id={m.userId} size={30} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {m.name}
                  {m.userId === selfId && <span className="font-normal text-muted"> (vous)</span>}
                  {m.status === "deactivated" && <span className="font-normal text-muted"> (désactivé)</span>}
                  {m.status === "invited" && <span className="font-normal text-muted"> (invitation en attente)</span>}
                </div>
                <div className="truncate text-sm text-muted">{m.email}</div>
              </div>
              {canManage ? (
                <>
                  <label className="sr-only" htmlFor={`pr-${m.userId}`}>
                    Rôle de {m.name}
                  </label>
                  <Select
                    id={`pr-${m.userId}`}
                    className="h-9 w-40"
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => {
                      const role = e.target.value as ProjectRole;
                      setConfirm({
                        title: "Changer le rôle dans le projet ?",
                        description: `${m.name} deviendra « ${PROJECT_ROLE_LABELS[role]} ».${role === "viewer" ? " Ses tâches dans ce projet seront désassignées." : ""}`,
                        label: "Changer le rôle",
                        run: () => run(() => setProjectMemberAction(project.id, { userId: m.userId, role }), "Rôle modifié."),
                      });
                    }}
                  >
                    {(["owner", "editor", "viewer"] as ProjectRole[]).map((r) => (
                      <option key={r} value={r}>
                        {PROJECT_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={pending}
                    onClick={() =>
                      setConfirm({
                        title: m.userId === selfId ? "Quitter le projet ?" : "Retirer du projet ?",
                        description: `${m.userId === selfId ? "Vous perdrez" : `${m.name} perdra`} l'accès${project.visibility === "private" ? "" : " en écriture"} à ce projet. Ses tâches dans ce projet seront désassignées.`,
                        label: m.userId === selfId ? "Quitter" : "Retirer",
                        danger: true,
                        run: () =>
                          run(
                            () => removeProjectMemberAction(project.id, m.userId),
                            m.userId === selfId ? "Vous avez quitté le projet." : "Membre retiré.",
                            m.userId === selfId ? () => router.push("/projets") : undefined,
                          ),
                      })
                    }
                  >
                    {m.userId === selfId ? "Quitter" : "Retirer"}
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted">{PROJECT_ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <form
            className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const userId = String(fd.get("userId") ?? "");
              if (!userId) return;
              run(() => setProjectMemberAction(project.id, { userId, role: fd.get("role") }), "Membre ajouté.");
            }}
          >
            <div className="min-w-56 flex-1">
              <Label htmlFor="add-user">Ajouter une personne</Label>
              <Select id="add-user" name="userId" defaultValue="" required>
                <option value="" disabled>
                  Choisir…
                </option>
                {candidates.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.email}
                    {d.orgRole === "viewer" ? " (lecteur)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="add-role">Rôle</Label>
              <Select id="add-role" name="role" defaultValue="editor">
                <option value="editor">Contributeur</option>
                <option value="owner">Responsable</option>
                <option value="viewer">Lecteur</option>
              </Select>
            </div>
            <Button type="submit" disabled={pending || candidates.length === 0}>
              Ajouter
            </Button>
            {candidates.length === 0 && <p className="w-full text-xs text-muted">Toutes les personnes de l&apos;organisation sont déjà membres. Invitez-en de nouvelles depuis l&apos;administration.</p>}
          </form>
        )}
      </Card>

      {canManage && canReadContent && (
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">Paramètres du projet</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const description = String(new FormData(e.currentTarget).get("description") ?? "");
              run(() => updateProjectAction(project.id, project.version, { description }), "Description enregistrée.");
            }}
          >
            <Label htmlFor="p-description">Description</Label>
            <Textarea id="p-description" name="description" defaultValue={project.description} maxLength={5000} />
            <Button type="submit" variant="secondary" size="sm" className="mt-2" disabled={pending}>
              Enregistrer la description
            </Button>
          </form>
          <div>
            <Label htmlFor="p-visibility">Visibilité</Label>
            <Select
              id="p-visibility"
              value={project.visibility}
              disabled={pending}
              onChange={(e) => {
                const visibility = e.target.value as "organization" | "private";
                setConfirm({
                  title: "Changer la visibilité ?",
                  description:
                    visibility === "private"
                      ? "Le projet ne sera plus visible que par ses membres. Les autres personnes perdront l'accès immédiatement."
                      : "Toutes les personnes internes de l'organisation pourront consulter ce projet.",
                  label: "Changer la visibilité",
                  run: () => run(() => updateProjectAction(project.id, project.version, { visibility }), "Visibilité modifiée."),
                });
              }}
              className="max-w-sm"
            >
              <option value="organization">Visible par toute l&apos;organisation</option>
              <option value="private">Privé (membres uniquement)</option>
            </Select>
          </div>
          <div className="border-t border-border pt-4">
            {project.archived ? (
              <Button variant="secondary" disabled={pending} onClick={() => run(() => setProjectArchivedAction(project.id, false), "Projet restauré.")}>
                Restaurer le projet
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await setProjectArchivedAction(project.id, true);
                    if (!r.ok) return void toast.error(r.error);
                    toast("Projet archivé.", {
                      action: {
                        label: "Annuler",
                        onClick: async () => {
                          const u = await setProjectArchivedAction(project.id, false);
                          if (!u.ok) toast.error(u.error);
                          router.refresh();
                        },
                      },
                    });
                    router.refresh();
                  })
                }
              >
                Archiver le projet
              </Button>
            )}
            <p className="mt-1 text-xs text-muted">Un projet archivé reste consultable (en lecture seule) et peut être restauré à tout moment.</p>
          </div>
        </Card>
      )}
      {canManage && !canReadContent && (
        <Card className="p-5">
          {project.archived ? (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => setProjectArchivedAction(project.id, false), "Projet restauré.")}>
              Restaurer le projet
            </Button>
          ) : (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => setProjectArchivedAction(project.id, true), "Projet archivé.")}>
              Archiver le projet
            </Button>
          )}
        </Card>
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.label ?? "Confirmer"}
        danger={confirm?.danger}
        onConfirm={() => confirm?.run()}
      />
    </div>
  );
}
