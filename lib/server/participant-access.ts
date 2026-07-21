/**
 * Participant entry: turning an access code into a session token.
 *
 * This is the only unauthenticated write path in the product, so the order of operations here is the
 * security design, not an implementation detail:
 *
 *   check budget -> hash -> look up -> check code state -> (transaction) advance session + spend
 *   code + issue token + audit,   with a FAILURE recorded against the budget only on a wrong code
 *
 * The budget is CHECKED before the lookup, so a guessing burst cannot be cashed in the moment it
 * lands on a real code: once the budget is gone the client is refused before the credential is read.
 * It is FILLED only by wrong codes (spec §9, brief §8), so twenty candidates NATed behind one lab IP
 * never meter each other out of a test they are sitting in front of.
 */
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

/** The limiter bucket these attempts share. Also the readable prefix of the stored key. */
const RATE_LIMIT_SCOPE = "access_code";

/** Every test opens on SE; derived rather than hardcoded so the fixed order has one definition. */
const FIRST_SUBTEST_CODE = SUBTEST_ORDER[0];

const RATE_LIMITED_MESSAGE = "Terlalu banyak percobaan. Coba lagi dalam 15 menit atau hubungi HR.";
const CODE_INVALID_MESSAGE = "Kode akses tidak valid. Periksa kembali kode Anda atau hubungi HR.";
const SESSION_NOT_ACTIVE_MESSAGE = "Sesi tes ini tidak dapat dimulai. Hubungi HR.";

/**
 * One entry per non-active status, keyed by the status itself: a new `access_code_status` enum value
 * becomes a TYPE ERROR here rather than a code that silently falls through to a generic message.
 *
 * Status choices: 410 for the one state that is about time having passed, 409 for the states that
 * are about the code's lifecycle, 404 for a code that does not exist.
 */
const CODE_STATE_ERRORS: Readonly<
  Record<Exclude<AccessCodeStatus, "active">, { code: string; message: string; status: number }>
> = {
  in_use: {
    code: "CODE_IN_USE",
    // Brief §8: one code cannot create two active attempts. Resuming is done through the token URL
    // the first device already holds, never by re-entering the code — so the copy has to send the
    // participant back to that device rather than invite them to retry here.
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
  /** As typed by the participant. Normalized and hashed here; never logged, never audited. */
  code: string;
  /**
   * Opaque per-client identifier — in production the caller's IP. Hashed inside `rateLimitKey`
   * before it reaches the database or a log line.
   */
  clientKey: string;
};

export type ValidateAccessCodeResult = {
  /** Plaintext participant token. The ONLY moment it exists server-side; only its hash is stored. */
  sessionToken: string;
  /**
   * The session's live persisted status, read back from the row inside the same transaction that
   * advanced it — `tutorial`, since validation and the move into the tutorial commit together so a
   * crash cannot strand a session at `code_validated` holding a token that routes nowhere.
   *
   * Typed as the full `SessionStatus` rather than a literal, and never assembled from a constant:
   * whatever this reports is what the row actually holds.
   */
  sessionStatus: SessionStatus;
  /** Where the participant continues. The token is in the path, so the route is per-attempt. */
  nextRoute: string;
};

type CodeLookup = {
  codeId: string;
  codeStatus: AccessCodeStatus;
  /** Computed by the DATABASE, not compared here — see the note on the lookup query. */
  hasExpired: boolean;
  sessionId: string;
  sessionStatus: SessionStatus;
  organizationId: string;
};

function codeStateError(status: Exclude<AccessCodeStatus, "active">): ApiError {
  const mapped = CODE_STATE_ERRORS[status];
  return new ApiError(mapped.code, mapped.message, mapped.status);
}

/**
 * Marks an `active` code whose `expires_at` has passed as `expired`, then reports it.
 *
 * Lazy rather than swept by a cron: the code is only interesting at the moment someone presents it,
 * and this keeps `access_codes.status` honest for the HR list without a scheduled job. Bounded by
 * construction — the second attempt reads `expired` from the row and never reaches this path, which
 * is what keeps the audit trail from growing with retries.
 */
async function expireCode(db: DbLike, lookup: CodeLookup): Promise<never> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(accessCodes)
      .set({ status: "expired" })
      // The status guard makes this idempotent under a race: two simultaneous requests both try, one
      // updates zero rows and skips the audit row.
      // `expires_at <= now()` is re-asserted here, on the database's clock: this write is
      // DESTRUCTIVE and irreversible for the participant, so it must not fire on a code the
      // database still considers valid.
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
      // No code, masked or otherwise — the object id already identifies the row for HR.
      metadata: { reason: "expires_at_passed", sessionId: lookup.sessionId },
    });
  });

  throw codeStateError("expired");
}

/**
 * `code_generated -> code_validated -> tutorial`, both hops asserted against the state machine.
 *
 * The machine is the authority on what is reachable (an `expired`, `cancelled`, or already-running
 * session must not be re-entered), but `InvalidTransitionError` is an internal fault type that
 * `withApiHandler` would report as a 500. It is translated here into the one thing the participant
 * can act on: this session cannot be started, talk to HR.
 */
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

