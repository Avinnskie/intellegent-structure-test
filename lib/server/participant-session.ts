/**
 * Participant session state: the read model the test client polls, and the timeout sweep that
 * closes an expired subtest exactly once.
 *
 * Two invariants shape everything here:
 *
 * 1. THE SERVER OWNS THE CLOCK. `serverNow` is the database's `now()`, never the Node process
 *    clock, so the client's offset math and the sweep's expiry decision are made against ONE
 *    authority. Web servers and app servers drift apart; the database cannot drift from itself.
 * 2. TIMEOUT CLOSES A SUBTEST ONCE (spec §11). Every request may sweep, so no read may be trusted
 *    as a decision — see `sweepExpiredAttempt` for the three layers that make the close idempotent
 *    and for which of them the test suite can and cannot reach.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import { getServerConfig } from "../config.ts";
import type { DbLike } from "../db/client.ts";
import {
  accessCodes,
  assessmentSessions,
  itemVersions,
  participantTokens,
  responses,
  subtestAttempts,
  subtestVersions,
  tutorialVersions,
} from "../db/schema.ts";
import {
  assertSessionTransition,
  nextSubtestCode,
  type SessionStatus,
} from "../domain/session-state.ts";
import { hashSessionToken } from "../domain/session-token.ts";
import { getAttemptRemainingSeconds } from "../domain/timer.ts";
import { asSubtestCode, type SubtestCode } from "../ist-subtests.ts";
import { writeAudit } from "./audit.ts";
import { calculateResultAsSystem, sessionHasManualGePending } from "./calculate.ts";
import { dbNow, selectNow } from "./db-clock.ts";

const TOKEN_INVALID_MESSAGE = "Sesi tes tidak ditemukan atau sudah tidak berlaku. Hubungi HR.";

/**
 * How stale `last_seen_at` may get before a request rewrites it.
 *
 * Every participant request passes through `resolveParticipantSession`, and T17 polls `/heartbeat`
 * about once a second. Writing on every one of those would put ~1 write/second/participant on the
 * Supabase transaction pooler (`DB_POOL_MAX=5`) to maintain a field HR reads as "is this candidate
 * still there" — a question 30-second granularity answers just as well as 1-second granularity.
 */
const LAST_SEEN_THROTTLE_MS = 30_000;

type ResponseStatusValue = (typeof responses.$inferSelect)["responseStatus"];

/**
 * What the PARTICIPANT is told about their session — deliberately coarser than `SessionStatus`.
 *
 * Spec §13: "Peserta tidak melihat status scoring internal." The raw 17-value enum carries the whole
 * back-office workflow (`needs_ge_scoring`, `calculated`, `reviewed`, `needs_review`, `final`), and
 * shipping it to the browser leaks that workflow whether or not the UI renders it — a response body
 * is readable in devtools. So the enum stops at the service boundary and this union crosses it.
 *
 * Five values, one per thing a participant can actually DO:
 *
 * - `tutorial`   — read the instructions, then start the subtest.
 * - `question`   — answer; a timer is running.
 * - `finished`   — the test is over. Every scoring state collapses to this: from the participant's
 *                  side, GE marking and norm lookup are indistinguishable from "done".
 * - `paused`     — an admin froze the session; it is INTENDED to resume. Kept distinct from
 *                  `finished` precisely so the closing page is not shown to someone who will come
 *                  back — the two are opposite futures and must never share a screen.
 * - `unavailable` — the session cannot be continued (expired/cancelled/invalidated/void), or is in a
 *                  state unreachable with a token at all. Fails closed: never hands out a test.
 */
export type ParticipantSessionStatus =
  "tutorial" | "question" | "finished" | "paused" | "unavailable";

/**
 * The internal status -> participant status projection.
 *
 * Keyed by every `SessionStatus`, so a new enum value is a TYPE ERROR here rather than a state that
 * silently leaks or routes nowhere. This is the ONLY place the two vocabularies meet.
 *
 * `code_generated`/`code_validated` are unreachable while holding a token (it is issued in the same
 * transaction that moves the session to `tutorial`), so they fail closed as `unavailable`.
 */
