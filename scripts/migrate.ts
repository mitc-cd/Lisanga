/** Applique les migrations SQL versionnées (dossier drizzle/). */
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  // Utiliser l'URL directe (non poolée) si disponible : les migrations ont besoin d'une session stable.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas défini.");
  const pool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
  console.log("Migrations appliquées.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
