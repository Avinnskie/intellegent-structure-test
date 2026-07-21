/**
 * Closes a subtest by hand, and drives the session all the way to its scoring state.
 *
 * Four rules shape everything here:
 *
 * 1. CLOSING IS WHAT SHUTS THE WRITE GATE. T14 gates every save on the ATTEMPT row
 *    (`status = 'in_progress'` AND not expired), so flipping that row IS the completion — the
 *    session status that follows is bookkeeping on top of it. Nothing here writes a per-item
 *    "locked" status: T12 stamps `locked_at` and deliberately leaves `response_status` alone,
 *    because that column carries the answered/skipped distinction T27 scores from.
 * 2. THE RECORDED REASON IS HONEST. A "Selesai" that arrives after `expires_at` did not close the
 *    subtest — the clock did (spec §11). The sweep runs first and records `timeout`; this module
 *    then refuses, rather than backdating a manual completion over the clock's.
 * 3. CLOSING ME IS CLOSING THE TEST. Whether the participant hand-closes ME or the clock times it
 *    out, the session walks `subtest_in_progress -> subtest_completed -> test_completed ->
 *    needs_ge_scoring` in one transaction and then runs the GE gate: no manual GE score pending
 *    means the result is calculated immediately (`calculated`), pending means the session waits in
 *    `needs_ge_scoring` for HR. `finishTest` survives only as the IDEMPOTENT replay a client may
 *    still call — it reports, never transitions.
 * 4. THE SESSION ENDS WHEN ITS LAST SUBTEST DOES. `completed_at` is stamped by whoever closes ME —
 *    the sweep or this module — never by a later acknowledgement.
 *
 * Lives beside `participant-session.ts` rather than inside it (the plan said "extend the service")
 * because that module is under review; the shared pieces — `resolveParticipantSession`,
 * `sweepExpiredAttempt` — are imported from it rather than reimplemented, since a second copy of the
 * sweep would be a second answer to "when does a subtest close".
 */
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

/**
 * What the transition screen needs, and nothing else.
 *
 * Typed explicitly rather than inferred from a query so that adding a column to a select cannot
 * widen the payload by accident. There is no field for an answer, a score, or a candidate identity.
 * `nextRoute` is deliberately absent: `getSessionState` owns routing, and a second answer to "where
 * does the participant go now" is exactly the drift T12 exists to prevent.
 */
export type CompleteSubtestDto = {
  /** COARSE, via `toParticipantStatus` — never the internal enum (spec §13). */
  sessionStatus: ParticipantSessionStatus;
  /** The subtest the participant is on NOW: the next one, or ME itself once the test is over. */
  currentSubtestCode: SubtestCode | null;
  /** ISO-8601, from the database clock: the instant the attempt was closed. */
  completedAt: string;
};

export type FinishTestDto = {
  /** COARSE, via `toParticipantStatus` — `needs_ge_scoring` must never reach a participant. */
  sessionStatus: ParticipantSessionStatus;
  /**
   * ISO-8601: when the LAST subtest closed, NOT when this call ran. Null only for a session whose
   * closer failed to stamp it — a broken row, reported rather than invented.
   */
  completedAt: string | null;
};

/**
 * A rejection carried as a VALUE rather than thrown.
 *
 * The reason is `sweepExpiredAttempt`: a completion that arrives after `expires_at` must sweep the
 * attempt closed AND then refuse, and those two happen in one transaction. Throwing the refusal
 * would roll the sweep back — leaving a dead attempt `in_progress` forever, since a participant
 * whose tab shut at timeout may never send another request. So the checks return, the transaction
 * commits its sweep, and the caller throws outside it. Same shape as T14, and for the same reason.
 */
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

/** Reuses T13's code for "this subtest is closed" rather than inventing a synonym for it. */
function subtestLocked(): ApiError {
  return new ApiError("SUBTEST_LOCKED", SUBTEST_LOCKED_MESSAGE, 409);
}

/** Reuses T14's code for "the clock ended this", with copy that fits a close rather than a save. */
function timeExpired(): ApiError {
  return new ApiError("TIME_EXPIRED", TIME_EXPIRED_MESSAGE, 410);
}

