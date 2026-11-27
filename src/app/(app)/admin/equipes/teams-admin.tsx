"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Avatar, Card, EmptyState } from "@/components/ui/misc";
import { archiveTeamAction, createTeamAction, renameTeamAction, setTeamMemberAction } from "../actions";

export function TeamsAdmin({ teams, people }: { teams: { id: string; name: string; memberIds: string[] }[]; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string, undo?: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (ok) toast.success(ok, undo ? { action: { label: "Annuler", onClick: () => run(undo) } } : undefined);
      router.refresh();
    });
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "—";
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const n = new FormData(form).get("name");
            run(async () => {
              const r = await createTeamAction(n);
              if (r.ok) form.reset();
              return r;
            }, "Équipe créée.");
          }}
        >
          <div className="min-w-56 flex-1">
            <Label htmlFor="team-name">Nouvelle équipe</Label>
            <Input id="team-name" name="name" required maxLength={80} placeholder="Ex. : Direction des systèmes d'information" />
          </div>
          <Button type="submit" disabled={pending}>
            Créer
          </Button>
        </form>
      </Card>
      {teams.length === 0 ? (
        <EmptyState icon={<Users size={28} />} title="Aucune équipe">
          Les équipes regroupent des personnes (par département, par exemple) et permettent de rattacher des projets.
        </EmptyState>
      ) : (
        teams.map((t) => (
          <Card key={t.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                defaultValue={t.name}
                aria-label="Nom de l'équipe"
                maxLength={80}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && run(() => renameTeamAction(t.id, e.target.value.trim()), "Équipe renommée.")}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-lg font-semibold hover:border-border-strong"
              />
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => archiveTeamAction(t.id), "Équipe archivée.")}>
                Archiver
              </Button>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {t.memberIds.map((id) => (
                <li key={id} className="flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pl-1 pr-2 text-sm">
                  <Avatar name={name(id)} id={id} size={22} />
                  {name(id)}
                  <button
                    className="text-muted hover:text-danger"
                    aria-label={`Retirer ${name(id)} de l'équipe`}
                    onClick={() => run(() => setTeamMemberAction(t.id, id, false), `${name(id)} retiré(e) de l'équipe.`, () => setTeamMemberAction(t.id, id, true))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 max-w-sm">
              <label htmlFor={`add-${t.id}`} className="sr-only">
                Ajouter une personne à {t.name}
              </label>
              <Select
                id={`add-${t.id}`}
                value=""
                onChange={(e) => e.target.value && run(() => setTeamMemberAction(t.id, e.target.value, true))}
                className="h-9"
              >
                <option value="">Ajouter une personne…</option>
                {people
                  .filter((p) => !t.memberIds.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
