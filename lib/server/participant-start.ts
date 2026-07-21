/**
 * Starting a subtest: the one request that creates a timer.
 *
 * Everything here follows from two rules the rest of the engine depends on:
 *
 * 1. THE SERVER CREATES THE CLOCK, ONCE. `started_at` and `expires_at` are computed from the
 *    DATABASE's `now()` and the PINNED `subtest_versions.duration_seconds`. The client sends no
 *    time and is never asked for one.
 * 2. A SECOND START IS A RESUME (spec §11: "Membuka tab baru tidak membuat timer baru"). The
 *    existing attempt is returned as-is — same id, same `expires_at`. A participant with two tabs
 *    open must neither gain time nor lose it, so the resume is a READ: it writes nothing, not even
 *    an audit row.
 *
 * Lives beside `participant-session.ts` rather than inside it (the plan said "extend") because that
 * module is under review; the shared pieces — `resolveParticipantSession`, `sweepExpiredAttempt` —
 * are imported from it rather than reimplemented, since a second copy of the sweep would be a second
 * answer to "when does a subtest close".
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentSessions,
  itemOptions,
  itemVersions,
  subtestAttempts,
  subtestVersions,
} from "../db/schema.ts";
import {
  assertSessionTransition,
  InvalidTransitionError,
  type SessionStatus,
} from "../domain/session-state.ts";
import { asSubtestCode, type SubtestCode } from "../ist-subtests.ts";
import { writeAudit } from "./audit.ts";
import { selectNow } from "./db-clock.ts";
import {
  resolveParticipantSession,
  sweepExpiredAttempt,
  type ParticipantSessionContext,
} from "./participant-session.ts";

const MS_PER_SECOND = 1000;

const SESSION_NOT_ACTIVE_MESSAGE = "Sesi tes ini tidak dapat dimulai. Hubungi HR.";
const WRONG_SUBTEST_MESSAGE = "Subtes ini tidak dapat dimulai. Lanjutkan dari subtes yang aktif.";
const SUBTEST_LOCKED_MESSAGE = "Subtes ini sudah ditutup dan tidak dapat dibuka kembali.";

/**
 * Statuses a PARTICIPANT may start from.
 *
 * Deliberately narrower than the state machine, which also allows `paused_by_admin ->
 * subtest_in_progress`: that edge exists for the ADMIN's resume action, and a participant taking it
 * would be unpausing a session someone froze on purpose. `subtest_in_progress` is here for the
 * resume path only — a start that arrives while the subtest it names is already running.
 */
const PARTICIPANT_START_STATUSES: readonly SessionStatus[] = [
  "tutorial",
  "tutorial_next",
  "subtest_in_progress",
];

type ItemTypeValue = (typeof itemVersions.$inferSelect)["itemType"];

export type StartSubtestOption = {
  optionCode: string;
  label: string;
};

/**
 * One question, as the participant is allowed to see it.
 *
 * Typed FIELD BY FIELD and never spread from a row: the item's scoring rule lives one join away in
 * `item_scoring_rules`, and the reason it cannot leak is that this type has nowhere to put it. Widen
 * this and the leak test is the only thing left standing — do not add a field to serve a UI need
 * without asking what else rides along with it.
 */
export type StartSubtestItem = {
  itemVersionId: string;
  /** Global 1..176 — the identity T14 saves a response against. */
  itemNumber: number;
  /** 1..itemCount within this subtest: what the participant sees and the question route uses. */
  localNumber: number;
  itemType: ItemTypeValue;
  prompt: string;
  /** Empty for `short_text` and `numeric` items. Never a correctness marker. */
  options: readonly StartSubtestOption[];
  /** Input hint for `short_text`/`numeric`; null for `choice`. */
  placeholder: string | null;
  /** Storage path of an attached image, or null. The PAGE signs it into a URL; never a secret. */
  mediaReference: string | null;
};