/**
 * Statuses a valid ACTIVE code may RE-ENTER: the participant lost their session URL (closed tab,
 * revoked token, regenerated code) while the test is still live. Re-entry issues a fresh token and
 * routes to wherever the session already is — it never rewinds or restarts anything. Terminal and
 * post-test statuses stay out: a finished sitting is not re-enterable (spec §9), and `assertStartable`
 * keeps answering those with SESSION_NOT_ACTIVE.
 */
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
    // Re-read under a row lock. The status checked before the transaction was read outside it, so
    // without this two requests arriving together could both pass that check and each issue a token
    // for the same code — precisely the "two active attempts" the CODE_IN_USE rule forbids.
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
    // `in_use` is NOT rejected here anymore: whether an already-redeemed code may re-enter is the
    // session's re-entry policy's call, decided below with the session row in hand. Every other
    // non-active state (revoked, regenerated, completed, expired) stays a hard stop.
    if (code.status !== "active" && code.status !== "in_use") {
      throw codeStateError(code.status);
    }
    // Re-checked under the lock alongside the status: a code that expires between the lookup and
    // this transaction must not still be redeemed. Persisting `expired` is left to the next
    // attempt's lazy path, so this transaction stays a pure no-op when it rejects.
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

    // THE RESUME PATH: the session is already live and the participant is holding a valid code.
    // Whether the SAME code may come back is HR's per-session policy:
    //   `single` — one redemption per code; an `in_use` code answers CODE_IN_USE and the rescue is
    //              an HR regenerate (which mints a fresh `active` code).
    //   `multi`  — the same code re-admits while the test lives.
    // Either way a fresh token is issued and every previous token dies (one live URL), and re-entry
    // never rewinds a running test. Finished sessions never reach here — RESUMABLE excludes every
    // post-test status, and their codes are stamped `completed` at finish.
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
        // The tutorial page of the CURRENT subtest: its server component re-reads the state and
        // redirects to the exact question/route the session is on, so this never lands wrong.
        subtestCode: session.currentSubtestCode ?? FIRST_SUBTEST_CODE,
      };
    }

    // Fresh-start path: only a pristine `active` code may START a session. An `in_use` code on a
    // session that never started is a broken pairing, not a resume — same CODE_IN_USE answer.
    if (code.status !== "active") {
      throw codeStateError(code.status);
    }

    assertStartable(session.status);

    // RETURNING, rather than echoing the literal that was just written: what the caller is told is
    // read back from the row, so the response cannot claim a status the database does not hold.
    const [advanced] = await tx
      .update(assessmentSessions)
      .set({ status: "tutorial", currentSubtestCode: FIRST_SUBTEST_CODE })
      .where(eq(assessmentSessions.id, lookup.sessionId))
      .returning({ status: assessmentSessions.status });

    if (!advanced) {
      // The row was locked above, so it cannot have vanished; failing loudly beats reporting a
      // status nobody read.
      throw new Error("Status sesi gagal diperbarui.");
    }

    await tx
      .update(accessCodes)
      .set({ status: "in_use", lastUsedAt: new Date() })
      .where(eq(accessCodes.id, lookup.codeId));

    // Hash only. A stolen database dump must not yield working session URLs.
    await tx.insert(participantTokens).values({ sessionId: lookup.sessionId, tokenHash });

    await writeAudit(tx, {
      organizationId: lookup.organizationId,
      actorType: "participant",
      // The session, never the code and never the token: an audit row is readable by HR, so an
      // identifier in it must not be a credential.
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

/**
 * Validates a participant's access code and issues a session token.
 *
 * Failed attempts are deliberately NOT audited. An audit row per failure would be unbounded rows
 * written by an unauthenticated caller, and for an unknown code there is nothing to attribute it to
 * (no session, so no organization) — a table any attacker can grow, filled with rows nobody can act
 * on. The rate-limit counter is the durable signal; failures are recorded in the log stream with the
 * hashed client key, which is what makes a distributed guessing campaign visible without giving the
 * campaign a write primitive. Code STATE CHANGES (`expired` above, `validated` in the transaction)
 * are audited, because those are mutations to a record HR relies on.
 *
 * `access_codes.failed_attempts` stays untouched here for the same reason it cannot help: lookup is
 * by hash, so a wrong code matches NO row and has no counter to increment. The only codes that reach
 * a known row are ones the participant typed correctly but that are expired/revoked/in use — state
 * conflicts, not guesses. Incrementing on those would make the column a "confused participant"
 * tally, then let an attacker who guessed a real code lock it out by replaying it. It is left for
 * HR-side use where a per-code counter has a real meaning.
 *
 * Timing: because the lookup is a hash-column equality, an unknown code and a known-but-rejected one
 * differ by a query that hits the unique index either way, plus one extra state-read for the known
 * path. That gap is measurable in principle, but it only tells an attacker whether a code exists —
 * which is exactly what the returned error already says, deliberately, so a participant knows
 * whether to retype the code or call HR. Guessing is bounded by the 10-per-15-minutes budget over a
 * ~2^39.6 keyspace, so the leak buys nothing that matters. Constant-time comparison would be
 * theatre here: there is no plaintext comparison to make constant.
 */
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
      // Evaluated by the DATABASE. Comparing `expiresAt` against `Date.now()` in the app would put
      // this deadline on one clock while `rate-limit.ts` argues the opposite principle for its own;
      // when the app's clock runs ahead, the difference DESTRUCTIVELY persists `expired` onto a
      // code the database still considers valid.
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
    // The ONLY attempt that fills the budget: a code matching no row is BY DEFINITION a wrong code,
    // which is exactly what spec §9 ("batasi percobaan kode salah") and brief §8 scope the limit to.
    // Everything below this point is a correctly typed code whose lifecycle or session is wrong — a
    // confused participant, not a guesser. Counting those would let one candidate re-entering a
    // revoked code ten times lock out every other candidate sharing the lab's public IP.
    await recordRateLimitFailure(db, limitKey);
    // The rejected code is not logged in any form, not even masked: two masked failures from one
    // client narrow the keyspace for whoever reads the logs, and nothing here needs it.
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

  // `in_use` passes through: whether an already-redeemed code may RE-ENTER is the session's
  // re-entry policy's decision, made inside the transaction with the rows locked. Every other
  // non-active state is a hard stop here.
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
