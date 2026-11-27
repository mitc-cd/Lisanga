import "server-only";
import { and, count, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { invitations, loginChallenges, rateLimitEvents, users } from "@/db/schema";
import { hashToken, randomCode, randomToken, safeEqualHex } from "../crypto";
import { appUrl } from "../env";
import { getOrganizationId, getSettingsRow } from "../settings";
import { AppError } from "@/lib/errors";

export const MAX_CODE_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
export const LIMITS = {
  requestPerEmail: 5,
  requestPerIp: 20,
  verifyPerIp: 30,
};

export const GENERIC_CODE_ERROR = "Code invalide ou expiré. Vérifiez le code ou demandez-en un nouveau.";
export const GENERIC_LINK_ERROR = "Ce lien de connexion n'est plus valable (expiré ou déjà utilisé). Demandez-en un nouveau.";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Enregistre un événement et indique si la limite est dépassée sur la fenêtre glissante.
 * Retourne true si l'action est autorisée.
 */
export async function hitRateLimit(key: string, limit: number, dbx: DbOrTx = db): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  await dbx.insert(rateLimitEvents).values({ key });
  const [{ n }] = await dbx
    .select({ n: count() })
    .from(rateLimitEvents)
    .where(and(eq(rateLimitEvents.key, key), gt(rateLimitEvents.createdAt, since)));
  return n <= limit;
}

export async function purgeExpiredAuthData() {
  const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(rateLimitEvents).where(lt(rateLimitEvents.createdAt, new Date(Date.now() - WINDOW_MS)));
  await db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, old));
}

type Admission =
  | { kind: "user"; userId: string; organizationId: string }
  | { kind: "domain"; organizationId: string };

/**
 * Une adresse est admise si : compte actif ; compte invité dont l'invitation est valide ;
 * ou (aucun compte) domaine dans la liste des domaines admis automatiquement.
 * Un compte désactivé n'est jamais admis.
 */
export async function checkAdmission(email: string, dbx: DbOrTx = db): Promise<Admission | null> {
  const [user] = await dbx.select().from(users).where(eq(users.email, email));
  if (user) {
    if (user.status === "active") return { kind: "user", userId: user.id, organizationId: user.organizationId };
    if (user.status === "invited") {
      const [inv] = await dbx
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.userId, user.id),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .limit(1);
      return inv ? { kind: "user", userId: user.id, organizationId: user.organizationId } : null;
    }
    return null;
  }
  const orgId = await getOrganizationId(dbx);
  if (!orgId) return null;
  const s = await getSettingsRow(orgId, dbx);
  const domain = email.split("@")[1] ?? "";
  if (s.autoAdmitDomains.includes(domain)) return { kind: "domain", organizationId: orgId };
  return null;
}

export type IssuedChallenge = { email: string; code: string; link: string; minutes: number; organizationId: string };

/** Crée un défi (lien + code) et invalide les précédents pour cette adresse. */
export async function issueChallenge(email: string, organizationId: string, ip: string | null): Promise<IssuedChallenge> {
  const s = await getSettingsRow(organizationId);
  const code = randomCode();
  const token = randomToken(32);
  const minutes = s.codeTtlMinutes;
  await db.transaction(async (tx) => {
    await tx
      .update(loginChallenges)
      .set({ invalidatedAt: new Date() })
      .where(and(eq(loginChallenges.email, email), isNull(loginChallenges.consumedAt), isNull(loginChallenges.invalidatedAt)));
    await tx.insert(loginChallenges).values({
      email,
      codeHash: hashToken(`code:${email}:${code}`),
      linkTokenHash: hashToken(`link:${token}`),
      expiresAt: new Date(Date.now() + minutes * 60 * 1000),
      requestIp: ip,
    });
  });
  return {
    email,
    code,
    link: `${appUrl()}/connexion/lien?jeton=${encodeURIComponent(token)}`,
    minutes,
    organizationId,
  };
}

/**
 * Demande de connexion. Retourne le défi à envoyer, ou null si l'adresse n'est pas admise.
 * L'appelant affiche le même message dans tous les cas (aucune fuite d'existence de compte).
 */
export async function requestLogin(rawEmail: string, ip: string | null): Promise<IssuedChallenge | null> {
  const email = normalizeEmail(rawEmail);
  const okEmail = await hitRateLimit(`login-request:email:${email}`, LIMITS.requestPerEmail);
  const okIp = ip ? await hitRateLimit(`login-request:ip:${ip}`, LIMITS.requestPerIp) : true;
  if (!okEmail || !okIp)
    throw new AppError("rate_limited", "Trop de demandes de connexion. Patientez quelques minutes avant de réessayer.");
  const orgId = await getOrganizationId();
  if (!orgId) return null;
  const s = await getSettingsRow(orgId);
  if (!s.emailLoginEnabled) return null;
  const admission = await checkAdmission(email);
  if (!admission) return null;
  return issueChallenge(email, admission.organizationId, ip);
}

