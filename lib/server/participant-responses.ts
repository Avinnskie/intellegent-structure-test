/**
 * Saving, skipping, and reviewing answers: the only writer of `responses`.
 *
 * Four rules shape everything here:
 *
 * 1. THE ATTEMPT IS THE AUTHORITY, NOT THE RESPONSE ROW. T12 locks an attempt by stamping
 *    `locked_at` and deliberately does NOT overwrite `response_status`, because that column carries
 *    the answered/skipped distinction T27 scores from. So no response row can say "closed" — and an
 *    unanswered item has no row at all to say it with. Every gate below reads the ATTEMPT.
 * 2. AUTOSAVE IS IDEMPOTENT. The client re-sends the same value on every debounce tick and after
 *    every reconnect, so an unchanged value writes NOTHING: no status flip, no moved timestamp.
 * 3. THE SERVER OWNS THE CLOCK AND THE DECISION. Times come from the database's `now()`; the
 *    client's `clientTimestamp` never reaches this module (see `responseDriftFields`).
 * 4. A RESPONSE VALUE IS PARTICIPANT DATA (spec §19). It is never logged, never audited, and the
 *    DTO never echoes correctness back — the scoring key lives one join away in
 *    `item_scoring_rules` and must stay there.
 *
 * Lives beside `participant-session.ts` rather than inside it (the plan said "extend the session
 * service") because that module is under review; the shared pieces — `resolveParticipantSession`,
 * `sweepExpiredAttempt` — are imported from it rather than reimplemented, since a second copy of the
 * sweep would be a second answer to "when does a subtest close".
 */
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  itemOptions,
  itemVersions,
  responses,
  subtestAttempts,
  subtestVersions,
} from "../db/schema.ts";
import { getAttemptRemainingSeconds } from "../domain/timer.ts";
import { asSubtestCode, type SubtestCode } from "../ist-subtests.ts";
import { selectNow } from "./db-clock.ts";
import type { LogFields } from "./logger.ts";
import { resolveParticipantSession, sweepExpiredAttempt } from "./participant-session.ts";
import type { ParticipantSessionContext } from "./participant-session.ts";

/** Bounds a free-text answer. GE is a phrase and RA/ZR are numbers; 500 is slack, not a target. */
const MAX_VALUE_LENGTH = 500;
const MS_PER_SECOND = 1000;

/**
 * Below this, a client/server clock difference is ordinary network and scheduling latency and is not
 * worth a log line. A line per autosave would be tens of thousands per session and would bury the
 * signal it exists to carry.
 */
const DRIFT_LOG_THRESHOLD_SECONDS = 30;

const ITEM_NOT_IN_ACTIVE_SUBTEST_MESSAGE =
  "Soal ini bukan bagian dari subtes yang sedang berjalan.";
const SUBTEST_LOCKED_MESSAGE = "Subtes ini sudah ditutup dan tidak dapat dibuka kembali.";
const TIME_EXPIRED_MESSAGE = "Waktu subtes ini sudah habis. Jawaban tidak dapat diubah lagi.";
const INVALID_RESPONSE_VALUE_MESSAGE = "Jawaban yang dikirim tidak valid.";
const WRONG_SUBTEST_MESSAGE = "Subtes ini tidak sedang berjalan. Lanjutkan dari subtes yang aktif.";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ResponseStatusValue = (typeof responses.$inferSelect)["responseStatus"];
type ItemTypeValue = (typeof itemVersions.$inferSelect)["itemType"];

/**
 * What the autosave indicator needs, and nothing else.
 *
 * There is no field for the value (the client already knows what it typed), and none for
 * correctness. Typed explicitly rather than inferred from a row so that a future `select` cannot
 * widen the payload by accident.
 */
export type SaveResponseDto = {
  status: ResponseStatusValue;
  /** ISO-8601, from the database clock — the instant the record now claims. */
  savedAt: string;
  remainingSeconds: number;
};

