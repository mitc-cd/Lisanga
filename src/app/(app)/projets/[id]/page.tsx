import { Suspense } from "react";
import { requireActor } from "@/server/auth/session";
import { getProjectDetail } from "@/server/projects";
import { getProjectTasks, listLabels } from "@/server/tasks";
import { orNotFound } from "@/server/page-helpers";
import { ProjectView } from "@/components/project/project-view";

export default async function ProjectPage({ params }: PageProps<"/projets/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const [project, tasks, labels] = await orNotFound(() => Promise.all([getProjectDetail(actor, id), getProjectTasks(actor, id), listLabels(actor)]));
  return (
    <Suspense>
      <title>{project.name}</title>
      <ProjectView initial={{ project, tasks }} labels={labels} isExternal={actor.isExternal} />
    </Suspense>
  );
}
