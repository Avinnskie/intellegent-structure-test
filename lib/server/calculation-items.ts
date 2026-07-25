import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentSessions,
  candidates,
  itemScores,
  itemScoringRules,
  itemVersions,
  responses,
  subtestAttempts,
  subtestVersions,
} from "../db/schema.ts";
import {
  isGeAutoPayload,
  scoreObjective,
  type ObjectiveRule,
} from "../domain/objective-scoring.ts";
import { SUBTEST_CODES, type SubtestCode } from "../ist-subtests.ts";
import {
  actorOrganizationId,
  calculationNotFound,
  GE_INCOMPLETE_MESSAGE,
  type CalculationActor,
  type CalculationItem,
  type CalculationSession,
} from "./calculation-types.ts";
import { readResponseValue } from "./participant-responses.ts";

export async function lockSessionForCalculation(
  tx: DbLike,
  actor: CalculationActor,
  sessionId: string,
): Promise<CalculationSession> {
  if (!z.uuid().safeParse(sessionId).success) {
    throw calculationNotFound();
  }
  const [row] = await tx
    .select({
      id: assessmentSessions.id,
      status: assessmentSessions.status,
      startedAt: assessmentSessions.startedAt,
      formVersionId: assessmentSessions.formVersionId,
      scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
      normSetVersionId: assessmentSessions.normSetVersionId,
      birthDate: candidates.birthDate,
    })
    .from(assessmentSessions)
    .innerJoin(candidates, eq(assessmentSessions.candidateId, candidates.id))
    .where(
      and(
        eq(assessmentSessions.id, sessionId),
        eq(assessmentSessions.organizationId, actorOrganizationId(actor)),
      ),
    )
    .for("update")
    .limit(1);
  if (!row) {
    throw calculationNotFound();
  }
  return row;
}

export async function loadCalculationItems(
  tx: DbLike,
  session: CalculationSession,
): Promise<CalculationItem[]> {
  const rows = await tx
    .select({
      itemVersionId: itemVersions.id,
      subtestCode: subtestVersions.code,
      ruleId: itemScoringRules.id,
      ruleType: itemScoringRules.ruleType,
      rulePayload: itemScoringRules.rulePayload,
      responseId: responses.id,
      storedValue: responses.responseValue,
    })
    .from(itemVersions)
    .innerJoin(subtestVersions, eq(itemVersions.subtestVersionId, subtestVersions.id))
    .leftJoin(
      itemScoringRules,
      and(
        eq(itemScoringRules.itemVersionId, itemVersions.id),
        eq(itemScoringRules.scoringKeyVersionId, session.scoringKeyVersionId),
      ),
    )
    .leftJoin(
      subtestAttempts,
      and(
        eq(subtestAttempts.sessionId, session.id),
        eq(subtestAttempts.subtestCode, subtestVersions.code),
      ),
    )
    .leftJoin(
      responses,
      and(
        eq(responses.itemVersionId, itemVersions.id),
        eq(responses.subtestAttemptId, subtestAttempts.id),
      ),
    )
    .where(eq(subtestVersions.formVersionId, session.formVersionId))
    .orderBy(asc(subtestVersions.sequence), asc(itemVersions.sequence));

  return rows.map((row) => ({ ...row, subtestCode: row.subtestCode as SubtestCode }));
}

export async function computeRawScores(
  tx: DbLike,
  session: CalculationSession,
  items: readonly CalculationItem[],
  now: Date,
): Promise<Record<SubtestCode, number>> {
  const raw = Object.fromEntries(SUBTEST_CODES.map((code) => [code, 0])) as Record<
    SubtestCode,
    number
  >;
  const manualGeResponseIds = items
    .filter(
      (item) =>
        item.subtestCode === "GE" && item.responseId !== null && !isGeAutoPayload(item.rulePayload),
    )
    .map((item) => item.responseId as string);
  const manualGeScores = manualGeResponseIds.length
    ? await tx
        .select({ responseId: itemScores.responseId, score: itemScores.score })
        .from(itemScores)
        .where(inArray(itemScores.responseId, manualGeResponseIds))
    : [];
  const geScoreByResponse = new Map(manualGeScores.map((row) => [row.responseId, row.score]));

  const responseIds = items
    .map((item) => item.responseId)
    .filter((id): id is string => id !== null);
  if (responseIds.length > 0) {
    await tx
      .delete(itemScores)
      .where(and(inArray(itemScores.responseId, responseIds), isNull(itemScores.scoredBy)));
  }

  const objectiveScores: (typeof itemScores.$inferInsert)[] = [];
  for (const item of items) {
    if (item.subtestCode === "GE" && !isGeAutoPayload(item.rulePayload)) {
      if (item.responseId !== null) {
        const score = geScoreByResponse.get(item.responseId);
        if (score === undefined) {
          throw new ApiError("GE_INCOMPLETE", GE_INCOMPLETE_MESSAGE, 409);
        }
        raw.GE += score;
      }
      continue;
    }
    if (!item.ruleType || !item.rulePayload) {
      throw new Error(
        `Item ${item.itemVersionId} tidak punya aturan skoring pada kunci yang di-pin.`,
      );
    }
    const responseValue = item.responseId === null ? null : readResponseValue(item.storedValue);
    const outcome = scoreObjective(
      { ruleType: item.ruleType, payload: item.rulePayload } as ObjectiveRule,
      responseValue,
    );
    if (outcome.kind !== "scored") {
      throw new Error(
        `Item ${item.itemVersionId} (${item.subtestCode}) memakai aturan manual — kunci rusak.`,
      );
    }
    raw[item.subtestCode] += outcome.score;
    if (item.responseId !== null) {
      objectiveScores.push({
        responseId: item.responseId,
        score: outcome.score,
        scoringRuleId: item.ruleId,
        scoredBy: null,
        scoredAt: now,
      });
    }
  }
  if (objectiveScores.length > 0) {
    await tx.insert(itemScores).values(objectiveScores);
  }
  void session;
  return raw;
}