const PARTICIPANT_STATUS: Readonly<Record<SessionStatus, ParticipantSessionStatus>> = {
  code_generated: "unavailable",
  code_validated: "unavailable",
  tutorial: "tutorial",
  subtest_in_progress: "question",
  subtest_completed: "tutorial",
  tutorial_next: "tutorial",
  test_completed: "finished",
  needs_ge_scoring: "finished",
  calculated: "finished",
  reviewed: "finished",
  final: "finished",
  paused_by_admin: "paused",
  expired: "unavailable",
  cancelled: "unavailable",
  invalidated: "unavailable",
  // Reached only from `needs_ge_scoring`/`calculated`, so the participant HAS finished; that a norm
  // band is missing is our problem, not theirs, and naming it would be the exact leak §13 forbids.
  needs_review: "finished",
  void: "unavailable",
};

/**
 * The one door from the internal vocabulary to the participant's. Every DTO that carries a session
 * status to the participant client must pass through here — T15's complete/finish DTOs included —
 * so §13's "peserta tidak melihat status scoring internal" is enforced by a single map instead of
 * re-decided per endpoint. The map itself stays private so no caller can read around the projection.
 */
export function toParticipantStatus(status: SessionStatus): ParticipantSessionStatus {
  return PARTICIPANT_STATUS[status];
}

/** Statuses that describe a participant who is inside a subtest and needs its content. */
const CONTENT_KINDS: ReadonlySet<ParticipantSessionStatus> = new Set(["tutorial", "question"]);

export type ParticipantSessionContext = {
  tokenId: string;
  sessionId: string;
  organizationId: string;
  sessionStatus: SessionStatus;
  currentSubtestCode: SubtestCode | null;
  formVersionId: string;
  scoringKeyVersionId: string;
  /** `{ SE: tutorialVersionId, ... }` — spec §10A. Validated on read; never handed to the client. */
  pinnedTutorialVersions: Readonly<Record<string, string>>;
};

/** Per-item progress. Deliberately carries NO value: the client already knows what it typed. */
export type SessionStateItem = {
  itemNumber: number;
  status: ResponseStatusValue;
};

/**
 * Everything the participant client is allowed to know, and nothing else.
 *
 * Typed explicitly rather than inferred from a query so that adding a column to a select cannot
 * widen the payload by accident. There is no field for a response value, a scoring rule, a norm, or
 * a candidate's identity — the absence is the mechanism; the leak test is only the net.
 */
export type SessionStateDto = {
  /**
   * COARSE, not the internal enum (spec §13). T16/T17 render from this and from `nextRoute`, which
   * agree by construction — both derive from `PARTICIPANT_STATUS`.
   */
  sessionStatus: ParticipantSessionStatus;
  /** ISO-8601, from the database clock. The client's countdown is `expiresAt - serverNow`. */
  serverNow: string;
  nextRoute: string;
  currentSubtest: {
    code: SubtestCode;
    title: string;
    itemCount: number;
    durationSeconds: number;
  } | null;
  tutorial: { textContent: string; videoReference: string | null } | null;
  attempt: { startedAt: string; expiresAt: string; remainingSeconds: number } | null;
  /** One entry per item of the current subtest; empty when no attempt is running. */
  items: readonly SessionStateItem[];
};

export type HeartbeatDto = {
  serverNow: string;
  /** COARSE, not the internal enum — same reason as `SessionStateDto.sessionStatus`. */
  sessionStatus: ParticipantSessionStatus;
  /** 0 when no attempt is running — including immediately after this call swept one closed. */
  remainingSeconds: number;
};

/**
 * A pin map that is not an object of strings is a corrupt session row, not a bad request: it can
 * only come from our own writer. It throws a plain `Error` so `withApiHandler` reports a 500 and
 * the fault is visible, rather than a 4xx that blames the participant.
 */
