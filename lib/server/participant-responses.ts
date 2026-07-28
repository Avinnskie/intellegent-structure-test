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

const MAX_VALUE_LENGTH = 500;
const MS_PER_SECOND = 1000;

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

export type SaveResponseDto = {
  status: ResponseStatusValue;
  savedAt: string;
  remainingSeconds: number;
};

export type UnansweredItem = {
  itemNumber: number;
  localNumber: number;
  status: ResponseStatusValue;
};

export type UnansweredDto = { items: readonly UnansweredItem[] };

export function readResponseValue(stored: unknown): string | null {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) {
    return null;
  }
  const value = (stored as { value?: unknown }).value;
  return typeof value === "string" ? value : null;
}

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

  return { driftSeconds, savedAt, clientTimestamp };
}

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

function itemNotInActiveSubtest(): ApiError {
  return new ApiError("ITEM_NOT_IN_ACTIVE_SUBTEST", ITEM_NOT_IN_ACTIVE_SUBTEST_MESSAGE, 409);
}

function subtestLocked(): ApiError {
  return new ApiError("SUBTEST_LOCKED", SUBTEST_LOCKED_MESSAGE, 409);
}

function timeExpired(): ApiError {
  return new ApiError("TIME_EXPIRED", TIME_EXPIRED_MESSAGE, 410);
}

function invalidValue(): ApiError {
  return new ApiError("INVALID_RESPONSE_VALUE", INVALID_RESPONSE_VALUE_MESSAGE, 422);
}

function wrongSubtest(): ApiError {
  return new ApiError("WRONG_SUBTEST", WRONG_SUBTEST_MESSAGE, 409);
}

type ItemRow = {
  id: string;
  subtestVersionId: string;
  itemType: ItemTypeValue;
};

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

async function applySkip(
  tx: DbLike,
  sessionId: string,
  attempt: OpenAttempt,
  item: ItemRow,
  now: Date,
): Promise<{ status: ResponseStatusValue; savedAt: Date }> {
  const existing = await selectResponse(tx, attempt.id, item.id);

  if (existing && existing.status === "skipped" && existing.value === null) {
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

async function withParticipant<T>(
  db: DbLike,
  token: string,
  run: (tx: DbLike, session: ParticipantSessionContext, now: Date) => Promise<Outcome<T>>,
): Promise<T> {
  const outcome = await db.transaction(async (tx) => {
    const resolved = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, resolved.sessionId);
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

export async function saveResponse(
  db: DbLike,
  token: string,
  itemVersionId: string,
  value: string,
): Promise<SaveResponseDto> {
  return withParticipant(db, token, (tx, session, now) =>
    writeWithin(tx, session, itemVersionId, now, async (attempt, item) => {
      const normalized = await normalizeValue(tx, item, value);
      if (!normalized.ok) {
        return normalized;
      }
      return ok(await applyAnswer(tx, session.sessionId, attempt, item, normalized.value, now));
    }),
  );
}

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

const PENDING_STATUSES: readonly ResponseStatusValue[] = ["skipped", "unanswered"];

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
