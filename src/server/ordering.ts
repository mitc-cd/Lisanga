import "server-only";
import { and, asc, desc, eq, gt, ne, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import type { DbOrTx } from "@/db";
import { sections, taskProjects } from "@/db/schema";

/** Sérialise les réordonnancements d'une même section (verrou transactionnel). */
export async function lockSection(tx: DbOrTx, sectionId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"section:" + sectionId}))`);
}

/**
 * Clé de tri pour placer une tâche dans une section, calculée à partir de l'état réel
 * en base (pas de la vue du client) :
 * - afterTaskId === undefined → en fin de section ;
 * - afterTaskId === null → en tête ;
 * - sinon → juste après cette tâche (si elle n'est plus dans la section : en fin).
 */
export async function taskSortKey(
  tx: DbOrTx,
  projectId: string,
  sectionId: string,
  afterTaskId: string | null | undefined,
  excludeTaskId?: string,
): Promise<string> {
  const inSection = and(
    eq(taskProjects.projectId, projectId),
    eq(taskProjects.sectionId, sectionId),
    excludeTaskId ? ne(taskProjects.taskId, excludeTaskId) : undefined,
  );
  const first = async (order: "asc" | "desc", extra?: ReturnType<typeof gt>) => {
    const [r] = await tx
      .select({ k: taskProjects.sortKey })
      .from(taskProjects)
      .where(and(inSection, extra))
      .orderBy(order === "asc" ? asc(taskProjects.sortKey) : desc(taskProjects.sortKey))
      .limit(1);
    return r?.k ?? null;
  };
  if (afterTaskId === null) return generateKeyBetween(null, await first("asc"));
  if (afterTaskId !== undefined) {
    const [after] = await tx
      .select({ k: taskProjects.sortKey })
      .from(taskProjects)
      .where(and(inSection, eq(taskProjects.taskId, afterTaskId)));
    if (after) {
      const next = await first("asc", gt(taskProjects.sortKey, after.k));
      return generateKeyBetween(after.k, next);
    }
  }
  return generateKeyBetween(await first("desc"), null);
}

export async function sectionSortKey(tx: DbOrTx, projectId: string, afterSectionId: string | null | undefined, excludeId?: string) {
  const base = and(eq(sections.projectId, projectId), sql`${sections.archivedAt} is null`, excludeId ? ne(sections.id, excludeId) : undefined);
  const all = await tx.select({ id: sections.id, k: sections.sortKey }).from(sections).where(base).orderBy(asc(sections.sortKey));
  if (afterSectionId === null) return generateKeyBetween(null, all[0]?.k ?? null);
  const idx = afterSectionId ? all.findIndex((s) => s.id === afterSectionId) : -1;
  if (idx === -1) return generateKeyBetween(all.at(-1)?.k ?? null, null);
  const a = all[idx]!.k;
  const b = all.slice(idx + 1).find((s) => s.k > a)?.k ?? null;
  return generateKeyBetween(a, b);
}
