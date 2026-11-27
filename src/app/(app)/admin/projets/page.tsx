import Link from "next/link";
import { Globe, Lock } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { listAllProjectsForAdmin } from "@/server/projects";
import { Card } from "@/components/ui/misc";

export const metadata = { title: "Projets (administration)" };

export default async function AdminProjectsPage() {
  const actor = await requireActor();
  const rows = await listAllProjectsForAdmin(actor);
  return (
    <Card>
      <p className="border-b border-border px-5 py-3 text-sm text-muted">
        Tous les projets de l&apos;organisation. Pour un projet privé dont vous n&apos;êtes pas membre, vous pouvez gérer ses membres sans accéder à son contenu.
      </p>
      <ul className="divide-y divide-border">
        {rows.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="h-3 w-3 rounded" style={{ background: p.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{p.name}</span>
              {p.archivedAt && <span className="ml-2 text-xs text-muted">(archivé)</span>}
              <span className="block text-xs text-muted">
                {p.members} membre{p.members > 1 ? "s" : ""} · responsable{p.owners.length > 1 ? "s" : ""} : {p.owners.join(", ") || "—"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              {p.visibility === "private" ? <Lock size={12} aria-hidden /> : <Globe size={12} aria-hidden />}
              {p.visibility === "private" ? "Privé" : "Organisation"}
            </span>
            <Link href={`/projets/${p.id}/parametres`} className="rounded-md border border-border-strong px-3 py-1 hover:bg-surface-hover">
              Gérer les membres
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
