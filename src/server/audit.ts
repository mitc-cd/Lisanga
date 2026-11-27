import "server-only";
import { auditLogs } from "@/db/schema";
import type { DbOrTx } from "@/db";

export async function writeAudit(
  dbx: DbOrTx,
  entry: {
    organizationId: string;
    actorId: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    /** Ne jamais y mettre la valeur d'un secret. */
    details?: Record<string, unknown>;
  },
) {
  await dbx.insert(auditLogs).values({
    organizationId: entry.organizationId,
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details: entry.details ?? {},
  });
}
