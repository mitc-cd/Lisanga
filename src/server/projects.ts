import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { outer } from "@/db/sql";
import { db } from "@/db";
import { projectMembers, projects, sections, taskEvents, taskProjects, tasks, teams, users } from "@/db/schema";
import { writeAudit } from "./audit";
import { computeAccess, getProjectAccess, readableProjectIdsSql } from "./permissions";
import { lockSection, sectionSortKey } from "./ordering";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { maxProjectRole, type ProjectRole } from "@/lib/permissions";
import type { Actor } from "./actor";
import type { ProjectInput, ProjectUpdateInput } from "@/lib/validation/projects";

export const DEFAULT_SECTIONS = ["À faire", "En cours", "Terminé"];

export type ProjectSummary = {
  id: string;
  name: string;
  color: string;
  visibility: "organization" | "private";
  archived: boolean;
  role: ProjectRole | null;
  isMember: boolean;
  openTasks: number;
  teamName: string | null;
};

/** Projets lisibles par l'acteur, avec compteurs (une seule requête). */
export async function listProjects(actor: Actor, opts: { archived?: boolean } = {}): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      project: projects,
      memberRole: projectMembers.role,
      teamName: teams.name,
      openTasks: sql<number>`(select count(*)::int from ${tasks} t where t.primary_project_id = ${outer("projects", "id")}
        and t.parent_task_id is null and t.archived_at is null and t.deleted_at is null and t.status <> 'done')`,
    })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
    .leftJoin(teams, eq(teams.id, projects.teamId))
    .where(
      and(
        sql`${projects.id} in ${readableProjectIdsSql(actor)}`,
        opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(sql`lower(${projects.name})`));
  return rows.map((r) => {
    const access = computeAccess(actor, r.project, r.memberRole);
    return {
      id: r.project.id,
      name: r.project.name,
      color: r.project.color,
      visibility: r.project.visibility,
      archived: r.project.archivedAt !== null,
      role: access.role,
      isMember: r.memberRole !== null,
      openTasks: r.openTasks,
      teamName: r.teamName,
    };
  });
}

export type SectionView = { id: string; name: string; sortKey: string; version: number };
export type MemberView = { userId: string; name: string; email: string; role: ProjectRole; status: string };

export type ProjectDetail = {
  id: string;
  name: string;
  description: string;
  color: string;
  visibility: "organization" | "private";
  teamId: string | null;
  archived: boolean;
  version: number;
  role: ProjectRole | null;
  isMember: boolean;
  canEdit: boolean;
  canManage: boolean;
  sections: SectionView[];
  members: MemberView[];
};

export async function getProjectDetail(actor: Actor, projectId: string): Promise<ProjectDetail> {
  const access = await getProjectAccess(actor, projectId);
  const [secs, members] = await Promise.all([
    db
      .select({ id: sections.id, name: sections.name, sortKey: sections.sortKey, version: sections.version })
      .from(sections)
      .where(and(eq(sections.projectId, projectId), isNull(sections.archivedAt)))
      .orderBy(asc(sections.sortKey)),
    listProjectMembersRaw(projectId),
  ]);
  const p = access.project;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    visibility: p.visibility,
    teamId: p.teamId,
    archived: p.archivedAt !== null,
    version: p.version,
    role: access.role,
    isMember: access.memberRole !== null,
    canEdit: access.canEdit,
    canManage: access.canManage,
    sections: secs,
    members,
  };
}

async function listProjectMembersRaw(projectId: string): Promise<MemberView[]> {
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: projectMembers.role, status: users.status })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(sql`lower(${users.name})`));
}

/** Membres d'un projet (pour un admin gérant un projet privé sans en lire le contenu). */
export async function getProjectMembersForManagement(actor: Actor, projectId: string) {
  const access = await getProjectAccess(actor, projectId, { allowManageOnly: true });
  if (!access.canManage) throw forbidden();
  return { project: { id: access.project.id, name: access.project.name, visibility: access.project.visibility }, members: await listProjectMembersRaw(projectId) };
}