/** One entry of the review list. Carries no value: it is a navigation target, not an answer. */
export type UnansweredItem = {
  /** Global 1..176. */
  itemNumber: number;
  /** 1..itemCount — what the participant sees and what `/question/{code}/{n}` uses. */
  localNumber: number;
  status: ResponseStatusValue;
};

export type UnansweredDto = { items: readonly UnansweredItem[] };

/**
 * The ONE reader of `responses.response_value`, and the contract T24's
 * `scoreObjective(rule, responseValue: string | null)` consumes.
 *
 * The stored shape is `{ "value": "<answer>" }` and NOT a bare jsonb string, which looks simpler and
 * is a trap: drizzle's jsonb mapper re-parses anything the driver returns as a string, so a bare
 * `"123"` reads back as the NUMBER 123, `"null"` as null and `"true"` as a boolean. Letter answers
 * (SE/WA/AN) survive that and every test written with them passes — while every RA/ZR numeric answer
 * silently arrives at scoring as the wrong type and misses an exact-match key. The envelope is an
 * object, which the mapper passes through untouched.
 *
 * Anything that is not our own envelope reads as "no answer" rather than as a coerced string: a
 * corrupt cell then scores 0 (spec §13) instead of scoring something invented.
 */
export function readResponseValue(stored: unknown): string | null {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) {
    return null;
  }
  const value = (stored as { value?: unknown }).value;
  return typeof value === "string" ? value : null;
}

/**
 * Log fields for a client/server clock disagreement, or null when there is nothing to say.
 *
 * This is the ONLY thing `clientTimestamp` is allowed to reach, and the isolation is structural
 * rather than disciplinary: the value is never passed to `saveResponse`, whose signature has nowhere
 * to put it, and this helper runs AFTER the save with the finished DTO's own `savedAt` in hand. It
 * returns log fields — it cannot return a decision, so it cannot influence one.
 *
 * Never throws and never logs on garbage: a client clock is untrusted input.
 */
export function responseDriftFields(
  clientTimestamp: string | undefined,
  savedAt: string,
): LogFields | null {
  if (!clientTimestamp) {
    return null;
  }

  const clientMs = Date.parse(clientTimestamp);
  const serverMs = Date.parse(savedAt);
  if (!Number.isFinite(clientMs) || !Number.isFinite(serverMs)) {
    return null;
  }

  const driftSeconds = Math.round((clientMs - serverMs) / MS_PER_SECOND);
  if (Math.abs(driftSeconds) < DRIFT_LOG_THRESHOLD_SECONDS) {
    return null;
  }

  // Scalars only, and never the answer: `LogFields` bars objects, and nothing here has seen a value.
  return { driftSeconds, savedAt, clientTimestamp };
}

/**
 * A rejection carried as a VALUE rather than thrown.
 *
 * The reason is `sweepExpiredAttempt`: a save that arrives after `expires_at` must sweep the attempt
 * closed AND then refuse the write, and those two happen in one transaction. Throwing the refusal
 * would roll the sweep back — leaving a dead attempt `in_progress` forever, since a participant
 * whose tab was closed at timeout may never send another request. So the checks return, the
 * transaction commits its sweep, and the caller throws outside it.
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

/**
 * An unknown item id, a malformed one, and an item from a subtest that is not running all get the
 * SAME answer. Distinguishing them would tell a prober which item ids exist, and the participant has
 * nothing to do differently either way — the same reasoning T13 applies to subtest codes.
 */
function itemNotInActiveSubtest(): ApiError {
  return new ApiError("ITEM_NOT_IN_ACTIVE_SUBTEST", ITEM_NOT_IN_ACTIVE_SUBTEST_MESSAGE, 409);
}

/** Reuses T13's code for "this subtest is closed" rather than inventing a synonym for it. */
function subtestLocked(): ApiError {
  return new ApiError("SUBTEST_LOCKED", SUBTEST_LOCKED_MESSAGE, 409);
}

function timeExpired(): ApiError {
  return new ApiError("TIME_EXPIRED", TIME_EXPIRED_MESSAGE, 410);
}

