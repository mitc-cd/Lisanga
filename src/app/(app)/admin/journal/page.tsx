import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { listAudit } from "@/server/users";
import { formatInstant } from "@/lib/dates";
import { Card } from "@/components/ui/misc";

export const metadata = { title: "Journal d'audit" };

const LABELS: Record<string, string> = {
  "setup.completed": "Installation : premier administrateur créé",
  "settings.smtp.activated": "Configuration SMTP testée et activée",
  "settings.smtp.test_failed": "Échec d'un test SMTP",
  "settings.login.updated": "Paramètres de connexion modifiés",
  "settings.branding.updated": "Identité visuelle modifiée",
  "settings.entra.updated": "Paramètres Microsoft Entra ID modifiés",
  "settings.entra.tested": "Test de connexion Microsoft Entra ID",
  "user.invited": "Invitation envoyée",
  "user.reinvited": "Invitation renouvelée",
  "user.invitation_revoked": "Invitation annulée",
  "user.role_changed": "Rôle d'organisation modifié",
  "user.deactivated": "Compte désactivé (sessions révoquées)",
  "user.reactivated": "Compte réactivé",
  "team.created": "Équipe créée",
  "team.archived": "Équipe archivée",
  "project.visibility.changed": "Visibilité d'un projet modifiée",
  "project.archived": "Projet archivé",
  "project.restored": "Projet restauré",
  "project.member.added": "Membre ajouté à un projet",
  "project.member.role_changed": "Rôle dans un projet modifié",
  "project.member.removed": "Membre retiré d'un projet",
};

export default async function AuditPage({ searchParams }: PageProps<"/admin/journal">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const before = typeof sp.avant === "string" ? Number(sp.avant) || undefined : undefined;
  const { items, names, next } = await listAudit(actor, before);
  const detail = (d: Record<string, unknown>, targetType: string | null, targetId: string | null) => {
    const parts: string[] = [];
    if (targetType === "user" && targetId) parts.push(names[targetId] ?? "");
    if (typeof d.userId === "string") parts.push(names[d.userId] ?? "");
    if (Array.isArray(d.fields)) parts.push(`champs : ${(d.fields as string[]).join(", ")}`);
    if (d.from !== undefined || d.to !== undefined) parts.push(`${String(d.from ?? "—")} → ${String(d.to ?? "—")}`);
    if (typeof d.email === "string") parts.push(d.email);
    if (typeof d.error === "string") parts.push(d.error);
    if (typeof d.ok === "boolean") parts.push(d.ok ? "réussi" : "échec");
    return parts.filter(Boolean).join(" · ");
  };
  return (
    <Card>
      <ul className="divide-y divide-border">
        {items.length === 0 && <li className="px-5 py-6 text-sm text-muted">Aucune opération enregistrée.</li>}
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 text-sm">
            <time dateTime={a.createdAt} className="w-40 shrink-0 text-muted">
              {formatInstant(a.createdAt)}
            </time>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{LABELS[a.action] ?? a.action}</span>
              <span className="block text-xs text-muted">
                par {a.actorName ?? "système"}
                {detail(a.details, a.targetType, a.targetId) && ` · ${detail(a.details, a.targetType, a.targetId)}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {next && (
        <div className="border-t border-border px-5 py-3 text-center">
          <Link href={`/admin/journal?avant=${next}`} className="text-sm text-primary-text underline">
            Entrées plus anciennes
          </Link>
        </div>
      )}
    </Card>
  );
}