export async function createProject(actor: Actor, input: ProjectInput): Promise<{ id: string }> {
  if (actor.orgRole === "viewer") throw forbidden("Les lecteurs ne peuvent pas créer de projet.");
  if (actor.isExternal) throw forbidden("Les invités externes ne peuvent pas créer de projet.");
  if (input.teamId) {
    const [t] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, input.teamId), eq(teams.organizationId, actor.organizationId)));
    if (!t) throw invalid("Équipe introuvable.");
  }
  return db.transaction(async (tx) => {
    const [p] = await tx
      .insert(projects)
      .values({
        organizationId: actor.organizationId,
        name: input.name,
        description: input.description ?? "",
        visibility: input.visibility,
        teamId: input.teamId ?? null,
        color: input.color ?? "#0B3D91",
        createdBy: actor.id,
      })
      .returning({ id: projects.id });
    await tx.insert(projectMembers).values({ projectId: p.id, userId: actor.id, role: "owner", addedBy: actor.id });
    let key: string | null = null;
    for (const name of DEFAULT_SECTIONS) {
      key = generateKeyBetween(key, null);
      await tx.insert(sections).values({ projectId: p.id, name, sortKey: key });
    }
    return p;
  });
}

export async function updateProject(actor: Actor, projectId: string, version: number, input: ProjectUpdateInput) {
  const access = await getProjectAccess(actor, projectId, { allowManageOnly: true });
  if (!access.canManage) throw forbidden("Seuls les responsables du projet peuvent modifier ses paramètres.");
  // Un admin non membre d'un projet privé ne gère que les adhésions, pas le contenu.
  if (!access.canRead) throw forbidden();
  const p = access.project;
  await db.transaction(async (tx) => {
    const res = await tx
      .update(projects)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.visibility !== undefined && { visibility: input.visibility }),
        ...(input.color !== undefined && { color: input.color }),
        ...(input.teamId !== undefined && { teamId: input.teamId }),
        updatedAt: new Date(),
        version: sql`${projects.version} + 1`,
      })
      .where(and(eq(projects.id, projectId), eq(projects.version, version)))
      .returning({ id: projects.id });
    if (!res.length) throw conflict("Le projet a été modifié entre-temps. Rechargez la page.");
    if (input.visibility !== undefined && input.visibility !== p.visibility)
      await writeAudit(tx, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "project.visibility.changed",
        targetType: "project",
        targetId: projectId,
        details: { from: p.visibility, to: input.visibility },
      });
  });
}

export async function setProjectArchived(actor: Actor, projectId: string, archived: boolean) {
  const access = await getProjectAccess(actor, projectId, { allowManageOnly: true });
  if (!access.canManage) throw forbidden("Seuls les responsables du projet peuvent l'archiver.");
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), version: sql`${projects.version} + 1` })
      .where(eq(projects.id, projectId));
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: archived ? "project.archived" : "project.restored",
      targetType: "project",
      targetId: projectId,
    });
  });
}

/** Rejoindre un projet visible par l'organisation (contributeur, ou lecteur pour un lecteur d'org.). */
export async function joinProject(actor: Actor, projectId: string) {
  const access = await getProjectAccess(actor, projectId);
  if (access.memberRole) return;
  if (access.project.visibility !== "organization" || actor.isExternal) throw notFound("Projet");
  const role: ProjectRole = actor.orgRole === "viewer" ? "viewer" : "editor";
  await db.insert(projectMembers).values({ projectId, userId: actor.id, role, addedBy: actor.id }).onConflictDoNothing();
}

async function assertNotLastOwner(projectId: string, userId: string, tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const owners = await tx
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, "owner")));
  if (owners.length === 1 && owners[0]!.userId === userId)
    throw invalid("Un projet doit garder au moins un responsable. Nommez d'abord un autre responsable.");
}