function asPinnedTutorialVersions(value: unknown, sessionId: string): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`pinned_tutorial_versions sesi ${sessionId} bukan objek.`);
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([, id]) => typeof id !== "string")) {
    throw new Error(`pinned_tutorial_versions sesi ${sessionId} berisi nilai non-string.`);
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

/**
 * Resolves a raw participant token to its session.
 *
 * A revoked token is rejected with the SAME code and status as one that never existed: the client
 * has nothing to do differently, and distinguishing them would turn this into an oracle for whether
 * a guessed token was ever real. 401 rather than 404 — the token is the credential.
 *
 * `last_seen_at` is stamped here because this is the one place every participant request passes
 * through, which is what makes it a truthful liveness signal for HR's session list. It is THROTTLED
 * rather than written every time — see `LAST_SEEN_THROTTLE_MS`.
 */
export async function resolveParticipantSession(
  db: DbLike,
  rawToken: string,
): Promise<ParticipantSessionContext> {
  // Sync, and now memoized (see `lib/config.ts`), so this costs an object read rather than a zod
  // parse of the whole environment on every participant request.
  const tokenHash = hashSessionToken(rawToken, getServerConfig().SESSION_TOKEN_SECRET);

  const [row] = await db
    .select({
      tokenId: participantTokens.id,
      revokedAt: participantTokens.revokedAt,
      lastSeenAt: participantTokens.lastSeenAt,
      sessionId: assessmentSessions.id,
      organizationId: assessmentSessions.organizationId,
      sessionStatus: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
      formVersionId: assessmentSessions.formVersionId,
      scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
      pinnedTutorialVersions: assessmentSessions.pinnedTutorialVersions,
    })
    .from(participantTokens)
    .innerJoin(assessmentSessions, eq(participantTokens.sessionId, assessmentSessions.id))
    .where(eq(participantTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.revokedAt !== null) {
    throw new ApiError("TOKEN_INVALID", TOKEN_INVALID_MESSAGE, 401);
  }

  // The staleness test uses the NODE clock against a DB-written timestamp, which the value itself
  // does not: a few ms of skew cannot matter at 30-second granularity, and this is a liveness hint,
  // never an authority. `dbNow()` is what gets STORED, so the column stays on the database's clock.
  const isStale =
    row.lastSeenAt === null || Date.now() - row.lastSeenAt.getTime() >= LAST_SEEN_THROTTLE_MS;

  if (isStale) {
    await db
      .update(participantTokens)
      .set({ lastSeenAt: dbNow() })
      .where(eq(participantTokens.id, row.tokenId));
  }

  return {
    tokenId: row.tokenId,
    sessionId: row.sessionId,
    organizationId: row.organizationId,
    sessionStatus: row.sessionStatus,
    currentSubtestCode: asSubtestCode(row.currentSubtestCode),
    formVersionId: row.formVersionId,
    scoringKeyVersionId: row.scoringKeyVersionId,
    pinnedTutorialVersions: asPinnedTutorialVersions(row.pinnedTutorialVersions, row.sessionId),
  };
}

type AttemptRow = {
  id: string;
  subtestCode: string;
  subtestVersionId: string;
  startedAt: Date;
  durationSeconds: number;
  expiresAt: Date;
};

/** The session's single running attempt, if any. */
async function selectInProgressAttempt(db: DbLike, sessionId: string): Promise<AttemptRow | null> {
  const [row] = await db
    .select({
      id: subtestAttempts.id,
      subtestCode: subtestAttempts.subtestCode,
      subtestVersionId: subtestAttempts.subtestVersionId,
      startedAt: subtestAttempts.startedAt,
      durationSeconds: subtestAttempts.durationSeconds,
      expiresAt: subtestAttempts.expiresAt,
    })
    .from(subtestAttempts)
    .where(and(eq(subtestAttempts.sessionId, sessionId), eq(subtestAttempts.status, "in_progress")))
    .orderBy(asc(subtestAttempts.startedAt))
    .limit(1);

  return row ?? null;
}

/**
 * A sweep's outcome: the session's resulting state, plus the attempt that is RUNNING afterwards.
 *
 * `attempt` is null whenever nothing is live — no attempt, one just closed, or the session is not in
 * a subtest at all. Returning it costs nothing (the sweep has already read it) and saves the callers
 * a second `selectInProgressAttempt` per request.
 */
type SweepResult = {
  session: ParticipantSessionContext;
  attempt: AttemptRow | null;
};

/**
 * Re-reads the session's status and current subtest from the row.
 *
 * Needed because a context resolved a statement ago is not proof of anything: under READ COMMITTED
 * every statement takes a FRESH snapshot, so a racing request can advance the session between the
 * resolve and the sweep, and echoing the caller's copy would report `subtest_in_progress` for a
 * session the database has already moved to `tutorial_next`. The client would then render a dead
 * question screen against a closed attempt — exactly the drift `getSessionState` exists to prevent.
 */
async function refreshSession(
  tx: DbLike,
  session: ParticipantSessionContext,
): Promise<ParticipantSessionContext> {
  const [row] = await tx
    .select({
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
      formVersionId: assessmentSessions.formVersionId,
      scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
    })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, session.sessionId))
    .limit(1);

  if (!row) {
    throw new Error(`Sesi ${session.sessionId} hilang saat menyegarkan status.`);
  }

  return {
    ...session,
    sessionStatus: row.status,
    currentSubtestCode: asSubtestCode(row.currentSubtestCode),
    formVersionId: row.formVersionId,
    scoringKeyVersionId: row.scoringKeyVersionId,
  };
}

