import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";

/** Dans une page : « introuvable » et « inaccessible » donnent la même page 404. */
export async function orNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
}
