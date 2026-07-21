/**
 * Fixed-window rate limiting, backed by the `rate_limits` table.
 *
 * The counter lives in Postgres rather than in process memory on purpose: the app runs as multiple
 * serverless instances, and an in-memory counter would give an attacker one full budget per instance
 * — no limit at all in practice.
 */
import { createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getServerConfig } from "../config.ts";
import type { DbLike } from "../db/client.ts";
import { rateLimits } from "../db/schema.ts";

const WINDOW_MINUTES = 15;

/**
 * FAILURES allowed per key per window. Exported so tests cannot drift from the real budget.
 *
 * Failures, not attempts: spec §9 ("batasi percobaan kode salah") and brief §8 ("rate-limit invalid
 * attempts") both scope the limit to WRONG codes. Counting successes too would meter the proctored
 * lab of brief §21, where twenty candidates NAT out through one public IP and would exhaust a
 * shared bucket with twenty perfectly valid codes.
 *
 * Fixed window, not sliding: a burst can straddle a boundary and land up to 2x the budget across
 * two adjacent windows. Accepted — the budget is a blunt anti-guessing measure over a ~2^39.6
 * keyspace, and a sliding window costs a per-attempt row we would then have to retain and expire.
 */
export const MAX_FAILURES_PER_WINDOW = 10;

/** Shared by both halves so the check and the increment can never disagree on what "current" means. */
const currentWindow = sql`now() - make_interval(mins => ${WINDOW_MINUTES})`;

/**
 * Builds the stored key from an untrusted client identifier (an IP).
 *
 * A raw IP is personal data (spec §19), and `rate_limits` is neither access-controlled per-tenant
 * nor expired on a retention schedule, so the address is HMAC'd before it can land in a row — or in
 * a log line, since callers log this key rather than the address. The scope prefix stays in the
 * clear so a `rate_limits` row is still diagnosable ("which limiter?") without being re-identifiable
 * ("whose IP?").
 *
 * Keyed with `ACCESS_CODE_PEPPER` rather than a dedicated secret: both are server-only config in the
 * same trust boundary, and the `rate-limit:<scope>:` message prefix domain-separates this digest
 * from `hashAccessCode`'s, so neither can be used as an oracle for the other. A plain (unkeyed) hash
 * would not be enough — the IPv4 space is small enough to brute-force a digest back to an address.
 */
export function rateLimitKey(scope: string, clientKey: string): string {
  const digest = createHmac("sha256", getServerConfig().ACCESS_CODE_PEPPER)
    .update(`rate-limit:${scope}:${clientKey}`)
    .digest("hex");

  return `${scope}:${digest}`;
}

/**
 * Is `key` still within its budget? Read-only: this NEVER consumes anything.
 *
 * Callers check this BEFORE doing the work, and record a failure only if the work actually failed.
 * That ordering is what keeps a guessing burst from being cashed in the moment one guess lands: once
 * the budget is spent, the client is refused before the credential is even looked at.
 *
 * A row whose window has aged out is ignored rather than deleted — `recordRateLimitFailure` resets
 * the count when it next writes, so a stale row reads as an empty budget without a write here.
 */
export async function isWithinRateLimit(db: DbLike, key: string): Promise<boolean> {
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), sql`${rateLimits.windowStartedAt} >= ${currentWindow}`))
    .limit(1);

  return (row?.count ?? 0) < MAX_FAILURES_PER_WINDOW;
}

/**
 * Records one failed attempt against `key` and returns the failure count for the current window.
 *
 * ONE statement, so the read-modify-write cannot interleave: two concurrent requests both take the
 * row lock that `on conflict do update` acquires, and the second sees the first's increment. A
 * select-then-update would let a burst of parallel requests all read the same count and each write
 * count+1 — the classic way a limiter silently permits N× its budget under exactly the load it
 * exists to stop.
 *
 * `now()` is the transaction timestamp. This statement is its own transaction (callers MUST NOT run
 * it inside a larger one), so the window comparison is against real wall-clock time rather than
 * against whenever an enclosing transaction happened to begin.
 *
 * Expressed with drizzle's query builder rather than `db.execute(sql\`…\`)`: `execute` returns a
 * bare array on postgres-js but a `{ rows }` object on PGlite, so raw SQL here would read the count
 * correctly in production and silently as `undefined` under test (or the reverse). `.returning()`
 * normalizes both drivers onto the same typed shape.
 */
export async function recordRateLimitFailure(db: DbLike, key: string): Promise<number> {
  // `rate_limits.window_started_at` in a DO UPDATE SET expression refers to the EXISTING row.
  const windowHasExpired = sql`${rateLimits.windowStartedAt} < ${currentWindow}`;

  const [row] = await db
    .insert(rateLimits)
    // `window_started_at` is left to its `now()` column default: a value computed in the app would
    // put the window on the app's clock and the comparison above on the database's.
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${windowHasExpired} then 1 else ${rateLimits.count} + 1 end`,
        windowStartedAt: sql`case when ${windowHasExpired} then now() else ${rateLimits.windowStartedAt} end`,
      },
    })
    .returning({ count: rateLimits.count });

  if (!row) {
    // `on conflict do update` always returns the row it wrote, so this is unreachable unless the
    // statement changed shape. Throwing fails the request closed; returning silently would let the
    // caller believe a failure was counted when it was not.
    throw new Error("Rate limit tidak dapat diperbarui.");
  }

  return row.count;
}
