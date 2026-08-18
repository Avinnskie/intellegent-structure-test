import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbLike } from "../db/client.ts";
import { assessmentSessions } from "../db/schema.ts";
import type { AuthContext } from "./authz.ts";
import { requirePermission } from "./authz.ts";
import { runCalculatePipeline } from "./calculation-pipeline.ts";
import {
  calculationNotFound,
  type CalculateOutcome,
  type CalculationActor,
} from "./calculation-types.ts";
import { sessionHasManualGePending } from "./ge-pending.ts";

export {
  testDateIso,
  type CalculateOutcome,
  type CalculationActor,
  type NeedsReviewReason,
} from "./calculation-types.ts";
export { sessionHasManualGePending } from "./ge-pending.ts";
export { getResult, type ResultDto } from "./result-read.ts";

export async function calculateResult(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<CalculateOutcome> {
  return db.transaction(async (tx) => runCalculatePipeline(tx, { kind: "user", ctx }, sessionId));
}

export async function calculateResultAsSystem(
  tx: DbLike,
  organizationId: string,
  sessionId: string,
): Promise<CalculateOutcome> {
  const actor: CalculationActor = { kind: "system", organizationId };
  return runCalculatePipeline(tx, actor, sessionId);
}

export type EnsureAutomaticResultOutcome =
  CalculateOutcome | { kind: "unchanged" } | { kind: "ge_key_required" };

export async function ensureAutomaticResult(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<EnsureAutomaticResultOutcome> {
  requirePermission(ctx, "view_results");
  if (!z.uuid().safeParse(sessionId).success) {
    throw calculationNotFound();
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: assessmentSessions.id,
        status: assessmentSessions.status,
        formVersionId: assessmentSessions.formVersionId,
        scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
        includesIst: assessmentSessions.includesIst,
      })
      .from(assessmentSessions)
      .where(
        and(
          eq(assessmentSessions.id, sessionId),
          eq(assessmentSessions.organizationId, ctx.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!session) {
      throw calculationNotFound();
    }
    /**
     * Sesi PAPI-saja tidak punya IST untuk dihitung.
     *
     * Pengaman ini berdiri sendiri, terpisah dari pemeriksaan status di bawah.
     * Status bisa tertinggal salah — sesi lama yang dibuat sebelum perbaikan
     * ini masih terparkir di `needs_ge_scoring` — dan halaman hasil memanggil
     * fungsi ini setiap kali dibuka. Tanpa penjaga di sini, pipeline IST tetap
     * berjalan pada sesi tanpa waktu mulai dan halamannya gagal dimuat.
     */
    if (session.includesIst !== 1) {
      return { kind: "unchanged" };
    }
    if (session.status !== "test_completed" && session.status !== "needs_ge_scoring") {
      return { kind: "unchanged" };
    }

    const manualGePending = await sessionHasManualGePending(
      tx,
      session.id,
      session.formVersionId,
      session.scoringKeyVersionId,
    );
    if (manualGePending) {
      return { kind: "ge_key_required" };
    }
    return calculateResultAsSystem(tx, ctx.organizationId, session.id);
  });
}