/**
 * The status chain a closed subtest drives the session through.
 *
 * `subtest_in_progress -> subtest_completed -> tutorial_next` while subtests remain, and
 * `-> test_completed -> needs_ge_scoring` after ME. Every hop is asserted against the state machine
 * rather than assumed, so an illegal chain fails loudly here instead of writing a status no
 * transition allows.
 *
 * Chaining past `test_completed` on the LAST subtest is deliberate: a timed-out ME means the
 * participant never pressed "Selesai", so nothing would ever call T15's `finishTest`, and the
 * session would sit at `test_completed` outside HR's GE-scoring queue until someone happened to
 * open the closing page. The sweep is the last server-side event that session will see, so it must
 * leave it in its final participant-side state. T15's `finishTest` stays correct: it is specified as
 * idempotent, and from `needs_ge_scoring` it reports the current state rather than transitioning.
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
 * Closes the session's in-progress attempt if its `expires_at` has passed, exactly once.
 *
 * Shared with T13/T14/T15, which must sweep before they act: an answer saved after `expires_at`, or
 * a subtest started while a dead one is still open, are the bugs this exists to prevent.
 *
 * IDEMPOTENCE rests on ONE mechanism — the session row lock — plus a backstop:
 *
 * 1. THE SESSION ROW LOCK (`for update`), under which the attempt is RE-SELECTED. Nothing read
 *    before the lock is a decision; the pre-check below is an optimisation and is explicitly
 *    re-derived afterwards. Holding this lock means no other request can close an attempt or move
 *    the session while we act — T13's start and T15's completion take the SAME lock — so between
 *    the re-select and the update, the attempt provably cannot change.
 * 2. THE GUARDED UPDATE (`where … and status = 'in_progress'`) + row count. Genuinely belt-and-
 *    braces GIVEN the lock ordering above, and kept for the caller who one day closes an attempt
 *    without taking the session lock first.
 *
 * WHY THE RE-SELECT UNDER THE LOCK IS NOT OPTIONAL — the interleaving it kills:
 *
 *   1. T1 (`/state`) resolves `subtest_in_progress`, reads expired attempt A, then stalls.
 *   2. T2 (heartbeat) sweeps: closes A, session -> `tutorial_next`/WA. Commits.
 *   3. T3 (`/start WA`) locks, inserts attempt B, session -> `subtest_in_progress`/WA. Commits.
 *   4. T1 resumes, takes the lock, re-reads the session -> `subtest_in_progress` AGAIN (because of
 *      B), so a status check ALONE passes.
 *
 * With a pre-lock attempt read, T1 would then close stale attempt A, re-lock its responses, and
 * force the session to `tutorial_next`/WA — kicking the participant out of the WA subtest they are
 * actively sitting — plus a second `subtest.timeout` audit row. Re-selecting under the lock returns
 * B (live, not expired), so T1 correctly does nothing.
 *
 * HONEST LIMIT: none of this is covered by a test. PGlite is a single connection, so the suite
 * cannot interleave two live transactions — mutating the lock or the row-count guard away kills no
 * test. What the suite DOES pin is the stale-context path ("sweepExpiredAttempt called with a STALE
 * pre-sweep context…"). Verifying the rest needs two connections against real Postgres, which the
 * harness cannot host; T18 is the place for it.
 *
 * The lock is taken only once an expired attempt has been observed, so the common case — polling a
 * live or idle session — stays lock-free.
 *
 * Sweeping is confined to `subtest_in_progress`. `paused_by_admin` is the reason: an admin froze a
 * live subtest, and advancing it into the next tutorial behind their back would both defeat the
 * pause and be undefined — `subtest_completed` is only reachable from `subtest_in_progress`.
 */
