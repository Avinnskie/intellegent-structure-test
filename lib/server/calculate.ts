/**
 * The calculation pipeline (T27, spec §14–§16): responses → RW → age → band → SW → aggregates,
 * snapshotted into `assessment_results` + `subtest_scores` in one transaction.
 *
 * Principles that carry the correctness weight:
 *
 * 1. REPRODUCIBLE BY CONSTRUCTION. Every input is pinned: the session's form/key/norm version ids,
 *    the engine version, the GE scores as recorded. Running calculate twice on identical data
 *    yields identical numbers; every result row names everything that produced it (brief §22).
 * 2. NOTHING IS INVENTED. Age outside every band, an ambiguous band, or a missing norm row does
 *    NOT produce a result — the session goes to `needs_review` and a human decides (spec §15).
 *    Closest-band and interpolation are forbidden; see `lib/domain/norms.ts`.
 * 3. THE TEST DATE IS THE LOCAL (WIB) DATE. Sessions run in UTC+7; a session started 00:00–07:00
 *    WIB falls on the PREVIOUS day in UTC, and an age computed off the UTC date would select the
 *    wrong band for a candidate whose birthday sits in that window — the exact wrong-score class
 *    the brief forbids.
 * 4. UNANSWERED SCORES 0 WITHOUT A ROW. Items with no response row contribute 0 to RW; no
 *    `item_scores` row is fabricated for them (there is no response to attach one to).
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentResults,
  assessmentSessions,
  candidates,
  itemScores,
  itemScoringRules,
  itemVersions,
  normAgeBands,
  normScoreRows,
  responses,
  subtestAttempts,
  subtestScores,
  subtestVersions,
} from "../db/schema.ts";
import {
  categoryForStandardScore,
  CHART_ORDER,
  dominanceProfile,
  ENGINE_VERSION,
  iqFromTotalStandard,
  type DominanceProfile,
  type ScoreCategory,
} from "../domain/aggregate.ts";
import { calculateExactAge } from "../domain/age.ts";
import { lookupStandardScore, selectAgeBand, type AgeBand } from "../domain/norms.ts";
import {
  isGeAutoPayload,
  scoreObjective,
  type ObjectiveRule,
} from "../domain/objective-scoring.ts";
import { assertSessionTransition, type SessionStatus } from "../domain/session-state.ts";
import { SUBTEST_CODES, type SubtestCode } from "../ist-subtests.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";
import { requirePermission } from "./authz.ts";
import { readResponseValue } from "./participant-responses.ts";

const NOT_FOUND_MESSAGE = "Data tidak ditemukan.";
const WRONG_STATUS_MESSAGE = "Sesi ini belum siap dihitung (harus selesai tes dan dinilai GE).";
const GE_INCOMPLETE_MESSAGE = "Masih ada jawaban GE yang belum dinilai.";
const RESULT_FINAL_MESSAGE =
  "Hasil sesi ini sudah final dan tidak dapat dihitung ulang tanpa proses override.";
const NOT_STARTED_MESSAGE = "Sesi ini tidak memiliki waktu mulai; tidak dapat menghitung usia.";

/** Sessions run in WIB (UTC+7). Single-company decision; becomes config if that ever changes. */
const TEST_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The civil date the test happened on, in the test timezone — the date age is computed against. */
export function testDateIso(startedAt: Date): string {
  return new Date(startedAt.getTime() + TEST_TIMEZONE_OFFSET_MS).toISOString().slice(0, 10);
}

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
}

export type NeedsReviewReason = "NO_AGE_BAND" | "AMBIGUOUS_AGE_BAND" | `MISSING_NORM_ROW:${string}`;

export type CalculateOutcome =
  | { kind: "calculated"; resultId: string; iqScore: number }
  | { kind: "needs_review"; reason: NeedsReviewReason };

type SessionRow = {
  id: string;
  status: SessionStatus;
  startedAt: Date | null;
  formVersionId: string;
  scoringKeyVersionId: string;
  normSetVersionId: string;
  candidateId: string;
  birthDate: string;
};

export type CalculationActor =
  { kind: "user"; ctx: AuthContext } | { kind: "system"; organizationId: string };

function actorOrganizationId(actor: CalculationActor): string {
  return actor.kind === "user" ? actor.ctx.organizationId : actor.organizationId;
}

function actorUserId(actor: CalculationActor): string | null {
  return actor.kind === "user" ? actor.ctx.userId : null;
}

