/** Travaux différés : idempotence, exécution, reprise après échec. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, lt } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { jobs, loginChallenges, rateLimitEvents } from "@/db/schema";
import { enqueueJob, runDueJobs } from "@/server/jobs";
import { createOrg, resetDb } from "./helpers";

beforeAll(async () => {
  await resetDb();
  await createOrg();
});
afterAll(closeDb);

describe("travaux différés", () => {
  it("même clé d'idempotence : un seul travail", async () => {
    await enqueueJob("auth.purge", "auth.purge:test");
    await enqueueJob("auth.purge", "auth.purge:test");
    expect(await db.select().from(jobs).where(eq(jobs.idempotencyKey, "auth.purge:test"))).toHaveLength(1);
  });
  it("la purge supprime les compteurs et défis expirés, et le travail est marqué terminé", async () => {
    await db.insert(rateLimitEvents).values({ key: "vieux", createdAt: new Date(Date.now() - 60 * 60_000) });
    await db.insert(loginChallenges).values({
      email: "a@b.test",
      codeHash: "x",
      linkTokenHash: "y",
      expiresAt: new Date(Date.now() - 48 * 3600_000),
    });
    const r = await runDueJobs();
    expect(r).toEqual({ done: 1, failed: 0 });
    expect(await db.select().from(rateLimitEvents).where(lt(rateLimitEvents.createdAt, new Date(Date.now() - 30 * 60_000)))).toHaveLength(0);
    expect(await db.select().from(loginChallenges)).toHaveLength(0);
    const [j] = await db.select().from(jobs).where(eq(jobs.idempotencyKey, "auth.purge:test"));
    expect(j!.status).toBe("done");
    expect(await runDueJobs()).toEqual({ done: 0, failed: 0 });
  });
  it("type inconnu : échec enregistré et nouvelle tentative différée", async () => {
    await enqueueJob("inconnu", "inconnu:1");
    expect(await runDueJobs()).toEqual({ done: 0, failed: 1 });
    const [j] = await db.select().from(jobs).where(eq(jobs.idempotencyKey, "inconnu:1"));
    expect(j).toMatchObject({ status: "pending", attempts: 1 });
    expect(j!.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(j!.lastError).toMatch(/inconnu/);
  });
});
