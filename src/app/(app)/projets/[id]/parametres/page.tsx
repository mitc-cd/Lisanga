import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { getProjectAccess } from "@/server/permissions";
import { getProjectDetail, getProjectMembersForManagement } from "@/server/projects";
import { listDirectory } from "@/server/users";
import { orNotFound } from "@/server/page-helpers";
import { ProjectSettings } from "./project-settings";

export const metadata = { title: "Membres du projet" };

export default async function ProjectSettingsPage({ params }: PageProps<"/projets/[id]/parametres">) {
  const actor = await requireActor();
  const { id } = await params;
  const access = await orNotFound(() => getProjectAccess(actor, id, { allowManageOnly: true }));
  if (!access.canRead && !access.canManage) notFound();
  const directory = access.canManage ? await listDirectory(actor) : [];
  if (access.canRead) {
    const p = await getProjectDetail(actor, id);
    return (
      <ProjectSettings
        project={{ id: p.id, name: p.name, visibility: p.visibility, archived: p.archived, version: p.version, description: p.description }}
        members={p.members}
        canManage={p.canManage}
        canReadContent
        selfId={actor.id}
        directory={directory}
      />
    );
  }
  const m = await getProjectMembersForManagement(actor, id);
  return (
    <ProjectSettings
      project={{ ...m.project, archived: access.project.archivedAt !== null, version: access.project.version, description: "" }}
      members={m.members}
      canManage
      canReadContent={false}
      selfId={actor.id}
      directory={directory}
    />
  );
}
