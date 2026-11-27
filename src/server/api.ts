import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import type { Actor } from "./actor";
import { requireActorApi } from "./auth/session";

const STATUS: Record<string, number> = { not_found: 404, forbidden: 403, unauthenticated: 401, validation: 400, conflict: 409, rate_limited: 429 };

/** Route Handler JSON authentifié. Inaccessible et inexistant donnent la même réponse 404. */
export function apiRoute<P>(handler: (actor: Actor, req: Request, params: P) => Promise<unknown>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const actor = await requireActorApi();
      const data = await handler(actor, req, await ctx.params);
      return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code }, { status: STATUS[e.code] ?? 500 });
      console.error("[api] erreur inattendue", e);
      return NextResponse.json({ error: "Une erreur inattendue s'est produite.", code: "internal" }, { status: 500 });
    }
  };
}
