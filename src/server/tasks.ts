import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { outer } from "@/db/sql";
import { db, type DbOrTx, type Tx } from "@/db";
import {
  comments,
  labels,
  projectMembers,
  projects,
  sections,
  taskEvents,
  taskLabels,
  taskProjects,
  tasks,
  users,
  type TaskEventChanges,
} from "@/db/schema";
import { getProjectAccess, getTaskAccess, readableProjectIdsSql, requireProjectEdit, requireTaskEdit } from "./permissions";
import { assignableUserIds } from "./projects";
import { lockSection, taskSortKey } from "./ordering";
import { notifyAssignment } from "./notifications";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import type { CreateTaskInput, MoveTaskInput, UpdateTaskInput } from "@/lib/validation/tasks";
import type { TaskPriority, TaskStatus } from "@/lib/labels";
import type { Actor } from "./actor";

export type LabelView = { id: string; name: string; color: string };
export type UserRef = { id: string; name: string; deactivated?: boolean };

export type TaskCard = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  assignee: UserRef | null;
  labels: LabelView[];
  subtaskCount: number;
  subtaskDoneCount: number;
  commentCount: number;
  sectionId: string;
  sortKey: string;
  version: number;
  archived: boolean;
};

const cardColumns = {
  id: tasks.id,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  startDate: tasks.startDate,
  dueDate: tasks.dueDate,
  version: tasks.version,
  archivedAt: tasks.archivedAt,
  assigneeId: tasks.assigneeId,
  assigneeName: users.name,
  assigneeStatus: users.status,
  subtaskCount: sql<number>`(select count(*)::int from ${tasks} s where s.parent_task_id = ${outer("tasks", "id")} and s.archived_at is null and s.deleted_at is null)`,
  subtaskDoneCount: sql<number>`(select count(*)::int from ${tasks} s where s.parent_task_id = ${outer("tasks", "id")} and s.archived_at is null and s.deleted_at is null and s.status = 'done')`,
  commentCount: sql<number>`(select count(*)::int from ${comments} c where c.task_id = ${outer("tasks", "id")} and c.deleted_at is null)`,
};

async function labelsFor(taskIds: string[], dbx: DbOrTx = db): Promise<Map<string, LabelView[]>> {
  const map = new Map<string, LabelView[]>();
  if (!taskIds.length) return map;
  const rows = await dbx
    .select({ taskId: taskLabels.taskId, id: labels.id, name: labels.name, color: labels.color })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(inArray(taskLabels.taskId, taskIds))
    .orderBy(asc(labels.name));
  for (const r of rows) {
    const list = map.get(r.taskId) ?? [];
    list.push({ id: r.id, name: r.name, color: r.color });
    map.set(r.taskId, list);
  }
  return map;
}

function toAssignee(r: { assigneeId: string | null; assigneeName: string | null; assigneeStatus: string | null }): UserRef | null {
  if (!r.assigneeId) return null;
  return { id: r.assigneeId, name: r.assigneeName ?? "", deactivated: r.assigneeStatus === "deactivated" };
}

/**
 * Tâches d'un projet (vues Liste et Tableau) : 3 requêtes quelle que soit la taille,
 * sans N+1. Les tâches terminées depuis plus de 14 jours sont masquées par défaut.
 */
export async function getProjectTasks(actor: Actor, projectId: string, opts: { archived?: boolean } = {}): Promise<TaskCard[]> {
  await getProjectAccess(actor, projectId);
  const rows = await db
    .select({ ...cardColumns, sectionId: taskProjects.sectionId, sortKey: taskProjects.sortKey })
    .from(taskProjects)
    .innerJoin(tasks, eq(tasks.id, taskProjects.taskId))
    .innerJoin(sections, eq(sections.id, taskProjects.sectionId))
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(
      and(
        eq(taskProjects.projectId, projectId),
        isNull(tasks.parentTaskId),
        isNull(tasks.deletedAt),
        isNull(sections.archivedAt),
        opts.archived ? sql`${tasks.archivedAt} is not null` : isNull(tasks.archivedAt),
      ),
    )
    .orderBy(asc(sections.sortKey), asc(taskProjects.sortKey), asc(tasks.id));
  const labelMap = await labelsFor(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    startDate: r.startDate,
    dueDate: r.dueDate,
    assignee: toAssignee(r),
    labels: labelMap.get(r.id) ?? [],
    subtaskCount: r.subtaskCount,
    subtaskDoneCount: r.subtaskDoneCount,
    commentCount: r.commentCount,
    sectionId: r.sectionId,
    sortKey: r.sortKey,
    version: r.version,
    archived: r.archivedAt !== null,
  }));
}

