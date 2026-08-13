import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentSessions,
  papiAttempts,
  papiAttemptSegments,
  papiResponses,
} from "../db/schema.ts";
import { assertSessionTransition, type SessionStatus } from "../domain/session-state.ts";
import { PAPI_ITEMS } from "../domain/official-papi.ts";
import { findUnansweredPapiItems, type PapiAnswerSheet } from "../domain/papi-scoring.ts";
import { PAPI_ITEM_COUNT, type PapiOptionCode } from "../papi-factors.ts";
import { writeAudit } from "./audit.ts";
import { selectNow } from "./db-clock.ts";
import type { ParticipantSessionContext } from "./participant-session.ts";

export const PAPI_SEGMENT_STALE_SECONDS = 90;

const PAPI_NOT_AVAILABLE = "Bagian PAPI belum dapat dibuka pada sesi ini.";
const PAPI_ALREADY_CLOSED = "Bagian PAPI sudah ditutup dan tidak dapat dibuka kembali.";
const PAPI_INCOMPLETE = "Masih ada nomor yang belum dijawab.";

export function papiNotAvailable(): ApiError {
  return new ApiError("PAPI_NOT_AVAILABLE", PAPI_NOT_AVAILABLE, 409);
}

export function papiAlreadyClosed(): ApiError {
  return new ApiError("PAPI_LOCKED", PAPI_ALREADY_CLOSED, 409);
}

export function papiIncomplete(missing: readonly number[]): ApiError {
  return new ApiError(
    "PAPI_INCOMPLETE",
    `${PAPI_INCOMPLETE} (${missing.length} dari ${PAPI_ITEM_COUNT} nomor)`,
    422,
  );
}

export type LockedPapiSession = {
  status: SessionStatus;
  includesPapi: boolean;
  papiFormVersionId: string | null;
};

/**
 * Membaca keadaan tahap PAPI tanpa mengunci.
 *
 * Dipakai jalur baca murni — memuat halaman, denyut waktu. Mengunci baris sesi
 * di sana hanya menahan penulisan lain tanpa memberi jaminan apa pun, karena
 * tidak ada yang diubah setelahnya.
 */
export async function readPapiSession(
  tx: DbLike,
  sessionId: string,
): Promise<LockedPapiSession> {
  const [row] = await tx
    .select({
      status: assessmentSessions.status,
      includesPapi: assessmentSessions.includesPapi,
      papiFormVersionId: assessmentSessions.papiFormVersionId,
    })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, sessionId))
    .limit(1);

  if (!row) {
    throw new Error(`Sesi ${sessionId} hilang saat membaca tahap PAPI.`);
  }

  return {
    status: row.status,
    includesPapi: row.includesPapi === 1,
    papiFormVersionId: row.papiFormVersionId,
  };
}

/** Versi mengunci, dipakai jalur yang mengubah status sesi. */
export async function lockPapiSession(tx: DbLike, sessionId: string): Promise<LockedPapiSession> {
  const [row] = await tx
    .select({
      status: assessmentSessions.status,
      includesPapi: assessmentSessions.includesPapi,
      papiFormVersionId: assessmentSessions.papiFormVersionId,
    })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, sessionId))
    .for("update")
    .limit(1);

  if (!row) {
    throw new Error(`Sesi ${sessionId} hilang saat membuka tahap PAPI.`);
  }

  return {
    status: row.status,
    includesPapi: row.includesPapi === 1,
    papiFormVersionId: row.papiFormVersionId,
  };
}

export type PapiAttemptRow = {
  id: string;
  status: (typeof papiAttempts.$inferSelect)["status"];
  papiFormVersionId: string;
  startedAt: Date;
  completedAt: Date | null;
  resumeCount: number;
};

export async function selectPapiAttempt(
  tx: DbLike,
  sessionId: string,
): Promise<PapiAttemptRow | null> {
  const [row] = await tx
    .select({
      id: papiAttempts.id,
      status: papiAttempts.status,
      papiFormVersionId: papiAttempts.papiFormVersionId,
      startedAt: papiAttempts.startedAt,
      completedAt: papiAttempts.completedAt,
      resumeCount: papiAttempts.resumeCount,
    })
    .from(papiAttempts)
    .where(eq(papiAttempts.sessionId, sessionId))
    .limit(1);

  return row ?? null;
}

export async function papiElapsedSeconds(tx: DbLike, attemptId: string): Promise<number> {
  const [row] = await tx
    .select({
      seconds: sql<number>`
        coalesce(
          sum(
            extract(epoch from (coalesce(${papiAttemptSegments.endedAt}, ${papiAttemptSegments.lastHeartbeatAt}) - ${papiAttemptSegments.startedAt}))
          ),
          0
        )::int
      `,
    })
    .from(papiAttemptSegments)
    .where(eq(papiAttemptSegments.papiAttemptId, attemptId));

  return row?.seconds ?? 0;
}

