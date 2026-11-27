import { apiRoute } from "@/server/api";
import { unreadCount } from "@/server/notifications";

export const GET = apiRoute(async (actor) => ({ count: await unreadCount(actor) }));
