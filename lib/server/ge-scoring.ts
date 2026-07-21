/**
 * GE manual scoring (T25, spec §14): the one subtest a human scores, on a 0/1/2 rubric.
 *
 * Ground rules:
 * - Only sessions in `needs_ge_scoring` accept scores — before that the participant may still be
 *   writing; after `calculated` the numbers are already derived from these scores.
 * - A response may be scored once freely; CHANGING a recorded score requires an override reason
 *   and writes an `ge.overridden` audit row. A psychological score that silently changed is
 *   exactly what the audit trail exists to prevent.
 * - Unanswered GE items have NO response row and cannot be hand-scored; the calculation pipeline
 *   (T27) scores their absence 0 automatically. Completeness therefore means: every GE response
 *   THAT EXISTS carries a score.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentSessions,
  itemScores,
  itemScoringRules,
  itemVersions,
  responses,
  subtestAttempts,
  subtestVersions,
} from "../db/schema.ts";
import { readResponseValue } from "./participant-responses.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";
import { calculateResultAsSystem } from "./calculate.ts";
import { dbNow } from "./db-clock.ts";

const NOT_FOUND_MESSAGE = "Data tidak ditemukan.";
const WRONG_STATUS_MESSAGE = "Sesi ini tidak sedang menunggu penilaian GE.";
const OVERRIDE_REASON_MESSAGE = "Mengubah skor yang sudah tercatat membutuhkan alasan override.";
const UNKNOWN_RESPONSE_MESSAGE = "Ada jawaban yang bukan milik subtes GE sesi ini.";

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
}

export type GeItemDto = {
  responseId: string | null;
  itemVersionId: string;
  localNumber: number;
  prompt: string;
  /** The participant's ORIGINAL text, verbatim (spec §12: preserved as typed). Null = unanswered. */
  responseValue: string | null;
  responseStatus: string | null;
  score: number | null;
  scoreNote: string | null;
  rubric: string | null;
};

export type GeListDto = {
  sessionId: string;
  candidateAnswered: number;
  totalItems: number;
  scored: number;
  /** True when every EXISTING GE response has a score — the gate T27 checks before calculating. */
  isComplete: boolean;
  items: readonly GeItemDto[];
};

type GeRow = {
  itemVersionId: string;
  localNumber: number;
  prompt: string;
  responseId: string | null;
  storedValue: unknown;
  responseStatus: string | null;
  rubricPayload: unknown;
};

