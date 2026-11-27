import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { outer } from "@/db/sql";
import { db, type DbOrTx } from "@/db";
import { auditLogs, invitations, projectMembers, sessions, taskEvents, tasks, teamMembers, teams, users } from "@/db/schema";
import { writeAudit } from "./audit";
import { appUrl } from "./env";
import { getSettingsRow } from "./settings";
import { brandFor, sendAppMail } from "./mail/send";
import { invitationEmail } from "./mail/templates";
import { AppError, forbidden, invalid, notFound } from "@/lib/errors";
import type { OrgRole } from "@/lib/permissions";
import type { InviteInput } from "@/lib/validation/projects";
import type { Actor } from "./actor";

const INVITATION_DAYS = 14;

function assertAdmin(actor: Actor) {
  if (actor.orgRole !== "admin") throw forbidden("Action réservée aux administrateurs.");
}

export type OrgUserView = {
  id: string;
  name: string;
  email: string;
  orgRole: OrgRole;
  status: "invited" | "active" | "deactivated";
  isExternal: boolean;
  lastLoginAt: string | null;
  invitationExpired: boolean;
  teams: string[];
};

export async function listOrgUsers(actor: Actor): Promise<OrgUserView[]> {
  assertAdmin(actor);
  const rows = await db
    .select({
      u: users,
      invExpires: sql<Date | null>`(select max(i.expires_at) from ${invitations} i where i.user_id = ${outer("users", "id")} and i.revoked_at is null)`,
      teams: sql<string[]>`coalesce((select array_agg(t.name order by t.name) from ${teamMembers} tm join ${teams} t on t.id = tm.team_id where tm.user_id = ${outer("users", "id")}), '{}')`,
    })
    .from(users)
    .where(eq(users.organizationId, actor.organizationId))
    .orderBy(asc(sql`${users.status} = 'deactivated'`), asc(sql`lower(${users.name})`));
  return rows.map(({ u, invExpires, teams: t }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    orgRole: u.orgRole,
    status: u.status,
    isExternal: u.isExternal,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    invitationExpired: u.status === "invited" && (!invExpires || new Date(invExpires) < new Date()),
    teams: t ?? [],
  }));
}

/** Annuaire minimal (pour ajouter des membres à un projet) : comptes non désactivés. */
export async function listDirectory(actor: Actor) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, orgRole: users.orgRole, status: users.status })
    .from(users)
    .where(and(eq(users.organizationId, actor.organizationId), ne(users.status, "deactivated")))
    .orderBy(asc(sql`lower(${users.name})`));
}

/**
 * Invite une personne : crée (ou réutilise) le compte au statut « invité » et envoie
 * l'e-mail d'invitation. L'e-mail est envoyé après validation de la transaction.
 */
export async function inviteUser(actor: Actor, input: InviteInput): Promise<{ userId: string; emailSent: boolean; emailError?: string }> {
  assertAdmin(actor);
  const email = input.email;
  const userId = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.email, email));
    let id: string;
    if (existing) {
      if (existing.organizationId !== actor.organizationId) throw invalid("Cette adresse ne peut pas être invitée.");
      if (existing.status === "active") throw invalid("Cette personne a déjà un compte actif.");
      if (existing.status === "deactivated") throw invalid("Ce compte est désactivé : réactivez-le depuis la liste des membres.");
      id = existing.id;
      await tx
        .update(users)
        .set({ orgRole: input.orgRole, isExternal: input.isExternal, ...(input.name && { name: input.name }) })
        .where(eq(users.id, id));
      await tx.update(invitations).set({ revokedAt: new Date() }).where(and(eq(invitations.userId, id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
    } else {
      const [u] = await tx
        .insert(users)
        .values({
          organizationId: actor.organizationId,
          email,
          name: input.name || email.split("@")[0]!,
          orgRole: input.orgRole,
          isExternal: input.isExternal,
          status: "invited",
        })
        .returning({ id: users.id });
      id = u.id;
    }
    await tx.insert(invitations).values({
      organizationId: actor.organizationId,
      userId: id,
      email,
      orgRole: input.orgRole,
      invitedBy: actor.id,
      expiresAt: new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000),
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: existing ? "user.reinvited" : "user.invited",
      targetType: "user",
      targetId: id,
      details: { email, orgRole: input.orgRole, isExternal: input.isExternal },
    });
    return id;
  });
  try {
    const s = await getSettingsRow(actor.organizationId);
    const loginUrl = `${appUrl()}/connexion?email=${encodeURIComponent(email)}`;
    await sendAppMail(actor.organizationId, { to: email, ...invitationEmail(brandFor(s), { inviterName: actor.name, loginUrl, email }) });
    return { userId, emailSent: true };
  } catch (e) {
    return { userId, emailSent: false, emailError: e instanceof AppError ? e.message : "Erreur d'envoi." };
  }
}