async function assertAssignable(projectId: string, assigneeId: string) {
  const ok = await assignableUserIds(projectId, [assigneeId]);
  if (!ok.has(assigneeId))
    throw invalid("Cette personne ne peut pas être responsable : elle doit être contributrice ou responsable du projet.");
}

async function writeEvent(
  tx: DbOrTx,
  actor: Actor,
  taskId: string,
  projectId: string | null,
  type: string,
  changes: TaskEventChanges = {},
  meta: Record<string, unknown> = {},
) {
  await tx.insert(taskEvents).values({ organizationId: actor.organizationId, taskId, projectId, actorId: actor.id, type, changes, meta });
}

export async function createTask(actor: Actor, raw: CreateTaskInput): Promise<{ id: string; sectionId: string | null; sortKey: string; version: number }> {
  const input = { ...raw, title: raw.title.trim() };
  if (!input.title) throw invalid("Le titre est obligatoire.");
  if (input.parentTaskId) return createSubtask(actor, input);
  const access = await requireProjectEdit(actor, input.projectId);
  const projectId = access.project.id;
  if (input.assigneeId) await assertAssignable(projectId, input.assigneeId);
  const result = await db.transaction(async (tx) => {
    let sectionId = input.sectionId;
    if (sectionId) {
      const [s] = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(and(eq(sections.id, sectionId), eq(sections.projectId, projectId), isNull(sections.archivedAt)));
      if (!s) throw notFound("Section");
    } else {
      const [s] = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(and(eq(sections.projectId, projectId), isNull(sections.archivedAt)))
        .orderBy(asc(sections.sortKey))
        .limit(1);
      if (!s) throw invalid("Ce projet n'a aucune section.");
      sectionId = s.id;
    }
    await lockSection(tx, sectionId);
    const sortKey = await taskSortKey(tx, projectId, sectionId, input.afterTaskId);
    const [t] = await tx
      .insert(tasks)
      .values({
        ...(input.clientId && { id: input.clientId }),
        organizationId: actor.organizationId,
        primaryProjectId: projectId,
        title: input.title,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        createdBy: actor.id,
      })
      .returning({ id: tasks.id, version: tasks.version });
    await tx.insert(taskProjects).values({ taskId: t.id, projectId, sectionId, sortKey });
    await writeEvent(tx, actor, t.id, projectId, "task.created", {}, { title: input.title, sectionId });
    if (input.assigneeId) await notifyAssignment(tx, actor, t.id, projectId, input.assigneeId);
    return { id: t.id, sectionId, sortKey, version: t.version };
  });
  return result;
}

async function createSubtask(actor: Actor, input: CreateTaskInput) {
  const { task: parent, access } = await requireTaskEdit(actor, input.parentTaskId!);
  if (parent.parentTaskId) throw invalid("Un seul niveau de sous-tâches est possible.");
  const projectId = access.project.id;
  if (input.assigneeId) await assertAssignable(projectId, input.assigneeId);
  return db.transaction(async (tx) => {
    await lockSection(tx, `subtasks:${parent.id}`);
    const [last] = await tx
      .select({ k: sql<string | null>`max(${tasks.subtaskSortKey})` })
      .from(tasks)
      .where(eq(tasks.parentTaskId, parent.id));
    const sortKey = generateKeyBetween(last?.k ?? null, null);
    const [t] = await tx
      .insert(tasks)
      .values({
        ...(input.clientId && { id: input.clientId }),
        organizationId: actor.organizationId,
        primaryProjectId: projectId,
        parentTaskId: parent.id,
        title: input.title,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        subtaskSortKey: sortKey,
        createdBy: actor.id,
      })
      .returning({ id: tasks.id, version: tasks.version });
    await writeEvent(tx, actor, t.id, projectId, "task.created", {}, { title: input.title, parentTaskId: parent.id });
    await writeEvent(tx, actor, parent.id, projectId, "subtask.added", {}, { subtaskId: t.id, title: input.title });
    if (input.assigneeId) await notifyAssignment(tx, actor, t.id, projectId, input.assigneeId);
    return { id: t.id, sectionId: null, sortKey, version: t.version };
  });
}

const EVENT_FIELDS = ["title", "description", "assigneeId", "priority", "status", "startDate", "dueDate"] as const;

