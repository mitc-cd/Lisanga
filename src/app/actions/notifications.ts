"use server";
import { z } from "zod";
import { requireActor } from "@/server/auth/session";
import { parse, runAction } from "@/server/action";
import { markAllRead, setNotificationRead } from "@/server/notifications";

export async function setNotificationReadAction(id: unknown, read: boolean) {
  return runAction(async () => setNotificationRead(await requireActor(), parse(z.uuid(), id), Boolean(read)));
}

export async function markAllReadAction() {
  return runAction(async () => markAllRead(await requireActor()));
}
