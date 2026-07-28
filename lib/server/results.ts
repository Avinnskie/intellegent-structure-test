import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import { assessmentResults, assessmentSessions } from "../db/schema.ts";
import { assertSessionTransition } from "../domain/session-state.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";
import { calculateResult, type CalculateOutcome } from "./calculate.ts";

const NOT_FOUND_MESSAGE = "Data tidak ditemukan.";
const RESULT_LOCKED_MESSAGE =
  "Hasil ini sudah final dan terkunci. Perubahan hanya lewat proses override beralasan.";
const WRONG_RESULT_STATUS_MESSAGE = "Status hasil tidak mengizinkan tindakan ini.";
const OVERRIDE_REASON_MESSAGE = "Override atas hasil final wajib menyertakan alasan.";

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
}

type ResultRow = {
  id: string;
  sessionId: string;
  status: string;
  supersededById: string | null;
};

async function lockResult(tx: DbLike, ctx: AuthContext, resultId: string): Promise<ResultRow> {
  if (!z.uuid().safeParse(resultId).success) {
    throw notFound();
  }
  const [row] = await tx
    .select({
      id: assessmentResults.id,
      sessionId: assessmentResults.sessionId,
      status: assessmentResults.status,
      supersededById: assessmentResults.supersededById,
    })
    .from(assessmentResults)
    .innerJoin(assessmentSessions, eq(assessmentResults.sessionId, assessmentSessions.id))
    .where(
      and(
        eq(assessmentResults.id, resultId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .for("update", { of: assessmentSessions })
    .limit(1);
  if (!row) {
    throw notFound();
  }
  return row;
}

export type ResultActionDto = { resultId: string; sessionId: string; status: string };

export async function reviewResult(
  db: DbLike,
  ctx: AuthContext,
  resultId: string,
  notes: string,
): Promise<ResultActionDto> {
  const trimmed = z.string().trim().min(1).max(2000).parse(notes);

  return db.transaction(async (tx) => {
    const result = await lockResult(tx, ctx, resultId);
    if (result.status === "final") {
      throw new ApiError("RESULT_LOCKED", RESULT_LOCKED_MESSAGE, 409);
    }
    if (result.status !== "draft" || result.supersededById !== null) {
      throw new ApiError("WRONG_RESULT_STATUS", WRONG_RESULT_STATUS_MESSAGE, 409);
    }

    await tx
      .update(assessmentResults)
      .set({ status: "reviewed", reviewNotes: trimmed })
      .where(eq(assessmentResults.id, result.id));

    assertSessionTransition("calculated", "reviewed");
    await tx
      .update(assessmentSessions)
      .set({ status: "reviewed" })
      .where(and(eq(assessmentSessions.id, result.sessionId), eq(assessmentSessions.status, "calculated")));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "result.reviewed",
      objectType: "assessment_result",
      objectId: result.id,
      metadata: { sessionId: result.sessionId, resultId: result.id },
    });

    return { resultId: result.id, sessionId: result.sessionId, status: "reviewed" };
  });
}

export async function finalizeResult(
  db: DbLike,
  ctx: AuthContext,
  resultId: string,
): Promise<ResultActionDto> {
  return db.transaction(async (tx) => {
    const result = await lockResult(tx, ctx, resultId);
    if (result.status === "final") {
      throw new ApiError("RESULT_LOCKED", RESULT_LOCKED_MESSAGE, 409);
    }
    if ((result.status !== "draft" && result.status !== "reviewed") || result.supersededById !== null) {
      throw new ApiError("WRONG_RESULT_STATUS", WRONG_RESULT_STATUS_MESSAGE, 409);
    }

    const [sessionRow] = await tx
      .select({ status: assessmentSessions.status })
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, result.sessionId))
      .limit(1);
    if (!sessionRow) {
      throw notFound();
    }
    assertSessionTransition(sessionRow.status, "final");

    await tx
      .update(assessmentResults)
      .set({ status: "final", finalizedBy: ctx.userId, finalizedAt: new Date() })
      .where(eq(assessmentResults.id, result.id));
    await tx
      .update(assessmentSessions)
      .set({ status: "final" })
      .where(eq(assessmentSessions.id, result.sessionId));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "result.finalized",
      objectType: "assessment_result",
      objectId: result.id,
      metadata: { sessionId: result.sessionId, resultId: result.id },
    });

    return { resultId: result.id, sessionId: result.sessionId, status: "final" };
  });
}

export const overrideSchema = z.object({
  overrideReason: z.string().trim().min(1, OVERRIDE_REASON_MESSAGE).max(2000),
});

export async function overrideFinalResult(
  db: DbLike,
  ctx: AuthContext,
  resultId: string,
  input: unknown,
): Promise<CalculateOutcome> {
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError("OVERRIDE_REASON_REQUIRED", OVERRIDE_REASON_MESSAGE, 422);
  }
  const { overrideReason } = parsed.data;

  const { sessionId } = await db.transaction(async (tx) => {
    const result = await lockResult(tx, ctx, resultId);
    if (result.status !== "final") {
      throw new ApiError("WRONG_RESULT_STATUS", WRONG_RESULT_STATUS_MESSAGE, 409);
    }

    await tx
      .update(assessmentResults)
      .set({ status: "superseded" })
      .where(eq(assessmentResults.id, result.id));
    await tx
      .update(assessmentSessions)
      .set({ status: "calculated" })
      .where(eq(assessmentSessions.id, result.sessionId));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "result.overridden",
      objectType: "assessment_result",
      objectId: result.id,
      metadata: { sessionId: result.sessionId, resultId: result.id, reason: overrideReason },
    });

    return { sessionId: result.sessionId };
  });

  return calculateResult(db, ctx, sessionId);
}

export async function latestResultId(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<string | null> {
  if (!z.uuid().safeParse(sessionId).success) {
    return null;
  }
  const [row] = await db
    .select({ id: assessmentResults.id })
    .from(assessmentResults)
    .innerJoin(assessmentSessions, eq(assessmentResults.sessionId, assessmentSessions.id))
    .where(
      and(
        eq(assessmentResults.sessionId, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
        isNull(assessmentResults.supersededById),
      ),
    )
    .orderBy(desc(assessmentResults.calculatedAt))
    .limit(1);
  return row?.id ?? null;
}
