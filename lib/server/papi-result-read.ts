import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbLike } from "../db/client.ts";
import {
  assessmentSessions,
  candidates,
  papiAttempts,
  papiFactorScores,
  papiItemVersions,
  papiResponses,
  papiResults,
} from "../db/schema.ts";
import { PAPI_GROUPS } from "../domain/official-papi.ts";
import type {
  PapiCategory,
  PapiFactorCode,
  PapiGroupCode,
  PapiOptionCode,
} from "../papi-factors.ts";
import type { AuthContext } from "./authz.ts";
import { requirePermission } from "./authz.ts";
import { calculationNotFound } from "./calculation-types.ts";
import { papiElapsedSeconds } from "./papi-session.ts";

export type PapiFactorRow = {
  readonly code: PapiFactorCode;
  readonly name: string;
  readonly group: PapiGroupCode;
  readonly kind: "role" | "need";
  readonly score: number;
  readonly category: PapiCategory | string;
  readonly interpretation: string | null;
  readonly interpretationPending: boolean;
};

export type PapiGroupRow = {
  readonly code: PapiGroupCode;
  readonly label: string;
  readonly total: number;
  readonly average: number;
  readonly factors: readonly PapiFactorRow[];
};

export type PapiResultDto = {
  readonly papiResultId: string;
  readonly sessionId: string;
  readonly status: string;
  readonly candidate: { readonly fullName: string };
  readonly elapsedSeconds: number;
  readonly roleTotal: number;
  readonly needTotal: number;
  readonly totalScore: number;
  readonly factors: readonly PapiFactorRow[];
  readonly groups: readonly PapiGroupRow[];
  readonly pendingInterpretationFactors: readonly string[];
  readonly engineVersion: string;
  readonly papiFormVersionId: string;
  readonly calculatedAt: string;
  readonly finalizedAt: string | null;
};

export type PapiAnswerRow = {
  readonly itemNumber: number;
  readonly optionAText: string;
  readonly optionBText: string;
  readonly optionAFactor: string;
  readonly optionBFactor: string;
  readonly selected: PapiOptionCode | null;
  readonly selectedFactor: string | null;
  readonly answeredAt: string | null;
};

export type PapiAnswerSheetDto = {
  readonly attemptId: string;
  readonly itemCount: number;
  readonly answeredCount: number;
  readonly elapsedSeconds: number;
  readonly resumeCount: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly answers: readonly PapiAnswerRow[];
};

/**
 * Lembar jawaban mentah peserta untuk halaman detail sesi.
 * Mengembalikan `null` bila peserta belum pernah membuka bagian PAPI.
 */