function invalidValue(): ApiError {
  return new ApiError("INVALID_RESPONSE_VALUE", INVALID_RESPONSE_VALUE_MESSAGE, 422);
}

/** Reuses T13's code for "that is not the subtest you are on" — an unknown code answers the same. */
function wrongSubtest(): ApiError {
  return new ApiError("WRONG_SUBTEST", WRONG_SUBTEST_MESSAGE, 409);
}

type ItemRow = {
  id: string;
  subtestVersionId: string;
  itemType: ItemTypeValue;
};

/**
 * The item, by id, NOT filtered by `status`.
 *
 * Same decision as T13's deck and the pinned tutorial: a running session is immune to content
 * changes (spec §10A). Filtering `status = 'active'` here would reject an answer to an item the
 * start endpoint served seconds earlier, the moment HR deactivated it mid-session.
 *
 * The uuid guard is not cosmetic: a malformed path segment would otherwise reach Postgres as
 * `invalid input syntax for type uuid` and surface as a 500 instead of the 409 it is.
 */
async function selectItem(tx: DbLike, itemVersionId: string): Promise<ItemRow | null> {
  if (!UUID_PATTERN.test(itemVersionId)) {
    return null;
  }

  const [row] = await tx
    .select({
      id: itemVersions.id,
      subtestVersionId: itemVersions.subtestVersionId,
      itemType: itemVersions.itemType,
    })
    .from(itemVersions)
    .where(eq(itemVersions.id, itemVersionId))
    .limit(1);

  return row ?? null;
}

async function selectSubtestVersionId(
  tx: DbLike,
  formVersionId: string,
  code: SubtestCode,
): Promise<string | null> {
  const [row] = await tx
    .select({ id: subtestVersions.id })
    .from(subtestVersions)
    .where(and(eq(subtestVersions.formVersionId, formVersionId), eq(subtestVersions.code, code)))
    .limit(1);

  return row?.id ?? null;
}

type OpenAttempt = {
  id: string;
  expiresAt: Date;
  durationSeconds: number;
};

/**
 * The session's attempt at one subtest, gated and (for writers) locked.
 *
 * The `for update` lock is what makes the read-then-write below one decision: it serializes two
 * concurrent saves for the same attempt, and it blocks a completion (T15) or a sweep from closing
 * the attempt between this check and the write. It is taken AFTER `sweepExpiredAttempt` may have
 * taken the session lock, so the lock order is always session -> attempt and cannot cycle with T13,
 * which takes the session lock alone.
 *
 * EXPIRY IS CHECKED BEFORE STATUS, deliberately. After `expires_at` the answer is 410 whether or not
 * the sweep has closed the row yet — otherwise the same late save would report 410 or 409 depending
 * on who swept first, and spec §11's "server menolak perubahan jawaban setelah `expires_at`" is
 * about the clock, not about the bookkeeping.
 */
async function openAttempt(
  tx: DbLike,
  sessionId: string,
  subtestVersionId: string,
  now: Date,
  options: { lock: boolean; whenMissing: () => ApiError },
): Promise<Outcome<OpenAttempt>> {
  const query = tx
    .select({
      id: subtestAttempts.id,
      status: subtestAttempts.status,
      expiresAt: subtestAttempts.expiresAt,
      durationSeconds: subtestAttempts.durationSeconds,
    })
    .from(subtestAttempts)
    .where(
      and(
        eq(subtestAttempts.sessionId, sessionId),
        eq(subtestAttempts.subtestVersionId, subtestVersionId),
      ),
    )
    .limit(1);

  const [row] = options.lock ? await query.for("update") : await query;

  if (!row) {
    return fail(options.whenMissing());
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return fail(timeExpired());
  }
  if (row.status !== "in_progress") {
    return fail(subtestLocked());
  }

  return ok({ id: row.id, expiresAt: row.expiresAt, durationSeconds: row.durationSeconds });
}