async function guardVerifyIp(ip: string | null) {
  if (ip && !(await hitRateLimit(`login-verify:ip:${ip}`, LIMITS.verifyPerIp)))
    throw new AppError("rate_limited", "Trop de tentatives. Patientez quelques minutes avant de réessayer.");
}

/** Vérifie un code à 6 chiffres. Retourne l'id utilisateur (compte créé/activé si besoin). */
export async function verifyLoginCode(rawEmail: string, code: string, ip: string | null): Promise<string> {
  await guardVerifyIp(ip);
  const email = normalizeEmail(rawEmail);
  if (!/^\d{6}$/.test(code)) throw new AppError("validation", GENERIC_CODE_ERROR);
  const [challenge] = await db
    .select()
    .from(loginChallenges)
    .where(
      and(
        eq(loginChallenges.email, email),
        isNull(loginChallenges.consumedAt),
        isNull(loginChallenges.invalidatedAt),
        gt(loginChallenges.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(loginChallenges.createdAt))
    .limit(1);
  if (!challenge) throw new AppError("validation", GENERIC_CODE_ERROR);
  if (!safeEqualHex(challenge.codeHash, hashToken(`code:${email}:${code}`))) {
    const [after] = await db
      .update(loginChallenges)
      .set({
        attempts: sql`${loginChallenges.attempts} + 1`,
        invalidatedAt: sql`case when ${loginChallenges.attempts} + 1 >= ${MAX_CODE_ATTEMPTS} then now() else null end`,
      })
      .where(eq(loginChallenges.id, challenge.id))
      .returning({ attempts: loginChallenges.attempts });
    if (after && after.attempts >= MAX_CODE_ATTEMPTS)
      throw new AppError("validation", "Trop d'essais erronés : ce code n'est plus valable. Demandez un nouveau code.");
    throw new AppError("validation", "Code incorrect. Vérifiez les 6 chiffres reçus par e-mail.");
  }
  return consumeAndFinalize(challenge.id, email, GENERIC_CODE_ERROR);
}

/** Vérifie le jeton du lien (appelé par le POST de la page de confirmation, jamais par un GET). */
export async function verifyLoginLink(token: string, ip: string | null): Promise<string> {
  await guardVerifyIp(ip);
  if (!token || token.length > 200) throw new AppError("validation", GENERIC_LINK_ERROR);
  const [challenge] = await db
    .select()
    .from(loginChallenges)
    .where(
      and(
        eq(loginChallenges.linkTokenHash, hashToken(`link:${token}`)),
        isNull(loginChallenges.consumedAt),
        isNull(loginChallenges.invalidatedAt),
        gt(loginChallenges.expiresAt, new Date()),
      ),
    );
  if (!challenge) throw new AppError("validation", GENERIC_LINK_ERROR);
  return consumeAndFinalize(challenge.id, challenge.email, GENERIC_LINK_ERROR);
}

/** Consomme le défi (usage unique, atomique) puis crée/active le compte. */
async function consumeAndFinalize(challengeId: string, email: string, errorMessage: string): Promise<string> {
  return db.transaction(async (tx) => {
    const consumed = await tx
      .update(loginChallenges)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(loginChallenges.id, challengeId),
          isNull(loginChallenges.consumedAt),
          isNull(loginChallenges.invalidatedAt),
          gt(loginChallenges.expiresAt, new Date()),
        ),
      )
      .returning({ id: loginChallenges.id });
    if (!consumed.length) throw new AppError("validation", errorMessage);
    const userId = await admitUser(tx, email);
    if (!userId) throw new AppError("validation", errorMessage);
    return userId;
  });
}

/**
 * Admission définitive au moment de la connexion (re-vérifiée : un compte a pu être
 * désactivé entre la demande et la saisie du code). Crée le compte pour un domaine admis,
 * active un compte invité. Retourne null si refusé.
 */
export async function admitUser(tx: DbOrTx, email: string): Promise<string | null> {
  const admission = await checkAdmission(email, tx);
  if (!admission) return null;
  const now = new Date();
  if (admission.kind === "domain") {
    const [created] = await tx
      .insert(users)
      .values({
        organizationId: admission.organizationId,
        email,
        name: email.split("@")[0],
        emailVerified: true,
        orgRole: "member",
        status: "active",
        lastLoginAt: now,
      })
      .returning({ id: users.id });
    return created.id;
  }
  await tx
    .update(users)
    .set({ status: "active", emailVerified: true, lastLoginAt: now, updatedAt: now })
    .where(eq(users.id, admission.userId));
  await tx
    .update(invitations)
    .set({ acceptedAt: now })
    .where(and(eq(invitations.userId, admission.userId), isNull(invitations.acceptedAt)));
  return admission.userId;
}