export async function updateTask(actor: Actor, taskId: string, version: number, rawPatch: UpdateTaskInput): Promise<{ version: number }> {
  const patch = rawPatch.title === undefined ? rawPatch : { ...rawPatch, title: rawPatch.title.trim() };
  if (patch.title === "") throw invalid("Le titre est obligatoire.");
  const { task, access } = await requireTaskEdit(actor, taskId);
  const projectId = access.project.id;
  if (patch.assigneeId) await assertAssignable(projectId, patch.assigneeId);
  const start = patch.startDate !== undefined ? patch.startDate : task.startDate;
  const due = patch.dueDate !== undefined ? patch.dueDate : task.dueDate;
  if (start && due && start > due) throw invalid("La date de début doit précéder l'échéance.");
  let labelIds: string[] | undefined;
  if (patch.labelIds) {
    labelIds = [...new Set(patch.labelIds)];
    if (labelIds.length) {
      const found = await db
        .select({ id: labels.id })
        .from(labels)
        .where(and(inArray(labels.id, labelIds), eq(labels.organizationId, actor.organizationId)));
      if (found.length !== labelIds.length) throw invalid("Étiquette introuvable.");
    }
  }
  return db.transaction(async (tx) => {
    const changes: TaskEventChanges = {};
    const set: Partial<typeof tasks.$inferInsert> = {};
    for (const f of EVENT_FIELDS) {
      const v = patch[f];
      if (v === undefined) continue;
      if ((task[f] ?? null) !== (v ?? null)) {
        changes[f] = { from: task[f] ?? null, to: v ?? null };
        (set as Record<string, unknown>)[f] = v;
      }
    }
    if (changes.status) set.completedAt = patch.status === "done" ? new Date() : null;
    if (labelIds) {
      const current = (await tx.select({ id: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.taskId, taskId))).map((r) => r.id);
      const same = current.length === labelIds.length && current.every((id) => labelIds!.includes(id));
      if (!same) {
        changes.labels = { from: current, to: labelIds };
        await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
        if (labelIds.length) await tx.insert(taskLabels).values(labelIds.map((labelId) => ({ taskId, labelId })));
      }
    }
    const res = await tx
      .update(tasks)
      .set({ ...set, updatedAt: new Date(), version: sql`${tasks.version} + 1` })
      .where(and(eq(tasks.id, taskId), eq(tasks.version, version)))
      .returning({ version: tasks.version });
    if (!res.length) throw conflict("Cette tâche a été modifiée par quelqu'un d'autre entre-temps. Les données ont été rechargées : refaites votre modification.");
    if (Object.keys(changes).length) {
      await writeEvent(tx, actor, taskId, projectId, "task.updated", changes);
      if (changes.assigneeId && patch.assigneeId) await notifyAssignment(tx, actor, taskId, projectId, patch.assigneeId);
    }
    return { version: res[0]!.version };
  });
}

export async function moveTask(actor: Actor, taskId: string, version: number, input: MoveTaskInput): Promise<{ sortKey: string; version: number }> {
  const { task } = await requireTaskEdit(actor, taskId);
  if (task.parentTaskId) throw invalid("Une sous-tâche se déplace avec sa tâche parente.");
  await requireProjectEdit(actor, input.projectId);
  const [membership] = await db
    .select()
    .from(taskProjects)
    .where(and(eq(taskProjects.taskId, taskId), eq(taskProjects.projectId, input.projectId)));
  if (!membership) throw notFound("Tâche");
  const [section] = await db
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.id, input.sectionId), eq(sections.projectId, input.projectId), isNull(sections.archivedAt)));
  if (!section) throw notFound("Section");
  if (input.afterTaskId === taskId) throw invalid("Position invalide.");
  return db.transaction(async (tx) => {
    await lockSection(tx, input.sectionId);
    const sortKey = await taskSortKey(tx, input.projectId, input.sectionId, input.afterTaskId, taskId);
    const res = await tx
      .update(tasks)
      .set({ updatedAt: new Date(), version: sql`${tasks.version} + 1` })
      .where(and(eq(tasks.id, taskId), eq(tasks.version, version)))
      .returning({ version: tasks.version });
    if (!res.length) throw conflict("Cette tâche a été modifiée par quelqu'un d'autre entre-temps. Le tableau a été rechargé.");
    await tx
      .update(taskProjects)
      .set({ sectionId: input.sectionId, sortKey })
      .where(and(eq(taskProjects.taskId, taskId), eq(taskProjects.projectId, input.projectId)));
    const changes: TaskEventChanges =
      membership.sectionId !== input.sectionId ? { section: { from: membership.sectionId, to: input.sectionId } } : {};
    await writeEvent(tx, actor, taskId, input.projectId, "task.moved", changes, { afterTaskId: input.afterTaskId });
    return { sortKey, version: res[0]!.version };
  });
}