/**
 * An unknown subtest code gets the SAME answer as a real-but-wrong one, and as one with no attempt.
 * Distinguishing them would tell a prober which codes exist, and the participant has nothing to do
 * differently either way — the only subtest they may close is the one they are sitting.
 */
function wrongSubtest(): ApiError {
  return new ApiError("WRONG_SUBTEST", WRONG_SUBTEST_MESSAGE, 409);
}

/** Reuses T13's code for "this session cannot do that now"; the copy is this endpoint's own. */
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

/**
 * Re-reads the session under a row lock.
 *
 * The context resolved a statement ago proves nothing: under READ COMMITTED every statement takes a
 * fresh snapshot, so a racing request can advance the session in between. The lock is what makes
 * everything below — the status check, the attempt read, the close — one decision, and it is the
 * SAME lock `sweepExpiredAttempt` and T13's start take, so none of the three can interleave into a
 * lost update on `status`/`current_subtest_code`. Taken BEFORE the attempt row, so the lock order is
 * always session -> attempt and cannot cycle with T14's saves.
 */
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

/** This session's attempt at this subtest. At most one can exist — `attempt_session_subtest_ux`. */
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

/**
 * The status chain a hand-closed subtest drives the session through.
 *
 * `subtest_in_progress -> subtest_completed -> tutorial_next` while subtests remain, and
 * `-> test_completed -> needs_ge_scoring` after ME — the SAME end-of-test chain T12's sweep runs.
 * `test_completed` is a bookkeeping state the machine passes through, not one a session rests in:
 * the GE gate and the auto-calculation that follow decide where the session actually lands, so no
 * manual path can strand a finished test outside HR's queue.
 *
 * Every hop is asserted against the state machine rather than assumed, so an illegal chain fails
 * loudly here instead of writing a status no transition allows.
 */
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

/**
 * Stamps `locked_at` on the rows that exist, and creates none.
 *
 * Unanswered items have NO row (T14 creates them lazily on save), and materializing them here would
 * fabricate rows to record an absence the item list already implies. `response_status` is left
 * untouched on purpose: it carries the meaning T27 scores from, and `locked_at` is what says the
 * attempt is shut. `is null` makes this idempotent, so a re-run cannot move a stamp.
 *
 * This is the same statement T12's sweep runs on the timeout path, and the duplication is deliberate
 * rather than accidental: extracting it would mean editing `participant-session.ts`, which is under
 * review. The two paths can never both run on one attempt — the sweep closes it as `timeout` and
 * this module then refuses — so there is no double-lock to reconcile. See the report: once that file
 * is free, this and `closingChain` belong in one shared attempt-closing module.
 */
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
    // No attempt for this code: it was never started. Answered identically to a code that does not
    // exist, so neither becomes an oracle.
    return fail(wrongSubtest());
  }

  // EXPIRY IS CHECKED BEFORE STATUS, exactly as T14 checks it. After `expires_at` the answer is 410
  // whether or not the sweep has closed the row yet — otherwise the same late click would report 410
  // or 409 depending on who swept first, and spec §11 is about the clock, not the bookkeeping. The
  // sweep above has already recorded the honest `timeout`; this only refuses to overwrite it.
  if (attempt.expiresAt.getTime() <= now.getTime()) {
    return fail(timeExpired());
  }
  if (attempt.status !== "in_progress") {
    // Already handed in. Spec §10: "Peserta tidak dapat kembali ke subtes yang sudah ditutup."
    return fail(subtestLocked());
  }

  // The ATTEMPT is the gate, so it is checked first; these two are the session-level backstop. An
  // in-progress attempt implies `subtest_in_progress` on its own code, so reaching either means the
  // rows disagree — or that an admin froze the session under a live attempt, which is the real case:
  // closing it would advance the session behind their back and defeat the pause.
  if (locked.status !== "subtest_in_progress") {
    return fail(sessionNotActive());
  }
  if (locked.currentSubtestCode !== code) {
    return fail(wrongSubtest());
  }

  const closed = await tx
    .update(subtestAttempts)
    .set({ status: "completed", completionReason: "manual", completedAt: now })
    // The guard AND the row count below are the idempotence, not the read above: under READ
    // COMMITTED a second closer blocks on the ROW lock, then re-evaluates this `where` against the
    // committed row and matches nothing. Everything below must happen exactly once.
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
      // Null means "stay", never "clear": there is no subtest after ME, and blanking the pointer
      // would strip what HR's session list and T27 read to know where the session ended.
      currentSubtestCode: chain.nextCode ?? locked.currentSubtestCode,
      // The session is over the moment its last subtest closed, whoever closed it — the same rule
      // T12's sweep applies, so a timed-out ME and a hand-closed one stamp the same column at the
      // same event.
      ...(chain.nextCode === null ? { completedAt: now } : {}),
    })
    .where(eq(assessmentSessions.id, session.sessionId))
    .returning({
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
    });

  if (!advanced) {
    // The row is locked above, so it cannot have vanished. Failing loudly beats reporting a status
    // nobody read back.
    throw new Error("Status sesi gagal diperbarui setelah subtes ditutup.");
  }

  // The test just ENDED (hand-closed ME): spec §9 — "kode yang selesai tidak dapat memulai sesi
  // baru". A finished sitting's code never admits anyone again, under ANY re-entry policy.
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
    // The session, never the token: an audit row is readable by HR, so an identifier in it must not
    // be a credential.
    actorId: session.sessionId,
    action: "subtest.completed",
    objectType: "subtest_attempt",
    objectId: attempt.id,
    // Codes and statuses only — never an answer, never the token (spec §19).
    metadata: {
      sessionId: session.sessionId,
      subtestCode: code,
      fromStatus: locked.status,
      toStatus: advanced.status,
      completionReason: "manual",
    },
  });

  // FULL AUTO-CALCULATE: the moment the last subtest is closed, run the same GE gate the old
  // finishTest acknowledgement ran. No manual GE score pending → the result is calculated in this
  // same transaction (`calculated`); pending → the session waits in `needs_ge_scoring` for HR.
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

