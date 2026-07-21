/**
 * The database clock — the single authority on "now" for every participant request.
 *
 * The server owns the clock: `expires_at` decisions and the `serverNow` the client does its offset
 * math against must come from ONE source, and the database is the only one every request already
 * shares. Node process clocks drift apart across instances; a database cannot drift from itself.
 *
 * This module exists because the mapping below was independently copied into three modules that each
 * decide when a subtest closes (`participant-session`, `participant-start`, `participant-responses`).
 * A subtle driver-mapping fix is the worst possible thing to keep three copies of.
 */
import { eq, sql } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import { assessmentSessions } from "../db/schema.ts";

/**
 * `now()`, mapped to a `Date` on every driver.
 *
 * A bare `sql` fragment carries no type mapper, so the value arrives however the driver decodes it:
 * **postgres-js parses timestamptz into a `Date`; PGlite hands back a `string`** like
 * `"2026-07-15 19:38:34.354+07"`.
 *
 * What that means without `mapWith` is worth stating precisely, because the obvious guess is
 * backwards: production (postgres-js) would have WORKED, and the test suite (PGlite) would have
 * FAILED LOUDLY the moment `selectNow`'s caller reached `.toISOString()` on a string. So this is not
 * a fix for a silent production bug — it is what makes the return type HONEST on both drivers, so
 * the two can never disagree about what `selectNow` returns and no caller has to care which one it
 * is talking to.
 *
 * `mapWith` borrows a timestamptz column's mapper. The column is arbitrary; only its type matters.
 */
export function dbNow() {
  return sql`now()`.mapWith(assessmentSessions.createdAt);
}

/**
 * Reads the database clock inside the caller's transaction.
 *
 * Scoped to a session row rather than a bare `select now()` so it costs no extra round trip beyond
 * a lookup the callers make anyway, and so a vanished session fails here rather than three
 * statements later. Inside a transaction `now()` is the TRANSACTION's start time, which is what we
 * want: every timestamp derived from it describes one consistent instant.
 */
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
