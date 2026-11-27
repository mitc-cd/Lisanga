import { describe, expect, it } from "vitest";
import { effectiveProjectRole, maxProjectRole } from "@/lib/permissions";
import { dueBucket, todayIso, formatDue } from "@/lib/dates";
import { extractMentionIds, mentionToken } from "@/lib/mentions";
import { translateSmtpError } from "@/server/mail/smtp-errors";
import { contrastRatio, readableOn } from "@/lib/colors";
import { decryptSecret, encryptSecret, hashToken, randomCode } from "@/server/crypto";

describe("rôle effectif dans un projet", () => {
  const base = { memberRole: null, orgRole: "member" as const, isExternal: false };
  it("membre du projet : son rôle", () => {
    expect(effectiveProjectRole({ ...base, visibility: "private", memberRole: "editor" })).toBe("editor");
    expect(effectiveProjectRole({ ...base, visibility: "private", memberRole: "owner" })).toBe("owner");
  });
  it("projet privé : aucun accès sans adhésion, même administrateur", () => {
    expect(effectiveProjectRole({ ...base, visibility: "private" })).toBeNull();
    expect(effectiveProjectRole({ ...base, visibility: "private", orgRole: "admin" })).toBeNull();
  });
  it("projet visible par l'organisation : lecture pour les internes, rien pour les externes", () => {
    expect(effectiveProjectRole({ ...base, visibility: "organization" })).toBe("viewer");
    expect(effectiveProjectRole({ ...base, visibility: "organization", isExternal: true })).toBeNull();
  });
  it("lecteur d'organisation plafonné à lecteur", () => {
    expect(effectiveProjectRole({ ...base, visibility: "private", memberRole: "owner", orgRole: "viewer" })).toBe("viewer");
    expect(maxProjectRole("viewer")).toBe("viewer");
    expect(maxProjectRole("member")).toBe("owner");
  });
});

describe("dates (Africa/Kinshasa, échéances calendaires)", () => {
  it("le jour courant suit le fuseau de Kinshasa (UTC+1)", () => {
    expect(todayIso(new Date("2026-11-26T23:30:00Z"))).toBe("2026-11-27");
    expect(todayIso(new Date("2026-11-27T22:59:00Z"))).toBe("2026-11-27");
  });
  it("regroupement par échéance", () => {
    const today = "2026-11-25"; // mercredi
    expect(dueBucket(null, today)).toBe("none");
    expect(dueBucket("2026-11-24", today)).toBe("overdue");
    expect(dueBucket("2026-11-25", today)).toBe("today");
    expect(dueBucket("2026-11-29", today)).toBe("week"); // dimanche
    expect(dueBucket("2026-11-30", today)).toBe("later"); // lundi suivant
  });
  it("le dimanche, « cette semaine » est vide", () => {
    expect(dueBucket("2026-11-30", "2026-11-29")).toBe("later");
  });
  it("libellés relatifs", () => {
    expect(formatDue("2026-11-25", "2026-11-25")).toBe("Aujourd'hui");
    expect(formatDue("2026-11-26", "2026-11-25")).toBe("Demain");
    expect(formatDue("2026-11-24", "2026-11-25")).toBe("Hier");
  });
});

describe("mentions", () => {
  it("extrait les identifiants sans doublon", () => {
    const id = "0b3d91aa-0000-4000-8000-000000000001";
    const body = `${mentionToken("Awa [K]", id)} et ${mentionToken("Awa", id)}`;
    expect(body).toContain("@[Awa K]");
    expect(extractMentionIds(body)).toEqual([id]);
  });
});

describe("erreurs SMTP traduites", () => {
  it("cas courants", () => {
    expect(translateSmtpError({ code: "EAUTH", responseCode: 535 })).toMatch(/Authentification refusée/);
    expect(translateSmtpError({ code: "EDNS", message: "getaddrinfo ENOTFOUND x" })).toMatch(/introuvable/);
    expect(translateSmtpError({ code: "ESOCKET", errors: [{ code: "ECONNREFUSED" }] })).toMatch(/Connexion refusée/);
    expect(translateSmtpError({ code: "ETIMEDOUT" })).toMatch(/Délai dépassé/);
    expect(translateSmtpError({ code: "ESOCKET", message: "wrong version number" })).toMatch(/chiffrement/);
    expect(translateSmtpError({})).toMatch(/L'envoi a échoué/);
  });
});

describe("couleurs et contrastes", () => {
  it("l'orange MiTC n'est pas lisible en texte sur blanc", () => {
    expect(contrastRatio("#F5A623", "#ffffff")).toBeLessThan(3);
    expect(contrastRatio("#0B3D91", "#ffffff")).toBeGreaterThan(7);
    expect(readableOn("#F5A623")).toBe("#1a2233");
    expect(readableOn("#0B3D91")).toBe("#ffffff");
  });
});

describe("chiffrement des secrets", () => {
  it("AES-256-GCM aller-retour, IV aléatoire, falsification détectée", () => {
    const a = encryptSecret("mot de passe SMTP");
    const b = encryptSecret("mot de passe SMTP");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toContain("mot de passe");
    expect(decryptSecret(a)).toBe("mot de passe SMTP");
    const tampered = "v1:" + Buffer.from(Buffer.from(a.slice(3), "base64").map((x, i) => (i === 40 ? x ^ 1 : x))).toString("base64");
    expect(() => decryptSecret(tampered)).toThrow();
  });
  it("hachage déterministe et codes à 6 chiffres", () => {
    expect(hashToken("x")).toBe(hashToken("x"));
    expect(hashToken("x")).not.toBe(hashToken("y"));
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });
});
