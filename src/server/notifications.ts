import "server-only";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { comments, notifications, projects, tasks, users } from "@/db/schema";
import { readableProjectIdsSql, userCanReadProject } from "./permissions";
import type { Actor } from "./actor";

/**
 * Crée une notification uniquement si le destinataire peut lire l'élément
 * (et n'est pas l'auteur de l'action).
 */
async function createIfAllowed(
  tx: DbOrTx,
  actor: Actor,
  recipientId: string,
  projectId: string,
  values: { type: "assigned" | "mentioned"; taskId: string; commentId?: string },
) {
  if (recipientId === actor.id) return false;
  if (!(await userCanReadProject(recipientId, projectId, tx))) return false;
  await tx.insert(notifications).values({
    organizationId: actor.organizationId,
    recipientId,
    actorId: actor.id,
    type: values.type,
    taskId: values.taskId,
    commentId: values.commentId,
  });
  return true;
}

export function notifyAssignment(tx: DbOrTx, actor: Actor, taskId: string, projectId: string, assigneeId: string) {
  return createIfAllowed(tx, actor, assigneeId, projectId, { type: "assigned", taskId });
}

export function notifyMention(tx: DbOrTx, actor: Actor, taskId: string, projectId: string, userId: string, commentId: string) {
  return createIfAllowed(tx, actor, userId, projectId, { type: "mentioned", taskId, commentId });
}

export type InboxItem = {
  id: string;
  type: "assigned" | "mentioned";
  read: boolean;
  createdAt: string;
  actorName: string | null;
  task: { id: string; title: string; projectName: string; projectColor: string };
  excerpt: string | null;
};

/**
 * Boîte de réception. Refiltrée à la lecture : un accès perdu masque les notifications
 * correspondantes. Pagination par curseur (date de création).
 */
export async function listInbox(actor: Actor, opts: { unreadOnly?: boolean; before?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 30, 100);
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorName: users.name,
      taskId: tasks.id,
      taskTitle: tasks.title,
      projectName: projects.name,
      projectColor: projects.color,
      excerpt: comments.body,
    })
    .from(notifications)
    .innerJoin(tasks, eq(tasks.id, notifications.taskId))
    .innerJoin(projects, eq(projects.id, tasks.primaryProjectId))
    .leftJoin(users, eq(users.id, notifications.actorId))
    .leftJoin(comments, eq(comments.id, notifications.commentId))
    .where(
      and(
        eq(notifications.recipientId, actor.id),
        isNull(tasks.deletedAt),
        sql`${projects.id} in ${readableProjectIdsSql(actor)}`,
        opts.unreadOnly ? isNull(notifications.readAt) : undefined,
        opts.before ? lt(notifications.createdAt, new Date(opts.before)) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1);
  const items: InboxItem[] = rows.slice(0, limit).map((r) => ({
    id: r.id,
    type: r.type,
    read: r.readAt !== null,
    createdAt: r.createdAt.toISOString(),
    actorName: r.actorName,
    task: { id: r.taskId, title: r.taskTitle, projectName: r.projectName, projectColor: r.projectColor },
    excerpt: r.excerpt ? r.excerpt.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, "@$1").slice(0, 200) : null,
  }));
  return { items, nextCursor: rows.length > limit ? items.at(-1)!.createdAt : null };
}

export async function unreadCount(actor: Actor): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .innerJoin(tasks, eq(tasks.id, notifications.taskId))
    .where(
      and(
        eq(notifications.recipientId, actor.id),
        isNull(notifications.readAt),
        isNull(tasks.deletedAt),
        sql`${tasks.primaryProjectId} in ${readableProjectIdsSql(actor)}`,
      ),
    );
  return r?.n ?? 0;
}

export async function setNotificationRead(actor: Actor, id: string, read: boolean) {
  await db
    .update(notifications)
    .set({ readAt: read ? new Date() : null })
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, actor.id)));
}

export async function markAllRead(actor: Actor) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, actor.id), isNull(notifications.readAt)));
}
