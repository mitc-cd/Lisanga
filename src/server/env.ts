import "server-only";

export const isProduction = process.env.NODE_ENV === "production";

/** Vrai uniquement pour les exécutions de tests automatisés hors production. */
export function appUrl(): string {
  return (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}
