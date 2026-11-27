import { sql } from "drizzle-orm";

/**
 * Référence de colonne TOUJOURS qualifiée par sa table, pour les sous-requêtes corrélées.
 * (Dans une requête sur une seule table, Drizzle écrit `"id"` sans table : dans une
 * sous-requête, ce nom désignerait la table interne.)
 */
export const outer = (table: string, column: string) => sql.raw(`"${table}"."${column}"`);
