import { apiRoute } from "@/server/api";
import { getProjectDetail } from "@/server/projects";
import { getProjectTasks } from "@/server/tasks";

export const GET = apiRoute<{ id: string }>(async (actor, req, { id }) => {
  const archived = new URL(req.url).searchParams.get("archives") === "1";
  const [project, tasks] = await Promise.all([getProjectDetail(actor, id), getProjectTasks(actor, id, { archived })]);
  return { project, tasks };
});