export async function addProjectMember(actor: Actor, projectId: string, userId: string, role: ProjectRole) {
  const access = await getProjectAccess(actor, projectId, { allowManageOnly: true });
  if (!access.canManage) throw forbidden("Seuls les responsables du projet peuvent gérer ses membres.");
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, actor.organizationId)));
  if (!u || u.status === "deactivated") throw invalid("Personne introuvable ou compte désactivé.");
  if (role !== "viewer" && maxProjectRole(u.orgRole) === "viewer")
    throw invalid("Cette personne est « lecteur » dans l'organisation : elle ne peut être que lectrice du projet.");
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    if (existing) {
      if (existing.role === role) return;
      if (existing.role === "owner") await assertNotLastOwner(projectId, userId, tx);
      await tx
        .update(projectMembers)
        .set({ role })
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
      if (role === "viewer") await unassignInProject(tx, actor, projectId, userId);
    } else {
      await tx.insert(projectMembers).values({ projectId, userId, role, addedBy: actor.id });
    }
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: existing ? "project.member.role_changed" : "project.member.added",
      targetType: "project",
      targetId: projectId,
      details: { userId, from: existing?.role ?? null, to: role },
    });
  });
}

export async function removeProjectMember(actor: Actor, projectId: string, userId: string) {
  const access = await getProjectAccess(actor, projectId, { allowManageOnly: true });
  const self = userId === actor.id;
  if (!access.canManage && !self) throw forbidden("Seuls les responsables du projet peuvent gérer ses membres.");
  await db.transaction(async (tx) => {
    await assertNotLastOwner(projectId, userId, tx);
    const del = await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning({ userId: projectMembers.userId });
    if (!del.length) return;
    await unassignInProject(tx, actor, projectId, userId);
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "project.member.removed",
      targetType: "project",
      targetId: projectId,
      details: { userId },
    });
  });
}

/** « Assigner implique d'être membre (contributeur ou responsable) » : on désassigne et on journalise. */
async function unassignInProject(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], actor: Actor, projectId: string, userId: string) {
  const affected = await tx
    .update(tasks)
    .set({ assigneeId: null, updatedAt: new Date(), version: sql`${tasks.version} + 1` })
    .where(and(eq(tasks.primaryProjectId, projectId), eq(tasks.assigneeId, userId)))
    .returning({ id: tasks.id });
  if (affected.length)
    await tx.insert(taskEvents).values(
      affected.map((t) => ({
        organizationId: actor.organizationId,
        taskId: t.id,
        projectId,
        actorId: actor.id,
        type: "task.updated",
        changes: { assigneeId: { from: userId, to: null } },
        meta: { reason: "member_removed" },
      })),
    );
}

// --- Sections -------------------------------------------------------------

export async function createSection(actor: Actor, projectId: string, name: string, afterSectionId?: string | null) {
  const access = await getProjectAccess(actor, projectId);
  if (!access.canEdit) throw forbidden("Vous avez un accès en lecture seule à ce projet.");
  return db.transaction(async (tx) => {
    await lockSection(tx, projectId);
    const sortKey = await sectionSortKey(tx, projectId, afterSectionId);
    const [s] = await tx.insert(sections).values({ projectId, name, sortKey }).returning();
    return { id: s.id, name: s.name, sortKey: s.sortKey, version: s.version };
  });
}

async function sectionInProject(sectionId: string, projectId: string) {
  const [s] = await db
    .select()
    .from(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.projectId, projectId), isNull(sections.archivedAt)));
  if (!s) throw notFound("Section");
  return s;
}

export async function renameSection(actor: Actor, projectId: string, sectionId: string, name: string) {
  const access = await getProjectAccess(actor, projectId);
  if (!access.canEdit) throw forbidden("Vous avez un accès en lecture seule à ce projet.");
  await sectionInProject(sectionId, projectId);
  await db
    .update(sections)
    .set({ name, updatedAt: new Date(), version: sql`${sections.version} + 1` })
    .where(eq(sections.id, sectionId));
}