async function sweepWithin(
  tx: DbLike,
  session: ParticipantSessionContext,
  now: Date,
): Promise<SweepResult> {
  if (session.sessionStatus !== "subtest_in_progress") {
    return { session, attempt: null };
  }

  // ADVISORY ONLY. This read exists to keep the hot path lock-free; every value it produces is
  // re-derived under the lock below. Nothing may branch on it except to skip taking the lock.
  const candidate = await selectInProgressAttempt(tx, session.sessionId);

  if (!candidate) {
    // The status said `subtest_in_progress` but no attempt is running: a racing sweep or a T15
    // completion just closed it, or the row is broken. Re-read rather than trust the context.
    return { session: await refreshSession(tx, session), attempt: null };
  }

  if (candidate.expiresAt.getTime() > now.getTime()) {
    // A LIVE attempt exists, and an attempt can only stay `in_progress` while its session is
    // `subtest_in_progress` — every path that leaves that status closes the attempt in the same
    // transaction. So the context is provably current, and this poll needs no lock and no re-read.
    return { session, attempt: candidate };
  }

  const [locked] = await tx
    .select({
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
    })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, session.sessionId))
    .for("update")
    .limit(1);

  if (!locked || locked.status !== "subtest_in_progress") {
    // The session moved while we blocked on the lock. Report what the winner committed — status AND
    // current subtest, since it moved both.
    return { session: await refreshSession(tx, session), attempt: null };
  }

  // THE DECISION. Re-selected under the lock, because `candidate` may name an attempt that a racer
  // has since closed and replaced — see the interleaving in the docstring.
  const attempt = await selectInProgressAttempt(tx, session.sessionId);

  if (!attempt) {
    return { session: await refreshSession(tx, session), attempt: null };
  }
  if (attempt.expiresAt.getTime() > now.getTime()) {
    // A DIFFERENT, live attempt is running now (a racer closed the expired one and started the next
    // subtest). Nothing to sweep; the session is whatever that racer committed.
    return { session: await refreshSession(tx, session), attempt };
  }

  const code = asSubtestCode(attempt.subtestCode);
  if (!code) {
    throw new Error(`Attempt ${attempt.id} punya subtest_code tidak dikenal.`);
  }

  const closed = await tx
    .update(subtestAttempts)
    .set({ status: "completed", completionReason: "timeout", completedAt: now })
    // Belt-and-braces: we hold the session lock and re-selected under it, so this cannot lose. It
    // stays for the caller who someday reaches this without the lock.
    .where(and(eq(subtestAttempts.id, attempt.id), eq(subtestAttempts.status, "in_progress")))
    .returning({ id: subtestAttempts.id });

  if (closed.length === 0) {
    // Someone closed this attempt without the session lock. Everything below must happen exactly
    // once, so do none of it and report the winner's committed state.
    return { session: await refreshSession(tx, session), attempt: null };
  }

  // Only the rows that exist. Unanswered items have NO row (T14 creates them lazily on save), and
  // materializing them here would fabricate ~176 rows per session to record an absence the item
  // list already implies — see `buildItems`. `response_status` is left untouched on purpose: it
  // carries the meaning T27 scores from (answered vs skipped), and `locked_at` is what says the
  // attempt is shut. The attempt's own `status`/`completion_reason` remain the authority T14 must
  // check before accepting a write; a per-row `locked` status would be a second, weaker copy of it.
  await tx
    .update(responses)
    .set({ lockedAt: now })
    .where(and(eq(responses.subtestAttemptId, attempt.id), isNull(responses.lockedAt)));

  const chain = closingChain(locked.status, code);

  const [advanced] = await tx
    .update(assessmentSessions)
    .set({
      status: chain.status,
      currentSubtestCode: chain.nextCode ?? locked.currentSubtestCode,
      // The session is over the moment its last subtest closed, whoever closed it.
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
    throw new Error("Status sesi gagal diperbarui setelah timeout.");
  }

  // The test just ENDED (ME timed out): spec §9 — "kode yang selesai tidak dapat memulai sesi
  // baru". Stamping `completed` here is what makes a later redemption answer honestly, under any
  // re-entry policy.
  if (advanced.status === "needs_ge_scoring") {
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
    // The clock closed this subtest, not a person: nobody clicked anything. The participant's
    // request merely observed it.
    actorType: "system",
    actorId: "system",
    action: "subtest.timeout",
    objectType: "subtest_attempt",
    objectId: attempt.id,
    // Codes and statuses only — never an answer, never the token (spec §19).
    metadata: {
      sessionId: session.sessionId,
      subtestCode: code,
      fromStatus: locked.status,
      toStatus: advanced.status,
      completionReason: "timeout",
    },
  });

  // FULL AUTO-CALCULATE on the timeout path too: an expired ME just walked the session to
  // `needs_ge_scoring`, and the sweep is the last server-side event that session will ever see —
  // nobody is left to click anything. Run the same GE gate the manual close runs: no manual GE
  // score pending → calculate now; pending → wait in `needs_ge_scoring` for HR.
  if (advanced.status === "needs_ge_scoring") {
    const hasManualGe = await sessionHasManualGePending(
      tx,
      session.sessionId,
      session.formVersionId,
      session.scoringKeyVersionId,
    );
    if (!hasManualGe) {
      await calculateResultAsSystem(tx, session.organizationId, session.sessionId);
    }
    return {
      session: await refreshSession(tx, session),
      attempt: null,
    };
  }

  return {
    session: {
      ...session,
      sessionStatus: advanced.status,
      currentSubtestCode: asSubtestCode(advanced.currentSubtestCode),
    },
    // The attempt we just closed is not running any more, and no other can be: we hold the lock.
    attempt: null,
  };
}

