import { and, eq } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import {
  itemScores,
  itemScoringRules,
  itemVersions,
  responses,
  subtestAttempts,
  subtestVersions,
} from "../db/schema.ts";
import { isGeAutoPayload } from "../domain/objective-scoring.ts";

export async function sessionHasManualGePending(
  tx: DbLike,
  sessionId: string,
  formVersionId: string,
  scoringKeyVersionId: string,
): Promise<boolean> {
  const rows = await tx
    .select({
      rulePayload: itemScoringRules.rulePayload,
      scoreId: itemScores.id,
    })
    .from(subtestVersions)
    .innerJoin(itemVersions, eq(itemVersions.subtestVersionId, subtestVersions.id))
    .innerJoin(
      itemScoringRules,
      and(
        eq(itemScoringRules.itemVersionId, itemVersions.id),
        eq(itemScoringRules.scoringKeyVersionId, scoringKeyVersionId),
      ),
    )
    .innerJoin(
      subtestAttempts,
      and(
        eq(subtestAttempts.sessionId, sessionId),
        eq(subtestAttempts.subtestCode, subtestVersions.code),
      ),
    )
    .innerJoin(
      responses,
      and(
        eq(responses.subtestAttemptId, subtestAttempts.id),
        eq(responses.itemVersionId, itemVersions.id),
      ),
    )
    .leftJoin(itemScores, eq(itemScores.responseId, responses.id))
    .where(and(eq(subtestVersions.formVersionId, formVersionId), eq(subtestVersions.code, "GE")));

  return rows.some((row) => !isGeAutoPayload(row.rulePayload) && row.scoreId === null);
}