export async function setTaskArchived(actor: Actor, taskId: string, archived: boolean): Promise<{ version: number }> {
  const { task, access } = await requireTaskEdit(actor, taskId);
  if ((task.archivedAt !== null) === archived) return { version: task.version };
  return db.transaction(async (tx) => {
    const [r] = await tx
      .update(tasks)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), version: sql`${tasks.version} + 1` })
      .where(eq(tasks.id, taskId))
      .returning({ version: tasks.version });
    await writeEvent(tx, actor, taskId, access.project.id, archived ? "task.archived" : "task.restored");
    return { version: r!.version };
  });
}

// --- Détail ---------------------------------------------------------------

export type CommentView = {
  id: string;
  body: string;
  author: UserRef | null;
  createdAt: string;
  mine: boolean;
};
export type EventView = {
  id: number;
  type: string;
  actor: UserRef | null;
  changes: TaskEventChanges;
  meta: Record<string, unknown>;
  createdAt: string;
};
export type SubtaskView = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  assignee: UserRef | null;
  version: number;
};

export type TaskDetail = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: UserRef | null;
  assignee: UserRef | null;
  labels: LabelView[];
  version: number;
  archived: boolean;
  project: { id: string; name: string; color: string; archived: boolean };
  sectionId: string | null;
  parent: { id: string; title: string } | null;
  subtasks: SubtaskView[];
  comments: CommentView[];
  events: EventView[];
  canEdit: boolean;
  assignable: UserRef[];
  mentionable: UserRef[];
  userNames: Record<string, string>;
  sectionNames: Record<string, string>;
};

export async function getTaskDetail(actor: Actor, taskId: string): Promise<TaskDetail> {
  const { task, access } = await getTaskAccess(actor, taskId);
  const p = access.project;
  const [membership, parent, subtaskRows, commentRows, eventRows, labelMap, memberRows, secRows] = await Promise.all([
    db.select().from(taskProjects).where(and(eq(taskProjects.taskId, taskId), eq(taskProjects.projectId, p.id))),
    task.parentTaskId ? db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.id, task.parentTaskId)) : Promise.resolve([]),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        version: tasks.version,
        assigneeId: tasks.assigneeId,
        assigneeName: users.name,
        assigneeStatus: users.status,
      })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.parentTaskId, taskId), isNull(tasks.archivedAt), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.subtaskSortKey), asc(tasks.createdAt)),
    db
      .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, authorId: comments.authorId, authorName: users.name, authorStatus: users.status })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorId))
      .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt)),
    db
      .select({ e: taskEvents, actorName: users.name })
      .from(taskEvents)
      .leftJoin(users, eq(users.id, taskEvents.actorId))
      .where(eq(taskEvents.taskId, taskId))
      .orderBy(desc(taskEvents.createdAt), desc(taskEvents.id))
      .limit(100),
    labelsFor([taskId]),
    db
      .select({ id: users.id, name: users.name, role: projectMembers.role, status: users.status })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(and(eq(projectMembers.projectId, p.id), ne(users.status, "deactivated")))
      .orderBy(asc(sql`lower(${users.name})`)),
    db.select({ id: sections.id, name: sections.name }).from(sections).where(eq(sections.projectId, p.id)),
  ]);
  const [createdBy] = task.createdBy ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, task.createdBy)) : [];
  const [assignee] = task.assigneeId
    ? await db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(eq(users.id, task.assigneeId))
    : [];
  // Personnes mentionnables = celles qui peuvent lire la tâche.
  let mentionable: UserRef[] = memberRows.map((m) => ({ id: m.id, name: m.name }));
  if (p.visibility === "organization") {
    const internal = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, actor.organizationId), inArray(users.status, ["active", "invited"]), eq(users.isExternal, false)))
      .orderBy(asc(sql`lower(${users.name})`));
    const seen = new Set(internal.map((u) => u.id));
    mentionable = [...internal, ...mentionable.filter((m) => !seen.has(m.id))];
  }
  // Noms pour l'historique (anciens responsables).
  const ids = new Set<string>();
  for (const { e } of eventRows) {
    const c = e.changes.assigneeId;
    if (c) [c.from, c.to].forEach((v) => typeof v === "string" && ids.add(v));
  }
  const nameRows = ids.size ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...ids])) : [];
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    createdBy: createdBy ?? null,
    assignee: assignee ? { id: assignee.id, name: assignee.name, deactivated: assignee.status === "deactivated" } : null,
    labels: labelMap.get(taskId) ?? [],
    version: task.version,
    archived: task.archivedAt !== null,
    project: { id: p.id, name: p.name, color: p.color, archived: p.archivedAt !== null },
    sectionId: membership[0]?.sectionId ?? null,
    parent: parent[0] ?? null,
    subtasks: subtaskRows.map((s) => ({ id: s.id, title: s.title, status: s.status, dueDate: s.dueDate, version: s.version, assignee: toAssignee(s) })),
    comments: commentRows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: c.authorId ? { id: c.authorId, name: c.authorName ?? "", deactivated: c.authorStatus === "deactivated" } : null,
      mine: c.authorId === actor.id,
    })),
    events: eventRows.map(({ e, actorName }) => ({
      id: e.id,
      type: e.type,
      actor: e.actorId ? { id: e.actorId, name: actorName ?? "" } : null,
      changes: e.changes,
      meta: e.meta,
      createdAt: e.createdAt.toISOString(),
    })),
    canEdit: access.canEdit,
    assignable: memberRows.filter((m) => m.role !== "viewer").map((m) => ({ id: m.id, name: m.name })),
    mentionable,
    userNames: Object.fromEntries(nameRows.map((r) => [r.id, r.name])),
    sectionNames: Object.fromEntries(secRows.map((s) => [s.id, s.name])),
  };
}

