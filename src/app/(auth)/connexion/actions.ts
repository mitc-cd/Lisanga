"use server";
import { after } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/server/auth/auth";
import { callAuth } from "@/server/auth/call";
import { clientIp } from "@/server/auth/client-ip";
import { requestLogin } from "@/server/auth/email-login";
import { parse, runAction } from "@/server/action";
import { getSettingsRow } from "@/server/settings";
import { brandFor, sendAppMail } from "@/server/mail/send";
import { loginEmail } from "@/server/mail/templates";
import { codeSchema, emailSchema } from "@/lib/validation/auth";
import { z } from "zod";

/**
 * Demande de connexion : même réponse que l'adresse soit connue ou non. L'e-mail est
 * envoyé après la réponse (temps de réponse identique dans les deux cas).
 */
export async function requestLoginAction(rawEmail: unknown) {
  return runAction(async () => {
    const email = parse(emailSchema, rawEmail);
    const challenge = await requestLogin(email, clientIp(await headers()));
    if (challenge)
      after(async () => {
        try {
          const s = await getSettingsRow(challenge.organizationId);
          await sendAppMail(challenge.organizationId, { to: challenge.email, ...loginEmail(brandFor(s), challenge) });
        } catch (e) {
          console.error("[connexion] envoi du code impossible :", e instanceof Error ? e.message : e);
        }
      });
    return { email };
  });
}

export async function verifyCodeAction(rawEmail: unknown, rawCode: unknown) {
  return runAction(async () => {
    const email = parse(emailSchema, rawEmail);
    const code = parse(codeSchema, rawCode);
    const auth = await getAuth();
    const h = await headers();
    await callAuth(() => auth.api.mitcVerifyCode({ body: { email, code }, headers: h }));
  });
}

export async function verifyLinkAction(rawToken: unknown) {
  return runAction(async () => {
    const token = parse(z.string().min(10).max(200), rawToken);
    const auth = await getAuth();
    const h = await headers();
    await callAuth(() => auth.api.mitcVerifyLink({ body: { token }, headers: h }));
  });
}