export type StartSubtestDto = {
  attemptId: string;
  /** ISO-8601, from the database clock. The client's countdown is `expiresAt - serverNow`. */
  expiresAt: string;
  /** ISO-8601 `now()`, read live on every call — including a resume, which reuses `expiresAt`. */
  serverNow: string;
  items: readonly StartSubtestItem[];
};

/**
 * An unknown subtest code gets the SAME answer as a real-but-wrong one.
 *
 * Two different errors would tell a prober which codes exist, and the participant has nothing to do
 * differently either way: the only subtest they may start is the one they are on.
 */
function wrongSubtest(): ApiError {
  return new ApiError("WRONG_SUBTEST", WRONG_SUBTEST_MESSAGE, 409);
}

function sessionNotActive(): ApiError {
  return new ApiError("SESSION_NOT_ACTIVE", SESSION_NOT_ACTIVE_MESSAGE, 409);
}

/**
 * `InvalidTransitionError` is an internal fault type that `withApiHandler` reports as a 500. The
 * participant cannot act on that; the one thing they can act on is "this session cannot be started".
 */
function assertStartable(from: SessionStatus): void {
  try {
    assertSessionTransition(from, "subtest_in_progress");
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      throw sessionNotActive();
    }
    throw error;
  }
}

type SubtestRow = {
  id: string;
  durationSeconds: number;
};

/** The subtest as the SESSION's form version defines it — the duration is pinned there, not here. */
async function selectSubtest(
  tx: DbLike,
  formVersionId: string,
  code: SubtestCode,
): Promise<SubtestRow> {
  const [row] = await tx
    .select({ id: subtestVersions.id, durationSeconds: subtestVersions.durationSeconds })
    .from(subtestVersions)
    .where(and(eq(subtestVersions.formVersionId, formVersionId), eq(subtestVersions.code, code)))
    .limit(1);

  if (!row) {
    // The session pins a form version that has no such subtest: broken master data, not a bad
    // request. A 500 makes the fault visible instead of blaming the participant.
    throw new Error(`Subtes ${code} tidak ada pada form version ${formVersionId}.`);
  }
  return row;
}

type AttemptRow = {
  id: string;
  status: (typeof subtestAttempts.$inferSelect)["status"];
  subtestVersionId: string;
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
      subtestVersionId: subtestAttempts.subtestVersionId,
      expiresAt: subtestAttempts.expiresAt,
    })
    .from(subtestAttempts)
    .where(and(eq(subtestAttempts.sessionId, sessionId), eq(subtestAttempts.subtestCode, code)))
    .limit(1);

  return row ?? null;
}

/**
 * Every item of the subtest version, in local order, with its options.
 *
 * Two queries rather than a join, because a join would multiply each item by its option count and
 * leave the de-duplication to hand-written grouping over a wider row than either query needs.
 *
 * `item_versions.status` is NOT filtered, and that is the same decision as the pinned tutorial: a
 * running session is immune to content changes (spec §10A). Dropping an item HR deactivated
 * mid-session would renumber the deck under the participant and make this list shorter than the
 * `item_count` their tutorial just promised — while `getSessionState`'s progress list, which does
 * not filter either, kept showing all of them. Removing an item is a new form version, which a
 * running session does not follow, never a status flip on the one it pinned.
 *
 * Ordered by `sequence`, which IS the local number: the seed writes `question.localNumber` into it,
 * `getSessionState` routes `/question/{code}/{sequence}`, and T14's review list orders by it.
 * `item_number` would sort identically today — it is monotonic within a subtest — but it is the
 * GLOBAL identity, and using it here would silently make the deck's order depend on a column that
 * exists to be unique across all 176 items rather than to order these 20.
 */
