import { and, eq, inArray } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import { accessCodes, assessmentSessions, papiAttempts } from "../db/schema.ts";
import { canSkipPapi, type SessionStatus } from "../domain/session-state.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";
import { selectNow } from "./db-clock.ts";
import { closeBatterySession } from "./papi-calculate.ts";
import { pausePapiSegments, selectPapiAttempt } from "./papi-session.ts";

const NOT_SKIPPABLE =
  "Sesi ini tidak berada pada tahap PAPI, sehingga tidak dapat ditutup lebih awal.";
const NOT_FOUND = "Sesi tidak ditemukan.";

export type SkipPapiDto = {
  sessionId: string;
  status: SessionStatus;
  skippedAt: string;
};

/**
 * Menutup sesi lebih awal tanpa PAPI ketika peserta tidak melanjutkan.
 *
 * IST tetap dihitung dan dilaporkan; laporan gabungan akan menandai bagian
 * PAPI sebagai tidak dikerjakan beserta alasannya. Skoring PAPI parsial
 * sengaja tidak dilakukan — skor ipsatif hanya sah bila seluruh 90 nomor terisi.
 */
export async function skipPapi(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
  reason: "participant_declined" | "hr_closed_early",
): Promise<SkipPapiDto> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: assessmentSessions.id,
        status: assessmentSessions.status,
        organizationId: assessmentSessions.organizationId,
        includesPapi: assessmentSessions.includesPapi,
      })
      .from(assessmentSessions)
      .where(
        and(
          eq(assessmentSessions.id, sessionId),
          eq(assessmentSessions.organizationId, ctx.organizationId),
        ),
      )
      .for("update")
      .limit(1);

    if (!session) {
      throw new ApiError("NOT_FOUND", NOT_FOUND, 404);
    }
    if (session.includesPapi !== 1 || !canSkipPapi(session.status)) {
      throw new ApiError("PAPI_NOT_SKIPPABLE", NOT_SKIPPABLE, 409);
    }

    const now = await selectNow(tx, sessionId);

    const attempt = await selectPapiAttempt(tx, sessionId);
    if (attempt) {
      await pausePapiSegments(tx, attempt.id);
      await tx
        .update(papiAttempts)
        .set({ status: "completed", completionReason: "admin", completedAt: now })
        .where(eq(papiAttempts.id, attempt.id));
    }

    await tx
      .update(assessmentSessions)
      .set({ papiSkipReason: reason, papiSkippedBy: ctx.userId, papiSkippedAt: now })
      .where(eq(assessmentSessions.id, sessionId));

    await tx
      .update(accessCodes)
      .set({ status: "completed" })
      .where(
        and(
          eq(accessCodes.sessionId, sessionId),
          inArray(accessCodes.status, ["active", "in_use"]),
        ),
      );

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "papi.skipped",
      objectType: "assessment_session",
      objectId: sessionId,
      metadata: {
        reason,
        fromStatus: session.status,
        answeredItemsDiscarded: attempt !== null,
      },
    });

    const status = await closeBatterySession(
      tx,
      ctx.organizationId,
      sessionId,
      session.status,
      now,
    );

    return { sessionId, status, skippedAt: now.toISOString() };
  });
}
