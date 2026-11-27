"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/auth/session";
import { parse, runAction } from "@/server/action";
import {
  addProjectMember,
  createProject,
  createSection,
  deleteSection,
  joinProject,
  moveSection,
  removeProjectMember,
  renameSection,
  setProjectArchived,
  updateProject,
} from "@/server/projects";
import { memberSchema, projectSchema, projectUpdateSchema, sectionNameSchema } from "@/lib/validation/projects";

const uuid = z.uuid();

export async function createProjectAction(input: unknown) {
  return runAction(async () => {
    const p = await createProject(await requireActor(), parse(projectSchema, input));
    revalidatePath("/", "layout");
    return p;
  });
}

export async function updateProjectAction(projectId: unknown, version: unknown, input: unknown) {
  return runAction(async () => {
    await updateProject(await requireActor(), parse(uuid, projectId), parse(z.number().int(), version), parse(projectUpdateSchema, input));
    revalidatePath("/", "layout");
  });
}

export async function setProjectArchivedAction(projectId: unknown, archived: boolean) {
  return runAction(async () => {
    await setProjectArchived(await requireActor(), parse(uuid, projectId), Boolean(archived));
    revalidatePath("/", "layout");
  });
}

export async function joinProjectAction(projectId: unknown) {
  return runAction(async () => {
    await joinProject(await requireActor(), parse(uuid, projectId));
    revalidatePath("/", "layout");
  });
}

export async function setProjectMemberAction(projectId: unknown, input: unknown) {
  return runAction(async () => {
    const m = parse(memberSchema, input);
    await addProjectMember(await requireActor(), parse(uuid, projectId), m.userId, m.role);
    revalidatePath("/", "layout");
  });
}

export async function removeProjectMemberAction(projectId: unknown, userId: unknown) {
  return runAction(async () => {
    await removeProjectMember(await requireActor(), parse(uuid, projectId), parse(uuid, userId));
    revalidatePath("/", "layout");
  });
}

export async function createSectionAction(projectId: unknown, name: unknown, afterSectionId?: unknown) {
  return runAction(async () =>
    createSection(
      await requireActor(),
      parse(uuid, projectId),
      parse(sectionNameSchema, name),
      afterSectionId === undefined ? undefined : parse(uuid.nullable(), afterSectionId),
    ),
  );
}

export async function renameSectionAction(projectId: unknown, sectionId: unknown, name: unknown) {
  return runAction(async () => renameSection(await requireActor(), parse(uuid, projectId), parse(uuid, sectionId), parse(sectionNameSchema, name)));
}

export async function moveSectionAction(projectId: unknown, sectionId: unknown, afterSectionId: unknown) {
  return runAction(async () => moveSection(await requireActor(), parse(uuid, projectId), parse(uuid, sectionId), parse(uuid.nullable(), afterSectionId)));
}

export async function deleteSectionAction(projectId: unknown, sectionId: unknown) {
  return runAction(async () => deleteSection(await requireActor(), parse(uuid, projectId), parse(uuid, sectionId)));
}
