import { apiRoute } from "@/server/api";
import { search } from "@/server/search";

export const GET = apiRoute(async (actor, req) => search(actor, new URL(req.url).searchParams.get("q") ?? ""));
