"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/auth";
import { requireActor } from "@/server/auth/session";
import { signOutEverywhere } from "@/server/users";

export async function signOutAction() {
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  redirect("/connexion");
}

export async function signOutEverywhereAction() {
  const actor = await requireActor();
  await signOutEverywhere(actor);
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  redirect("/connexion?deconnecte=1");
}
