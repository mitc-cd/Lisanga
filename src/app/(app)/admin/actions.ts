"use server";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/server/auth/session";
import { invalidateAuthCache } from "@/server/auth/auth";
import { parse, runAction } from "@/server/action";
import { recordEntraTest, updateBranding, updateEntra, updateLoginSettings, getSettingsRow } from "@/server/settings";
import { sendTestWithActive, testAndSaveSmtp } from "@/server/mail/send";
import { testEntraConnection } from "@/server/entra";
import { brandingSchema, entraSchema, loginSettingsSchema, smtpSchema } from "@/lib/validation/settings";
import { emailSchema } from "@/lib/validation/auth";
import { inviteSchema, teamSchema } from "@/lib/validation/projects";
import { z } from "zod";
import {
  archiveTeam,
  changeOrgRole,
  createTeam,
  deactivateUser,
  inviteUser,
  reactivateUser,
  renameTeam,
  revokeInvitation,
  setTeamMember,
} from "@/server/users";
import { forbidden } from "@/lib/errors";

const uuid = z.uuid();

export async function saveSmtpAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await testAndSaveSmtp(actor, parse(smtpSchema, input));
    invalidateAuthCache();
    revalidatePath("/", "layout");
  });
}

export async function sendSmtpTestAction(recipient: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await sendTestWithActive(actor, parse(emailSchema, recipient));
    revalidatePath("/", "layout");
  });
}

export async function saveLoginSettingsAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await updateLoginSettings(actor, parse(loginSettingsSchema, input));
    invalidateAuthCache();
  });
}

export async function saveBrandingAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await updateBranding(actor, parse(brandingSchema, input));
    revalidatePath("/", "layout");
  });
}

export async function saveEntraAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await updateEntra(actor, parse(entraSchema, input));
    invalidateAuthCache();
  });
}

export async function testEntraAction() {
  return runAction(async () => {
    const actor = await requireActor();
    if (actor.orgRole !== "admin") throw forbidden("Cette page est réservée aux administrateurs.");
    const s = await getSettingsRow(actor.organizationId);
    const result = await testEntraConnection(s);
    await recordEntraTest(actor, result.ok);
    return result;
  });
}

// --- Membres ---------------------------------------------------------------

export async function inviteUserAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    const r = await inviteUser(actor, parse(inviteSchema, input));
    revalidatePath("/admin/membres");
    return r;
  });
}

const roleSchema = z.enum(["admin", "member", "viewer"]);

export async function changeRoleAction(userId: unknown, role: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await changeOrgRole(actor, parse(uuid, userId), parse(roleSchema, role));
    revalidatePath("/admin/membres");
  });
}

export async function setUserActiveAction(userId: unknown, active: boolean) {
  return runAction(async () => {
    const actor = await requireActor();
    const id = parse(uuid, userId);
    if (active) await reactivateUser(actor, id);
    else await deactivateUser(actor, id);
    revalidatePath("/admin/membres");
  });
}

export async function revokeInvitationAction(userId: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await revokeInvitation(actor, parse(uuid, userId));
    revalidatePath("/admin/membres");
  });
}

// --- Équipes ---------------------------------------------------------------

export async function createTeamAction(name: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await createTeam(actor, parse(teamSchema, { name }).name);
    revalidatePath("/admin/equipes");
  });
}

export async function renameTeamAction(teamId: unknown, name: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await renameTeam(actor, parse(uuid, teamId), parse(teamSchema, { name }).name);
    revalidatePath("/admin/equipes");
  });
}

export async function archiveTeamAction(teamId: unknown) {
  return runAction(async () => {
    const actor = await requireActor();
    await archiveTeam(actor, parse(uuid, teamId));
    revalidatePath("/admin/equipes");
  });
}

export async function setTeamMemberAction(teamId: unknown, userId: unknown, member: boolean) {
  return runAction(async () => {
    const actor = await requireActor();
    await setTeamMember(actor, parse(uuid, teamId), parse(uuid, userId), member);
    revalidatePath("/admin/equipes");
  });
}
