import type { DbLike } from "../db/client.ts";
import { auditLogs } from "../db/schema.ts";

type AuditInsert = typeof auditLogs.$inferInsert;

/** "user" | "participant" | "system" — derived from the table so it cannot drift from the enum. */
export type AuditActorType = AuditInsert["actorType"];

export type AuditEntry = {
  /** Null for platform-wide events that belong to no single tenant. */
  organizationId?: string | null;
  actorType: AuditActorType;
  /** A user uuid, a participant session uuid, or "system". */
  actorId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  /**
   * Structured context for the audit viewer. Subject to spec §19 exactly like the log stream:
   * pass masked codes and identifiers, never PII, full access codes, tokens, response values,
   * scoring keys, or norms.
   */
  metadata?: Record<string, unknown> | null;
};

/**
 * Appends one audit row. Takes a `DbLike` so a caller can pass the pool or a transaction handle and
 * have the audit row commit or roll back with the change it describes.
 *
 * There is deliberately no update or delete counterpart, here or anywhere else: the audit trail is
 * append-only by construction rather than by convention.
 */
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
