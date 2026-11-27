import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { comments, taskEvents, users } from "@/db/schema";
import { requireTaskEdit, userCanReadProject } from "./permissions";
import { notifyMention } from "./notifications";
import { extractMentionIds } from "@/lib/mentions";
import { forbidden, notFound } from "@/lib/errors";
import type { Actor } from "./actor";

/**
 * Ajoute un commentaire. Les mentions ne visent que des personnes de l'organisation qui
 * peuvent lire la tâche ; les autres sont ignorées (aucune notification, aucune fuite).
 */
export async function addComment(actor: Actor, taskId: string, body: string): Promise<{ id: string; notified: number }> {
  const { access } = await requireTaskEdit(actor, taskId);
  const projectId = access.project.id;
  const requested = extractMentionIds(body);
  const candidates = requested.length
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, requested), eq(users.organizationId, actor.organizationId)))
    : [];
  const allowed: string[] = [];
  for (const c of candidates) if (await userCanReadProject(c.id, projectId)) allowed.push(c.id);
  return db.transaction(async (tx) => {
    const [c] = await tx
      .insert(comments)
      .values({ organizationId: actor.organizationId, taskId, authorId: actor.id, body, mentionedUserIds: allowed })
      .returning({ id: comments.id });
    await tx.insert(taskEvents).values({
      organizationId: actor.organizationId,
      taskId,
      projectId,
      actorId: actor.id,
      type: "comment.added",
      meta: { commentId: c.id },
    });
    let notified = 0;
    for (const uid of allowed) if (await notifyMention(tx, actor, taskId, projectId, uid, c.id)) notified++;
    return { id: c.id, notified };
  });
}

/** Suppression logique de son propre commentaire. */
export async function deleteComment(actor: Actor, commentId: string) {
  const [c] = await db.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.organizationId, actor.organizationId)));
  if (!c || c.deletedAt) throw notFound("Commentaire");
  await requireTaskEdit(actor, c.taskId);
  if (c.authorId !== actor.id) throw forbidden("Vous ne pouvez supprimer que vos propres commentaires.");
  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));
}
