import { apiRoute } from "@/server/api";
import { listInbox } from "@/server/notifications";

export const GET = apiRoute(async (actor, req) => {
  const sp = new URL(req.url).searchParams;
  return listInbox(actor, { unreadOnly: sp.get("nonlues") === "1", before: sp.get("avant") ?? undefined });
});
