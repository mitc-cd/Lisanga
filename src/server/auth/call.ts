import "server-only";
import { AppError } from "@/lib/errors";

/** Convertit une erreur d'endpoint Better Auth (APIError) en AppError lisible. */
export async function callAuth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e as { status?: string | number; body?: { message?: string; code?: string }; statusCode?: number };
    if (err?.body?.message) {
      const code = err.body.code === "rate_limited" || err.statusCode === 429 ? "rate_limited" : err.statusCode === 403 ? "forbidden" : "validation";
      throw new AppError(code, err.body.message);
    }
    throw e;
  }
}