async function selectItems(tx: DbLike, subtestVersionId: string): Promise<StartSubtestItem[]> {
  const rows = await tx
    .select({
      id: itemVersions.id,
      itemNumber: itemVersions.itemNumber,
      localNumber: itemVersions.sequence,
      itemType: itemVersions.itemType,
      prompt: itemVersions.prompt,
      placeholder: itemVersions.placeholder,
      mediaReference: itemVersions.mediaReference,
    })
    .from(itemVersions)
    .where(eq(itemVersions.subtestVersionId, subtestVersionId))
    .orderBy(asc(itemVersions.sequence));

  if (rows.length === 0) {
    return [];
  }

  const optionRows = await tx
    .select({
      itemVersionId: itemOptions.itemVersionId,
      optionCode: itemOptions.optionCode,
      label: itemOptions.label,
    })
    .from(itemOptions)
    .where(
      inArray(
        itemOptions.itemVersionId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(itemOptions.sequence));

  const optionsByItem = new Map<string, StartSubtestOption[]>();
  for (const option of optionRows) {
    const list = optionsByItem.get(option.itemVersionId) ?? [];
    list.push({ optionCode: option.optionCode, label: option.label });
    optionsByItem.set(option.itemVersionId, list);
  }

  return rows.map((row) => ({
    itemVersionId: row.id,
    itemNumber: row.itemNumber,
    localNumber: row.localNumber,
    itemType: row.itemType,
    prompt: row.prompt,
    options: optionsByItem.get(row.id) ?? [],
    placeholder: row.placeholder,
    mediaReference: row.mediaReference,
  }));
}

type LockedSession = {
  status: SessionStatus;
  currentSubtestCode: string | null;
  startedAt: Date | null;
};

/**
 * Re-reads the session under a row lock.
 *
 * The context resolved a statement ago proves nothing: under READ COMMITTED every statement takes a
 * fresh snapshot, so a racing request can advance the session in between. The lock is what makes
 * everything below — the status check, the attempt read, the insert — one decision, and it is the
 * SAME lock `sweepExpiredAttempt` takes, so a sweep and a start cannot interleave into a lost update
 * on `status`/`current_subtest_code`.
 */
async function lockSession(tx: DbLike, sessionId: string): Promise<LockedSession> {
  const [row] = await tx
    .select({
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
      startedAt: assessmentSessions.startedAt,
    })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, sessionId))
    .for("update")
    .limit(1);

  if (!row) {
    throw new Error(`Sesi ${sessionId} hilang saat memulai subtes.`);
  }
  return row;
}

async function createAttempt(
  tx: DbLike,
  session: ParticipantSessionContext,
  locked: LockedSession,
  code: SubtestCode,
  now: Date,
): Promise<{ attemptId: string; expiresAt: Date; subtestVersionId: string }> {
  const subtest = await selectSubtest(tx, session.formVersionId, code);
  const expiresAt = new Date(now.getTime() + subtest.durationSeconds * MS_PER_SECOND);

  assertStartable(locked.status);

  const [attempt] = await tx
    .insert(subtestAttempts)
    .values({
      sessionId: session.sessionId,
      subtestVersionId: subtest.id,
      subtestCode: code,
      status: "in_progress",
      // Stamped explicitly from `now()` rather than left to `defaultNow()`, so `expires_at` and
      // `started_at` are provably the same instant plus the duration — two clock reads could not be.
      startedAt: now,
      durationSeconds: subtest.durationSeconds,
      expiresAt,
    })
    .returning({ id: subtestAttempts.id, expiresAt: subtestAttempts.expiresAt });

  if (!attempt) {
    throw new Error("Attempt subtes gagal dibuat.");
  }

  const [advanced] = await tx
    .update(assessmentSessions)
    .set({
      status: "subtest_in_progress",
      currentSubtestCode: code,
      // The session begins when its FIRST timer does, and never moves again. Keyed on
      // `started_at is null` rather than on `code === SE`, which is strictly stronger: any session
      // holding an attempt has a non-null `started_at`, so T27's age-at-test math cannot meet a
      // null even on a path where SE was somehow skipped. A resume never reaches this write.
      ...(locked.startedAt === null ? { startedAt: now } : {}),
    })
    .where(eq(assessmentSessions.id, session.sessionId))
    .returning({ status: assessmentSessions.status });

  if (!advanced) {
    // The row is locked above, so it cannot have vanished. Failing loudly beats reporting a status
    // nobody read back.
    throw new Error("Status sesi gagal diperbarui saat memulai subtes.");
  }

  await writeAudit(tx, {
    organizationId: session.organizationId,
    actorType: "participant",
    // The session, never the token: an audit row is readable by HR, so an identifier in it must not
    // be a credential.
    actorId: session.sessionId,
    action: "subtest.started",
    objectType: "subtest_attempt",
    objectId: attempt.id,
    // Codes and statuses only — never a prompt, never a key (spec §19).
    metadata: {
      sessionId: session.sessionId,
      subtestCode: code,
      fromStatus: locked.status,
      toStatus: advanced.status,
    },
  });

  return { attemptId: attempt.id, expiresAt: attempt.expiresAt, subtestVersionId: subtest.id };
}

