"use server";
import { z } from "zod";
import { requireActor } from "@/server/auth/session";
import { parse, runAction } from "@/server/action";
import { createLabel, createTask, moveTask, setTaskArchived, updateTask } from "@/server/tasks";
import { addComment, deleteComment } from "@/server/comments";
import { commentSchema, createTaskSchema, labelSchema, moveTaskSchema, updateTaskSchema } from "@/lib/validation/tasks";

const uuid = z.uuid();
const version = z.number().int().positive();

export async function createTaskAction(input: unknown) {
  return runAction(async () => createTask(await requireActor(), parse(createTaskSchema, input)));
}

export async function updateTaskAction(taskId: unknown, v: unknown, patch: unknown) {
  return runAction(async () => updateTask(await requireActor(), parse(uuid, taskId), parse(version, v), parse(updateTaskSchema, patch)));
}

export async function moveTaskAction(taskId: unknown, v: unknown, input: unknown) {
  return runAction(async () => moveTask(await requireActor(), parse(uuid, taskId), parse(version, v), parse(moveTaskSchema, input)));
}

export async function setTaskArchivedAction(taskId: unknown, archived: boolean) {
  return runAction(async () => setTaskArchived(await requireActor(), parse(uuid, taskId), Boolean(archived)));
}

export async function addCommentAction(taskId: unknown, body: unknown) {
  return runAction(async () => addComment(await requireActor(), parse(uuid, taskId), parse(commentSchema, { body }).body));
}

export async function deleteCommentAction(commentId: unknown) {
  return runAction(async () => deleteComment(await requireActor(), parse(uuid, commentId)));
}

export async function createLabelAction(name: unknown) {
  return runAction(async () => createLabel(await requireActor(), parse(labelSchema, { name }).name));
}