async function closeOpenSegments(
  tx: DbLike,
  attemptId: string,
  reason: (typeof papiAttemptSegments.$inferSelect)["closeReason"],
): Promise<void> {
  await tx
    .update(papiAttemptSegments)
    .set({ endedAt: sql`${papiAttemptSegments.lastHeartbeatAt}`, closeReason: reason })
    .where(
      and(eq(papiAttemptSegments.papiAttemptId, attemptId), isNull(papiAttemptSegments.endedAt)),
    );
}

async function openSegment(tx: DbLike, attemptId: string, now: Date): Promise<void> {
  await tx
    .insert(papiAttemptSegments)
    .values({ papiAttemptId: attemptId, startedAt: now, lastHeartbeatAt: now });
}

async function refreshOpenSegment(tx: DbLike, attemptId: string, now: Date): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - PAPI_SEGMENT_STALE_SECONDS * 1000);

  await tx
    .update(papiAttemptSegments)
    .set({ endedAt: sql`${papiAttemptSegments.lastHeartbeatAt}`, closeReason: "stale" })
    .where(
      and(
        eq(papiAttemptSegments.papiAttemptId, attemptId),
        isNull(papiAttemptSegments.endedAt),
        lt(papiAttemptSegments.lastHeartbeatAt, staleBefore),
      ),
    );

  const refreshed = await tx
    .update(papiAttemptSegments)
    .set({ lastHeartbeatAt: now })
    .where(
      and(eq(papiAttemptSegments.papiAttemptId, attemptId), isNull(papiAttemptSegments.endedAt)),
    )
    .returning({ id: papiAttemptSegments.id });

  return refreshed.length > 0;
}

export async function touchPapiSegment(tx: DbLike, attemptId: string, now: Date): Promise<void> {
  const alive = await refreshOpenSegment(tx, attemptId, now);
  if (!alive) {
    await openSegment(tx, attemptId, now);
  }
}

export async function pausePapiSegments(tx: DbLike, attemptId: string): Promise<void> {
  await closeOpenSegments(tx, attemptId, "navigated");
}

export async function ensurePapiAttempt(
  tx: DbLike,
  session: ParticipantSessionContext,
  papiFormVersionId: string,
  now: Date,
): Promise<PapiAttemptRow> {
  const existing = await selectPapiAttempt(tx, session.sessionId);
  if (existing) {
    return existing;
  }

  const [created] = await tx
    .insert(papiAttempts)
    .values({
      sessionId: session.sessionId,
      papiFormVersionId,
      status: "in_progress",
      startedAt: now,
    })
    .returning({
      id: papiAttempts.id,
      status: papiAttempts.status,
      papiFormVersionId: papiAttempts.papiFormVersionId,
      startedAt: papiAttempts.startedAt,
      completedAt: papiAttempts.completedAt,
      resumeCount: papiAttempts.resumeCount,
    });

  if (!created) {
    throw new Error(`Gagal membuat attempt PAPI untuk sesi ${session.sessionId}.`);
  }

  await tx.insert(papiResponses).values(
    PAPI_ITEMS.map((item) => ({
      sessionId: session.sessionId,
      papiAttemptId: created.id,
      itemNumber: item.number,
      optionCode: null,
      responseStatus: "unanswered" as const,
    })),
  );

  await writeAudit(tx, {
    organizationId: session.organizationId,
    actorType: "participant",
    actorId: session.sessionId,
    action: "papi.attempt_started",
    objectType: "papi_attempt",
    objectId: created.id,
    metadata: { sessionId: session.sessionId, itemCount: PAPI_ITEM_COUNT },
  });

  return created;
}

export async function readPapiAnswers(
  tx: DbLike,
  attemptId: string,
): Promise<{ answers: PapiAnswerSheet; answeredCount: number }> {
  const rows = await tx
    .select({
      itemNumber: papiResponses.itemNumber,
      optionCode: papiResponses.optionCode,
    })
    .from(papiResponses)
    .where(eq(papiResponses.papiAttemptId, attemptId));

  const answers: Record<number, PapiOptionCode | null> = {};
  for (const row of rows) {
    answers[row.itemNumber] = row.optionCode;
  }

  return {
    answers,
    answeredCount: rows.filter((row) => row.optionCode !== null).length,
  };
}

export async function unansweredPapiItems(
  tx: DbLike,
  attemptId: string,
): Promise<readonly number[]> {
  const { answers } = await readPapiAnswers(tx, attemptId);
  return findUnansweredPapiItems(answers);
}

export async function advancePapiStatus(
  tx: DbLike,
  sessionId: string,
  from: SessionStatus,
  to: SessionStatus,
): Promise<SessionStatus> {
  if (from === to) {
    return from;
  }

  assertSessionTransition(from, to);

  const [row] = await tx
    .update(assessmentSessions)
    .set({ status: to })
    .where(eq(assessmentSessions.id, sessionId))
    .returning({ status: assessmentSessions.status });

  if (!row) {
    throw new Error(`Status sesi ${sessionId} gagal diperbarui ke ${to}.`);
  }

  return row.status;
}

export async function papiServerNow(tx: DbLike, sessionId: string): Promise<Date> {
  return selectNow(tx, sessionId);
}
