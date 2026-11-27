/**
 * Génère un jeton d'installation à usage unique (valable 24 h) et affiche l'URL de l'assistant.
 * Usage : pnpm setup:admin
 */
import "./env";
import { closeDb } from "@/db";
import { createSetupToken } from "@/server/setup";
import { appUrl } from "@/server/env";

async function main() {
  const token = await createSetupToken();
  console.log("\nJeton d'installation (usage unique, valable 24 h) :\n");
  console.log("  " + token);
  console.log(`\nOuvrez : ${appUrl()}/installation?jeton=${token}\n`);
}
main()
  .catch((e) => {
    console.error("Erreur :", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