// --- Mes tâches -----------------------------------------------------------

export type MyTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  startDate: string | null;
  version: number;
  project: { id: string; name: string; color: string };
  parentTitle: string | null;
  labels: LabelView[];
  canEdit: boolean;
};

/** Tâches assignées à l'acteur, limitées aux projets qu'il peut lire (non archivés). */
export async function listMyTasks(actor: Actor, opts: { includeDone?: boolean } = {}): Promise<MyTask[]> {
  const doneSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const parent = sql`(select pt.title from ${tasks} pt where pt.id = ${outer("tasks", "parent_task_id")})`;
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      startDate: tasks.startDate,
      version: tasks.version,
      projectId: projects.id,
      projectName: projects.name,
      projectColor: projects.color,
      memberRole: projectMembers.role,
      parentTitle: sql<string | null>`${parent}`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.primaryProjectId))
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
    .where(
      and(
        eq(tasks.assigneeId, actor.id),
        isNull(tasks.archivedAt),
        isNull(tasks.deletedAt),
        isNull(projects.archivedAt),
        sql`${projects.id} in ${readableProjectIdsSql(actor)}`,
        sql`(${tasks.parentTaskId} is null or exists (select 1 from ${tasks} pt where pt.id = ${outer("tasks", "parent_task_id")} and pt.archived_at is null))`,
        opts.includeDone ? or(ne(tasks.status, "done"), gte(tasks.completedAt, doneSince)) : ne(tasks.status, "done"),
      ),
    )
    .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt))
    .limit(1000);
  const labelMap = await labelsFor(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate,
    startDate: r.startDate,
    version: r.version,
    project: { id: r.projectId, name: r.projectName, color: r.projectColor },
    parentTitle: r.parentTitle,
    labels: labelMap.get(r.id) ?? [],
    canEdit: actor.orgRole !== "viewer" && (r.memberRole === "owner" || r.memberRole === "editor"),
  }));
}

/** Pour les liens directs /taches/[id] : projet principal de la tâche si elle est visible. */
export async function resolveTaskLink(actor: Actor, taskId: string) {
  const { task, access } = await getTaskAccess(actor, taskId);
  return { projectId: access.project.id, taskId: task.parentTaskId ?? task.id, focusId: task.id };
}

// --- Étiquettes -----------------------------------------------------------

export async function listLabels(actor: Actor): Promise<LabelView[]> {
  return db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.organizationId, actor.organizationId))
    .orderBy(asc(sql`lower(${labels.name})`));
}

const LABEL_COLORS = ["#589CDB", "#0B3D91", "#2E7D32", "#8E24AA", "#C62828", "#00838F", "#6D4C41", "#F5A623"];

export async function createLabel(actor: Actor, name: string): Promise<LabelView> {
  if (actor.orgRole === "viewer") throw forbidden("Les lecteurs ne peuvent pas créer d'étiquette.");
  const [existing] = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(and(eq(labels.organizationId, actor.organizationId), sql`lower(${labels.name}) = lower(${name})`));
  if (existing) return existing;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(labels).where(eq(labels.organizationId, actor.organizationId));
  const [l] = await db
    .insert(labels)
    .values({ organizationId: actor.organizationId, name, color: LABEL_COLORS[n % LABEL_COLORS.length] })
    .onConflictDoNothing()
    .returning({ id: labels.id, name: labels.name, color: labels.color });
  if (l) return l;
  const [again] = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(and(eq(labels.organizationId, actor.organizationId), sql`lower(${labels.name}) = lower(${name})`));
  return again!;
}

export type { Tx };