/**
 * "Selesaikan subtes": closes the running attempt and advances the session.
 *
 * Resolve -> read the clock -> SWEEP -> lock -> act, all in one transaction. The sweep is not
 * optional and it is not a formality: it is what makes a click that lands after `expires_at` record
 * `timeout` rather than `manual`, and it must commit even though this call then refuses — hence the
 * `Outcome` above.
 *
 * `code` is typed `string`, not `SubtestCode`: it arrives from a URL path segment, so validating it
 * is this function's job rather than the caller's promise.
 */
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
    // THE IDEMPOTENT REPLAY — and the ONLY thing this endpoint still does. Closing ME (manual or
    // timeout) already drove the session through `needs_ge_scoring` and, when no manual GE score is
    // pending, ran the calculation. A client that still calls finish (the button's fire-and-forget,
    // a retry, an old tab) gets the truth read back from the row — never an error, never a second
    // `session.finished` audit for a transition this call did not make.
    return ok({
      sessionStatus: toParticipantStatus(locked.status),
      completedAt: locked.completedAt?.toISOString() ?? null,
    });
  }

  // Anything else is mid-test or already past the participant's world (reviewed/final/…). Refusing
  // here protects the one thing finish could still break: finishing mid-test would strand unopened
  // subtests in HR's GE queue as if the candidate had sat them.
  return fail(sessionNotActive());
}

/**
 * "Selesaikan tes": kept for backward compatibility with clients that still call it.
 *
 * READ-ONLY BY CONTRACT. Since closing ME (manual or timeout) already drives the session through
 * `needs_ge_scoring` and runs the auto-calculation, this endpoint only reports the committed state
 * — from the scoring states it answers "finished", and from anything mid-test it refuses. It never
 * invents a completion and never audits one.
 *
 * The sweep runs first for the same reason as everywhere else: this call can be the first request
 * the server has seen since ME's timer ran out.
 */
export async function finishTest(db: DbLike, token: string): Promise<FinishTestDto> {
  const outcome = await db.transaction(async (tx) => {
    const resolved = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, resolved.sessionId);
    const session = await sweepExpiredAttempt(tx, resolved, now);
    return finishWithin(tx, session);
  });

  return unwrap(outcome);
}