export async function moveSection(actor: Actor, projectId: string, sectionId: string, afterSectionId: string | null) {
  const access = await getProjectAccess(actor, projectId);
  if (!access.canEdit) throw forbidden("Vous avez un accès en lecture seule à ce projet.");
  await sectionInProject(sectionId, projectId);
  await db.transaction(async (tx) => {
    await lockSection(tx, projectId);
    const sortKey = await sectionSortKey(tx, projectId, afterSectionId, sectionId);
    await tx.update(sections).set({ sortKey, updatedAt: new Date(), version: sql`${sections.version} + 1` }).where(eq(sections.id, sectionId));
  });
}

/** Supprime une section ; ses tâches rejoignent la première section restante. */
export async function deleteSection(actor: Actor, projectId: string, sectionId: string) {
  const access = await getProjectAccess(actor, projectId);
  if (!access.canEdit) throw forbidden("Vous avez un accès en lecture seule à ce projet.");
  await sectionInProject(sectionId, projectId);
  await db.transaction(async (tx) => {
    const remaining = await tx
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.projectId, projectId), isNull(sections.archivedAt), sql`${sections.id} <> ${sectionId}`))
      .orderBy(asc(sections.sortKey));
    if (!remaining.length) throw invalid("Un projet doit garder au moins une section.");
    const target = remaining[0]!.id;
    await lockSection(tx, target);
    const moving = await tx
      .select({ taskId: taskProjects.taskId })
      .from(taskProjects)
      .where(and(eq(taskProjects.projectId, projectId), eq(taskProjects.sectionId, sectionId)))
      .orderBy(asc(taskProjects.sortKey));
    if (moving.length) {
      const [last] = await tx
        .select({ k: sql<string>`max(${taskProjects.sortKey})` })
        .from(taskProjects)
        .where(and(eq(taskProjects.projectId, projectId), eq(taskProjects.sectionId, target)));
      let key: string | null = last?.k ?? null;
      for (const m of moving) {
        key = generateKeyBetween(key, null);
        await tx
          .update(taskProjects)
          .set({ sectionId: target, sortKey: key })
          .where(and(eq(taskProjects.taskId, m.taskId), eq(taskProjects.projectId, projectId)));
      }
    }
    await tx.update(sections).set({ archivedAt: new Date() }).where(eq(sections.id, sectionId));
  });
}

/** Utilisateurs assignables dans un projet : membres contributeurs ou responsables, comptes non désactivés. */
export async function assignableUserIds(projectId: string, userIds?: string[]) {
  const rows = await db
    .select({ id: users.id })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        inArray(projectMembers.role, ["owner", "editor"]),
        inArray(users.status, ["active", "invited"]),
        userIds ? inArray(users.id, userIds) : undefined,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** Administration : tous les projets (y compris privés), sans leur contenu. */
export async function listAllProjectsForAdmin(actor: Actor) {
  if (actor.orgRole !== "admin") throw forbidden("Action réservée aux administrateurs.");
  return db
    .select({
      id: projects.id,
      name: projects.name,
      visibility: projects.visibility,
      archivedAt: projects.archivedAt,
      color: projects.color,
      members: sql<number>`(select count(*)::int from ${projectMembers} pm where pm.project_id = ${outer("projects", "id")})`,
      owners: sql<string[]>`coalesce((select array_agg(u.name order by u.name) from ${projectMembers} pm join ${users} u on u.id = pm.user_id where pm.project_id = ${outer("projects", "id")} and pm.role = 'owner'), '{}')`,
    })
    .from(projects)
    .where(and(eq(projects.organizationId, actor.organizationId), isNull(projects.deletedAt)))
    .orderBy(asc(sql`${projects.archivedAt} is not null`), asc(sql`lower(${projects.name})`));
}
