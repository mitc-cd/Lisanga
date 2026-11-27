/** Paramètres d'administration : accès, secrets, test SMTP (Mailpit), journal d'audit. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { auditLogs, orgSettings } from "@/db/schema";
import { getAdminSettings, getPublicSettings, updateBranding, updateEntra, updateLoginSettings } from "@/server/settings";
import { sendAppMail, testAndSaveSmtp } from "@/server/mail/send";
import { decryptSecret } from "@/server/crypto";
import type { Actor } from "@/server/actor";
import { createOrg, expectCode, makeUser, resetDb } from "./helpers";

const MAILPIT = "http://localhost:18025/api/v1";
let admin: Actor;
let member: Actor;
let viewer: Actor;
let orgId: string;
const SMTP_PASSWORD = "S3cret-SMTP-ne-jamais-afficher";
const ENTRA_SECRET = "Entra~Secret~ne-jamais-afficher";

const smtpInput = (over: Partial<Parameters<typeof testAndSaveSmtp>[1]> = {}) => ({
  host: "localhost",
  port: 11025,
  security: "none" as const,
  user: "compte-smtp",
  newPassword: SMTP_PASSWORD,
  fromEmail: "projets@mitc.test",
  fromName: "MiTC Projets",
  replyTo: "",
  testRecipient: `admin-${Date.now()}@mitc.test`,
  ...over,
});

beforeAll(async () => {
  await resetDb();
  orgId = (await createOrg()).id;
  admin = await makeUser(orgId, { role: "admin" });
  member = await makeUser(orgId);
  viewer = await makeUser(orgId, { role: "viewer" });
});
afterAll(closeDb);

describe("accès réservé aux administrateurs", () => {
  for (const who of ["member", "viewer"] as const) {
    it(`${who} : ni lecture ni modification`, async () => {
      const a = who === "member" ? member : viewer;
      await expectCode(getAdminSettings(a), "forbidden");
      await expectCode(updateLoginSettings(a, { emailLoginEnabled: true, codeTtlMinutes: 10, sessionDays: 30, autoAdmitDomains: ["pirate.test"] }), "forbidden");
      await expectCode(updateBranding(a, { appName: "Pirate", primaryColor: "#000000", secondaryColor: "#000000", accentColor: "#000000" }), "forbidden");
      await expectCode(updateEntra(a, { tenantId: "", clientId: "", enabled: false, newSecret: "x" }), "forbidden");
      await expectCode(testAndSaveSmtp(a, smtpInput()), "forbidden");
    });
  }
});

describe("SMTP : test avant activation", () => {
  it("l'e-mail de test part via Mailpit et la configuration devient active", async () => {
    const input = smtpInput();
    await testAndSaveSmtp(admin, input);
    const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${input.testRecipient}"`)}`);
    const body = (await res.json()) as { messages: { Subject: string }[] };
    expect(body.messages[0]?.Subject).toMatch(/e-mail de test/);
    const view = await getAdminSettings(admin);
    expect(view.smtp).toMatchObject({ host: "localhost", port: 11025, status: "ok", passwordSet: true });
  });
  it("le mot de passe est chiffré en base et n'est jamais renvoyé", async () => {
    const [row] = await db.select().from(orgSettings).where(eq(orgSettings.organizationId, orgId));
    expect(row!.smtpPasswordEnc).toMatch(/^v1:/);
    expect(row!.smtpPasswordEnc).not.toContain(SMTP_PASSWORD);
    expect(decryptSecret(row!.smtpPasswordEnc!)).toBe(SMTP_PASSWORD);
    const json = JSON.stringify(await getAdminSettings(admin)) + JSON.stringify(await getPublicSettings());
    expect(json).not.toContain(SMTP_PASSWORD);
    expect(json).not.toContain(row!.smtpPasswordEnc!);
    expect(json).not.toMatch(/passwordEnc|secretEnc/);
  });
  it("une configuration en échec n'écrase pas la dernière configuration fonctionnelle", async () => {
    await expect(testAndSaveSmtp(admin, smtpInput({ port: 1, newPassword: "autre" }))).rejects.toMatchObject({
      code: "validation",
      message: expect.stringMatching(/Connexion refusée/),
    });
    const view = await getAdminSettings(admin);
    expect(view.smtp.port).toBe(11025);
    const [row] = await db.select().from(orgSettings).where(eq(orgSettings.organizationId, orgId));
    expect(decryptSecret(row!.smtpPasswordEnc!)).toBe(SMTP_PASSWORD);
  });
  it("mot de passe laissé vide : l'ancien est conservé", async () => {
    await testAndSaveSmtp(admin, smtpInput({ newPassword: undefined, fromName: "MiTC (modifié)" }));
    const [row] = await db.select().from(orgSettings).where(eq(orgSettings.organizationId, orgId));
    expect(decryptSecret(row!.smtpPasswordEnc!)).toBe(SMTP_PASSWORD);
    expect(row!.smtpFromName).toBe("MiTC (modifié)");
  });
  it("un envoi en échec avec la configuration active avertit l'administrateur", async () => {
    await db.update(orgSettings).set({ smtpPort: 1 }).where(eq(orgSettings.organizationId, orgId));
    await expect(sendAppMail(orgId, { to: "x@mitc.test", subject: "s", html: "h", text: "t" })).rejects.toBeTruthy();
    expect((await getAdminSettings(admin)).smtp).toMatchObject({ status: "failing", lastError: expect.stringMatching(/Connexion refusée/) });
    await db.update(orgSettings).set({ smtpPort: 11025 }).where(eq(orgSettings.organizationId, orgId));
    await sendAppMail(orgId, { to: "x@mitc.test", subject: "s", html: "h", text: "t" });
    expect((await getAdminSettings(admin)).smtp.status).toBe("ok");
  });
});

describe("Entra ID : enregistrer, tester, activer", () => {
  it("secret chiffré, jamais renvoyé ; activation impossible sans test réussi", async () => {
    const tenant = "11111111-2222-4333-8444-555555555555";
    const client = "66666666-7777-4888-8999-000000000000";
    await updateEntra(admin, { tenantId: tenant, clientId: client, newSecret: ENTRA_SECRET, enabled: false });
    const view = await getAdminSettings(admin);
    expect(view.entra).toMatchObject({ tenantId: tenant, clientId: client, secretSet: true, enabled: false });
    expect(JSON.stringify(view)).not.toContain(ENTRA_SECRET);
    await expectCode(updateEntra(admin, { tenantId: tenant, clientId: client, enabled: true }), "validation");
    expect((await getPublicSettings()).entraEnabled).toBe(false);
    // Simule un test réussi : l'activation devient possible et le bouton apparaît
    await db.update(orgSettings).set({ entraLastTestOk: true });
    await updateEntra(admin, { tenantId: tenant, clientId: client, enabled: true });
    expect((await getPublicSettings()).entraEnabled).toBe(true);
    // Changer un identifiant désactive Entra et invalide le test
    await updateEntra(admin, { tenantId: tenant, clientId: "66666666-7777-4888-8999-000000000001", enabled: true });
    expect((await getAdminSettings(admin)).entra).toMatchObject({ enabled: false, lastTestOk: null });
  });
});

describe("connexion et journal d'audit", () => {
  it("impossible de désactiver la connexion par e-mail sans Entra actif", async () => {
    await expectCode(updateLoginSettings(admin, { emailLoginEnabled: false, codeTtlMinutes: 10, sessionDays: 30, autoAdmitDomains: [] }), "validation");
  });
  it("chaque modification est journalisée (qui, quoi, champs) sans valeur de secret", async () => {
    await updateLoginSettings(admin, { emailLoginEnabled: true, codeTtlMinutes: 15, sessionDays: 14, autoAdmitDomains: ["mitc.cd"] });
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.organizationId, orgId)).orderBy(desc(auditLogs.id));
    expect(logs[0]).toMatchObject({ action: "settings.login.updated", actorId: admin.id });
    expect((logs[0]!.details as { fields: string[] }).fields).toEqual(expect.arrayContaining(["codeTtlMinutes", "sessionDays", "autoAdmitDomains"]));
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["settings.smtp.activated", "settings.smtp.test_failed", "settings.entra.updated"]));
    const all = JSON.stringify(logs);
    expect(all).not.toContain(SMTP_PASSWORD);
    expect(all).not.toContain(ENTRA_SECRET);
    const activations = logs.filter((l) => l.action === "settings.smtp.activated").map((l) => (l.details as { fields: string[] }).fields);
    expect(activations.at(-1)).toContain("password"); // première activation : mot de passe défini
    expect(activations[0]).toEqual(["fromName"]); // dernière : seul le nom d'expéditeur a changé
  });
});