/**
 * Closes the session's expired attempt, if any, and reports the session's resulting state.
 *
 * The public face of `sweepWithin`. T13/T14/T15 call this and want only the session; the two entry
 * points below want the live attempt as well, and re-querying it is a wasted round trip on a pooler
 * with five connections. Splitting the two keeps this signature — which
 * `participant-start`/`participant-responses`/`participant-complete` all depend on — unchanged.
 */
export async function sweepExpiredAttempt(
  tx: DbLike,
  session: ParticipantSessionContext,
  now: Date,
): Promise<ParticipantSessionContext> {
  return (await sweepWithin(tx, session, now)).session;
}

type SubtestRow = {
  id: string;
  code: string;
  title: string;
  itemCount: number;
  durationSeconds: number;
};

async function selectSubtest(
  db: DbLike,
  formVersionId: string,
  code: SubtestCode,
): Promise<SubtestRow | null> {
  const [row] = await db
    .select({
      id: subtestVersions.id,
      code: subtestVersions.code,
      title: subtestVersions.title,
      itemCount: subtestVersions.itemCount,
      durationSeconds: subtestVersions.durationSeconds,
    })
    .from(subtestVersions)
    .where(and(eq(subtestVersions.formVersionId, formVersionId), eq(subtestVersions.code, code)))
    .limit(1);

  return row ?? null;
}

