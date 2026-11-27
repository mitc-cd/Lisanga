import "server-only";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { completeSetup } from "../setup";
import { setupSchema } from "@/lib/validation/setup";
import { clientIp } from "./client-ip";
import { verifyLoginCode, verifyLoginLink } from "./email-login";

/**
 * Plugin MiTC : connexion par e-mail (un défi = un lien + un code) et finalisation de
 * l'installation. La logique métier vit dans email-login.ts / setup.ts ; ici on ne fait
 * que créer la session Better Auth et poser le cookie.
 */
export const mitcAuthPlugin = () =>
  ({
    id: "mitc-email-login",
    endpoints: {
      mitcVerifyCode: createAuthEndpoint(
        "/mitc/verify-code",
        { method: "POST", body: z.object({ email: z.string().max(254), code: z.string().max(20) }) },
        async (ctx) => {
          const userId = await run(() => verifyLoginCode(ctx.body.email, ctx.body.code, clientIp(ctx.headers)));
          return startSession(ctx, userId);
        },
      ),
      mitcVerifyLink: createAuthEndpoint(
        "/mitc/verify-link",
        { method: "POST", body: z.object({ token: z.string().max(200) }) },
        async (ctx) => {
          const userId = await run(() => verifyLoginLink(ctx.body.token, clientIp(ctx.headers)));
          return startSession(ctx, userId);
        },
      ),
      mitcCompleteSetup: createAuthEndpoint("/mitc/complete-setup", { method: "POST", body: setupSchema }, async (ctx) => {
        const userId = await run(() => completeSetup(ctx.body));
        return startSession(ctx, userId);
      }),
    },
  }) satisfies BetterAuthPlugin;

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.code === "rate_limited" ? "TOO_MANY_REQUESTS" : e.code === "forbidden" ? "FORBIDDEN" : "BAD_REQUEST";
      throw new APIError(status, { message: e.message, code: e.code });
    }
    throw e;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- contexte d'endpoint Better Auth
async function startSession(ctx: any, userId: string) {
  const user = await ctx.context.internalAdapter.findUserById(userId);
  if (!user) throw new APIError("BAD_REQUEST", { message: "Compte introuvable." });
  const session = await ctx.context.internalAdapter.createSession(userId);
  if (!session) throw new APIError("FORBIDDEN", { message: "Connexion refusée." });
  await setSessionCookie(ctx, { session, user });
  return ctx.json({ ok: true });
}
