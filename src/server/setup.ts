import "server-only";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { orgSettings, organizations, setupTokens, users } from "@/db/schema";
import { hashToken, randomToken } from "./crypto";
import { writeAudit } from "./audit";
import { AppError } from "@/lib/errors";
import type { SetupInput } from "@/lib/validation/setup";

/** L'installation est terminée dès qu'un administrateur existe (actif ou invité). */
export async function hasAdmin(): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgRole, "admin"), inArray(users.status, ["active", "invited"])))
    .limit(1);
  return Boolean(row);
}

/** Génère un jeton d'installation (affiché une seule fois, stocké haché, valable 24 h). */
export async function createSetupToken(): Promise<string> {
  if (await hasAdmin()) throw new Error("Un administrateur existe déjà : l'assistant d'installation est désactivé.");
  const token = randomToken(24);
  await db.insert(setupTokens).values({
    tokenHash: hashToken(`setup:${token}`),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  return token;
}

function matchesEnvToken(token: string): boolean {
  const env = process.env.SETUP_TOKEN;
  if (!env || env.length < 16) return false;
  const a = Buffer.from(env);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isValidSetupToken(token: string): Promise<boolean> {
  if (!token) return false;
  if (matchesEnvToken(token)) return true;
  const [row] = await db
    .select({ id: setupTokens.id })
    .from(setupTokens)
    .where(
      and(
        eq(setupTokens.tokenHash, hashToken(`setup:${token}`)),
        isNull(setupTokens.usedAt),
        gt(setupTokens.expiresAt, new Date()),
      ),
    );
  return Boolean(row);
}

/**
 * Crée l'organisation, ses paramètres et le premier administrateur.
 * Verrou consultatif : deux soumissions simultanées ne peuvent pas créer deux administrateurs.
 */
export async function completeSetup(input: SetupInput): Promise<string> {
  const invalid = new AppError("forbidden", "Jeton d'installation invalide, expiré ou déjà utilisé.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242001)`);
    const [admin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgRole, "admin"), inArray(users.status, ["active", "invited"])))
      .limit(1);
    if (admin) throw new AppError("forbidden", "L'installation est déjà terminée.");
    const viaEnv = matchesEnvToken(input.token);
    if (!viaEnv) {
      const used = await tx
        .update(setupTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(setupTokens.tokenHash, hashToken(`setup:${input.token}`)),
            isNull(setupTokens.usedAt),
            gt(setupTokens.expiresAt, new Date()),
          ),
        )
        .returning({ id: setupTokens.id });
      if (!used.length) throw invalid;
    }
    let [org] = await tx.select().from(organizations).limit(1);
    if (!org) {
      [org] = await tx.insert(organizations).values({ name: input.organizationName }).returning();
      await tx.insert(orgSettings).values({ organizationId: org.id });
    }
    const email = input.email.trim().toLowerCase();
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    let userId: string;
    if (existing) {
      await tx
        .update(users)
        .set({ orgRole: "admin", status: "active", emailVerified: true, name: input.name, deactivatedAt: null })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const [u] = await tx
        .insert(users)
        .values({
          organizationId: org.id,
          email,
          name: input.name,
          emailVerified: true,
          orgRole: "admin",
          status: "active",
          lastLoginAt: new Date(),
        })
        .returning({ id: users.id });
      userId = u.id;
    }
    await writeAudit(tx, {
      organizationId: org.id,
      actorId: userId,
      action: "setup.completed",
      targetType: "user",
      targetId: userId,
      details: { tokenSource: viaEnv ? "env" : "command" },
    });
    return userId;
  });
}
