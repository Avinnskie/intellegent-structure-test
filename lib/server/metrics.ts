/**
 * Dashboard metrics for the HR portal (T22). Read-only, org-scoped, and cheap: one grouped count
 * over sessions plus the page of recent rows `listSessions` already knows how to build.
 */
import { and, count, eq, gte } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import { assessmentSessions } from "../db/schema.ts";
import type { SessionStatus } from "../domain/session-state.ts";
import type { AuthContext } from "./authz.ts";
import { listSessions, type SessionListRow } from "./hr.ts";

/** Statuses that mean a candidate is actively somewhere inside the test flow right now. */
const ACTIVE_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "code_validated",
  "tutorial",
  "subtest_in_progress",
  "subtest_completed",
  "tutorial_next",
]);

export type DashboardMetrics = {
  /** Sessions created since the first day of the current month (server timezone). */
  createdThisMonth: number;
  active: number;
  waitingGeScoring: number;
  finalized: number;
  recentSessions: readonly SessionListRow[];
};

export async function getDashboardMetrics(
  db: DbLike,
  ctx: AuthContext,
): Promise<DashboardMetrics> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const grouped = await db
    .select({ status: assessmentSessions.status, total: count() })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.organizationId, ctx.organizationId))
    .groupBy(assessmentSessions.status);

  let active = 0;
  let waitingGeScoring = 0;
  let finalized = 0;
  for (const row of grouped) {
    if (ACTIVE_STATUSES.has(row.status)) {
      active += row.total;
    }
    if (row.status === "needs_ge_scoring") {
      waitingGeScoring = row.total;
    }
    if (row.status === "final") {
      finalized = row.total;
    }
  }

  const [createdRow] = await db
    .select({ total: count() })
    .from(assessmentSessions)
    .where(
      and(
        eq(assessmentSessions.organizationId, ctx.organizationId),
        gte(assessmentSessions.createdAt, monthStart),
      ),
    );

  const recentSessions = (await listSessions(db, ctx)).slice(0, 10);

  return {
    createdThisMonth: createdRow?.total ?? 0,
    active,
    waitingGeScoring,
    finalized,
    recentSessions,
  };
}
