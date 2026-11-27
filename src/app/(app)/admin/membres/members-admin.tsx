"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert, Avatar, Badge, Card } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ORG_ROLE_LABELS, type OrgRole } from "@/lib/permissions";
import { formatInstant } from "@/lib/dates";
import type { OrgUserView } from "@/server/users";
import { changeRoleAction, inviteUserAction, revokeInvitationAction, setUserActiveAction } from "../actions";

type Pending = { title: string; description: string; label: string; danger?: boolean; run: () => void } | null;

export function MembersAdmin({ users, selfId }: { users: OrgUserView[]; selfId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(success);
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserPlus size={18} aria-hidden /> Inviter une personne
        </h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            setError(null);
            start(async () => {
              const r = await inviteUserAction({
                email: fd.get("email"),
                name: fd.get("name") || undefined,
                orgRole: fd.get("orgRole"),
                isExternal: fd.get("isExternal") === "on",
              });
              if (!r.ok) return setError(r.error);
              form.reset();
              if (r.data.emailSent) toast.success("Invitation envoyée.");
              else toast.warning(`Compte créé, mais l'e-mail d'invitation n'est pas parti : ${r.data.emailError}`);
              router.refresh();
            });
          }}
        >
          <div>
            <Label htmlFor="inv-email">Adresse e-mail</Label>
            <Input id="inv-email" name="email" type="email" required placeholder="prenom.nom@mitc.cd" />
          </div>
          <div>
            <Label htmlFor="inv-name">Nom (facultatif)</Label>
            <Input id="inv-name" name="name" />
          </div>
          <div>
            <Label htmlFor="inv-role">Rôle</Label>
            <Select id="inv-role" name="orgRole" defaultValue="member">
              <option value="member">Membre</option>
              <option value="viewer">Lecteur</option>
              <option value="admin">Administrateur</option>
            </Select>
          </div>
          <Button type="submit" disabled={pending}>
            Inviter
          </Button>
          <label className="flex items-center gap-2 text-sm sm:col-span-4">
            <input type="checkbox" name="isExternal" className="h-4 w-4" />
            Invité externe (n&apos;accède qu&apos;aux projets où il est ajouté explicitement)
          </label>
          {error && (
            <div className="sm:col-span-4">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
        </form>
      </Card>

      <Card>
        <h2 className="border-b border-border px-5 py-3 text-lg font-semibold">Membres ({users.length})</h2>
        <ul className="divide-y divide-border">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Avatar name={u.name} id={u.id} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{u.name}</span>
                  {u.status === "invited" && (
                    <Badge className="bg-info-soft">{u.invitationExpired ? "Invitation expirée" : "Invitation en attente"}</Badge>
                  )}
                  {u.status === "deactivated" && <Badge className="bg-danger-soft">Désactivé</Badge>}
                  {u.isExternal && <Badge className="bg-accent-soft">Externe</Badge>}
                </div>
                <div className="truncate text-sm text-muted">
                  {u.email}
                  {u.lastLoginAt && ` · dernière connexion le ${formatInstant(u.lastLoginAt, "d MMM yyyy")}`}
                  {u.teams.length > 0 && ` · ${u.teams.join(", ")}`}
                </div>
              </div>
              <label className="sr-only" htmlFor={`role-${u.id}`}>
                Rôle de {u.name}
              </label>
              <Select
                id={`role-${u.id}`}
                className="h-9 w-40"
                value={u.orgRole}
                disabled={pending || u.status === "deactivated"}
                onChange={(e) => {
                  const role = e.target.value as OrgRole;
                  setConfirm({
                    title: "Changer le rôle ?",
                    description: `${u.name} deviendra « ${ORG_ROLE_LABELS[role]} ».${role === "viewer" ? " Ses rôles de projet passeront en lecture seule et ses tâches seront désassignées." : ""}`,
                    label: "Changer le rôle",
                    run: () => run(() => changeRoleAction(u.id, role), "Rôle modifié."),
                  });
                }}
              >
                {(["admin", "member", "viewer"] as OrgRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ORG_ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
              <div className="flex gap-2">
                {u.status === "invited" && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await inviteUserAction({ email: u.email, orgRole: u.orgRole, isExternal: u.isExternal });
                          if (!r.ok) toast.error(r.error);
                          else if (r.data.emailSent) toast.success("Invitation renvoyée.");
                          else toast.warning(`L'e-mail n'est pas parti : ${r.data.emailError}`);
                          router.refresh();
                        })
                      }
                    >
                      Renvoyer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        setConfirm({
                          title: "Annuler l'invitation ?",
                          description: `${u.email} ne pourra plus se connecter.`,
                          label: "Annuler l'invitation",
                          danger: true,
                          run: () => run(() => revokeInvitationAction(u.id), "Invitation annulée."),
                        })
                      }
                    >
                      Annuler
                    </Button>
                  </>
                )}
                {u.status === "active" && u.id !== selfId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={pending}
                    onClick={() =>
                      setConfirm({
                        title: "Désactiver ce compte ?",
                        description: `${u.name} sera déconnecté immédiatement de tous ses appareils et ne pourra plus se connecter. Ses tâches et commentaires sont conservés.`,
                        label: "Désactiver",
                        danger: true,
                        run: () => run(() => setUserActiveAction(u.id, false), "Compte désactivé, sessions révoquées."),
                      })
                    }
                  >
                    Désactiver
                  </Button>
                )}
                {u.status === "deactivated" && (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setUserActiveAction(u.id, true), "Compte réactivé.")}>
                    Réactiver
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
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