export async function revokeInvitation(actor: Actor, userId: string) {
  assertAdmin(actor);
  const u = await getOrgUser(actor, userId);
  if (u.status !== "invited") throw invalid("Cette personne n'est pas en attente d'invitation.");
  await db.transaction(async (tx) => {
    await tx.update(invitations).set({ revokedAt: new Date() }).where(and(eq(invitations.userId, userId), isNull(invitations.revokedAt)));
    await tx.update(users).set({ status: "deactivated", deactivatedAt: new Date() }).where(eq(users.id, userId));
    await writeAudit(tx, { organizationId: actor.organizationId, actorId: actor.id, action: "user.invitation_revoked", targetType: "user", targetId: userId });
  });
}

async function getOrgUser(actor: Actor, userId: string, dbx: DbOrTx = db) {
  const [u] = await dbx.select().from(users).where(and(eq(users.id, userId), eq(users.organizationId, actor.organizationId)));
  if (!u) throw notFound("Personne");
  return u;
}

async function assertNotLastAdmin(tx: DbOrTx, organizationId: string, userId: string) {
  const admins = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.orgRole, "admin"), eq(users.status, "active")));
  if (admins.length <= 1 && admins.some((a) => a.id === userId))
    throw invalid("Il doit rester au moins un administrateur actif. Nommez d'abord un autre administrateur.");
}

export async function changeOrgRole(actor: Actor, userId: string, role: OrgRole) {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    const u = await getOrgUser(actor, userId, tx);
    if (u.orgRole === role) return;
    if (u.orgRole === "admin") await assertNotLastAdmin(tx, actor.organizationId, userId);
    await tx.update(users).set({ orgRole: role, updatedAt: new Date(), version: sql`${users.version} + 1` }).where(eq(users.id, userId));
    if (role === "viewer") {
      // Un lecteur d'organisation ne peut être que lecteur des projets : rôles plafonnés, tâches désassignées.
      await tx.update(projectMembers).set({ role: "viewer" }).where(eq(projectMembers.userId, userId));
      const affected = await tx
        .update(tasks)
        .set({ assigneeId: null, version: sql`${tasks.version} + 1`, updatedAt: new Date() })
        .where(eq(tasks.assigneeId, userId))
        .returning({ id: tasks.id, projectId: tasks.primaryProjectId });
      if (affected.length)
        await tx.insert(taskEvents).values(
          affected.map((t) => ({
            organizationId: actor.organizationId,
            taskId: t.id,
            projectId: t.projectId,
            actorId: actor.id,
            type: "task.updated",
            changes: { assigneeId: { from: userId, to: null } },
            meta: { reason: "role_viewer" },
          })),
        );
    }
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "user.role_changed",
      targetType: "user",
      targetId: userId,
      details: { from: u.orgRole, to: role },
    });
  });
}

/** Désactivation : sessions supprimées immédiatement, connexion impossible (e-mail et Entra). */
export async function deactivateUser(actor: Actor, userId: string) {
  assertAdmin(actor);
  if (userId === actor.id) throw invalid("Vous ne pouvez pas désactiver votre propre compte.");
  await db.transaction(async (tx) => {
    const u = await getOrgUser(actor, userId, tx);
    if (u.status === "deactivated") return;
    if (u.orgRole === "admin") await assertNotLastAdmin(tx, actor.organizationId, userId);
    await tx
      .update(users)
      .set({ status: "deactivated", deactivatedAt: new Date(), updatedAt: new Date(), version: sql`${users.version} + 1` })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await writeAudit(tx, { organizationId: actor.organizationId, actorId: actor.id, action: "user.deactivated", targetType: "user", targetId: userId });
  });
}

