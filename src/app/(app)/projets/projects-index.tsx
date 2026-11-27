"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FolderKanban, Globe, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert, Card, EmptyState } from "@/components/ui/misc";
import { PROJECT_ROLE_LABELS } from "@/lib/permissions";
import type { ProjectSummary } from "@/server/projects";
import { createProjectAction } from "@/app/actions/projects";

const COLORS = ["#0B3D91", "#589CDB", "#F5A623", "#1E7B34", "#7B3FA0", "#B42318", "#0F766E", "#5B4636"];

export function ProjectsIndex({
  projects,
  teams,
  canCreate,
  showArchived,
  openCreate,
}: {
  projects: ProjectSummary[];
  teams: { id: string; name: string }[];
  canCreate: boolean;
  showArchived: boolean;
  openCreate: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(openCreate && canCreate);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [pending, start] = useTransition();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold">{showArchived ? "Projets archivés" : "Projets"}</h1>
        <Link href={showArchived ? "/projets" : "/projets?archives=1"} className="text-sm text-primary-text underline-offset-4 hover:underline">
          {showArchived ? "Voir les projets actifs" : "Voir les projets archivés"}
        </Link>
        {canCreate && !showArchived && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> Nouveau projet
          </Button>
        )}
      </div>

      {creating && (
        <Card className="mt-4 p-5">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(null);
              start(async () => {
                const r = await createProjectAction({
                  name: fd.get("name"),
                  description: fd.get("description") || undefined,
                  visibility: fd.get("visibility"),
                  teamId: fd.get("teamId") || null,
                  color,
                });
                if (!r.ok) return setError(r.error);
                toast.success("Projet créé.");
                router.push(`/projets/${r.data.id}?nouvelle=1`);
              });
            }}
          >
            <h2 className="text-lg font-semibold sm:col-span-2">Nouveau projet</h2>
            <div className="sm:col-span-2">
              <Label htmlFor="p-name">Nom du projet</Label>
              <Input id="p-name" name="name" required autoFocus maxLength={200} placeholder="Ex. : Migration de la messagerie" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="p-desc">Description (facultatif)</Label>
              <Input id="p-desc" name="description" maxLength={5000} />
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Qui peut voir ce projet ?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="radio" name="visibility" value="organization" defaultChecked className="mt-1" />
                  <span>
                    <span className="flex items-center gap-1 font-medium">
                      <Globe size={14} aria-hidden /> Toute l&apos;organisation
                    </span>
                    <span className="text-xs text-muted">Tout le monde peut le consulter ; seuls les membres le modifient.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="radio" name="visibility" value="private" className="mt-1" />
                  <span>
                    <span className="flex items-center gap-1 font-medium">
                      <Lock size={14} aria-hidden /> Privé
                    </span>
                    <span className="text-xs text-muted">Visible uniquement par les membres du projet.</span>
                  </span>
                </label>
              </div>
            </fieldset>
            {teams.length > 0 && (
              <div>
                <Label htmlFor="p-team">Équipe (facultatif)</Label>
                <Select id="p-team" name="teamId" defaultValue="">
                  <option value="">Aucune</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Couleur</legend>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={`Couleur ${c}`}
                    aria-pressed={color === c}
                    className="h-7 w-7 rounded-md ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-ring"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </fieldset>
            {error && (
              <div className="sm:col-span-2">
                <Alert tone="danger">{error}</Alert>
              </div>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Création…" : "Créer le projet"}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      )}

      {projects.length === 0 && !creating ? (
        <EmptyState
          icon={<FolderKanban size={28} />}
          title={showArchived ? "Aucun projet archivé" : "Aucun projet visible"}
          action={
            canCreate && !showArchived ? (
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden /> Créer un premier projet
              </Button>
            ) : undefined
          }
        >
          {showArchived
            ? "Les projets archivés apparaîtront ici et pourront être restaurés."
            : canCreate
              ? "Créez un projet pour organiser les tâches de votre équipe en sections, en liste ou en tableau."
              : "Vous verrez ici les projets visibles par l'organisation et ceux dont vous êtes membre."}
        </EmptyState>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projets/${p.id}`} className="block h-full rounded-xl border border-border bg-surface p-4 shadow-card hover:border-border-strong">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded" style={{ background: p.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  {p.visibility === "private" ? <Lock size={14} className="text-muted" aria-label="Privé" /> : <Globe size={14} className="text-muted" aria-label="Visible par l'organisation" />}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <span>
                    {p.openTasks} tâche{p.openTasks > 1 ? "s" : ""} ouverte{p.openTasks > 1 ? "s" : ""}
                  </span>
                  <span>{p.isMember && p.role ? PROJECT_ROLE_LABELS[p.role] : "Non membre (lecture)"}</span>
                  {p.teamName && <span>{p.teamName}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
