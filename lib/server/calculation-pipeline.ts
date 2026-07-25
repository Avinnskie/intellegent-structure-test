import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentResults,
  assessmentSessions,
  itemScores,
  normAgeBands,
  normScoreRows,
} from "../db/schema.ts";
import {
  categoryForIq,
  dominanceProfile,
  ENGINE_VERSION,
  iqFromCompositeStandard,
} from "../domain/aggregate.ts";
import { calculateScoringAge } from "../domain/age.ts";
import { lookupStandardScore, selectAgeBand, type AgeBand } from "../domain/norms.ts";
import { COMPOSITE_NORM_CODE } from "../domain/official-ist.ts";
import { isGeAutoPayload } from "../domain/objective-scoring.ts";
import { assertSessionTransition } from "../domain/session-state.ts";
import { SUBTEST_CODES, type SubtestCode } from "../ist-subtests.ts";
import { writeAudit } from "./audit.ts";
import {
  computeRawScores,
  loadCalculationItems,
  lockSessionForCalculation,
} from "./calculation-items.ts";
import { persistCalculation } from "./calculation-persistence.ts";
import {
  actorOrganizationId,
  actorUserId,
  GE_INCOMPLETE_MESSAGE,
  NOT_STARTED_MESSAGE,
  RESULT_FINAL_MESSAGE,
  testDateIso,
  WRONG_STATUS_MESSAGE,
  type CalculateOutcome,
  type CalculationActor,
  type CalculationSession,
  type NeedsReviewReason,
} from "./calculation-types.ts";

async function routeToNeedsReview(
  tx: DbLike,
  actor: CalculationActor,
  session: CalculationSession,
  reason: NeedsReviewReason,
): Promise<CalculateOutcome> {
  if (session.status !== "needs_review") {
    assertSessionTransition(session.status, "needs_review");
    await tx
      .update(assessmentSessions)
      .set({ status: "needs_review" })
      .where(eq(assessmentSessions.id, session.id));
  }
  await writeAudit(tx, {
    organizationId: actorOrganizationId(actor),
    actorType: actor.kind === "user" ? "user" : "system",
    actorId: actorUserId(actor),
    action: "result.needs_review",
    objectType: "assessment_session",
    objectId: session.id,
    metadata: { sessionId: session.id, reason, engineVersion: ENGINE_VERSION },
  });
  return { kind: "needs_review", reason };
}

export async function runCalculatePipeline(
  tx: DbLike,
  actor: CalculationActor,
  sessionId: string,
): Promise<CalculateOutcome> {
  const session = await lockSessionForCalculation(tx, actor, sessionId);
  const [latest] = await tx
    .select({ id: assessmentResults.id, status: assessmentResults.status })
    .from(assessmentResults)
    .where(
      and(eq(assessmentResults.sessionId, session.id), isNull(assessmentResults.supersededById)),
    )
    .orderBy(desc(assessmentResults.calculatedAt))
    .limit(1);
  if (latest?.status === "final") {
    throw new ApiError("RESULT_FINAL", RESULT_FINAL_MESSAGE, 409);
  }
  const calculableStatuses = ["test_completed", "needs_ge_scoring", "calculated", "needs_review"];
  if (!calculableStatuses.includes(session.status)) {
    throw new ApiError("SESSION_NOT_ACTIVE", WRONG_STATUS_MESSAGE, 409);
  }
  if (!session.startedAt) {
    throw new ApiError("SESSION_NOT_STARTED", NOT_STARTED_MESSAGE, 409);
  }

  const items = await loadCalculationItems(tx, session);
  const manualGeResponses = items.filter(
    (item) =>
      item.subtestCode === "GE" && item.responseId !== null && !isGeAutoPayload(item.rulePayload),
  );
  if (manualGeResponses.length > 0) {
    const responseIds = manualGeResponses.map((item) => item.responseId as string);
    const scoreRows = await tx
      .select({ responseId: itemScores.responseId })
      .from(itemScores)
      .where(inArray(itemScores.responseId, responseIds));
    if (scoreRows.length < manualGeResponses.length) {
      throw new ApiError("GE_INCOMPLETE", GE_INCOMPLETE_MESSAGE, 409);
    }
  }

  const now = new Date();
  const raw = await computeRawScores(tx, session, items, now);
  const age = calculateScoringAge(session.birthDate, testDateIso(session.startedAt));
  const bandRows = await tx
    .select({
      id: normAgeBands.id,
      label: normAgeBands.label,
      minAge: normAgeBands.minAge,
      maxAge: normAgeBands.maxAge,
    })
    .from(normAgeBands)
    .where(eq(normAgeBands.normSetVersionId, session.normSetVersionId));
  const selection = selectAgeBand(bandRows as AgeBand[], age);
  if (selection.kind !== "ok") {
    return routeToNeedsReview(tx, actor, session, selection.reason);
  }
  const band = selection.band;
  const normRows = await tx
    .select({
      subtestCode: normScoreRows.subtestCode,
      rawScore: normScoreRows.rawScore,
      standardScore: normScoreRows.standardScore,
    })
    .from(normScoreRows)
    .where(eq(normScoreRows.normAgeBandId, band.id));

  const standard = {} as Record<SubtestCode, number>;
  for (const code of SUBTEST_CODES) {
    const score = lookupStandardScore(normRows, code, raw[code]);
    if (score === null) {
      return routeToNeedsReview(tx, actor, session, `MISSING_NORM_ROW:${code}:${raw[code]}`);
    }
    standard[code] = score;
  }
  const totalRawScore = SUBTEST_CODES.reduce((sum, code) => sum + raw[code], 0);
  const totalStandardScore = lookupStandardScore(normRows, COMPOSITE_NORM_CODE, totalRawScore);
  if (totalStandardScore === null) {
    return routeToNeedsReview(
      tx,
      actor,
      session,
      `MISSING_NORM_ROW:${COMPOSITE_NORM_CODE}:${totalRawScore}`,
    );
  }
  const iqScore = iqFromCompositeStandard(totalStandardScore);
  const iqCategory = categoryForIq(iqScore);
  const dominance = dominanceProfile(standard);

  const resultId = await persistCalculation(tx, {
    session,
    actor,
    latestResultId: latest?.id ?? null,
    bandId: band.id,
    age,
    raw,
    standard,
    totalRawScore,
    totalStandardScore,
    iqScore,
    iqCategory,
    dominance,
    calculatedAt: now,
  });
  return { kind: "calculated", resultId, iqScore };
}
