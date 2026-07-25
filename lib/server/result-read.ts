import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DbLike } from "../db/client.ts";
import {
  assessmentResults,
  assessmentSessions,
  candidates,
  normAgeBands,
  subtestScores,
  subtestVersions,
} from "../db/schema.ts";
import { CHART_ORDER, type DominanceProfile, type SubtestCategory } from "../domain/aggregate.ts";
import type { SubtestCode } from "../ist-subtests.ts";
import type { AuthContext } from "./authz.ts";
import { requirePermission } from "./authz.ts";
import { calculationNotFound, testDateIso } from "./calculation-types.ts";

export type ResultDto = {
  readonly resultId: string;
  readonly sessionId: string;
  readonly status: string;
  readonly candidate: {
    readonly fullName: string;
    readonly birthDate: string;
    readonly testPurpose: string;
  };
  readonly ageAtTest: number;
  readonly testDate: string;
  readonly normBandLabel: string | null;
  readonly subtests: readonly {
    readonly code: SubtestCode;
    readonly title: string;
    readonly rawScore: number;
    readonly standardScore: number;
    readonly category: SubtestCategory | string;
  }[];
  readonly totals: { readonly rawScore: number; readonly standardScore: number };
  readonly iq: { readonly score: number | null; readonly category: string | null };
  readonly dominance: {
    readonly dominance: string | null;
    readonly profile: Omit<DominanceProfile, "dominance"> | null;
  };
  readonly versions: {
    readonly formVersionId: string;
    readonly scoringKeyVersionId: string;
    readonly normSetVersionId: string;
    readonly engineVersion: string;
  };
  readonly calculatedAt: string;
  readonly finalizedAt: string | null;
};

const dominanceProfileSchema = z.object({
  exactScore: z.number(),
  nonExactScore: z.number(),
  difference: z.number(),
});

export async function getResult(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<ResultDto> {
  requirePermission(ctx, "view_results");
  if (!z.uuid().safeParse(sessionId).success) {
    throw calculationNotFound();
  }
  const [row] = await db
    .select({
      resultId: assessmentResults.id,
      status: assessmentResults.status,
      ageAtTest: assessmentResults.ageAtTest,
      totalRawScore: assessmentResults.totalRawScore,
      totalStandardScore: assessmentResults.totalStandardScore,
      iqScore: assessmentResults.iqScore,
      iqCategory: assessmentResults.iqCategory,
      dominance: assessmentResults.dominance,
      profile: assessmentResults.profile,
      formVersionId: assessmentResults.formVersionId,
      scoringKeyVersionId: assessmentResults.scoringKeyVersionId,
      normSetVersionId: assessmentResults.normSetVersionId,
      engineVersion: assessmentResults.engineVersion,
      calculatedAt: assessmentResults.calculatedAt,
      finalizedAt: assessmentResults.finalizedAt,
      normAgeBandId: assessmentResults.normAgeBandId,
      sessionId: assessmentSessions.id,
      startedAt: assessmentSessions.startedAt,
      fullName: candidates.fullName,
      birthDate: candidates.birthDate,
      testPurpose: candidates.testPurpose,
    })
    .from(assessmentResults)
    .innerJoin(assessmentSessions, eq(assessmentResults.sessionId, assessmentSessions.id))
    .innerJoin(candidates, eq(assessmentSessions.candidateId, candidates.id))
    .where(
      and(
        eq(assessmentResults.sessionId, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
        isNull(assessmentResults.supersededById),
      ),
    )
    .orderBy(desc(assessmentResults.calculatedAt))
    .limit(1);
  if (!row) {
    throw calculationNotFound();
  }

  const [bandRow] = row.normAgeBandId
    ? await db
        .select({ label: normAgeBands.label })
        .from(normAgeBands)
        .where(eq(normAgeBands.id, row.normAgeBandId))
        .limit(1)
    : [];
  const scoreRows = await db
    .select({
      subtestCode: subtestScores.subtestCode,
      rawScore: subtestScores.rawScore,
      standardScore: subtestScores.standardScore,
      category: subtestScores.category,
    })
    .from(subtestScores)
    .where(eq(subtestScores.resultId, row.resultId));
  const scoreByCode = new Map(scoreRows.map((score) => [score.subtestCode, score]));
  const titleRows = await db
    .select({ code: subtestVersions.code, title: subtestVersions.title })
    .from(subtestVersions)
    .where(eq(subtestVersions.formVersionId, row.formVersionId));
  const titleByCode = new Map(titleRows.map((title) => [title.code, title.title]));
  const parsedProfile = dominanceProfileSchema.safeParse(row.profile);

  return {
    resultId: row.resultId,
    sessionId: row.sessionId,
    status: row.status,
    candidate: {
      fullName: row.fullName,
      birthDate: row.birthDate,
      testPurpose: row.testPurpose,
    },
    ageAtTest: row.ageAtTest,
    testDate: row.startedAt ? testDateIso(row.startedAt) : "",
    normBandLabel: bandRow?.label ?? null,
    subtests: CHART_ORDER.map((code) => {
      const score = scoreByCode.get(code);
      if (!score) {
        throw new Error(`Hasil ${row.resultId} tidak punya baris subtes ${code}.`);
      }
      return {
        code,
        title: titleByCode.get(code) ?? code,
        rawScore: score.rawScore,
        standardScore: score.standardScore,
        category: score.category,
      };
    }),
    totals: {
      rawScore: row.totalRawScore,
      standardScore: row.totalStandardScore,
    },
    iq: { score: row.iqScore, category: row.iqCategory },
    dominance: {
      dominance: row.dominance,
      profile: parsedProfile.success ? parsedProfile.data : null,
    },
    versions: {
      formVersionId: row.formVersionId,
      scoringKeyVersionId: row.scoringKeyVersionId,
      normSetVersionId: row.normSetVersionId,
      engineVersion: row.engineVersion,
    },
    calculatedAt: row.calculatedAt.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
  };
}
