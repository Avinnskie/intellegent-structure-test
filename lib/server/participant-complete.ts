import { and, eq, inArray, isNull } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import { accessCodes, assessmentSessions, responses, subtestAttempts } from "../db/schema.ts";
import {
  assertSessionTransition,
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

function asSubtestCode(value: string | null): SubtestCode | null {
  return SUBTEST_CODES.includes(value as SubtestCode) ? (value as SubtestCode) : null;
}

type LockedSession = {
  status: SessionStatus;
  currentSubtestCode: string | null;
  completedAt: Date | null;
  formVersionId: string;
  scoringKeyVersionId: string;
};

async function lockSession(tx: DbLike, sessionId: string): Promise<LockedSession> {
  const [row] = await tx
    .select({
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
      completedAt: assessmentSessions.completedAt,
      formVersionId: assessmentSessions.formVersionId,
      scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
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
      expiresAt: subtestAttempts.expiresAt,
    })
    .from(subtestAttempts)
    .where(and(eq(subtestAttempts.sessionId, sessionId), eq(subtestAttempts.subtestCode, code)))
    .limit(1);

  return row ?? null;
}

function closingChain(
  from: SessionStatus,
  code: SubtestCode,
): { status: SessionStatus; nextCode: SubtestCode | null } {
  assertSessionTransition(from, "subtest_completed");

  const next = nextSubtestCode(code);
  if (next) {
    assertSessionTransition("subtest_completed", "tutorial_next");
    return { status: "tutorial_next", nextCode: next };
  }

  assertSessionTransition("subtest_completed", "test_completed");
  assertSessionTransition("test_completed", "needs_ge_scoring");
  return { status: "needs_ge_scoring", nextCode: null };
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
): Promise<Outcome<CompleteSubtestDto>> {
  const locked = await lockSession(tx, session.sessionId);
  const attempt = await selectAttempt(tx, session.sessionId, code);

  if (!attempt) {
    return fail(wrongSubtest());
  }

  if (attempt.expiresAt.getTime() <= now.getTime()) {
    return fail(timeExpired());
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

  const closed = await tx
    .update(subtestAttempts)
    .set({ status: "completed", completionReason: "manual", completedAt: now })
    .where(and(eq(subtestAttempts.id, attempt.id), eq(subtestAttempts.status, "in_progress")))
    .returning({ id: subtestAttempts.id });

  if (closed.length === 0) {
    return fail(subtestLocked());
  }

  await lockResponses(tx, attempt.id, now);

  const chain = closingChain(locked.status, code);

  const [advanced] = await tx
    .update(assessmentSessions)
    .set({
      status: chain.status,
      currentSubtestCode: chain.nextCode ?? locked.currentSubtestCode,
      ...(chain.nextCode === null ? { completedAt: now } : {}),
    })
    .where(eq(assessmentSessions.id, session.sessionId))
    .returning({
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
    });

  if (!advanced) {
    throw new Error("Status sesi gagal diperbarui setelah subtes ditutup.");
  }

  if (chain.nextCode === null) {
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
      completionReason: "manual",
    },
  });

  if (chain.nextCode === null) {
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
): Promise<CompleteSubtestDto> {
  const outcome = await db.transaction(async (tx) => {
    const resolved = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, resolved.sessionId);
    const session = await sweepExpiredAttempt(tx, resolved, now);

    const subtestCode = asSubtestCode(code);
    if (!subtestCode) {
      return fail<CompleteSubtestDto>(wrongSubtest());
    }

    return completeWithin(tx, session, subtestCode, now);
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
    locked.status === "needs_review"
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
