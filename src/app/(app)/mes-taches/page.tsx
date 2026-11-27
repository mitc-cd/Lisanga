import { Suspense } from "react";
import { requireActor } from "@/server/auth/session";
import { listMyTasks, listLabels } from "@/server/tasks";
import { listProjects } from "@/server/projects";
import { MyTasksView } from "./my-tasks-view";

export const metadata = { title: "Mes tâches" };

export default async function MyTasksPage() {
  const actor = await requireActor();
  const [tasks, labels, projects] = await Promise.all([listMyTasks(actor), listLabels(actor), listProjects(actor)]);
  const editable = projects.filter((p) => p.role === "owner" || p.role === "editor").map((p) => ({ id: p.id, name: p.name }));
  return (
    <Suspense>
      <MyTasksView initial={tasks} labels={labels} editableProjects={editable} />
    </Suspense>
  );
}
