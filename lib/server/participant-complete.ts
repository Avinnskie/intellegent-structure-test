import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  accessCodes,
  assessmentSessions,
  itemOptions,
  itemVersions,
  responses,
  subtestAttempts,
} from "../db/schema.ts";
import type { SubmittedSubtestResponse } from "../domain/submitted-responses.ts";
import {
  assertSessionTransition,
  isPapiStageStatus,
  nextSubtestCode,
  type SessionStatus,
} from "../domain/session-state.ts";
import { SUBTEST_CODES, type SubtestCode } from "../ist-subtests.ts";
import { writeAudit } from "./audit.ts";
import { calculateResultAsSystem, sessionHasManualGePending } from "./calculate.ts";
import { selectNow } from "./db-clock.ts";
import {
  resolveParticipantSession,
  sweepExpiredAttempt,
  toParticipantStatus,
  type ParticipantSessionContext,
  type ParticipantSessionStatus,
} from "./participant-session.ts";

const SUBTEST_LOCKED_MESSAGE = "Subtes ini sudah ditutup dan tidak dapat dibuka kembali.";
const TIME_EXPIRED_MESSAGE = "Waktu subtes ini sudah habis. Subtes ditutup otomatis.";
const WRONG_SUBTEST_MESSAGE = "Subtes ini tidak sedang berjalan. Lanjutkan dari subtes yang aktif.";
const SESSION_NOT_ACTIVE_MESSAGE = "Sesi tes ini belum dapat diselesaikan. Hubungi HR.";
const INVALID_RESPONSES_MESSAGE = "Ada jawaban yang tidak valid untuk subtes aktif.";
const SUBMISSION_GRACE_MS = 5_000;

export type CompleteSubtestDto = {
  sessionStatus: ParticipantSessionStatus;
  currentSubtestCode: SubtestCode | null;
  completedAt: string;
};

export type FinishTestDto = {
  sessionStatus: ParticipantSessionStatus;
  completedAt: string | null;
};

type Outcome<T> = { ok: true; value: T } | { ok: false; error: ApiError };

function ok<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

function fail<T>(error: ApiError): Outcome<T> {
  return { ok: false, error };
}

function unwrap<T>(outcome: Outcome<T>): T {
  if (!outcome.ok) {
    throw outcome.error;
  }
  return outcome.value;
}

function subtestLocked(): ApiError {
  return new ApiError("SUBTEST_LOCKED", SUBTEST_LOCKED_MESSAGE, 409);
}

function timeExpired(): ApiError {
  return new ApiError("TIME_EXPIRED", TIME_EXPIRED_MESSAGE, 410);
}

function wrongSubtest(): ApiError {
  return new ApiError("WRONG_SUBTEST", WRONG_SUBTEST_MESSAGE, 409);
}

function sessionNotActive(): ApiError {
  return new ApiError("SESSION_NOT_ACTIVE", SESSION_NOT_ACTIVE_MESSAGE, 409);
}

function invalidResponses(): ApiError {
  return new ApiError("INVALID_RESPONSE_VALUE", INVALID_RESPONSES_MESSAGE, 422);
}

function asSubtestCode(value: string | null): SubtestCode | null {
  return SUBTEST_CODES.includes(value as SubtestCode) ? (value as SubtestCode) : null;
}

type LockedSession = {
  status: SessionStatus;
  currentSubtestCode: string | null;
  completedAt: Date | null;
  formVersionId: string;
  scoringKeyVersionId: string;
  includesPapi: number;
};

async function lockSession(tx: DbLike, sessionId: string): Promise<LockedSession> {
  const [row] = await tx
    .select({
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
      completedAt: assessmentSessions.completedAt,
      formVersionId: assessmentSessions.formVersionId,
      scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
      includesPapi: assessmentSessions.includesPapi,
    })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, sessionId))
    .for("update")
    .limit(1);

  if (!row) {
    throw new Error(`Sesi ${sessionId} hilang saat menutup subtes.`);
  }
  return row;
}

type AttemptRow = {
  id: string;
  status: (typeof subtestAttempts.$inferSelect)["status"];
  subtestVersionId: string;
  expiresAt: Date;
};

async function selectAttempt(
  tx: DbLike,
  sessionId: string,
  code: SubtestCode,
): Promise<AttemptRow | null> {
  const [row] = await tx
    .select({
      id: subtestAttempts.id,
      status: subtestAttempts.status,
      subtestVersionId: subtestAttempts.subtestVersionId,
      expiresAt: subtestAttempts.expiresAt,
    })
    .from(subtestAttempts)
    .where(and(eq(subtestAttempts.sessionId, sessionId), eq(subtestAttempts.subtestCode, code)))
    .limit(1);

  return row ?? null;
}

