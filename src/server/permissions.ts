import "server-only";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { projectMembers, projects, tasks } from "@/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import { effectiveProjectRole, type ProjectRole } from "@/lib/permissions";
import type { Actor } from "./actor";

export { effectiveProjectRole };

export type ProjectAccess = {
  project: typeof projects.$inferSelect;
  memberRole: ProjectRole | null;
  role: ProjectRole | null;
  canRead: boolean;
  /** Créer / modifier / déplacer des tâches, commenter, gérer les sections. */
  canEdit: boolean;
  /** Paramètres du projet, membres, archivage. */
  canManage: boolean;
};

export function computeAccess(actor: Actor, project: typeof projects.$inferSelect, memberRole: ProjectRole | null): ProjectAccess {
  const role = effectiveProjectRole({
    visibility: project.visibility,
    memberRole,
    orgRole: actor.orgRole,
    isExternal: actor.isExternal,
  });
  const archived = project.archivedAt !== null;
  return {
    project,
    memberRole,
    role,
    canRead: role !== null,
    canEdit: !archived && (role === "owner" || role === "editor"),
    canManage: role === "owner" || actor.orgRole === "admin",
  };
}

/**
 * Accès d'un acteur à un projet. Lève « introuvable » si le projet n'existe pas, est
 * supprimé, appartient à une autre organisation — et aussi si l'acteur ne peut pas le
 * voir, sauf `allowManageOnly` (admin d'organisation gérant les adhésions d'un projet privé).
 */
export async function getProjectAccess(
  actor: Actor,
  projectId: string,
  opts: { allowManageOnly?: boolean; dbx?: DbOrTx } = {},
): Promise<ProjectAccess> {
  const dbx = opts.dbx ?? db;
  if (!isUuid(projectId)) throw notFound("Projet");
  const rows = await dbx
    .select({ project: projects, memberRole: projectMembers.role })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, actor.organizationId), isNull(projects.deletedAt)));
  const row = rows[0];
  if (!row) throw notFound("Projet");
  const access = computeAccess(actor, row.project, row.memberRole);
  if (!access.canRead && !(opts.allowManageOnly && access.canManage)) throw notFound("Projet");
  return access;
}

export async function requireProjectEdit(actor: Actor, projectId: string, dbx?: DbOrTx) {
  const access = await getProjectAccess(actor, projectId, { dbx });
  if (!access.canEdit) {
    if (access.project.archivedAt) throw forbidden("Ce projet est archivé : restaurez-le pour le modifier.");
    throw forbidden("Vous avez un accès en lecture seule à ce projet.");
  }
  return access;
}

/** Accès via une tâche (projet principal). Même réponse si la tâche n'existe pas ou est invisible. */
export async function getTaskAccess(actor: Actor, taskId: string, dbx: DbOrTx = db) {
  if (!isUuid(taskId)) throw notFound("Tâche");
  const [task] = await dbx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId), isNull(tasks.deletedAt)));
  if (!task) throw notFound("Tâche");
  try {
    const access = await getProjectAccess(actor, task.primaryProjectId, { dbx });
    return { task, access };
  } catch {
    throw notFound("Tâche");
  }
}

export async function requireTaskEdit(actor: Actor, taskId: string, dbx: DbOrTx = db) {
  const r = await getTaskAccess(actor, taskId, dbx);
  if (!r.access.canEdit) {
    if (r.access.project.archivedAt) throw forbidden("Ce projet est archivé : restaurez-le pour le modifier.");
    throw forbidden("Vous avez un accès en lecture seule à ce projet.");
  }
  return r;
}

/**
 * Sous-requête SQL des projets lisibles par un utilisateur (recherche, Mes tâches,
 * boîte de réception…). Paramétrée par les données de la base, jamais par le client.
 */
export function readableProjectIdsSql(actor: Pick<Actor, "id" | "organizationId" | "isExternal">): SQL {
  return sql`(select p.id from ${projects} p where p.organization_id = ${actor.organizationId} and p.deleted_at is null and (
    exists (select 1 from ${projectMembers} pm where pm.project_id = p.id and pm.user_id = ${actor.id})
    or (p.visibility = 'organization' and ${actor.isExternal} = false)
  ))`;
}

/**
 * Vérifie si un utilisateur (pas forcément l'acteur) peut lire un projet :
 * compte actif ou invité, même organisation, membre ou projet visible par l'organisation (interne).
 * Sert aux notifications et aux mentions.
 */
export async function userCanReadProject(userId: string, projectId: string, dbx: DbOrTx = db): Promise<boolean> {
  const res = await dbx.execute<{ ok: boolean }>(sql`
    select exists (
      select 1 from projects p join users u on u.id = ${userId}
      where p.id = ${projectId} and p.deleted_at is null and p.organization_id = u.organization_id
        and u.status in ('active', 'invited')
        and (exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = u.id)
             or (p.visibility = 'organization' and u.is_external = false))
    ) as ok`);
  return Boolean(res.rows[0]?.ok);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}