/**
 * Normalizes and validates one answer against the item that received it.
 *
 * TRIMMED, because a trailing space the participant never sees must not read as a different answer:
 * it would spuriously flip `answered` to `changed` on an autosave retry, and it would make T24's
 * exact match hinge on invisible characters.
 *
 * BLANK IS REJECTED, not stored. Spec §11 says "jawaban kosong tetap `unanswered`", and the skip
 * endpoint already means "no value" — accepting `""` as an answer would create a SECOND
 * representation of "no answer" that reports as `answered` in HR's counts and forces T24 to decide
 * whether an empty string was an attempt.
 *
 * A CHOICE item accepts only an `option_code` that belongs to THAT item — scoped by
 * `item_version_id`, so another item's perfectly valid code is refused (spec §13: "jangan
 * menggunakan approximate lookup untuk kunci pilihan ganda" applies to the input side too).
 */
async function normalizeValue(
  tx: DbLike,
  item: ItemRow,
  raw: string,
): Promise<Outcome<string>> {
  if (typeof raw !== "string" || raw.length > MAX_VALUE_LENGTH) {
    return fail(invalidValue());
  }

  const value = raw.trim();
  if (value.length === 0) {
    return fail(invalidValue());
  }

  if (item.itemType !== "choice") {
    return ok(value);
  }

  const [option] = await tx
    .select({ id: itemOptions.id })
    .from(itemOptions)
    .where(and(eq(itemOptions.itemVersionId, item.id), eq(itemOptions.optionCode, value)))
    .limit(1);

  return option ? ok(value) : fail(invalidValue());
}

type ExistingResponse = {
  id: string;
  value: string | null;
  status: ResponseStatusValue;
  answeredAt: Date | null;
  updatedAt: Date;
};