async function startWithin(
  tx: DbLike,
  session: ParticipantSessionContext,
  code: SubtestCode,
  now: Date,
): Promise<StartSubtestDto> {
  const locked = await lockSession(tx, session.sessionId);

  if (!PARTICIPANT_START_STATUSES.includes(locked.status)) {
    throw sessionNotActive();
  }
  if (locked.currentSubtestCode !== code) {
    throw wrongSubtest();
  }

  const existing = await selectAttempt(tx, session.sessionId, code);

  if (existing?.status === "in_progress") {
    // THE RESUME. A second tab, a refresh, a reconnect — all land here, and all get the deadline
    // the first start set. `serverNow` is still read live, so the client's countdown shortens.
    return {
      attemptId: existing.id,
      expiresAt: existing.expiresAt.toISOString(),
      serverNow: now.toISOString(),
      items: await selectItems(tx, existing.subtestVersionId),
    };
  }

  if (existing) {
    // Closed, by timeout or by hand. `attempt_session_subtest_ux` allows ONE attempt per (session,
    // subtest) ever — a retest is a new session (brief §4.1), never a reset — so there is nothing to
    // create here. Without this guard the insert would violate that index and hand the participant a
    // 500 instead of spec §10's "tidak dapat kembali ke subtes yang sudah ditutup".
    throw new ApiError("SUBTEST_LOCKED", SUBTEST_LOCKED_MESSAGE, 409);
  }

  const created = await createAttempt(tx, session, locked, code, now);

  return {
    attemptId: created.attemptId,
    expiresAt: created.expiresAt.toISOString(),
    serverNow: now.toISOString(),
    items: await selectItems(tx, created.subtestVersionId),
  };
}

/**
 * Starts (or resumes) the participant's current subtest and returns its items and deadline.
 *
 * Resolve -> read the clock -> SWEEP -> lock -> act, all in one transaction. The sweep is not
 * optional: a start can be the first request the server has seen since the previous subtest ran out
 * (the tab was closed when the timer hit zero), and starting the next one while a dead attempt is
 * still `in_progress` would leave two attempts open at once and skip the timeout close spec §11
 * requires to happen exactly once.
 *
 * `code` is typed `string`, not `SubtestCode`: it arrives from a URL path segment, so validating it
 * is this function's job rather than the caller's promise.
 */
export async function startSubtest(
  db: DbLike,
  token: string,
  code: string,
): Promise<StartSubtestDto> {
  return db.transaction(async (tx) => {
    const resolved = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, resolved.sessionId);
    const session = await sweepExpiredAttempt(tx, resolved, now);

    const subtestCode = asSubtestCode(code);
    if (!subtestCode) {
      throw wrongSubtest();
    }

    return startWithin(tx, session, subtestCode, now);
  });
}
