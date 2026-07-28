import type { DbLike } from "../db/client.ts";
import { auditLogs } from "../db/schema.ts";

type AuditInsert = typeof auditLogs.$inferInsert;

export type AuditActorType = AuditInsert["actorType"];

export type AuditEntry = {
  organizationId?: string | null;
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function writeAudit(db: DbLike, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    organizationId: entry.organizationId ?? null,
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    objectType: entry.objectType,
    objectId: entry.objectId ?? null,
    metadata: entry.metadata ?? null,
  });
}
