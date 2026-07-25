import { eq } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import { assessmentResults, assessmentSessions, subtestScores } from "../db/schema.ts";
import {
  categoryForSubtestStandardScore,
  ENGINE_VERSION,
  type DominanceProfile,
} from "../domain/aggregate.ts";
import { assertSessionTransition } from "../domain/session-state.ts";
import { SUBTEST_CODES, type SubtestCode } from "../ist-subtests.ts";
import { writeAudit } from "./audit.ts";
import {
  actorOrganizationId,
  actorUserId,
  type CalculationActor,
  type CalculationSession,
} from "./calculation-types.ts";

type PersistCalculationInput = {
  readonly session: CalculationSession;
  readonly actor: CalculationActor;
  readonly latestResultId: string | null;
  readonly bandId: string;
  readonly age: number;
  readonly raw: Readonly<Record<SubtestCode, number>>;
  readonly standard: Readonly<Record<SubtestCode, number>>;
  readonly totalRawScore: number;
  readonly totalStandardScore: number;
  readonly iqScore: number;
  readonly iqCategory: string;
  readonly dominance: DominanceProfile;
  readonly calculatedAt: Date;
};

export async function persistCalculation(
  tx: DbLike,
  input: PersistCalculationInput,
): Promise<string> {
  const { session, actor, dominance } = input;
  const [result] = await tx
    .insert(assessmentResults)
    .values({
      sessionId: session.id,
      status: "draft",
      ageAtTest: input.age,
      normAgeBandId: input.bandId,
      totalRawScore: input.totalRawScore,
      totalStandardScore: input.totalStandardScore,
      iqScore: input.iqScore,
      iqCategory: input.iqCategory,
      dominance: dominance.dominance,
      profile: {
        exactScore: dominance.exactScore,
        nonExactScore: dominance.nonExactScore,
        difference: dominance.difference,
      },
      formVersionId: session.formVersionId,
      scoringKeyVersionId: session.scoringKeyVersionId,
      normSetVersionId: session.normSetVersionId,
      engineVersion: ENGINE_VERSION,
      calculatedBy: actorUserId(actor),
      calculatedAt: input.calculatedAt,
    })
    .returning({ id: assessmentResults.id });
  if (!result) {
    throw new Error("Hasil gagal disimpan.");
  }
  if (input.latestResultId) {
    await tx
      .update(assessmentResults)
      .set({ supersededById: result.id })
      .where(eq(assessmentResults.id, input.latestResultId));
  }
  await tx.insert(subtestScores).values(
    SUBTEST_CODES.map((code) => ({
      resultId: result.id,
      sessionId: session.id,
      subtestCode: code,
      rawScore: input.raw[code],
      standardScore: input.standard[code],
      category: categoryForSubtestStandardScore(input.standard[code]),
      normAgeBandId: input.bandId,
    })),
  );
  await tx
    .update(assessmentSessions)
    .set({ status: "calculated", ageAtTest: input.age })
    .where(eq(assessmentSessions.id, session.id));
  if (session.status !== "calculated") {
    assertSessionTransition(session.status, "calculated");
  }
  await writeAudit(tx, {
    organizationId: actorOrganizationId(actor),
    actorType: actor.kind === "user" ? "user" : "system",
    actorId: actorUserId(actor),
    action: "result.calculated",
    objectType: "assessment_result",
    objectId: result.id,
    metadata: {
      sessionId: session.id,
      resultId: result.id,
      ageAtTest: input.age,
      normAgeBandId: input.bandId,
      formVersionId: session.formVersionId,
      scoringKeyVersionId: session.scoringKeyVersionId,
      normSetVersionId: session.normSetVersionId,
      engineVersion: ENGINE_VERSION,
      supersededResultId: input.latestResultId,
    },
  });
  return result.id;
}
