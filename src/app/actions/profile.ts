"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/auth/session";
import { parse, runAction } from "@/server/action";
import { updateMyName } from "@/server/users";

export async function updateMyNameAction(name: unknown) {
  return runAction(async () => {
    await updateMyName(await requireActor(), parse(z.string().trim().min(2, "Nom trop court.").max(100, "Nom trop long."), name));
    revalidatePath("/", "layout");
  });
}
