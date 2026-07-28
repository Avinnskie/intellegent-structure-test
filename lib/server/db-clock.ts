import { eq, sql } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import { assessmentSessions } from "../db/schema.ts";

export function dbNow() {
  return sql`now()`.mapWith(assessmentSessions.createdAt);
}

export async function selectNow(tx: DbLike, sessionId: string): Promise<Date> {
  const [row] = await tx
    .select({ now: dbNow() })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, sessionId))
    .limit(1);

  if (!row) {
    throw new Error(`Sesi ${sessionId} hilang saat membaca jam server.`);
  }
  return row.now;
}
