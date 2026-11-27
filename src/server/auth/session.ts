import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { Actor } from "../actor";
import { getAuth } from "./auth";

/** Utilisateur courant (une lecture par requête). Null si non connecté ou compte inactif. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [u] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!u || u.status !== "active") return null;
  return {
    id: u.id,
    organizationId: u.organizationId,
    orgRole: u.orgRole,
    isExternal: u.isExternal,
    name: u.name,
    email: u.email,
  };
});

/** Pour les pages et Server Actions : redirige vers la connexion si besoin. */
export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect("/connexion");
  return a;
}

/** Pour les Route Handlers : lève une erreur 401. */
export async function requireActorApi(): Promise<Actor> {
  const a = await getActor();
  if (!a) throw new AppError("unauthenticated", "Session expirée : reconnectez-vous.");
  return a;
}
