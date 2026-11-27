"use server";
import { headers } from "next/headers";
import { getAuth } from "@/server/auth/auth";
import { callAuth } from "@/server/auth/call";
import { parse, runAction } from "@/server/action";
import { setupSchema } from "@/lib/validation/setup";

export async function completeSetupAction(input: unknown) {
  return runAction(async () => {
    const body = parse(setupSchema, input);
    const auth = await getAuth();
    const h = await headers();
    await callAuth(() => auth.api.mitcCompleteSetup({ body, headers: h }));
  });
}
