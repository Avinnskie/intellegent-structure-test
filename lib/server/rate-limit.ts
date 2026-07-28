import { createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getServerConfig } from "../config.ts";
import type { DbLike } from "../db/client.ts";
import { rateLimits } from "../db/schema.ts";

const WINDOW_MINUTES = 15;

export const MAX_FAILURES_PER_WINDOW = 10;

const currentWindow = sql`now() - make_interval(mins => ${WINDOW_MINUTES})`;

export function rateLimitKey(scope: string, clientKey: string): string {
  const digest = createHmac("sha256", getServerConfig().ACCESS_CODE_PEPPER)
    .update(`rate-limit:${scope}:${clientKey}`)
    .digest("hex");

  return `${scope}:${digest}`;
}

export async function isWithinRateLimit(db: DbLike, key: string): Promise<boolean> {
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), sql`${rateLimits.windowStartedAt} >= ${currentWindow}`))
    .limit(1);

  return (row?.count ?? 0) < MAX_FAILURES_PER_WINDOW;
}

export async function recordRateLimitFailure(db: DbLike, key: string): Promise<number> {
  const windowHasExpired = sql`${rateLimits.windowStartedAt} < ${currentWindow}`;

  const [row] = await db
    .insert(rateLimits)
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
    throw new Error("Rate limit tidak dapat diperbarui.");
  }

  return row.count;
}