/**
 * The tutorial the session PINNED, looked up by id and NOT filtered by `status`.
 *
 * Pinning exists so a running session is immune to content changes (spec §10A). Re-filtering on
 * `published` here would undo that the moment HR archives or supersedes a version mid-session —
 * the participant would lose the instructions they started under. The pin is the decision; this is
 * only the read.
 */
async function selectPinnedTutorial(
  db: DbLike,
  session: ParticipantSessionContext,
  code: SubtestCode,
): Promise<{ textContent: string; videoReference: string | null } | null> {
  const pinnedId = session.pinnedTutorialVersions[code];
  if (!pinnedId) {
    return null;
  }

  const [row] = await db
    .select({
      textContent: tutorialVersions.textContent,
      videoReference: tutorialVersions.videoReference,
    })
    .from(tutorialVersions)
    .where(eq(tutorialVersions.id, pinnedId))
    .limit(1);

  return row ?? null;
}

type ItemProgress = {
  itemNumber: number;
  localNumber: number;
  status: ResponseStatusValue;
};

/**
 * One entry per item of the subtest, in local order.
 *
 * A LEFT JOIN, because an item with no response row is the normal case, not an anomaly: rows are
 * created lazily on first save, so "unanswered" is the ABSENCE of a row. This is what lets the
 * sweep write nothing for untouched items and still report them correctly, and it is what T27 must
 * do to score them 0 (brief §13).
 */
async function selectItemProgress(
  db: DbLike,
  subtestVersionId: string,
  attemptId: string,
): Promise<ItemProgress[]> {
  const rows = await db
    .select({
      itemNumber: itemVersions.itemNumber,
      localNumber: itemVersions.sequence,
      status: responses.responseStatus,
    })
    .from(itemVersions)
    .leftJoin(
      responses,
      and(eq(responses.itemVersionId, itemVersions.id), eq(responses.subtestAttemptId, attemptId)),
    )
    .where(eq(itemVersions.subtestVersionId, subtestVersionId))
    .orderBy(asc(itemVersions.sequence));

  return rows.map((row) => ({
    itemNumber: row.itemNumber,
    localNumber: row.localNumber,
    status: row.status ?? "unanswered",
  }));
}

/** Statuses that mean the participant has put an answer on the record. */
const ANSWERED_STATUSES: ReadonlySet<ResponseStatusValue> = new Set(["answered", "changed"]);

/**
 * Where a resume drops the participant: the first item they have not answered.
 *
 * `skipped` counts as unanswered here — a skip is "come back to this", so a resume that jumped past
 * it would hide the item behind the review list. When everything is answered, this lands on the LAST
 * item, which is where the completion action lives; item 1 would be a pointless walk back.
 */
function firstUnansweredLocalNumber(items: readonly ItemProgress[]): number {
  const pending = items.find((item) => !ANSWERED_STATUSES.has(item.status));
  return pending?.localNumber ?? items.at(-1)?.localNumber ?? 1;
}

/**
 * Where the client goes next. Derived from the PARTICIPANT status, so `nextRoute` and
 * `sessionStatus` can never disagree — they are two views of one projection.
 *
 * `paused` gets its own route rather than sharing `/complete`: an admin froze the session intending
 * to resume it, and the closing page would tell that participant their test is over. T16 owns
 * `/paused` and `/unavailable`; both are "wait / contact HR" pages, not endings.
 */
