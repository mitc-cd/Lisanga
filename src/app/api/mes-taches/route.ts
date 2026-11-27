import { apiRoute } from "@/server/api";
import { listMyTasks } from "@/server/tasks";

export const GET = apiRoute(async (actor, req) => listMyTasks(actor, { includeDone: new URL(req.url).searchParams.get("terminees") === "1" }));
