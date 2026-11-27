import "server-only";
import nodemailer from "nodemailer";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orgSettings } from "@/db/schema";
import { appUrl, isProduction } from "../env";
import { decryptSecret, encryptSecret } from "../crypto";
import { writeAudit } from "../audit";
import { getSettingsRow, type SettingsRow } from "../settings";
import { translateSmtpError } from "./smtp-errors";
import { testEmail } from "./templates";
import { AppError, forbidden, invalid } from "@/lib/errors";
import type { Actor } from "../actor";
import type { SmtpInput } from "@/lib/validation/settings";

export type SmtpConfig = {
  host: string;
  port: number;
  security: "none" | "starttls" | "tls";
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
};

export type MailMessage = { to: string; subject: string; html: string; text: string };

function buildTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === "tls",
    requireTLS: cfg.security === "starttls",
    ignoreTLS: cfg.security === "none",
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function deliver(cfg: SmtpConfig, msg: MailMessage) {
  const transport = buildTransport(cfg);
  try {
    await transport.sendMail({
      from: { name: cfg.fromName || "MiTC Projets", address: cfg.fromEmail },
      replyTo: cfg.replyTo || undefined,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
  } finally {
    transport.close();
  }
}

function activeConfig(s: SettingsRow): SmtpConfig | null {
  if (!s.smtpHost || !s.smtpPort || !s.smtpFromEmail) return null;
  return {
    host: s.smtpHost,
    port: s.smtpPort,
    security: (s.smtpSecurity as SmtpConfig["security"]) ?? "starttls",
    user: s.smtpUser ?? "",
    password: s.smtpPasswordEnc ? decryptSecret(s.smtpPasswordEnc) : "",
    fromEmail: s.smtpFromEmail,
    fromName: s.smtpFromName ?? "",
    replyTo: s.smtpReplyTo ?? "",
  };
}

/** Capture locale (Mailpit) en développement uniquement, si aucun SMTP n'est actif. */
function devCaptureConfig(): SmtpConfig | null {
  if (isProduction) return null;
  const url = process.env.DEV_MAIL_CAPTURE_URL;
  if (!url) return null;
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 1025),
    security: "none",
    user: "",
    password: "",
    fromEmail: "no-reply@mitc.local",
    fromName: "MiTC Projets (dev)",
    replyTo: "",
  };
}

export function brandFor(s: SettingsRow) {
  return { appName: s.appName, primaryColor: s.primaryColor, logoUrl: `${appUrl()}${s.logoPath}` };
}

/**
 * Envoie un e-mail applicatif avec la configuration SMTP active.
 * En cas d'échec, l'état « en échec » est enregistré pour avertir les administrateurs.
 */
export async function sendAppMail(organizationId: string, msg: MailMessage): Promise<void> {
  const s = await getSettingsRow(organizationId);
  const cfg = activeConfig(s);
  if (!cfg) {
    const dev = devCaptureConfig();
    if (dev) {
      await deliver(dev, msg);
      return;
    }
    if (!isProduction) {
      console.info(`[mail:console] À : ${msg.to}\nObjet : ${msg.subject}\n${msg.text}`);
      return;
    }
    throw new AppError("internal", "L'envoi d'e-mails n'est pas encore configuré. Contactez un administrateur.");
  }
  try {
    await deliver(cfg, msg);
    if (s.smtpStatus !== "ok")
      await db
        .update(orgSettings)
        .set({ smtpStatus: "ok", smtpLastError: null, smtpLastSuccessAt: new Date() })
        .where(eq(orgSettings.organizationId, organizationId));
  } catch (err) {
    const message = translateSmtpError(err);
    await db
      .update(orgSettings)
      .set({ smtpStatus: "failing", smtpLastError: message, smtpLastFailureAt: new Date() })
      .where(eq(orgSettings.organizationId, organizationId));
    console.error("[mail] échec d'envoi SMTP :", message);
    throw new AppError("internal", message);
  }
}

/**
 * Teste la configuration saisie en envoyant un e-mail, puis l'enregistre comme active
 * seulement si l'envoi réussit. La configuration active n'est jamais écrasée par une
 * configuration non testée.
 */
export async function testAndSaveSmtp(actor: Actor, input: SmtpInput): Promise<void> {
  if (actor.orgRole !== "admin") throw forbidden("Cette page est réservée aux administrateurs.");
  const s = await getSettingsRow(actor.organizationId);
  let password = input.newPassword ?? "";
  if (!password && s.smtpPasswordEnc) password = decryptSecret(s.smtpPasswordEnc);
  if (input.user && !password) throw invalid("Mot de passe SMTP requis pour cet identifiant.");
  const candidate: SmtpConfig = {
    host: input.host,
    port: input.port,
    security: input.security,
    user: input.user,
    password,
    fromEmail: input.fromEmail,
    fromName: input.fromName,
    replyTo: input.replyTo,
  };
  try {
    await deliver(candidate, { to: input.testRecipient, ...testEmail(brandFor(s)) });
  } catch (err) {
    const message = translateSmtpError(err);
    await writeAudit(db, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "settings.smtp.test_failed",
      details: { host: input.host, port: input.port, error: message },
    });
    throw invalid(message);
  }
  const fields: string[] = [];
  const cmp: [string, unknown, unknown][] = [
    ["host", s.smtpHost, input.host],
    ["port", s.smtpPort, input.port],
    ["security", s.smtpSecurity, input.security],
    ["user", s.smtpUser ?? "", input.user],
    ["fromEmail", s.smtpFromEmail, input.fromEmail],
    ["fromName", s.smtpFromName ?? "", input.fromName],
    ["replyTo", s.smtpReplyTo ?? "", input.replyTo],
  ];
  for (const [k, a, b] of cmp) if (a !== b) fields.push(k);
  if (input.newPassword) fields.push("password");
  await db.transaction(async (tx) => {
    await tx
      .update(orgSettings)
      .set({
        smtpHost: input.host,
        smtpPort: input.port,
        smtpSecurity: input.security,
        smtpUser: input.user || null,
        smtpPasswordEnc: password ? encryptSecret(password) : null,
        smtpFromEmail: input.fromEmail,
        smtpFromName: input.fromName || null,
        smtpReplyTo: input.replyTo || null,
        smtpStatus: "ok",
        smtpLastError: null,
        smtpLastSuccessAt: new Date(),
        updatedAt: new Date(),
        version: sql`${orgSettings.version} + 1`,
      })
      .where(eq(orgSettings.organizationId, actor.organizationId));
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "settings.smtp.activated",
      targetType: "settings",
      details: { fields },
    });
  });
}

/** Envoie un e-mail de test avec la configuration active (sans la modifier). */
export async function sendTestWithActive(actor: Actor, recipient: string): Promise<void> {
  if (actor.orgRole !== "admin") throw forbidden("Cette page est réservée aux administrateurs.");
  const s = await getSettingsRow(actor.organizationId);
  if (!activeConfig(s)) throw invalid("Aucune configuration SMTP active.");
  await sendAppMail(actor.organizationId, { to: recipient, ...testEmail(brandFor(s)) });
}
