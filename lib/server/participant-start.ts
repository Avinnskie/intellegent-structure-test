import { and, asc, eq, inArray } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentSessions,
  itemOptions,
  itemVersions,
  responses,
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
import { readResponseValue } from "./participant-responses.ts";

const MS_PER_SECOND = 1000;

const SESSION_NOT_ACTIVE_MESSAGE = "Sesi tes ini tidak dapat dimulai. Hubungi HR.";
const WRONG_SUBTEST_MESSAGE = "Subtes ini tidak dapat dimulai. Lanjutkan dari subtes yang aktif.";
const SUBTEST_LOCKED_MESSAGE = "Subtes ini sudah ditutup dan tidak dapat dibuka kembali.";

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

export type StartSubtestItem = {
  itemVersionId: string;
  itemNumber: number;
  localNumber: number;
  itemType: ItemTypeValue;
  prompt: string;
  options: readonly StartSubtestOption[];
  placeholder: string | null;
  mediaReference: string | null;
  savedValue: string | null;
};

export type StartSubtestDto = {
  attemptId: string;
  expiresAt: string;
  serverNow: string;
  items: readonly StartSubtestItem[];
};

function wrongSubtest(): ApiError {
  return new ApiError("WRONG_SUBTEST", WRONG_SUBTEST_MESSAGE, 409);
}

function sessionNotActive(): ApiError {
  return new ApiError("SESSION_NOT_ACTIVE", SESSION_NOT_ACTIVE_MESSAGE, 409);
}

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

async function selectItems(
  tx: DbLike,
  subtestVersionId: string,
  attemptId: string,
): Promise<StartSubtestItem[]> {
  const rows = await tx
    .select({
      id: itemVersions.id,
      itemNumber: itemVersions.itemNumber,
      localNumber: itemVersions.sequence,
      itemType: itemVersions.itemType,
      prompt: itemVersions.prompt,
      placeholder: itemVersions.placeholder,
      mediaReference: itemVersions.mediaReference,
      savedValue: responses.responseValue,
    })
    .from(itemVersions)
    .leftJoin(
      responses,
      and(eq(responses.itemVersionId, itemVersions.id), eq(responses.subtestAttemptId, attemptId)),
    )
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
    savedValue: readResponseValue(row.savedValue),
  }));
}

type LockedSession = {
  status: SessionStatus;
  currentSubtestCode: string | null;
  startedAt: Date | null;
};

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
      ...(locked.startedAt === null ? { startedAt: now } : {}),
    })
    .where(eq(assessmentSessions.id, session.sessionId))
    .returning({ status: assessmentSessions.status });

  if (!advanced) {
    throw new Error("Status sesi gagal diperbarui saat memulai subtes.");
  }

  await writeAudit(tx, {
    organizationId: session.organizationId,
    actorType: "participant",
    actorId: session.sessionId,
    action: "subtest.started",
    objectType: "subtest_attempt",
    objectId: attempt.id,
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
    return {
      attemptId: existing.id,
      expiresAt: existing.expiresAt.toISOString(),
      serverNow: now.toISOString(),
      items: await selectItems(tx, existing.subtestVersionId, existing.id),
    };
  }

  if (existing) {
    throw new ApiError("SUBTEST_LOCKED", SUBTEST_LOCKED_MESSAGE, 409);
  }

  const created = await createAttempt(tx, session, locked, code, now);

  return {
    attemptId: created.attemptId,
    expiresAt: created.expiresAt.toISOString(),
    serverNow: now.toISOString(),
    items: await selectItems(tx, created.subtestVersionId, created.attemptId),
  };
}

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
