import { eq } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import { assessmentSessions, papiFactorScores, papiResults } from "../db/schema.ts";
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

  return closeBatterySession(
    tx,
    input.organizationId,
    input.sessionId,
    "papi_completed",
    input.now,
  );
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
