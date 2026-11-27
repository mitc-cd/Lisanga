import { apiRoute } from "@/server/api";
import { getTaskDetail } from "@/server/tasks";

export const GET = apiRoute<{ id: string }>(async (actor, _req, { id }) => getTaskDetail(actor, id));