async function saveSubmittedResponses(
  tx: DbLike,
  sessionId: string,
  attempt: AttemptRow,
  submitted: readonly SubmittedSubtestResponse[],
  now: Date,
): Promise<Outcome<void>> {
  if (submitted.length === 0) {
    return ok(undefined);
  }

  const submittedIds = submitted.map((response) => response.itemVersionId);
  if (new Set(submittedIds).size !== submittedIds.length) {
    return fail(invalidResponses());
  }

  const items = await tx
    .select({ id: itemVersions.id, itemType: itemVersions.itemType })
    .from(itemVersions)
    .where(
      and(
        eq(itemVersions.subtestVersionId, attempt.subtestVersionId),
        inArray(itemVersions.id, submittedIds),
      ),
    );

  if (items.length !== submitted.length) {
    return fail(invalidResponses());
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const choiceItemIds = items
    .filter((item) => item.itemType === "choice")
    .map((item) => item.id);
  const optionRows =
    choiceItemIds.length === 0
      ? []
      : await tx
          .select({ itemVersionId: itemOptions.itemVersionId, optionCode: itemOptions.optionCode })
          .from(itemOptions)
          .where(inArray(itemOptions.itemVersionId, choiceItemIds));
  const optionKeys = new Set(
    optionRows.map((option) => `${option.itemVersionId}:${option.optionCode}`),
  );

  for (const response of submitted) {
    const item = itemById.get(response.itemVersionId);
    if (!item) {
      return fail(invalidResponses());
    }
    if (
      response.status === "answered" &&
      item.itemType === "choice" &&
      !optionKeys.has(`${response.itemVersionId}:${response.value}`)
    ) {
      return fail(invalidResponses());
    }
  }

  await tx
    .insert(responses)
    .values(
      submitted.map((response) => ({
        sessionId,
        subtestAttemptId: attempt.id,
        itemVersionId: response.itemVersionId,
        responseValue: response.status === "answered" ? { value: response.value } : null,
        responseStatus: response.status,
        answeredAt: response.status === "answered" ? now : null,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [responses.subtestAttemptId, responses.itemVersionId],
      set: {
        responseValue: sql`excluded.response_value`,
        responseStatus: sql`excluded.response_status`,
        answeredAt: sql`excluded.answered_at`,
        updatedAt: now,
        lockedAt: null,
      },
    });

  return ok(undefined);
}

type ClosingChain = {
  status: SessionStatus;
  nextCode: SubtestCode | null;
  /** IST tuntas dan tidak ada tahap lanjutan — sesi boleh ditutup. */
  batteryFinished: boolean;
};

function closingChain(from: SessionStatus, code: SubtestCode, includesPapi: boolean): ClosingChain {
  assertSessionTransition(from, "subtest_completed");

  const next = nextSubtestCode(code);
  if (next) {
    assertSessionTransition("subtest_completed", "tutorial_next");
    return { status: "tutorial_next", nextCode: next, batteryFinished: false };
  }

  // Subtes IST terakhir ditutup, dan IST kini bagian penghabisan baterai —
  // PAPI sudah dikerjakan serta diskor sebelum peserta sampai di sini. Jadi
  // tidak ada lagi tahap menyusul: sesi baterai maupun sesi IST-saja sama-sama
  // langsung ditutup dan masuk skoring.
  void includesPapi;

  assertSessionTransition("subtest_completed", "test_completed");
  assertSessionTransition("test_completed", "needs_ge_scoring");
  return { status: "needs_ge_scoring", nextCode: null, batteryFinished: true };
}

async function lockResponses(tx: DbLike, attemptId: string, now: Date): Promise<void> {
  await tx
    .update(responses)
    .set({ lockedAt: now })
    .where(and(eq(responses.subtestAttemptId, attemptId), isNull(responses.lockedAt)));
}

async function completeWithin(
  tx: DbLike,
  session: ParticipantSessionContext,
  code: SubtestCode,
  now: Date,
  submitted: readonly SubmittedSubtestResponse[],
): Promise<Outcome<CompleteSubtestDto>> {
  const locked = await lockSession(tx, session.sessionId);
  const attempt = await selectAttempt(tx, session.sessionId, code);

  if (!attempt) {
    return fail(wrongSubtest());
  }

  if (attempt.status !== "in_progress") {
    return fail(subtestLocked());
  }

  if (locked.status !== "subtest_in_progress") {
    return fail(sessionNotActive());
  }
  if (locked.currentSubtestCode !== code) {
    return fail(wrongSubtest());
  }

  const overdueMs = now.getTime() - attempt.expiresAt.getTime();
  if (overdueMs > SUBMISSION_GRACE_MS) {
    return fail(timeExpired());
  }

  const saved = await saveSubmittedResponses(tx, session.sessionId, attempt, submitted, now);
  if (!saved.ok) {
    return saved;
  }

  const completionReason = attempt.expiresAt.getTime() <= now.getTime() ? "timeout" : "manual";

  const closed = await tx
    .update(subtestAttempts)
    .set({ status: "completed", completionReason, completedAt: now })
    .where(and(eq(subtestAttempts.id, attempt.id), eq(subtestAttempts.status, "in_progress")))
    .returning({ id: subtestAttempts.id });

  if (closed.length === 0) {
    return fail(subtestLocked());
  }

  await lockResponses(tx, attempt.id, now);

  const chain = closingChain(locked.status, code, locked.includesPapi === 1);

  const [advanced] = await tx
    .update(assessmentSessions)
    .set({
      status: chain.status,
      currentSubtestCode: chain.nextCode ?? locked.currentSubtestCode,
      ...(chain.batteryFinished ? { completedAt: now } : {}),
    })
    .where(eq(assessmentSessions.id, session.sessionId))
    .returning({
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
    });

  if (!advanced) {
    throw new Error("Status sesi gagal diperbarui setelah subtes ditutup.");
  }

  if (chain.batteryFinished) {
    await tx
      .update(accessCodes)
      .set({ status: "completed" })
      .where(
        and(
          eq(accessCodes.sessionId, session.sessionId),
          inArray(accessCodes.status, ["active", "in_use"]),
        ),
      );
  }

  await writeAudit(tx, {
    organizationId: session.organizationId,
    actorType: "participant",
    actorId: session.sessionId,
    action: "subtest.completed",
    objectType: "subtest_attempt",
    objectId: attempt.id,
    metadata: {
      sessionId: session.sessionId,
      subtestCode: code,
      fromStatus: locked.status,
      toStatus: advanced.status,
      completionReason,
    },
  });

  if (chain.batteryFinished) {
    const hasManualGe = await sessionHasManualGePending(
      tx,
      session.sessionId,
      locked.formVersionId,
      locked.scoringKeyVersionId,
    );
    if (!hasManualGe) {
      await calculateResultAsSystem(tx, session.organizationId, session.sessionId);
    }

    const [finalRow] = await tx
      .select({
        status: assessmentSessions.status,
        currentSubtestCode: assessmentSessions.currentSubtestCode,
      })
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, session.sessionId))
      .limit(1);

    return ok({
      sessionStatus: toParticipantStatus(finalRow?.status ?? advanced.status),
      currentSubtestCode: asSubtestCode(
        finalRow?.currentSubtestCode ?? advanced.currentSubtestCode,
      ),
      completedAt: now.toISOString(),
    });
  }

  return ok({
    sessionStatus: toParticipantStatus(advanced.status),
    currentSubtestCode: asSubtestCode(advanced.currentSubtestCode),
    completedAt: now.toISOString(),
  });
}

export async function completeSubtest(
  db: DbLike,
  token: string,
  code: string,
  submitted: readonly SubmittedSubtestResponse[],
): Promise<CompleteSubtestDto> {
  const outcome = await db.transaction(async (tx) => {
    const session = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, session.sessionId);

    const subtestCode = asSubtestCode(code);
    if (!subtestCode) {
      return fail<CompleteSubtestDto>(wrongSubtest());
    }

    return completeWithin(tx, session, subtestCode, now, submitted);
  });

  return unwrap(outcome);
}

async function finishWithin(
  tx: DbLike,
  session: ParticipantSessionContext,
): Promise<Outcome<FinishTestDto>> {
  const locked = await lockSession(tx, session.sessionId);

  if (
    locked.status === "needs_ge_scoring" ||
    locked.status === "calculated" ||
    locked.status === "needs_review" ||
    isPapiStageStatus(locked.status)
  ) {
    return ok({
      sessionStatus: toParticipantStatus(locked.status),
      completedAt: locked.completedAt?.toISOString() ?? null,
    });
  }

  return fail(sessionNotActive());
}

export async function finishTest(db: DbLike, token: string): Promise<FinishTestDto> {
  const outcome = await db.transaction(async (tx) => {
    const resolved = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, resolved.sessionId);
    const session = await sweepExpiredAttempt(tx, resolved, now);
    return finishWithin(tx, session);
  });

  return unwrap(outcome);
}
