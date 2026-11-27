export type ErrorCode = "not_found" | "forbidden" | "conflict" | "validation" | "rate_limited" | "unauthenticated" | "internal";

/** Erreur métier : son message (en français) peut être montré tel quel à l'utilisateur. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Élément") => new AppError("not_found", `${what} introuvable ou inaccessible.`);
export const forbidden = (msg = "Vous n'avez pas les droits nécessaires pour cette action.") => new AppError("forbidden", msg);
export const conflict = (msg = "Cet élément a été modifié entre-temps. Les données ont été rechargées, réessayez.") =>
  new AppError("conflict", msg);
export const invalid = (msg: string) => new AppError("validation", msg);

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code: ErrorCode };