export async function reactivateUser(actor: Actor, userId: string) {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    const u = await getOrgUser(actor, userId, tx);
    if (u.status !== "deactivated") return;
    // Sans connexion préalable, le compte redevient « invité » et doit être réinvité.
    const status = u.lastLoginAt ? "active" : "invited";
    await tx.update(users).set({ status, deactivatedAt: null, updatedAt: new Date(), version: sql`${users.version} + 1` }).where(eq(users.id, userId));
    await writeAudit(tx, { organizationId: actor.organizationId, actorId: actor.id, action: "user.reactivated", targetType: "user", targetId: userId });
  });
}

// --- Sessions de l'utilisateur courant -----------------------------------

export async function listMySessions(actor: Actor) {
  return db
    .select({ id: sessions.id, createdAt: sessions.createdAt, updatedAt: sessions.updatedAt, userAgent: sessions.userAgent, ipAddress: sessions.ipAddress, token: sessions.token })
    .from(sessions)
    .where(eq(sessions.userId, actor.id))
    .orderBy(desc(sessions.updatedAt));
}

/** Déconnexion de tous les appareils (y compris celui-ci). */
export async function signOutEverywhere(actor: Actor) {
  await db.delete(sessions).where(eq(sessions.userId, actor.id));
}

export async function updateMyName(actor: Actor, name: string) {
  await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, actor.id));
}

// --- Équipes --------------------------------------------------------------

export async function listTeams(actor: Actor) {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      memberIds: sql<string[]>`coalesce((select array_agg(tm.user_id) from ${teamMembers} tm where tm.team_id = ${outer("teams", "id")}), '{}')`,
    })
    .from(teams)
    .where(and(eq(teams.organizationId, actor.organizationId), isNull(teams.archivedAt)))
    .orderBy(asc(sql`lower(${teams.name})`));
  return rows;
}

export async function createTeam(actor: Actor, name: string) {
  assertAdmin(actor);
  try {
    const [t] = await db.insert(teams).values({ organizationId: actor.organizationId, name }).returning({ id: teams.id });
    await writeAudit(db, { organizationId: actor.organizationId, actorId: actor.id, action: "team.created", targetType: "team", targetId: t.id, details: { name } });
    return t;
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "23505" || (e as { code?: string }).code === "23505")
      throw invalid("Une équipe porte déjà ce nom.");
    throw e;
  }
}

async function getTeam(actor: Actor, teamId: string) {
  const [t] = await db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.organizationId, actor.organizationId), isNull(teams.archivedAt)));
  if (!t) throw notFound("Équipe");
  return t;
}

export async function renameTeam(actor: Actor, teamId: string, name: string) {
  assertAdmin(actor);
  await getTeam(actor, teamId);
  await db.update(teams).set({ name, version: sql`${teams.version} + 1` }).where(eq(teams.id, teamId));
}

export async function archiveTeam(actor: Actor, teamId: string) {
  assertAdmin(actor);
  await getTeam(actor, teamId);
  await db.update(teams).set({ archivedAt: new Date() }).where(eq(teams.id, teamId));
  await writeAudit(db, { organizationId: actor.organizationId, actorId: actor.id, action: "team.archived", targetType: "team", targetId: teamId });
}

export async function setTeamMember(actor: Actor, teamId: string, userId: string, member: boolean) {
  assertAdmin(actor);
  await getTeam(actor, teamId);
  await getOrgUser(actor, userId);
  if (member) await db.insert(teamMembers).values({ teamId, userId }).onConflictDoNothing();
  else await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
}

// --- Journal d'audit ------------------------------------------------------

export async function listAudit(actor: Actor, before?: number) {
  assertAdmin(actor);
  const rows = await db
    .select({ a: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(and(eq(auditLogs.organizationId, actor.organizationId), before ? lt(auditLogs.id, before) : undefined))
    .orderBy(desc(auditLogs.id))
    .limit(51);
  const ids = new Set<string>();
  for (const { a } of rows) {
    if (a.targetType === "user" && a.targetId) ids.add(a.targetId);
    const d = a.details as { userId?: string };
    if (d.userId) ids.add(d.userId);
  }
  const names = ids.size ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, [...ids])) : [];
  return {
    items: rows.slice(0, 50).map(({ a, actorName }) => ({
      id: a.id,
      action: a.action,
      actorName,
      targetType: a.targetType,
      targetId: a.targetId,
      details: a.details,
      createdAt: a.createdAt.toISOString(),
    })),
    names: Object.fromEntries(names.map((n) => [n.id, n.name || n.email])),
    next: rows.length > 50 ? rows[49]!.a.id : null,
  };
}
