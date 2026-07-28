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

const LAST_SEEN_THROTTLE_MS = 30_000;

type ResponseStatusValue = (typeof responses.$inferSelect)["responseStatus"];

export type ParticipantSessionStatus =
  "tutorial" | "question" | "finished" | "paused" | "unavailable";

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
  needs_review: "finished",
  void: "unavailable",
};

export function toParticipantStatus(status: SessionStatus): ParticipantSessionStatus {
  return PARTICIPANT_STATUS[status];
}

const CONTENT_KINDS: ReadonlySet<ParticipantSessionStatus> = new Set(["tutorial", "question"]);

export type ParticipantSessionContext = {
  tokenId: string;
  sessionId: string;
  organizationId: string;
  sessionStatus: SessionStatus;
  currentSubtestCode: SubtestCode | null;
  formVersionId: string;
  scoringKeyVersionId: string;
  pinnedTutorialVersions: Readonly<Record<string, string>>;
};

export type SessionStateItem = {
  itemNumber: number;
  status: ResponseStatusValue;
};

export type SessionStateDto = {
  sessionStatus: ParticipantSessionStatus;
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
  items: readonly SessionStateItem[];
};

export type HeartbeatDto = {
  serverNow: string;
  sessionStatus: ParticipantSessionStatus;
  remainingSeconds: number;
};

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

export async function resolveParticipantSession(
  db: DbLike,
  rawToken: string,
): Promise<ParticipantSessionContext> {
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

type SweepResult = {
  session: ParticipantSessionContext;
  attempt: AttemptRow | null;
};

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

async function sweepWithin(
  tx: DbLike,
  session: ParticipantSessionContext,
  now: Date,
): Promise<SweepResult> {
  if (session.sessionStatus !== "subtest_in_progress") {
    return { session, attempt: null };
  }

  const candidate = await selectInProgressAttempt(tx, session.sessionId);

  if (!candidate) {
    return { session: await refreshSession(tx, session), attempt: null };
  }

  if (candidate.expiresAt.getTime() > now.getTime()) {
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
    return { session: await refreshSession(tx, session), attempt: null };
  }

  const attempt = await selectInProgressAttempt(tx, session.sessionId);

  if (!attempt) {
    return { session: await refreshSession(tx, session), attempt: null };
  }
  if (attempt.expiresAt.getTime() > now.getTime()) {
    return { session: await refreshSession(tx, session), attempt };
  }

  const code = asSubtestCode(attempt.subtestCode);
  if (!code) {
    throw new Error(`Attempt ${attempt.id} punya subtest_code tidak dikenal.`);
  }

  const closed = await tx
    .update(subtestAttempts)
    .set({ status: "completed", completionReason: "timeout", completedAt: now })
    .where(and(eq(subtestAttempts.id, attempt.id), eq(subtestAttempts.status, "in_progress")))
    .returning({ id: subtestAttempts.id });

  if (closed.length === 0) {
    return { session: await refreshSession(tx, session), attempt: null };
  }

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
      ...(chain.nextCode === null ? { completedAt: now } : {}),
    })
    .where(eq(assessmentSessions.id, session.sessionId))
    .returning({
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
    });

  if (!advanced) {
    throw new Error("Status sesi gagal diperbarui setelah timeout.");
  }

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
    actorType: "system",
    actorId: "system",
    action: "subtest.timeout",
    objectType: "subtest_attempt",
    objectId: attempt.id,
    metadata: {
      sessionId: session.sessionId,
      subtestCode: code,
      fromStatus: locked.status,
      toStatus: advanced.status,
      completionReason: "timeout",
    },
  });

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
    attempt: null,
  };
}

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

const ANSWERED_STATUSES: ReadonlySet<ResponseStatusValue> = new Set(["answered", "changed"]);

function firstUnansweredLocalNumber(items: readonly ItemProgress[]): number {
  const pending = items.find((item) => !ANSWERED_STATUSES.has(item.status));
  return pending?.localNumber ?? items.at(-1)?.localNumber ?? 1;
}

function routeFor(
  token: string,
  status: ParticipantSessionStatus,
  code: SubtestCode | null,
  items: readonly ItemProgress[],
): string {
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

export async function getSessionState(db: DbLike, token: string): Promise<SessionStateDto> {
  return db.transaction(async (tx) => {
    const resolved = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, resolved.sessionId);
    const { session, attempt } = await sweepWithin(tx, resolved, now);
    return readSessionState(tx, token, session, attempt, now);
  });
}

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
