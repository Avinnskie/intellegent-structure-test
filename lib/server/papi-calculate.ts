import { and, count, eq } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import {
  assessmentSessions,
  papiFactorScores,
  papiResults,
  subtestAttempts,
} from "../db/schema.ts";
import { PAPI_ENGINE_VERSION } from "../domain/official-papi.ts";
import { buildPapiProfile } from "../domain/papi-scoring.ts";
import { assertSessionTransition, type SessionStatus } from "../domain/session-state.ts";
import { writeAudit } from "./audit.ts";
import { calculateResultAsSystem, sessionHasManualGePending } from "./calculate.ts";
import { readPapiAnswers } from "./papi-session.ts";

export type CalculatePapiInput = {
  organizationId: string;
  sessionId: string;
  attemptId: string;
  papiFormVersionId: string;
  elapsedSeconds: number;
  now: Date;
};

export async function calculatePapiResult(
  tx: DbLike,
  input: CalculatePapiInput,
): Promise<SessionStatus> {
  const { answers } = await readPapiAnswers(tx, input.attemptId);
  const profile = buildPapiProfile(answers);

  const [result] = await tx
    .insert(papiResults)
    .values({
      sessionId: input.sessionId,
      papiAttemptId: input.attemptId,
      papiFormVersionId: input.papiFormVersionId,
      status: "draft",
      roleTotal: profile.roleTotal,
      needTotal: profile.needTotal,
      totalScore: profile.totalScore,
      elapsedSeconds: input.elapsedSeconds,
      profile,
      pendingInterpretationFactors: [...profile.pendingInterpretationFactors],
      engineVersion: PAPI_ENGINE_VERSION,
      calculatedAt: input.now,
    })
    .returning({ id: papiResults.id });

  if (!result) {
    throw new Error(`Gagal menyimpan hasil PAPI untuk sesi ${input.sessionId}.`);
  }

  await tx.insert(papiFactorScores).values(
    profile.factorScores.map((factor) => ({
      papiResultId: result.id,
      sessionId: input.sessionId,
      factorCode: factor.code,
      factorName: factor.name,
      groupCode: factor.group,
      factorKind: factor.kind,
      score: factor.score,
      category: factor.category,
      interpretation: factor.interpretation,
      interpretationPending: factor.interpretationPending ? 1 : 0,
    })),
  );

  await writeAudit(tx, {
    organizationId: input.organizationId,
    actorType: "system",
    actorId: null,
    action: "papi.calculated",
    objectType: "papi_result",
    objectId: result.id,
    metadata: {
      sessionId: input.sessionId,
      engineVersion: PAPI_ENGINE_VERSION,
      roleTotal: profile.roleTotal,
      needTotal: profile.needTotal,
      elapsedSeconds: input.elapsedSeconds,
      pendingInterpretationFactors: profile.pendingInterpretationFactors,
    },
  });

  /**
   * PAPI selesai TIDAK lagi menutup sesi — IST masih menunggu di belakangnya.
   *
   * Sesi berhenti di `papi_completed`, yang merangkap layar jeda: jawaban PAPI
   * sudah terkunci dan terskor, peserta boleh berhenti, lalu kembali dengan
   * token yang sama untuk memulai IST.
   * Statusnya sudah disetel oleh pemanggil sebelum skoring dijalankan, jadi di
   * sini cukup dikembalikan apa adanya.
   */
  return "papi_completed";
}

export async function closeBatterySession(
  tx: DbLike,
  organizationId: string,
  sessionId: string,
  from: SessionStatus,
  now: Date,
): Promise<SessionStatus> {
  assertSessionTransition(from, "test_completed");
  assertSessionTransition("test_completed", "needs_ge_scoring");

  const [row] = await tx
    .select({
      formVersionId: assessmentSessions.formVersionId,
      scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
    })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, sessionId))
    .limit(1);

  if (!row) {
    throw new Error(`Sesi ${sessionId} hilang saat menutup baterai.`);
  }

  const [updated] = await tx
    .update(assessmentSessions)
    .set({ status: "needs_ge_scoring", completedAt: now })
    .where(eq(assessmentSessions.id, sessionId))
    .returning({ status: assessmentSessions.status });

  if (!updated) {
    throw new Error(`Status sesi ${sessionId} gagal ditutup.`);
  }

  /**
   * Sejak PAPI dikerjakan lebih dulu, sesi bisa ditutup sebelum IST tersentuh.
   *
   * Menjalankan pipeline pada nol jawaban tidak menghasilkan galat — ia
   * menghasilkan RW 0 di sembilan subtes, lalu menormakannya menjadi IQ yang
   * tampak sah tetapi tidak berarti apa-apa. Angka semacam itu bisa terbawa ke
   * laporan dan dipakai mengambil keputusan rekrutmen.
   *
   * Jadi sesi tanpa satu pun subtes IST yang tuntas berhenti di `needs_review`
   * agar HR menilainya sendiri, bukan menerima angka bikinan sistem.
   */
  const [istProgress] = await tx
    .select({ total: count() })
    .from(subtestAttempts)
    .where(
      and(eq(subtestAttempts.sessionId, sessionId), eq(subtestAttempts.status, "completed")),
    );

  if ((istProgress?.total ?? 0) === 0) {
    assertSessionTransition("needs_ge_scoring", "needs_review");
    const [flagged] = await tx
      .update(assessmentSessions)
      .set({ status: "needs_review" })
      .where(eq(assessmentSessions.id, sessionId))
      .returning({ status: assessmentSessions.status });

    await writeAudit(tx, {
      organizationId,
      actorType: "system",
      actorId: null,
      action: "session.needs_review",
      objectType: "assessment_session",
      objectId: sessionId,
      metadata: { reason: "ist_not_attempted", closedFrom: from },
    });

    return flagged?.status ?? "needs_review";
  }

  const hasManualGe = await sessionHasManualGePending(
    tx,
    sessionId,
    row.formVersionId,
    row.scoringKeyVersionId,
  );

  if (!hasManualGe) {
    await calculateResultAsSystem(tx, organizationId, sessionId);
  }

  const [finalRow] = await tx
    .select({ status: assessmentSessions.status })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, sessionId))
    .limit(1);

  return finalRow?.status ?? "test_completed";
}