function routeFor(
  token: string,
  status: ParticipantSessionStatus,
  code: SubtestCode | null,
  items: readonly ItemProgress[],
): string {
  // A live-testing status with no subtest code is a broken row; fail closed rather than route into
  // a test we cannot name.
  if (!code && CONTENT_KINDS.has(status)) {
    return `/test/${token}/unavailable`;
  }

  switch (status) {
    case "tutorial":
      return `/test/${token}/tutorial/${code}`;
    case "question":
      return `/test/${token}/question/${code}/${firstUnansweredLocalNumber(items)}`;
    case "finished":
      return `/test/${token}/complete`;
    case "paused":
      return `/test/${token}/paused`;
    case "unavailable":
      return `/test/${token}/unavailable`;
  }
}

async function readSessionState(
  tx: DbLike,
  token: string,
  session: ParticipantSessionContext,
  attempt: AttemptRow | null,
  now: Date,
): Promise<SessionStateDto> {
  const code = session.currentSubtestCode;
  const status = PARTICIPANT_STATUS[session.sessionStatus];
  const wantsContent = CONTENT_KINDS.has(status) && code !== null;

  const subtest =
    wantsContent && code ? await selectSubtest(tx, session.formVersionId, code) : null;

  const items =
    attempt && subtest ? await selectItemProgress(tx, attempt.subtestVersionId, attempt.id) : [];

  // The tutorial is only fetched where it is shown; a question screen has no use for it, and the
  // payload is the participant's whole instruction text.
  const tutorial =
    status === "tutorial" && code && subtest ? await selectPinnedTutorial(tx, session, code) : null;

  return {
    sessionStatus: status,
    serverNow: now.toISOString(),
    nextRoute: routeFor(token, status, code, items),
    currentSubtest:
      subtest && code
        ? {
            code,
            title: subtest.title,
            itemCount: subtest.itemCount,
            durationSeconds: subtest.durationSeconds,
          }
        : null,
    tutorial,
    attempt: attempt
      ? {
          startedAt: attempt.startedAt.toISOString(),
          expiresAt: attempt.expiresAt.toISOString(),
          remainingSeconds: getAttemptRemainingSeconds(
            attempt.expiresAt,
            attempt.durationSeconds,
            now,
          ),
        }
      : null,
    items: items.map((item) => ({ itemNumber: item.itemNumber, status: item.status })),
  };
}

/**
 * Resolve -> sweep -> assemble, in one transaction so the state the caller is handed is the state
 * the database committed. A client that saw "tutorial_next" while the attempt was still open would
 * start the next subtest against a session that had not advanced.
 */
export async function getSessionState(db: DbLike, token: string): Promise<SessionStateDto> {
  return db.transaction(async (tx) => {
    const resolved = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, resolved.sessionId);
    // The sweep hands back the live attempt it already read; re-querying it here would be a third
    // read of the same row on a five-connection pooler.
    const { session, attempt } = await sweepWithin(tx, resolved, now);
    return readSessionState(tx, token, session, attempt, now);
  });
}

/**
 * The keepalive the question screen polls: the same sweep, and the three fields a running timer
 * needs. It exists so a participant who leaves the tab open past `expires_at` is moved on by the
 * server rather than sitting on a countdown that has already hit zero.
 */
export async function heartbeatSession(db: DbLike, token: string): Promise<HeartbeatDto> {
  return db.transaction(async (tx) => {
    const resolved = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, resolved.sessionId);
    const { session, attempt } = await sweepWithin(tx, resolved, now);

    return {
      serverNow: now.toISOString(),
      sessionStatus: PARTICIPANT_STATUS[session.sessionStatus],
      remainingSeconds: attempt
        ? getAttemptRemainingSeconds(attempt.expiresAt, attempt.durationSeconds, now)
        : 0,
    };
  });
}
