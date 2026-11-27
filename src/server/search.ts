import "server-only";
import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { readableProjectIdsSql } from "./permissions";
import type { Actor } from "./actor";

export type SearchResults = {
  projects: { id: string; name: string; color: string; archived: boolean }[];
  tasks: { id: string; title: string; projectName: string; projectColor: string; status: string; archived: boolean }[];
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/** Recherche globale, strictement limitée aux projets lisibles par l'acteur. */
export async function search(actor: Actor, raw: string): Promise<SearchResults> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return { projects: [], tasks: [] };
  const pattern = `%${escapeLike(q)}%`;
  const readable = sql`in ${readableProjectIdsSql(actor)}`;
  const [p, t] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, color: projects.color, archivedAt: projects.archivedAt })
      .from(projects)
      .where(and(sql`${projects.id} ${readable}`, ilike(projects.name, pattern)))
      .orderBy(asc(sql`${projects.archivedAt} is not null`), asc(sql`lower(${projects.name})`))
      .limit(8),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        archivedAt: tasks.archivedAt,
        projectName: projects.name,
        projectColor: projects.color,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.primaryProjectId))
      .where(and(sql`${tasks.primaryProjectId} ${readable}`, isNull(tasks.deletedAt), ilike(tasks.title, pattern)))
      .orderBy(asc(sql`${tasks.archivedAt} is not null`), asc(sql`${tasks.status} = 'done'`), asc(sql`length(${tasks.title})`))
      .limit(20),
  ]);
  return {
    projects: p.map((r) => ({ id: r.id, name: r.name, color: r.color, archived: r.archivedAt !== null })),
    tasks: t.map((r) => ({ id: r.id, title: r.title, projectName: r.projectName, projectColor: r.projectColor, status: r.status, archived: r.archivedAt !== null })),
  };
}
