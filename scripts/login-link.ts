/**
 * Secours : crée un lien et un code de connexion pour un ADMINISTRATEUR actif, sans e-mail
 * (par exemple si le SMTP est en panne). À exécuter sur un poste ayant accès à la base.
 * Usage : pnpm login-link admin@mitc.cd
 */
import "./env";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { issueChallenge, normalizeEmail } from "@/server/auth/email-login";

async function main() {
  const email = normalizeEmail(process.argv[2] ?? "");
  if (!email) throw new Error("Usage : pnpm login-link <adresse e-mail d'un administrateur>");
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u || u.orgRole !== "admin" || u.status !== "active") throw new Error("Aucun administrateur actif avec cette adresse.");
  const c = await issueChallenge(email, u.organizationId, "cli");
  console.log(`\nLien de connexion (valable ${c.minutes} min, usage unique) :\n  ${c.link}\nCode : ${c.code}\n`);
  console.log("Après connexion, vérifiez la configuration SMTP dans Administration → Paramètres.\n");
}
main()
  .catch((e) => {
    console.error("Erreur :", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