export async function getPapiAnswerSheet(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<PapiAnswerSheetDto | null> {
  requirePermission(ctx, "view_results");

  if (!z.uuid().safeParse(sessionId).success) {
    throw calculationNotFound();
  }

  const [attempt] = await db
    .select({
      id: papiAttempts.id,
      papiFormVersionId: papiAttempts.papiFormVersionId,
      startedAt: papiAttempts.startedAt,
      completedAt: papiAttempts.completedAt,
      resumeCount: papiAttempts.resumeCount,
    })
    .from(papiAttempts)
    .innerJoin(assessmentSessions, eq(papiAttempts.sessionId, assessmentSessions.id))
    .where(
      and(
        eq(papiAttempts.sessionId, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);

  if (!attempt) {
    return null;
  }

  const rows = await db
    .select({
      itemNumber: papiItemVersions.itemNumber,
      optionAText: papiItemVersions.optionAText,
      optionBText: papiItemVersions.optionBText,
      optionAFactor: papiItemVersions.optionAFactor,
      optionBFactor: papiItemVersions.optionBFactor,
      selected: papiResponses.optionCode,
      answeredAt: papiResponses.answeredAt,
    })
    .from(papiItemVersions)
    .leftJoin(
      papiResponses,
      and(
        eq(papiResponses.papiAttemptId, attempt.id),
        eq(papiResponses.itemNumber, papiItemVersions.itemNumber),
      ),
    )
    .where(eq(papiItemVersions.papiFormVersionId, attempt.papiFormVersionId))
    .orderBy(asc(papiItemVersions.itemNumber));

  const answers: PapiAnswerRow[] = rows.map((row) => ({
    itemNumber: row.itemNumber,
    optionAText: row.optionAText,
    optionBText: row.optionBText,
    optionAFactor: row.optionAFactor,
    optionBFactor: row.optionBFactor,
    selected: row.selected,
    selectedFactor:
      row.selected === "A" ? row.optionAFactor : row.selected === "B" ? row.optionBFactor : null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
  }));

  return {
    attemptId: attempt.id,
    itemCount: answers.length,
    answeredCount: answers.filter((answer) => answer.selected !== null).length,
    elapsedSeconds: await papiElapsedSeconds(db, attempt.id),
    resumeCount: attempt.resumeCount,
    startedAt: attempt.startedAt.toISOString(),
    completedAt: attempt.completedAt?.toISOString() ?? null,
    answers,
  };
}

/** Tahap PAPI pada sesi yang belum menghasilkan skor. */
export type PapiStageDto = {
  readonly includesPapi: boolean;
  readonly skipped: boolean;
  readonly skipReason: string | null;
  readonly skippedAt: string | null;
};

export async function getPapiStage(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<PapiStageDto> {
  if (!z.uuid().safeParse(sessionId).success) {
    throw calculationNotFound();
  }

  const [row] = await db
    .select({
      includesPapi: assessmentSessions.includesPapi,
      skipReason: assessmentSessions.papiSkipReason,
      skippedAt: assessmentSessions.papiSkippedAt,
    })
    .from(assessmentSessions)
    .where(
      and(
        eq(assessmentSessions.id, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    throw calculationNotFound();
  }

  return {
    includesPapi: row.includesPapi === 1,
    skipped: row.skipReason !== null,
    skipReason: row.skipReason,
    skippedAt: row.skippedAt?.toISOString() ?? null,
  };
}

/**
 * Hasil PAPI terakhir untuk sesi. Mengembalikan `null` bila peserta belum
 * menyelesaikan tahap PAPI atau tahapnya dilewati — bukan melempar 404,
 * supaya halaman hasil IST tetap dapat dirender apa adanya.
 */
export async function getPapiResult(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<PapiResultDto | null> {
  requirePermission(ctx, "view_results");

  if (!z.uuid().safeParse(sessionId).success) {
    throw calculationNotFound();
  }

  const [row] = await db
    .select({
      papiResultId: papiResults.id,
      status: papiResults.status,
      elapsedSeconds: papiResults.elapsedSeconds,
      roleTotal: papiResults.roleTotal,
      needTotal: papiResults.needTotal,
      totalScore: papiResults.totalScore,
      pendingInterpretationFactors: papiResults.pendingInterpretationFactors,
      engineVersion: papiResults.engineVersion,
      papiFormVersionId: papiResults.papiFormVersionId,
      calculatedAt: papiResults.calculatedAt,
      finalizedAt: papiResults.finalizedAt,
      sessionId: assessmentSessions.id,
      fullName: candidates.fullName,
    })
    .from(papiResults)
    .innerJoin(assessmentSessions, eq(papiResults.sessionId, assessmentSessions.id))
    .innerJoin(candidates, eq(assessmentSessions.candidateId, candidates.id))
    .where(
      and(
        eq(papiResults.sessionId, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .orderBy(desc(papiResults.calculatedAt))
    .limit(1);

  if (!row) {
    return null;
  }

  const factorRows = await db
    .select({
      code: papiFactorScores.factorCode,
      name: papiFactorScores.factorName,
      group: papiFactorScores.groupCode,
      kind: papiFactorScores.factorKind,
      score: papiFactorScores.score,
      category: papiFactorScores.category,
      interpretation: papiFactorScores.interpretation,
      interpretationPending: papiFactorScores.interpretationPending,
    })
    .from(papiFactorScores)
    .where(eq(papiFactorScores.papiResultId, row.papiResultId))
    .orderBy(asc(papiFactorScores.factorCode));

  const factors: PapiFactorRow[] = factorRows.map((factor) => ({
    code: factor.code as PapiFactorCode,
    name: factor.name,
    group: factor.group as PapiGroupCode,
    kind: factor.kind,
    score: factor.score,
    category: factor.category,
    interpretation: factor.interpretation,
    interpretationPending: factor.interpretationPending === 1,
  }));

  const byCode = new Map(factors.map((factor) => [factor.code, factor]));

  // Urutan kelompok dan faktor mengikuti definisi resmi, bukan urutan baris DB.
  const groups: PapiGroupRow[] = PAPI_GROUPS.map((group) => {
    const members = group.factors
      .map((code) => byCode.get(code))
      .filter((factor): factor is PapiFactorRow => factor !== undefined);
    const total = members.reduce((sum, factor) => sum + factor.score, 0);

    return {
      code: group.code,
      label: group.label,
      total,
      average: members.length === 0 ? 0 : Number((total / members.length).toFixed(2)),
      factors: members,
    };
  });

  return {
    papiResultId: row.papiResultId,
    sessionId: row.sessionId,
    status: row.status,
    candidate: { fullName: row.fullName },
    elapsedSeconds: row.elapsedSeconds,
    roleTotal: row.roleTotal,
    needTotal: row.needTotal,
    totalScore: row.totalScore,
    factors: groups.flatMap((group) => group.factors),
    groups,
    pendingInterpretationFactors: row.pendingInterpretationFactors,
    engineVersion: row.engineVersion,
    papiFormVersionId: row.papiFormVersionId,
    calculatedAt: row.calculatedAt.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
  };
}
