import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { resolveTaskLink } from "@/server/tasks";
import { orNotFound } from "@/server/page-helpers";

/** Lien direct partageable : n'ouvre la tâche que si l'utilisateur peut la lire (sinon 404). */
export default async function TaskLinkPage({ params }: PageProps<"/taches/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const r = await orNotFound(() => resolveTaskLink(actor, id));
  redirect(`/projets/${r.projectId}?tache=${r.focusId}`);
}