async function lockSessionForCalc(
  tx: DbLike,
  actor: CalculationActor,
  sessionId: string,
): Promise<SessionRow> {
  if (!z.uuid().safeParse(sessionId).success) {
    throw notFound();
  }
  const [row] = await tx
    .select({
      id: assessmentSessions.id,
      status: assessmentSessions.status,
      startedAt: assessmentSessions.startedAt,
      formVersionId: assessmentSessions.formVersionId,
      scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
      normSetVersionId: assessmentSessions.normSetVersionId,
      candidateId: assessmentSessions.candidateId,
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
    throw notFound();
  }
  return row;
}

type ItemRow = {
  itemVersionId: string;
  subtestCode: SubtestCode;
  ruleId: string | null;
  ruleType: string | null;
  rulePayload: unknown;
  responseId: string | null;
  storedValue: unknown;
};

/** The full pinned deck with rules and this session's responses, one row per item. */
async function loadItemRows(tx: DbLike, session: SessionRow): Promise<ItemRow[]> {
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

  return rows.map((row) => ({
    ...row,
    subtestCode: row.subtestCode as SubtestCode,
  }));
}

/**
 * Raw scores per subtest. Objective items are scored here (and persisted for the responses that
 * exist); GE items read the HUMAN scores already in `item_scores`. Returns null RW never — an
 * absent answer is a real 0.
 */
async function computeRawScores(
  tx: DbLike,
  actor: CalculationActor,
  session: SessionRow,
  items: ItemRow[],
  now: Date,
): Promise<Record<SubtestCode, number>> {
  const raw = Object.fromEntries(SUBTEST_CODES.map((code) => [code, 0])) as Record<
    SubtestCode,
    number
  >;

  // GE manual scores (human-typed, `autoScore=false`), keyed by responseId. GE items flipped to
  // `autoScore=true` are derived below alongside the objective items instead.
  const geManualResponseIds = items
    .filter(
      (item) =>
        item.subtestCode === "GE" && item.responseId !== null && !isGeAutoPayload(item.rulePayload),
    )
    .map((item) => item.responseId as string);
  const geScoreRows = geManualResponseIds.length
    ? await tx
        .select({ responseId: itemScores.responseId, score: itemScores.score })
        .from(itemScores)
        .where(inArray(itemScores.responseId, geManualResponseIds))
    : [];
  const geScoreByResponse = new Map(geScoreRows.map((row) => [row.responseId, row.score]));

  // Recalculation hygiene: objective (machine) scores are derived data — drop and re-derive.
  // Human GE scores (scoredBy != null) are inputs and are never touched here.
  const allResponseIds = items
    .map((item) => item.responseId)
    .filter((id): id is string => id !== null);
  if (allResponseIds.length > 0) {
    await tx
      .delete(itemScores)
      .where(and(inArray(itemScores.responseId, allResponseIds), isNull(itemScores.scoredBy)));
  }

  const objectiveInserts: (typeof itemScores.$inferInsert)[] = [];

  for (const item of items) {
    if (item.subtestCode === "GE" && !isGeAutoPayload(item.rulePayload)) {
      if (item.responseId !== null) {
        const score = geScoreByResponse.get(item.responseId);
        if (score === undefined) {
          // The GE-complete gate ran before this; reaching here means the rows changed under us.
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
    const value = item.responseId !== null ? readResponseValue(item.storedValue) : null;
    const outcome = scoreObjective(
      { ruleType: item.ruleType, payload: item.rulePayload } as ObjectiveRule,
      value,
    );
    if (outcome.kind !== "scored") {
      throw new Error(
        `Item ${item.itemVersionId} (${item.subtestCode}) memakai aturan manual — kunci rusak.`,
      );
    }

    raw[item.subtestCode] += outcome.score;
    if (item.responseId !== null) {
      objectiveInserts.push({
        responseId: item.responseId,
        score: outcome.score,
        scoringRuleId: item.ruleId,
        scoredBy: null,
        scoredAt: now,
      });
    }
  }

  if (objectiveInserts.length > 0) {
    await tx.insert(itemScores).values(objectiveInserts);
  }

  // `actor` participates only for the audit trail contract of the caller; nothing here branches
  // on the actor. Kept in the signature so a future permission check has a seat.
  void actor;

  return raw;
}

async function routeToNeedsReview(
  tx: DbLike,
  actor: CalculationActor,
  session: SessionRow,
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

/**
 * Runs the pipeline for a session in `needs_ge_scoring` (first run), `calculated` (recalculation:
 * new row, previous non-final rows superseded) or `needs_review` (retry after the norm set or the
 * data was fixed).
 */
export async function calculateResult(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<CalculateOutcome> {
  return db.transaction(async (tx) => runCalculatePipeline(tx, { kind: "user", ctx }, sessionId));
}

/**
 * System-triggered calculate, e.g. when `finishTest` decides every GE item was already auto-scored
 * by keywords and no human intervention is required. Runs INSIDE the caller's transaction so the
 * session transition (test_completed → calculated) commits atomically with the result row.
 *
 * `calculated_by` is nullable in the schema exactly to record this: a null actor means the pipeline
 * fired without a human trigger, and the audit row carries `actorType: 'system'` to match.
 */
export async function calculateResultAsSystem(
  tx: DbLike,
  organizationId: string,
  sessionId: string,
): Promise<CalculateOutcome> {
  return runCalculatePipeline(tx, { kind: "system", organizationId }, sessionId);
}

/**
 * True iff at least one GE response on this session still needs a human score — i.e. its rule is
 * NOT `autoScore=true` and no `item_scores` row exists yet. Used by `finishTest` to decide whether
 * the session can auto-calculate right away or must wait in `needs_ge_scoring` for HR.
 */
export async function sessionHasManualGePending(
  tx: DbLike,
  sessionId: string,
  formVersionId: string,
  scoringKeyVersionId: string,
): Promise<boolean> {
  const rows = await tx
    .select({
      responseId: responses.id,
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

export type EnsureAutomaticResultOutcome =
  CalculateOutcome | { kind: "unchanged" } | { kind: "ge_key_required" };

export async function ensureAutomaticResult(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<EnsureAutomaticResultOutcome> {
  requirePermission(ctx, "view_results");
  if (!z.uuid().safeParse(sessionId).success) {
    throw notFound();
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: assessmentSessions.id,
        status: assessmentSessions.status,
        formVersionId: assessmentSessions.formVersionId,
        scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
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
      throw notFound();
    }
    if (session.status !== "test_completed" && session.status !== "needs_ge_scoring") {
      return { kind: "unchanged" };
    }

    const hasMissingGeKey = await sessionHasManualGePending(
      tx,
      session.id,
      session.formVersionId,
      session.scoringKeyVersionId,
    );
    if (hasMissingGeKey) {
      return { kind: "ge_key_required" };
    }

    return calculateResultAsSystem(tx, ctx.organizationId, session.id);
  });
}

async function runCalculatePipeline(
  tx: DbLike,
  actor: CalculationActor,
  sessionId: string,
): Promise<CalculateOutcome> {
  const session = await lockSessionForCalc(tx, actor, sessionId);

  // A final result locks everything downstream of it (brief §22). Checked BEFORE the status
  // gate so a finalized session answers the specific "final terkunci" refusal, not the generic
  // one — the caller's next step (the audited override) depends on knowing which it is.
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

  if (
    session.status !== "test_completed" &&
    session.status !== "needs_ge_scoring" &&
    session.status !== "calculated" &&
    session.status !== "needs_review"
  ) {
    throw new ApiError("SESSION_NOT_ACTIVE", WRONG_STATUS_MESSAGE, 409);
  }
  if (!session.startedAt) {
    throw new ApiError("SESSION_NOT_STARTED", NOT_STARTED_MESSAGE, 409);
  }

  const items = await loadItemRows(tx, session);

  // GE completeness: only items whose rule is STILL manual (no autoScore keywords authored) need
  // a human score row. GE items flipped to autoScore are derived by the engine below — the same
  // gate for them would falsely block a session whose HR configured keyword-based scoring.
  const geManualResponses = items.filter(
    (item) =>
      item.subtestCode === "GE" && item.responseId !== null && !isGeAutoPayload(item.rulePayload),
  );
  if (geManualResponses.length > 0) {
    const scoreRows = await tx
      .select({ responseId: itemScores.responseId })
      .from(itemScores)
      .where(
        inArray(
          itemScores.responseId,
          geManualResponses.map((item) => item.responseId as string),
        ),
      );
    if (scoreRows.length < geManualResponses.length) {
      throw new ApiError("GE_INCOMPLETE", GE_INCOMPLETE_MESSAGE, 409);
    }
  }

  const now = new Date();
  const raw = await computeRawScores(tx, actor, session, items, now);

  // Age on the LOCAL test date, against the exact-match band set.
  const age = calculateExactAge(session.birthDate, testDateIso(session.startedAt));
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

  // SW per subtest from the band's rows; ANY missing row aborts to needs_review.
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
    const sw = lookupStandardScore(normRows, code, raw[code]);
    if (sw === null) {
      return routeToNeedsReview(tx, actor, session, `MISSING_NORM_ROW:${code}:${raw[code]}`);
    }
    standard[code] = sw;
  }

  const totalRawScore = SUBTEST_CODES.reduce((sum, code) => sum + raw[code], 0);
  const totalStandardScore = SUBTEST_CODES.reduce((sum, code) => sum + standard[code], 0);
  const iqScore = iqFromTotalStandard(totalStandardScore);
  const iqCategory = categoryForStandardScore(iqScore);
  const dominance = dominanceProfile(standard);

  // Supersede every previous live (non-final) result of this session.
  const [result] = await tx
    .insert(assessmentResults)
    .values({
      sessionId: session.id,
      status: "draft",
      ageAtTest: age,
      normAgeBandId: band.id,
      totalRawScore,
      totalStandardScore,
      iqScore,
      iqCategory,
      dominance: dominance.dominance,
      profile: { groupMeans: dominance.groupMeans },
      formVersionId: session.formVersionId,
      scoringKeyVersionId: session.scoringKeyVersionId,
      normSetVersionId: session.normSetVersionId,
      engineVersion: ENGINE_VERSION,
      calculatedBy: actorUserId(actor),
      calculatedAt: now,
    })
    .returning({ id: assessmentResults.id });
  if (!result) {
    throw new Error("Hasil gagal disimpan.");
  }
  if (latest) {
    await tx
      .update(assessmentResults)
      .set({ supersededById: result.id })
      .where(eq(assessmentResults.id, latest.id));
  }

  await tx.insert(subtestScores).values(
    SUBTEST_CODES.map((code) => ({
      resultId: result.id,
      sessionId: session.id,
      subtestCode: code,
      rawScore: raw[code],
      standardScore: standard[code],
      category: categoryForStandardScore(standard[code]),
      normAgeBandId: band.id,
    })),
  );

  await tx
    .update(assessmentSessions)
    .set({ status: "calculated", ageAtTest: age })
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
      ageAtTest: age,
      normAgeBandId: band.id,
      formVersionId: session.formVersionId,
      scoringKeyVersionId: session.scoringKeyVersionId,
      normSetVersionId: session.normSetVersionId,
      engineVersion: ENGINE_VERSION,
      supersededResultId: latest?.id ?? null,
    },
  });

  return { kind: "calculated", resultId: result.id, iqScore };
}

// ---------------------------------------------------------------------------
// Result read model (spec §16)
// ---------------------------------------------------------------------------

export type ResultDto = {
  resultId: string;
  sessionId: string;
  status: string;
  candidate: { fullName: string; birthDate: string; testPurpose: string };
  ageAtTest: number;
  testDate: string;
  normBandLabel: string | null;
  /** In CHART_ORDER (spec §16) — the UI renders, never re-derives. */
  subtests: readonly {
    code: SubtestCode;
    title: string;
    rawScore: number;
    standardScore: number;
    category: ScoreCategory | string;
  }[];
  totals: { rawScore: number; standardScore: number };
  iq: { score: number | null; category: string | null };
  dominance: { dominance: string | null; groupMeans: DominanceProfile["groupMeans"] | null };
  versions: {
    formVersionId: string;
    scoringKeyVersionId: string;
    normSetVersionId: string;
    engineVersion: string;
  };
  calculatedAt: string;
  finalizedAt: string | null;
};

/**
 * The latest live result of a session, shaped for the report table + chart. Gated on
 * `view_results` — role alone is NOT enough (spec §4.3): administering the system and reading
 * psychological results are different privileges.
 */
export async function getResult(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<ResultDto> {
  requirePermission(ctx, "view_results");
  if (!z.uuid().safeParse(sessionId).success) {
    throw notFound();
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
    throw notFound();
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

  const profile = (row.profile ?? null) as { groupMeans?: DominanceProfile["groupMeans"] } | null;

  return {
    resultId: row.resultId,
    sessionId: row.sessionId,
    status: row.status,
    candidate: { fullName: row.fullName, birthDate: row.birthDate, testPurpose: row.testPurpose },
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
    totals: { rawScore: row.totalRawScore, standardScore: row.totalStandardScore },
    iq: { score: row.iqScore, category: row.iqCategory },
    dominance: { dominance: row.dominance, groupMeans: profile?.groupMeans ?? null },
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