async function selectResponse(
  tx: DbLike,
  attemptId: string,
  itemVersionId: string,
): Promise<ExistingResponse | null> {
  const [row] = await tx
    .select({
      id: responses.id,
      responseValue: responses.responseValue,
      responseStatus: responses.responseStatus,
      answeredAt: responses.answeredAt,
      updatedAt: responses.updatedAt,
    })
    .from(responses)
    .where(
      and(eq(responses.subtestAttemptId, attemptId), eq(responses.itemVersionId, itemVersionId)),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    value: readResponseValue(row.responseValue),
    status: row.responseStatus,
    answeredAt: row.answeredAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Applies one answer to the record.
 *
 * `changed` vs `answered` keys on ONE question: was a value standing on the record already?
 * (spec §12 lists both statuses but does not define the boundary.)
 *
 * - No row, or a row with no value (`skipped`) -> `answered`. A skip put nothing on the record, so
 *   the next value is the participant's FIRST answer, not a revision of one — and spec §13 scores
 *   `skipped` exactly like `unanswered`, so there was nothing there to change.
 * - The same value again -> NOTHING IS WRITTEN. This is the autosave retry, and it is why
 *   `updated_at` is trustworthy as spec §12's "last changed at".
 * - A different value -> `changed`, keeping the original `answered_at`.
 *
 * `answered_at` is stamped once, when the first value goes on the record, and is never moved and
 * never cleared afterwards — that is what makes it survive an edit.
 *
 * Read-then-write rather than a single `on conflict do update`: the decision above depends on the
 * PREVIOUS row, and the idempotent case must write nothing at all, which no upsert expresses
 * (`do update` always touches `updated_at`). The attempt's `for update` lock is what makes the pair
 * atomic; this module is the only creator of response rows, and it always holds that lock, so the
 * `response_attempt_item_ux` index stays a loud backstop rather than a silent double-write.
 */
async function applyAnswer(
  tx: DbLike,
  sessionId: string,
  attempt: OpenAttempt,
  item: ItemRow,
  value: string,
  now: Date,
): Promise<{ status: ResponseStatusValue; savedAt: Date }> {
  const existing = await selectResponse(tx, attempt.id, item.id);

  if (existing && existing.value === value) {
    return { status: existing.status, savedAt: existing.updatedAt };
  }

  const status: ResponseStatusValue = existing?.value == null ? "answered" : "changed";

  if (!existing) {
    await tx.insert(responses).values({
      sessionId,
      subtestAttemptId: attempt.id,
      itemVersionId: item.id,
      responseValue: { value },
      responseStatus: status,
      answeredAt: now,
      // Set explicitly rather than left to `defaultNow()`/`$onUpdate`: the latter is the NODE
      // clock, and mixing it with the database clock in `answered_at` would put two authorities on
      // one row. An explicit value wins over `$onUpdate` in drizzle's update builder.
      updatedAt: now,
    });
  } else {
    await tx
      .update(responses)
      .set({
        responseValue: { value },
        responseStatus: status,
        answeredAt: existing.answeredAt ?? now,
        updatedAt: now,
      })
      .where(eq(responses.id, existing.id));
  }

  return { status, savedAt: now };
}

/**
 * Withdraws the value and marks the item `skipped`.
 *
 * The value is cleared rather than kept: `skipped` scores 0 (spec §13), and a row that scored 0
 * while still holding an answer would be a contradiction waiting for someone to resolve it the
 * wrong way. `answered_at` is left exactly as it was — it is history, and skipping does not unmake
 * the fact that an answer was once given.
 */
async function applySkip(
  tx: DbLike,
  sessionId: string,
  attempt: OpenAttempt,
  item: ItemRow,
  now: Date,
): Promise<{ status: ResponseStatusValue; savedAt: Date }> {
  const existing = await selectResponse(tx, attempt.id, item.id);

  if (existing && existing.status === "skipped" && existing.value === null) {
    // Already skipped: a double-tapped "Lewati" is the same request twice.
    return { status: existing.status, savedAt: existing.updatedAt };
  }

  if (!existing) {
    await tx.insert(responses).values({
      sessionId,
      subtestAttemptId: attempt.id,
      itemVersionId: item.id,
      responseValue: null,
      responseStatus: "skipped",
      answeredAt: null,
      updatedAt: now,
    });
  } else {
    await tx
      .update(responses)
      .set({
        responseValue: null,
        responseStatus: "skipped",
        answeredAt: existing.answeredAt,
        updatedAt: now,
      })
      .where(eq(responses.id, existing.id));
  }

  return { status: "skipped", savedAt: now };
}

/** Resolve -> read the clock -> sweep -> gate -> act, in ONE transaction. See `Outcome`. */
async function withParticipant<T>(
  db: DbLike,
  token: string,
  run: (tx: DbLike, session: ParticipantSessionContext, now: Date) => Promise<Outcome<T>>,
): Promise<T> {
  const outcome = await db.transaction(async (tx) => {
    const resolved = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, resolved.sessionId);
    // The sweep is not optional: a save can be the first request the server has seen since the
    // timer ran out, and it must close the dead attempt before it refuses the write.
    const session = await sweepExpiredAttempt(tx, resolved, now);
    return run(tx, session, now);
  });

  return unwrap(outcome);
}

async function writeWithin(
  tx: DbLike,
  session: ParticipantSessionContext,
  itemVersionId: string,
  now: Date,
  apply: (
    attempt: OpenAttempt,
    item: ItemRow,
  ) => Promise<Outcome<{ status: ResponseStatusValue; savedAt: Date }>>,
): Promise<Outcome<SaveResponseDto>> {
  const item = await selectItem(tx, itemVersionId);
  if (!item) {
    return fail(itemNotInActiveSubtest());
  }

  const attempt = await openAttempt(tx, session.sessionId, item.subtestVersionId, now, {
    lock: true,
    whenMissing: itemNotInActiveSubtest,
  });
  if (!attempt.ok) {
    return attempt;
  }

  const applied = await apply(attempt.value, item);
  if (!applied.ok) {
    return applied;
  }

  return ok({
    status: applied.value.status,
    savedAt: applied.value.savedAt.toISOString(),
    remainingSeconds: getAttemptRemainingSeconds(
      attempt.value.expiresAt,
      attempt.value.durationSeconds,
      now,
    ),
  });
}

/**
 * Saves one answer, idempotently.
 *
 * `itemVersionId` is typed `string`, not a validated id: it arrives from a URL path segment, so
 * checking it is this function's job rather than the caller's promise. There is deliberately no
 * parameter for the client's clock — see `responseDriftFields`.
 */
export async function saveResponse(
  db: DbLike,
  token: string,
  itemVersionId: string,
  value: string,
): Promise<SaveResponseDto> {
  return withParticipant(db, token, (tx, session, now) =>
    writeWithin(tx, session, itemVersionId, now, async (attempt, item) => {
      // Validated AFTER the lifecycle gate: an expired or closed attempt must refuse every value,
      // and reporting 422 for a bad one would hide the fact that the subtest is over.
      const normalized = await normalizeValue(tx, item, value);
      if (!normalized.ok) {
        return normalized;
      }
      return ok(await applyAnswer(tx, session.sessionId, attempt, item, normalized.value, now));
    }),
  );
}

/** "Lewati": records that the participant passed on this item, keeping it in the review list. */
export async function skipResponse(
  db: DbLike,
  token: string,
  itemVersionId: string,
): Promise<SaveResponseDto> {
  return withParticipant(db, token, (tx, session, now) =>
    writeWithin(tx, session, itemVersionId, now, async (attempt, item) =>
      ok(await applySkip(tx, session.sessionId, attempt, item, now)),
    ),
  );
}

/** The statuses that mean "no answer is on the record". `locked` is not one — T12 never writes it. */
const PENDING_STATUSES: readonly ResponseStatusValue[] = ["skipped", "unanswered"];

/**
 * The review list: every item the participant still has to deal with (spec §8's "Belum Dijawab").
 *
 * A LEFT JOIN, because an item with no response row is the normal case, not an anomaly: rows are
 * created lazily on first save, so "unanswered" is the ABSENCE of a row.
 *
 * Gated exactly like a save, and for the same reason: every entry here is an invitation to go and
 * answer that item, so the list must not outlive the ability to act on it — offering "go answer
 * item 7" for a closed subtest would send the participant to a page that refuses every write.
 *
 * Ordered by `sequence`, which IS the local number (T13): the same order as the deck and the
 * question route, so "item 7" in this list is item 7 everywhere else.
 */
async function unansweredWithin(
  tx: DbLike,
  session: ParticipantSessionContext,
  code: string,
  now: Date,
): Promise<Outcome<UnansweredDto>> {
  const subtestCode = asSubtestCode(code);
  if (!subtestCode) {
    return fail(wrongSubtest());
  }

  const subtestVersionId = await selectSubtestVersionId(tx, session.formVersionId, subtestCode);
  if (!subtestVersionId) {
    return fail(wrongSubtest());
  }

  const attempt = await openAttempt(tx, session.sessionId, subtestVersionId, now, {
    // A read takes no write lock: it would serialize the review page against the autosave it is
    // meant to run alongside, for nothing.
    lock: false,
    whenMissing: wrongSubtest,
  });
  if (!attempt.ok) {
    return attempt;
  }

  const rows = await tx
    .select({
      itemNumber: itemVersions.itemNumber,
      localNumber: itemVersions.sequence,
      status: responses.responseStatus,
    })
    .from(itemVersions)
    .leftJoin(
      responses,
      and(
        eq(responses.itemVersionId, itemVersions.id),
        eq(responses.subtestAttemptId, attempt.value.id),
      ),
    )
    .where(
      and(
        eq(itemVersions.subtestVersionId, subtestVersionId),
        or(isNull(responses.id), inArray(responses.responseStatus, PENDING_STATUSES)),
      ),
    )
    .orderBy(asc(itemVersions.sequence));

  return ok({
    items: rows.map((row) => ({
      itemNumber: row.itemNumber,
      localNumber: row.localNumber,
      status: row.status ?? "unanswered",
    })),
  });
}

export async function getUnanswered(
  db: DbLike,
  token: string,
  code: string,
): Promise<UnansweredDto> {
  return withParticipant(db, token, (tx, session, now) =>
    unansweredWithin(tx, session, code, now),
  );
}
