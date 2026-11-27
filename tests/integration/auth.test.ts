/** Sécurité de la connexion par e-mail et de l'installation. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { invitations, loginChallenges, orgSettings, sessions, users } from "@/db/schema";
import { LIMITS, MAX_CODE_ATTEMPTS, requestLogin, verifyLoginCode, verifyLoginLink } from "@/server/auth/email-login";
import { completeSetup, createSetupToken, hasAdmin, isValidSetupToken } from "@/server/setup";
import { deactivateUser, inviteUser } from "@/server/users";
import { createOrg, expectCode, makeUser, resetDb } from "./helpers";

afterAll(closeDb);

let org: { id: string };
let ip = 0;
const nextIp = () => `10.0.0.${++ip % 250}`;

beforeEach(async () => {
  await resetDb();
  org = await createOrg();
});

const tokenFromLink = (link: string) => new URL(link).searchParams.get("jeton")!;

describe("demande de connexion", () => {
  it("adresse inconnue : aucun défi créé, aucune erreur (pas de fuite d'existence)", async () => {
    await expect(requestLogin("inconnu@ailleurs.test", nextIp())).resolves.toBeNull();
    expect(await db.select().from(loginChallenges)).toHaveLength(0);
  });
  it("adresse connue : un défi lien + code, valable 10 minutes, stocké haché", async () => {
    const u = await makeUser(org.id);
    const c = await requestLogin(u.email.toUpperCase(), nextIp());
    expect(c).not.toBeNull();
    expect(c!.code).toMatch(/^\d{6}$/);
    expect(c!.minutes).toBe(10);
    const [row] = await db.select().from(loginChallenges);
    expect(row!.codeHash).not.toContain(c!.code);
    expect(row!.linkTokenHash).not.toBe(tokenFromLink(c!.link));
    expect(row!.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(row!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000);
  });
  it("adresse non invitée d'un domaine non autorisé : refusée silencieusement", async () => {
    await expect(requestLogin("quelquun@mitc.cd", nextIp())).resolves.toBeNull();
  });
  it("domaine admis automatiquement : compte créé à la connexion (rôle membre)", async () => {
    await db.update(orgSettings).set({ autoAdmitDomains: ["mitc.cd"] }).where(eq(orgSettings.organizationId, org.id));
    const c = await requestLogin("nouveau@mitc.cd", nextIp());
    const userId = await verifyLoginCode("nouveau@mitc.cd", c!.code, nextIp());
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u).toMatchObject({ email: "nouveau@mitc.cd", orgRole: "member", status: "active" });
  });
  it("compte désactivé : refusé", async () => {
    const u = await makeUser(org.id, { status: "deactivated" });
    await expect(requestLogin(u.email, nextIp())).resolves.toBeNull();
  });
  it("connexion par e-mail désactivée par l'administrateur : aucun défi", async () => {
    const u = await makeUser(org.id);
    await db.update(orgSettings).set({ emailLoginEnabled: false });
    await expect(requestLogin(u.email, nextIp())).resolves.toBeNull();
  });
  it(`limitation : ${LIMITS.requestPerEmail} demandes / 15 min par adresse (connue ou non)`, async () => {
    for (let i = 0; i < LIMITS.requestPerEmail; i++) await requestLogin("x@y.test", nextIp());
    await expectCode(requestLogin("x@y.test", nextIp()), "rate_limited");
  });
  it(`limitation : ${LIMITS.requestPerIp} demandes / 15 min par IP`, async () => {
    for (let i = 0; i < LIMITS.requestPerIp; i++) await requestLogin(`a${i}@y.test`, "192.168.1.1");
    await expectCode(requestLogin("autre@y.test", "192.168.1.1"), "rate_limited");
  });
});

describe("vérification du code", () => {
  it("code correct : connexion, puis réutilisation refusée", async () => {
    const u = await makeUser(org.id);
    const c = await requestLogin(u.email, nextIp());
    await expect(verifyLoginCode(u.email, c!.code, nextIp())).resolves.toBe(u.id);
    await expectCode(verifyLoginCode(u.email, c!.code, nextIp()), "validation");
  });
  it("code expiré : refusé", async () => {
    const u = await makeUser(org.id);
    const c = await requestLogin(u.email, nextIp());
    await db.update(loginChallenges).set({ expiresAt: new Date(Date.now() - 1000) });
    await expectCode(verifyLoginCode(u.email, c!.code, nextIp()), "validation");
  });
  it(`${MAX_CODE_ATTEMPTS} essais erronés : code invalidé, même le bon code échoue ensuite`, async () => {
    const u = await makeUser(org.id);
    const c = await requestLogin(u.email, nextIp());
    const wrong = c!.code === "000000" ? "111111" : "000000";
    for (let i = 1; i < MAX_CODE_ATTEMPTS; i++) {
      const e = await expectCode(verifyLoginCode(u.email, wrong, nextIp()), "validation");
      expect(e.message).toMatch(/Code incorrect/);
    }
    const last = await expectCode(verifyLoginCode(u.email, wrong, nextIp()), "validation");
    expect(last.message).toMatch(/Trop d'essais/);
    await expectCode(verifyLoginCode(u.email, c!.code, nextIp()), "validation");
  });
  it("une nouvelle demande invalide l'ancien code", async () => {
    const u = await makeUser(org.id);
    const c1 = await requestLogin(u.email, nextIp());
    const c2 = await requestLogin(u.email, nextIp());
    if (c1!.code !== c2!.code) await expectCode(verifyLoginCode(u.email, c1!.code, nextIp()), "validation");
    await expectCode(verifyLoginLink(tokenFromLink(c1!.link), nextIp()), "validation");
    await expect(verifyLoginCode(u.email, c2!.code, nextIp())).resolves.toBe(u.id);
  });
  it("le code d'une adresse ne fonctionne pas pour une autre", async () => {
    const a = await makeUser(org.id);
    const b = await makeUser(org.id);
    const c = await requestLogin(a.email, nextIp());
    await requestLogin(b.email, nextIp());
    await expectCode(verifyLoginCode(b.email, c!.code, nextIp()), "validation");
  });
  it("compte désactivé entre la demande et la saisie : refusé", async () => {
    const admin = await makeUser(org.id, { role: "admin" });
    const u = await makeUser(org.id);
    const c = await requestLogin(u.email, nextIp());
    await deactivateUser(admin, u.id);
    await expectCode(verifyLoginCode(u.email, c!.code, nextIp()), "validation");
  });
  it(`limitation : ${LIMITS.verifyPerIp} vérifications / 15 min par IP`, async () => {
    for (let i = 0; i < LIMITS.verifyPerIp; i++) await verifyLoginCode("x@y.test", "123456", "172.16.0.1").catch(() => undefined);
    await expectCode(verifyLoginCode("x@y.test", "123456", "172.16.0.1"), "rate_limited");
  });
});

describe("lien de connexion", () => {
  it("usage unique ; consommer le lien invalide aussi le code (même défi)", async () => {
    const u = await makeUser(org.id);
    const c = await requestLogin(u.email, nextIp());
    await expect(verifyLoginLink(tokenFromLink(c!.link), nextIp())).resolves.toBe(u.id);
    await expectCode(verifyLoginLink(tokenFromLink(c!.link), nextIp()), "validation");
    await expectCode(verifyLoginCode(u.email, c!.code, nextIp()), "validation");
  });
  it("lien expiré ou falsifié : refusé", async () => {
    const u = await makeUser(org.id);
    const c = await requestLogin(u.email, nextIp());
    await expectCode(verifyLoginLink(tokenFromLink(c!.link) + "x", nextIp()), "validation");
    await db.update(loginChallenges).set({ expiresAt: new Date(Date.now() - 1000) });
    await expectCode(verifyLoginLink(tokenFromLink(c!.link), nextIp()), "validation");
  });
});

describe("invitations", () => {
  it("un invité peut se connecter ; son compte devient actif et l'invitation acceptée", async () => {
    const admin = await makeUser(org.id, { role: "admin" });
    const r = await inviteUser(admin, { email: "invite@externe.test", orgRole: "member", isExternal: false });
    expect(r.emailSent).toBe(true); // capture locale (Mailpit) en test
    const c = await requestLogin("invite@externe.test", nextIp());
    await verifyLoginCode("invite@externe.test", c!.code, nextIp());
    const [u] = await db.select().from(users).where(eq(users.id, r.userId));
    expect(u!.status).toBe("active");
    const [inv] = await db.select().from(invitations).where(eq(invitations.userId, r.userId));
    expect(inv!.acceptedAt).not.toBeNull();
  });
  it("invitation expirée ou annulée : connexion refusée", async () => {
    const admin = await makeUser(org.id, { role: "admin" });
    const r = await inviteUser(admin, { email: "expire@externe.test", orgRole: "member", isExternal: false });
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.userId, r.userId));
    await expect(requestLogin("expire@externe.test", nextIp())).resolves.toBeNull();
  });
  it("seul un administrateur peut inviter", async () => {
    const m = await makeUser(org.id);
    await expectCode(inviteUser(m, { email: "z@z.test", orgRole: "admin", isExternal: false }), "forbidden");
  });
});

describe("désactivation", () => {
  it("révoque immédiatement toutes les sessions", async () => {
    const admin = await makeUser(org.id, { role: "admin" });
    const u = await makeUser(org.id);
    await db.insert(sessions).values([
      { token: "t1-" + u.id, userId: u.id, expiresAt: new Date(Date.now() + 86400_000) },
      { token: "t2-" + u.id, userId: u.id, expiresAt: new Date(Date.now() + 86400_000) },
    ]);
    await deactivateUser(admin, u.id);
    expect(await db.select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
  });
  it("le dernier administrateur ne peut pas être désactivé ; on ne se désactive pas soi-même", async () => {
    const a1 = await makeUser(org.id, { role: "admin" });
    const a2 = await makeUser(org.id, { role: "admin" });
    await expectCode(deactivateUser(a1, a1.id), "validation");
    await deactivateUser(a1, a2.id);
    const [still] = await db.select().from(users).where(and(eq(users.id, a1.id), eq(users.status, "active")));
    expect(still).toBeTruthy();
  });
});

describe("assistant d'installation", () => {
  beforeEach(resetDb);
  it("jeton généré : usage unique ; assistant désactivé dès qu'un administrateur existe", async () => {
    expect(await hasAdmin()).toBe(false);
    const token = await createSetupToken();
    expect(await isValidSetupToken(token)).toBe(true);
    expect(await isValidSetupToken("mauvais-jeton-de-test-123")).toBe(false);
    await completeSetup({ token, organizationName: "MiTC", name: "Première Admin", email: "Admin@MiTC.cd" });
    expect(await hasAdmin()).toBe(true);
    const [u] = await db.select().from(users);
    expect(u).toMatchObject({ email: "admin@mitc.cd", orgRole: "admin", status: "active" });
    await expectCode(completeSetup({ token, organizationName: "X", name: "Pirate", email: "pirate@x.test" }), "forbidden");
    await expect(createSetupToken()).rejects.toThrow(/déjà/);
  });
  it("jeton invalide : refusé, aucun compte créé", async () => {
    await expectCode(completeSetup({ token: "jeton-invalide-0123456789", organizationName: "X", name: "Y", email: "y@y.test" }), "forbidden");
    expect(await hasAdmin()).toBe(false);
  });
  it("jeton par variable d'environnement SETUP_TOKEN", async () => {
    process.env.SETUP_TOKEN = "env-token-0123456789abcdef";
    try {
      await completeSetup({ token: "env-token-0123456789abcdef", organizationName: "MiTC", name: "Admin Env", email: "env@mitc.cd" });
      expect(await hasAdmin()).toBe(true);
      await expectCode(completeSetup({ token: "env-token-0123456789abcdef", organizationName: "MiTC", name: "B", email: "b@mitc.cd" }), "forbidden");
    } finally {
      delete process.env.SETUP_TOKEN;
    }
  });
  it("deux installations simultanées : un seul administrateur", async () => {
    const t1 = await createSetupToken();
    const t2 = await createSetupToken();
    const results = await Promise.allSettled([
      completeSetup({ token: t1, organizationName: "MiTC", name: "A", email: "a@mitc.cd" }),
      completeSetup({ token: t2, organizationName: "MiTC", name: "B", email: "b@mitc.cd" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.orgRole, "admin"))).toHaveLength(1);
  });
});
