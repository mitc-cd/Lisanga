import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { orgSettings, organizations } from "@/db/schema";
import { writeAudit } from "./audit";
import { encryptSecret } from "./crypto";
import { forbidden, invalid } from "@/lib/errors";
import type { Actor } from "./actor";
import type {
  AdminSettingsView,
  BrandingInput,
  EntraInput,
  LoginSettingsInput,
  PublicSettings,
} from "@/lib/validation/settings";

export type SettingsRow = typeof orgSettings.$inferSelect;

/** Organisation unique (MiTC). Retourne null avant l'installation. */
export async function getOrganizationId(dbx: DbOrTx = db): Promise<string | null> {
  const [org] = await dbx.select({ id: organizations.id }).from(organizations).orderBy(organizations.createdAt).limit(1);
  return org?.id ?? null;
}

export async function getSettingsRow(organizationId: string, dbx: DbOrTx = db): Promise<SettingsRow> {
  const [row] = await dbx.select().from(orgSettings).where(eq(orgSettings.organizationId, organizationId));
  if (!row) throw new Error("Paramètres d'organisation absents.");
  return row;
}

export function isEntraUsable(s: SettingsRow): boolean {
  return Boolean(s.entraEnabled && s.entraTenantId && s.entraClientId && s.entraSecretEnc);
}

const DEFAULT_PUBLIC: PublicSettings = {
  appName: "MiTC Projets",
  primaryColor: "#0B3D91",
  secondaryColor: "#589CDB",
  accentColor: "#F5A623",
  logoPath: "/brand/mitc-logo.png",
  emailLoginEnabled: true,
  entraEnabled: false,
  installed: false,
};

/** Paramètres non sensibles, utilisables sans être connecté (page de connexion, thème). */
export async function getPublicSettings(): Promise<PublicSettings> {
  const orgId = await getOrganizationId();
  if (!orgId) return DEFAULT_PUBLIC;
  const s = await getSettingsRow(orgId);
  return {
    appName: s.appName,
    primaryColor: s.primaryColor,
    secondaryColor: s.secondaryColor,
    accentColor: s.accentColor,
    logoPath: s.logoPath,
    emailLoginEnabled: s.emailLoginEnabled,
    entraEnabled: isEntraUsable(s),
    installed: true,
  };
}

function assertAdmin(actor: Actor) {
  if (actor.orgRole !== "admin") throw forbidden("Cette page est réservée aux administrateurs.");
}

/** Vue administrateur : aucun secret n'est renvoyé, seulement « configuré » ou non. */
export async function getAdminSettings(actor: Actor): Promise<AdminSettingsView> {
  assertAdmin(actor);
  const s = await getSettingsRow(actor.organizationId);
  return {
    version: s.version,
    appName: s.appName,
    primaryColor: s.primaryColor,
    secondaryColor: s.secondaryColor,
    accentColor: s.accentColor,
    emailLoginEnabled: s.emailLoginEnabled,
    codeTtlMinutes: s.codeTtlMinutes,
    sessionDays: s.sessionDays,
    autoAdmitDomains: s.autoAdmitDomains,
    smtp: {
      host: s.smtpHost ?? "",
      port: s.smtpPort ?? 587,
      security: (s.smtpSecurity as "none" | "starttls" | "tls" | null) ?? "starttls",
      user: s.smtpUser ?? "",
      passwordSet: Boolean(s.smtpPasswordEnc),
      fromEmail: s.smtpFromEmail ?? "",
      fromName: s.smtpFromName ?? "",
      replyTo: s.smtpReplyTo ?? "",
      status: s.smtpStatus as "unconfigured" | "ok" | "failing",
      lastError: s.smtpLastError,
      lastSuccessAt: s.smtpLastSuccessAt?.toISOString() ?? null,
      lastFailureAt: s.smtpLastFailureAt?.toISOString() ?? null,
    },
    entra: {
      tenantId: s.entraTenantId ?? "",
      clientId: s.entraClientId ?? "",
      secretSet: Boolean(s.entraSecretEnc),
      enabled: s.entraEnabled,
      lastTestAt: s.entraLastTestAt?.toISOString() ?? null,
      lastTestOk: s.entraLastTestOk,
    },
  };
}

async function bumpAndAudit(actor: Actor, fields: string[], patch: Partial<typeof orgSettings.$inferInsert>, action: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(orgSettings)
      .set({ ...patch, updatedAt: new Date(), version: sql`${orgSettings.version} + 1` })
      .where(eq(orgSettings.organizationId, actor.organizationId));
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action,
      targetType: "settings",
      details: { fields },
    });
  });
}

export async function updateLoginSettings(actor: Actor, input: LoginSettingsInput) {
  assertAdmin(actor);
  const current = await getSettingsRow(actor.organizationId);
  if (!input.emailLoginEnabled && !isEntraUsable(current))
    throw invalid("Impossible de désactiver la connexion par e-mail tant que Microsoft Entra ID n'est pas configuré et activé.");
  const changed = (Object.keys(input) as (keyof LoginSettingsInput)[]).filter(
    (k) => JSON.stringify(input[k]) !== JSON.stringify(current[k]),
  );
  if (!changed.length) return;
  await bumpAndAudit(actor, changed, input, "settings.login.updated");
}

export async function updateBranding(actor: Actor, input: BrandingInput) {
  assertAdmin(actor);
  const current = await getSettingsRow(actor.organizationId);
  const changed = (Object.keys(input) as (keyof BrandingInput)[]).filter((k) => input[k] !== current[k]);
  if (!changed.length) return;
  await bumpAndAudit(actor, changed, input, "settings.branding.updated");
}

/**
 * Entra ID : enregistrer → tester → activer.
 * Tout changement d'identifiants désactive Entra et invalide le dernier test.
 */
export async function updateEntra(actor: Actor, input: EntraInput) {
  assertAdmin(actor);
  const current = await getSettingsRow(actor.organizationId);
  const changed: string[] = [];
  const patch: Partial<typeof orgSettings.$inferInsert> = {
    entraTenantId: input.tenantId || null,
    entraClientId: input.clientId || null,
  };
  if ((current.entraTenantId ?? "") !== input.tenantId) changed.push("entraTenantId");
  if ((current.entraClientId ?? "") !== input.clientId) changed.push("entraClientId");
  if (input.newSecret) {
    patch.entraSecretEnc = encryptSecret(input.newSecret);
    changed.push("entraSecret");
  }
  const credsChanged = changed.length > 0;
  const wantsEnabled = credsChanged ? false : input.enabled;
  if (credsChanged) {
    patch.entraLastTestOk = null;
    patch.entraLastTestAt = null;
  }
  if (wantsEnabled !== current.entraEnabled) {
    if (wantsEnabled && current.entraLastTestOk !== true)
      throw invalid("Testez la connexion avec succès avant d'activer Microsoft Entra ID.");
    if (!wantsEnabled && !current.emailLoginEnabled)
      throw invalid("Impossible de désactiver Microsoft Entra ID tant que la connexion par e-mail est désactivée.");
    patch.entraEnabled = wantsEnabled;
    changed.push("entraEnabled");
  }
  if (!changed.length) return;
  await bumpAndAudit(actor, changed, patch, "settings.entra.updated");
}

export async function recordEntraTest(actor: Actor, ok: boolean) {
  await db
    .update(orgSettings)
    .set({ entraLastTestAt: new Date(), entraLastTestOk: ok })
    .where(eq(orgSettings.organizationId, actor.organizationId));
  await writeAudit(db, {
    organizationId: actor.organizationId,
    actorId: actor.id,
    action: "settings.entra.tested",
    details: { ok },
  });
}
