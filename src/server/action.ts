import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AppError, type ActionResult } from "@/lib/errors";

/** Exécute une Server Action et convertit les erreurs en message français affichable. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { ok: false, error: e.message, code: e.code };
    console.error("[action] erreur inattendue", e);
    return { ok: false, error: "Une erreur inattendue s'est produite. Réessayez dans un instant.", code: "internal" };
  }
}

/** Validation Zod côté serveur : lève une AppError avec le premier message lisible. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new AppError("validation", r.error.issues[0]?.message ?? "Données invalides.");
  return r.data;
}
