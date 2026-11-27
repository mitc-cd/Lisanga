import { requireActor } from "@/server/auth/session";
import { listProjects } from "@/server/projects";
import { listTeams } from "@/server/users";
import { ProjectsIndex } from "./projects-index";

export const metadata = { title: "Projets" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projets">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const archived = sp.archives === "1";
  const [projects, teams] = await Promise.all([listProjects(actor, { archived }), listTeams(actor)]);
  return (
    <ProjectsIndex
      projects={projects}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      canCreate={actor.orgRole !== "viewer" && !actor.isExternal}
      showArchived={archived}
      openCreate={sp.nouveau === "1"}
    />
  );
}