/** Org-scoped session read; the GE deck of its pinned form version. */
async function loadGeRows(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<{ session: { id: string; status: string }; rows: GeRow[] }> {
  if (!z.uuid().safeParse(sessionId).success) {
    throw notFound();
  }
  const [session] = await db
    .select({
      id: assessmentSessions.id,
      status: assessmentSessions.status,
      formVersionId: assessmentSessions.formVersionId,
    })
    .from(assessmentSessions)
    .where(
      and(
        eq(assessmentSessions.id, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);
  if (!session) {
    throw notFound();
  }

  const rows = await db
    .select({
      itemVersionId: itemVersions.id,
      localNumber: itemVersions.sequence,
      prompt: itemVersions.prompt,
      responseId: responses.id,
      storedValue: responses.responseValue,
      responseStatus: responses.responseStatus,
      rubricPayload: itemScoringRules.rulePayload,
    })
    .from(itemVersions)
    .innerJoin(subtestVersions, eq(itemVersions.subtestVersionId, subtestVersions.id))
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
    .leftJoin(itemScoringRules, eq(itemScoringRules.itemVersionId, itemVersions.id))
    .where(
      and(eq(subtestVersions.formVersionId, session.formVersionId), eq(subtestVersions.code, "GE")),
    )
    .orderBy(asc(itemVersions.sequence));

  return { session: { id: session.id, status: session.status }, rows };
}

function rubricFrom(payload: unknown): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const rubric = (payload as { rubric?: unknown }).rubric;
    return typeof rubric === "string" ? rubric : null;
  }
  return null;
}

export async function listGeItems(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<GeListDto> {
  const { session, rows } = await loadGeRows(db, ctx, sessionId);

  const responseIds = rows.map((row) => row.responseId).filter((id): id is string => id !== null);
  const scoreRows = responseIds.length
    ? await db
        .select({
          responseId: itemScores.responseId,
          score: itemScores.score,
          note: itemScores.overrideReason,
          scoredAt: itemScores.scoredAt,
        })
        .from(itemScores)
        .where(inArray(itemScores.responseId, responseIds))
    : [];
  const scoreByResponse = new Map(scoreRows.map((row) => [row.responseId, row]));

  const items: GeItemDto[] = rows.map((row) => {
    const score = row.responseId ? scoreByResponse.get(row.responseId) : undefined;
    return {
      responseId: row.responseId,
      itemVersionId: row.itemVersionId,
      localNumber: row.localNumber,
      prompt: row.prompt,
      responseValue: readResponseValue(row.storedValue),
      responseStatus: row.responseStatus,
      score: score?.score ?? null,
      scoreNote: score?.note ?? null,
      rubric: rubricFrom(row.rubricPayload),
    };
  });

  const answered = items.filter((item) => item.responseId !== null);
  const scored = answered.filter((item) => item.score !== null).length;

  return {
    sessionId: session.id,
    candidateAnswered: answered.length,
    totalItems: items.length,
    scored,
    isComplete: scored === answered.length,
    items,
  };
}

export const geScoreEntrySchema = z.object({
  responseId: z.uuid(),
  score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  note: z.string().trim().min(1).max(500).optional(),
  overrideReason: z.string().trim().min(1).max(500).optional(),
});

export const saveGeScoresSchema = z.object({
  scores: z.array(geScoreEntrySchema).min(1).max(16),
});

export type SaveGeScoresDto = {
  sessionId: string;
  saved: number;
  overridden: number;
  isComplete: boolean;
};

export async function saveGeScores(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
  input: unknown,
): Promise<SaveGeScoresDto> {
  const data = saveGeScoresSchema.parse(input);

  return db.transaction(async (tx) => {
    const { session, rows } = await loadGeRows(tx, ctx, sessionId);
    if (session.status !== "needs_ge_scoring") {
      throw new ApiError("SESSION_NOT_ACTIVE", WRONG_STATUS_MESSAGE, 409);
    }

    // Every submitted responseId must be a GE response OF THIS SESSION — anything else (another
    // session's response, another subtest's, a fabricated uuid) is refused wholesale.
    const validResponseIds = new Set(
      rows.map((row) => row.responseId).filter((id): id is string => id !== null),
    );
    for (const entry of data.scores) {
      if (!validResponseIds.has(entry.responseId)) {
        throw new ApiError("INVALID_RESPONSE", UNKNOWN_RESPONSE_MESSAGE, 422);
      }
    }

    const submittedIds = data.scores.map((entry) => entry.responseId);
    const existing = submittedIds.length
      ? await tx
          .select({ id: itemScores.id, responseId: itemScores.responseId, score: itemScores.score })
          .from(itemScores)
          .where(inArray(itemScores.responseId, submittedIds))
      : [];
    const existingByResponse = new Map(existing.map((row) => [row.responseId, row]));

    const [clock] = await tx
      .select({ now: dbNow() })
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, session.id))
      .limit(1);
    if (!clock) {
      throw new Error("Gagal membaca jam server saat menyimpan skor GE.");
    }

    let saved = 0;
    let overridden = 0;

    for (const entry of data.scores) {
      const current = existingByResponse.get(entry.responseId);

      if (!current) {
        await tx.insert(itemScores).values({
          responseId: entry.responseId,
          score: entry.score,
          scoredBy: ctx.userId,
          scoredAt: clock.now,
          overrideReason: entry.note ?? null,
        });
        saved += 1;
        continue;
      }

      if (current.score === entry.score) {
        // Same value re-submitted (a save-all button does this) — not an override, nothing to do.
        continue;
      }

      // CHANGING a recorded score is the guarded path: reason required, audit written.
      if (!entry.overrideReason) {
        throw new ApiError("OVERRIDE_REASON_REQUIRED", OVERRIDE_REASON_MESSAGE, 422);
      }
      await tx
        .update(itemScores)
        .set({
          score: entry.score,
          scoredBy: ctx.userId,
          scoredAt: clock.now,
          overrideReason: entry.overrideReason,
        })
        .where(eq(itemScores.id, current.id));
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorType: "user",
        actorId: ctx.userId,
        action: "ge.overridden",
        objectType: "item_score",
        objectId: current.id,
        metadata: {
          sessionId: session.id,
          responseId: entry.responseId,
          fromScore: current.score,
          toScore: entry.score,
          reason: entry.overrideReason,
        },
      });
      overridden += 1;
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "ge.scored",
      objectType: "assessment_session",
      objectId: session.id,
      metadata: { sessionId: session.id, saved, overridden },
    });

    const summary = await listGeItems(tx, ctx, sessionId);
    if (summary.isComplete) {
      await calculateResultAsSystem(tx, ctx.organizationId, session.id);
    }
    return { sessionId: session.id, saved, overridden, isComplete: summary.isComplete };
  });
}

/** The gate T27 checks: every EXISTING GE response is scored (absence is auto-0 at calculate). */
export async function isGeComplete(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<boolean> {
  return (await listGeItems(db, ctx, sessionId)).isComplete;
}
