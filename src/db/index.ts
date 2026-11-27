import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Connexion PostgreSQL.
 * - Serverless (Vercel Fluid) : un petit pool par instance, rattaché au cycle de vie
 *   de la fonction via attachDatabasePool ; DATABASE_URL doit pointer vers le pooler Neon.
 * - Local / tests : pool classique.
 */
export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __mitcPool?: Pool; __mitcDb?: Db };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas défini.");
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 5_000,
  });
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

export function getPool(): Pool {
  if (!globalForDb.__mitcPool) globalForDb.__mitcPool = createPool();
  return globalForDb.__mitcPool;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    if (!globalForDb.__mitcDb) globalForDb.__mitcDb = drizzle(getPool(), { schema });
    const value = Reflect.get(globalForDb.__mitcDb, prop);
    return typeof value === "function" ? value.bind(globalForDb.__mitcDb) : value;
  },
});

export async function closeDb() {
  await globalForDb.__mitcPool?.end();
  globalForDb.__mitcPool = undefined;
  globalForDb.__mitcDb = undefined;
}

export { schema };
