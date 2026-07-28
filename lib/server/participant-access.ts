import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import { getServerConfig } from "../config.ts";
import type { DbLike } from "../db/client.ts";
import { accessCodes, assessmentSessions, participantTokens } from "../db/schema.ts";
import { hashAccessCode } from "../domain/access-code.ts";
import {
  assertSessionTransition,
  InvalidTransitionError,
  SUBTEST_ORDER,
  type SessionStatus,
} from "../domain/session-state.ts";
import { generateSessionToken, hashSessionToken } from "../domain/session-token.ts";
import { writeAudit } from "./audit.ts";
import { logInfo } from "./logger.ts";
import { isWithinRateLimit, rateLimitKey, recordRateLimitFailure } from "./rate-limit.ts";

type AccessCodeStatus = (typeof accessCodes.$inferSelect)["status"];

const RATE_LIMIT_SCOPE = "access_code";

const FIRST_SUBTEST_CODE = SUBTEST_ORDER[0];

const RATE_LIMITED_MESSAGE = "Terlalu banyak percobaan. Coba lagi dalam 15 menit atau hubungi HR.";
const CODE_INVALID_MESSAGE = "Kode akses tidak valid. Periksa kembali kode Anda atau hubungi HR.";
const SESSION_NOT_ACTIVE_MESSAGE = "Sesi tes ini tidak dapat dimulai. Hubungi HR.";

const CODE_STATE_ERRORS: Readonly<
  Record<Exclude<AccessCodeStatus, "active">, { code: string; message: string; status: number }>
> = {
  in_use: {
    code: "CODE_IN_USE",
    message: "Kode sedang digunakan. Lanjutkan dari tab/perangkat sebelumnya atau hubungi HR.",
    status: 409,
  },
  completed: {
    code: "CODE_ALREADY_COMPLETED",
    message: "Tes untuk kode ini sudah selesai. Hubungi HR jika Anda perlu tes ulang.",
    status: 409,
  },
  expired: {
    code: "CODE_EXPIRED",
    message: "Kode akses sudah kedaluwarsa. Hubungi HR untuk mendapatkan kode baru.",
    status: 410,
  },
  revoked: {
    code: "CODE_REVOKED",
    message: "Kode akses sudah dinonaktifkan. Hubungi HR.",
    status: 409,
  },
  regenerated: {
    code: "CODE_REGENERATED",
    message: "Kode akses ini sudah diganti. Gunakan kode terbaru dari HR.",
    status: 409,
  },
};

export type ValidateAccessCodeInput = {
  code: string;
  clientKey: string;
};

export type ValidateAccessCodeResult = {
  sessionToken: string;
  sessionStatus: SessionStatus;
  nextRoute: string;
};

type CodeLookup = {
  codeId: string;
  codeStatus: AccessCodeStatus;
  hasExpired: boolean;
  sessionId: string;
  sessionStatus: SessionStatus;
  organizationId: string;
};

function codeStateError(status: Exclude<AccessCodeStatus, "active">): ApiError {
  const mapped = CODE_STATE_ERRORS[status];
  return new ApiError(mapped.code, mapped.message, mapped.status);
}

async function expireCode(db: DbLike, lookup: CodeLookup): Promise<never> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(accessCodes)
      .set({ status: "expired" })
      .where(
        and(
          eq(accessCodes.id, lookup.codeId),
          eq(accessCodes.status, "active"),
          sql`${accessCodes.expiresAt} <= now()`,
        ),
      )
      .returning({ id: accessCodes.id });

    if (updated.length === 0) {
      return;
    }

    await writeAudit(tx, {
      organizationId: lookup.organizationId,
      actorType: "system",
      actorId: "system",
      action: "access_code.expired",
      objectType: "access_code",
      objectId: lookup.codeId,
      metadata: { reason: "expires_at_passed", sessionId: lookup.sessionId },
    });
  });

  throw codeStateError("expired");
}

function assertStartable(from: SessionStatus): void {
  try {
    assertSessionTransition(from, "code_validated");
    assertSessionTransition("code_validated", "tutorial");
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      throw new ApiError("SESSION_NOT_ACTIVE", SESSION_NOT_ACTIVE_MESSAGE, 409);
    }
    throw error;
  }
}

const RESUMABLE_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "code_validated",
  "tutorial",
  "subtest_in_progress",
  "subtest_completed",
  "tutorial_next",
  "paused_by_admin",
]);

