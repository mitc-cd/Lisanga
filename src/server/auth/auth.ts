import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { decryptSecret } from "../crypto";
import { appUrl } from "../env";
import { getOrganizationId, getSettingsRow, isEntraUsable, type SettingsRow } from "../settings";
import { checkAdmission, normalizeEmail } from "./email-login";
import { mitcAuthPlugin } from "./plugin";

function entraProvider(s: SettingsRow | null) {
  if (!s || !isEntraUsable(s)) return {};
  return {
    microsoft: {
      clientId: s.entraClientId!,
      clientSecret: decryptSecret(s.entraSecretEnc!),
      // Tenant explicite : Better Auth vérifie que l'émetteur du jeton est ce tenant.
      tenantId: s.entraTenantId!,
      disableProfilePhoto: true,
      mapProfileToUser: (p: Record<string, unknown>) => {
        const raw = (p.email ?? p.preferred_username ?? p.upn ?? "") as string;
        // Adresses gérées par l'administrateur du tenant MiTC : considérées vérifiées (cf. DECISIONS.md).
        return { email: normalizeEmail(raw), emailVerified: true, name: (p.name as string) ?? raw };
      },
    },
  };
}

function buildAuth(s: SettingsRow | null) {
  return betterAuth({
    appName: s?.appName ?? "MiTC Projets",
    baseURL: appUrl(),
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [appUrl()],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: (s?.sessionDays ?? 30) * 24 * 60 * 60,
      updateAge: 24 * 60 * 60, // expiration glissante : prolongée au plus une fois par jour
    },
    user: {
      additionalFields: {
        organizationId: { type: "string", required: false, input: false },
        orgRole: { type: "string", required: false, input: false },
        status: { type: "string", required: false, input: false },
      },
      // Admission pour Entra ID : compte existant admis, ou domaine autorisé.
      validateUserInfo: async ({ user }) => {
        const email = typeof user.email === "string" ? normalizeEmail(user.email) : "";
        if (!email || !(await checkAdmission(email)))
          return { error: "Accès non autorisé : demandez une invitation à un administrateur." };
      },
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["microsoft"] },
    },
    socialProviders: entraProvider(s),
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const orgId = await getOrganizationId();
            if (!orgId) return false;
            return {
              data: {
                ...user,
                email: normalizeEmail(user.email),
                organizationId: orgId,
                orgRole: "member",
                status: "active",
                emailVerified: true,
              },
            };
          },
        },
      },
      session: {
        create: {
          // Point de passage commun aux deux modes : un compte désactivé n'obtient jamais de session.
          before: async (session) => {
            const [u] = await db.select().from(users).where(eq(users.id, session.userId as string));
            if (!u || u.status === "deactivated") return false;
            if (u.status === "invited" || !u.lastLoginAt || Date.now() - u.lastLoginAt.getTime() > 60_000)
              await db
                .update(users)
                .set({ status: "active", emailVerified: true, lastLoginAt: new Date() })
                .where(eq(users.id, u.id));
          },
        },
      },
    },
    plugins: [mitcAuthPlugin(), nextCookies()],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

const g = globalThis as unknown as { __mitcAuth?: { key: string; auth: Auth; checkedAt: number } };
const RECHECK_MS = 15_000;

/**
 * Instance Better Auth reconstruite quand les paramètres changent (durée de session, Entra ID).
 * La version des paramètres est relue au plus toutes les 15 s par instance serveur.
 */
export async function getAuth(): Promise<Auth> {
  const c = g.__mitcAuth;
  if (c && Date.now() - c.checkedAt < RECHECK_MS) return c.auth;
  const orgId = await getOrganizationId();
  const s = orgId ? await getSettingsRow(orgId) : null;
  const key = s ? `v${s.version}` : "none";
  if (c && c.key === key) {
    c.checkedAt = Date.now();
    return c.auth;
  }
  const auth = buildAuth(s);
  g.__mitcAuth = { key, auth, checkedAt: Date.now() };
  return auth;
}

export function invalidateAuthCache() {
  g.__mitcAuth = undefined;
}
