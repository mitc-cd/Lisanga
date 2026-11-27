import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { purgeExpiredAuthData } from "./auth/email-login";

type Handler = (payload: Record<string, unknown>) => Promise<void>;

/** Registre des travaux différés. Chaque gestionnaire doit être idempotent. */
const HANDLERS: Record<string, Handler> = {
  "auth.purge": async () => purgeExpiredAuthData(),
};

/** Planifie un travail ; la clé d'idempotence empêche les doublons (reprises, double clic…). */
export async function enqueueJob(type: string, idempotencyKey: string, payload: Record<string, unknown> = {}, runAt = new Date()) {
  await db.insert(jobs).values({ type, idempotencyKey, payload, runAt }).onConflictDoNothing({ target: jobs.idempotencyKey });
}

/**
 * Exécute les travaux dus. Verrouillage `FOR UPDATE SKIP LOCKED` : deux exécutions
 * simultanées du cron ne traitent jamais le même travail. Échec → nouvelle tentative
 * avec délai croissant, jusqu'à max_attempts.
 */
export async function runDueJobs(limit = 20): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const claimed = await db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        select id from ${jobs}
        where (status = 'pending' or (status = 'running' and locked_at < now() - interval '10 minutes'))
          and run_at <= now()
        order by run_at limit 1 for update skip locked`);
      const id = rows.rows[0]?.id;
      if (!id) return null;
      const [job] = await tx
        .update(jobs)
        .set({ status: "running", lockedAt: new Date(), attempts: sql`${jobs.attempts} + 1` })
        .where(eq(jobs.id, id))
        .returning();
      return job;
    });
    if (!claimed) break;
    try {
      const handler = HANDLERS[claimed.type];
      if (!handler) throw new Error(`Type de travail inconnu : ${claimed.type}`);
      await handler(claimed.payload);
      await db.update(jobs).set({ status: "done", finishedAt: new Date(), lastError: null }).where(eq(jobs.id, claimed.id));
      done++;
    } catch (e) {
      failed++;
      const final = claimed.attempts >= claimed.maxAttempts;
      await db
        .update(jobs)
        .set({
          status: final ? "failed" : "pending",
          lastError: e instanceof Error ? e.message.slice(0, 500) : "Erreur",
          runAt: new Date(Date.now() + 2 ** claimed.attempts * 60_000),
          lockedAt: null,
        })
        .where(and(eq(jobs.id, claimed.id), lte(jobs.attempts, claimed.attempts)));
    }
  }
  return { done, failed };
}