async function issueSessionToken(
  db: DbLike,
  lookup: CodeLookup,
): Promise<ValidateAccessCodeResult> {
  const sessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(sessionToken, getServerConfig().SESSION_TOKEN_SECRET);

  const outcome = await db.transaction(async (tx) => {
    const [code] = await tx
      .select({
        status: accessCodes.status,
        hasExpired: sql<boolean>`${accessCodes.expiresAt} <= now()`,
      })
      .from(accessCodes)
      .where(eq(accessCodes.id, lookup.codeId))
      .for("update")
      .limit(1);

    if (!code) {
      throw new ApiError("CODE_INVALID", CODE_INVALID_MESSAGE, 404);
    }
    if (code.status !== "active" && code.status !== "in_use") {
      throw codeStateError(code.status);
    }
    if (code.hasExpired) {
      throw codeStateError("expired");
    }

    const [session] = await tx
      .select({
        status: assessmentSessions.status,
        currentSubtestCode: assessmentSessions.currentSubtestCode,
        reentryPolicy: assessmentSessions.reentryPolicy,
      })
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, lookup.sessionId))
      .for("update")
      .limit(1);

    if (!session) {
      throw new ApiError("SESSION_NOT_ACTIVE", SESSION_NOT_ACTIVE_MESSAGE, 409);
    }

    if (RESUMABLE_STATUSES.has(session.status)) {
      if (code.status === "in_use" && session.reentryPolicy !== "multi") {
        throw codeStateError("in_use");
      }
      const revoked = await tx
        .update(participantTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(participantTokens.sessionId, lookup.sessionId),
            isNull(participantTokens.revokedAt),
          ),
        )
        .returning({ id: participantTokens.id });

      await tx
        .update(accessCodes)
        .set({ status: "in_use", lastUsedAt: new Date() })
        .where(eq(accessCodes.id, lookup.codeId));
      await tx.insert(participantTokens).values({ sessionId: lookup.sessionId, tokenHash });

      await writeAudit(tx, {
        organizationId: lookup.organizationId,
        actorType: "participant",
        actorId: lookup.sessionId,
        action: "access_code.revalidated",
        objectType: "access_code",
        objectId: lookup.codeId,
        metadata: {
          sessionId: lookup.sessionId,
          sessionStatus: session.status,
          revokedTokens: revoked.length,
        },
      });

      return {
        status: session.status,
        subtestCode: session.currentSubtestCode ?? FIRST_SUBTEST_CODE,
      };
    }

    if (code.status !== "active") {
      throw codeStateError(code.status);
    }

    assertStartable(session.status);

    const [advanced] = await tx
      .update(assessmentSessions)
      .set({ status: "tutorial", currentSubtestCode: FIRST_SUBTEST_CODE })
      .where(eq(assessmentSessions.id, lookup.sessionId))
      .returning({ status: assessmentSessions.status });

    if (!advanced) {
      throw new Error("Status sesi gagal diperbarui.");
    }

    await tx
      .update(accessCodes)
      .set({ status: "in_use", lastUsedAt: new Date() })
      .where(eq(accessCodes.id, lookup.codeId));

    await tx.insert(participantTokens).values({ sessionId: lookup.sessionId, tokenHash });

    await writeAudit(tx, {
      organizationId: lookup.organizationId,
      actorType: "participant",
      actorId: lookup.sessionId,
      action: "access_code.validated",
      objectType: "access_code",
      objectId: lookup.codeId,
      metadata: {
        sessionId: lookup.sessionId,
        fromStatus: session.status,
        toStatus: advanced.status,
      },
    });

    return { status: advanced.status, subtestCode: FIRST_SUBTEST_CODE };
  });

  return {
    sessionToken,
    sessionStatus: outcome.status,
    nextRoute: `/test/${sessionToken}/tutorial/${outcome.subtestCode}`,
  };
}

export async function validateAccessCode(
  db: DbLike,
  input: ValidateAccessCodeInput,
): Promise<ValidateAccessCodeResult> {
  const limitKey = rateLimitKey(RATE_LIMIT_SCOPE, input.clientKey);

  if (!(await isWithinRateLimit(db, limitKey))) {
    logInfo("access_code_rate_limited", { rateLimitKey: limitKey });
    throw new ApiError("RATE_LIMITED", RATE_LIMITED_MESSAGE, 429);
  }

  const codeHash = hashAccessCode(input.code, getServerConfig().ACCESS_CODE_PEPPER);

  const [lookup] = await db
    .select({
      codeId: accessCodes.id,
      codeStatus: accessCodes.status,
      hasExpired: sql<boolean>`${accessCodes.expiresAt} <= now()`,
      sessionId: accessCodes.sessionId,
      sessionStatus: assessmentSessions.status,
      organizationId: assessmentSessions.organizationId,
    })
    .from(accessCodes)
    .innerJoin(assessmentSessions, eq(accessCodes.sessionId, assessmentSessions.id))
    .where(eq(accessCodes.codeHash, codeHash))
    .limit(1);

  if (!lookup) {
    await recordRateLimitFailure(db, limitKey);
    logInfo("access_code_rejected", { reason: "unknown_code", rateLimitKey: limitKey });
    throw new ApiError("CODE_INVALID", CODE_INVALID_MESSAGE, 404);
  }

  if (lookup.codeStatus === "active" && lookup.hasExpired) {
    logInfo("access_code_rejected", {
      reason: "expires_at_passed",
      rateLimitKey: limitKey,
      sessionId: lookup.sessionId,
    });
    await expireCode(db, lookup);
  }

  if (lookup.codeStatus !== "active" && lookup.codeStatus !== "in_use") {
    logInfo("access_code_rejected", {
      reason: lookup.codeStatus,
      rateLimitKey: limitKey,
      sessionId: lookup.sessionId,
    });
    throw codeStateError(lookup.codeStatus);
  }

  return issueSessionToken(db, lookup);
}
