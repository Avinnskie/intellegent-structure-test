/**
 * HR operations: candidates, sessions, and the session list/detail the portal reads (T19).
 *
 * Three rules carry the security weight here:
 *
 * 1. EVERY read and write is scoped to `ctx.organizationId`. A session or candidate from another
 *    organization answers `NOT_FOUND` — indistinguishable from one that does not exist, so the API
 *    never confirms what it will not show (spec §19).
 * 2. THE PLAINTEXT CODE EXISTS ONCE. `createSession` returns it a single time for HR to hand to the
 *    candidate; the database holds only the hash and the mask, the audit row only the mask. Nothing
 *    in this module can read a code back afterwards, because nothing stores it.
 * 3. VERSIONS ARE PINNED AT CREATION (spec §10A). The session records the published form, scoring
 *    key, norm set, and per-subtest tutorial versions the moment it is created; later publishes
 *    change nothing for sessions already issued.
 */
import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import { getServerConfig } from "../config.ts";
import type { DbLike } from "../db/client.ts";
import {
  accessCodes,
  assessmentFormVersions,
  assessmentSessions,
  candidates,
  normSetVersions,
  participantTokens,
  responses,
  scoringKeyVersions,
  subtestAttempts,
  subtestVersions,
  tutorialVersions,
} from "../db/schema.ts";
import { generateAccessCode, hashAccessCode, maskAccessCode } from "../domain/access-code.ts";
import type { SessionStatus } from "../domain/session-state.ts";
import { SUBTEST_CODES, type SubtestCode } from "../ist-subtests.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";
import { dbNow } from "./db-clock.ts";

const NOT_FOUND_MESSAGE = "Data tidak ditemukan.";
const MASTER_DATA_MESSAGE =
  "Master data tes belum siap: tidak ada versi form/kunci/norma berstatus published.";

const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_CODE_TTL_HOURS = 48;
const MAX_CODE_TTL_HOURS = 14 * 24;
/** Retries on the (astronomically unlikely) code-hash collision before giving up loudly. */
const CODE_GENERATION_ATTEMPTS = 3;
const SESSION_LIST_LIMIT = 100;

/** Same-shaped miss for "does not exist" and "belongs to someone else" — no existence oracle. */
function notFound(): ApiError {
  return new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

/**
 * Domain validation for a new candidate. `birthDate` must be a real calendar date in the past —
 * the age at test is computed from it (spec §15), and a typo here becomes a wrong norm band later.
 */
export const createCandidateSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal lahir harus YYYY-MM-DD.")
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }, "Tanggal lahir tidak valid.")
    .refine(
      (value) => new Date(`${value}T00:00:00Z`).getTime() < Date.now(),
      "Tanggal lahir harus di masa lalu.",
    ),
  testPurpose: z.string().trim().min(1).max(200),
  gender: z.string().trim().min(1).max(50).optional(),
  education: z.string().trim().min(1).max(100).optional(),
  externalReference: z.string().trim().min(1).max(100).optional(),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

export type CandidateDto = {
  id: string;
  fullName: string;
  birthDate: string;
  testPurpose: string;
  gender: string | null;
  education: string | null;
  externalReference: string | null;
  createdAt: string;
};

export async function createCandidate(
  db: DbLike,
  ctx: AuthContext,
  // `unknown`, parsed here: the route hands the raw body through, and the schema is the boundary.
  input: unknown,
): Promise<CandidateDto> {
  const data = createCandidateSchema.parse(input);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(candidates)
      .values({
        organizationId: ctx.organizationId,
        fullName: data.fullName,
        birthDate: data.birthDate,
        testPurpose: data.testPurpose,
        gender: data.gender ?? null,
        education: data.education ?? null,
        externalReference: data.externalReference ?? null,
        createdBy: ctx.userId,
      })
      .returning();

    if (!row) {
      throw new Error("Kandidat gagal dibuat.");
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "candidate.created",
      objectType: "candidate",
      objectId: row.id,
      // The id, never the name or birth date: audit rows are broadly readable and PII does not
      // belong in them (spec §19); the candidate row itself is the record.
      metadata: { candidateId: row.id },
    });

    return {
      id: row.id,
      fullName: row.fullName,
      birthDate: row.birthDate,
      testPurpose: row.testPurpose,
      gender: row.gender,
      education: row.education,
      externalReference: row.externalReference,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function listCandidates(db: DbLike, ctx: AuthContext): Promise<CandidateDto[]> {
  const rows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.organizationId, ctx.organizationId))
    .orderBy(desc(candidates.createdAt))
    .limit(SESSION_LIST_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    birthDate: row.birthDate,
    testPurpose: row.testPurpose,
    gender: row.gender,
    education: row.education,
    externalReference: row.externalReference,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Edits a candidate's identity fields. Same validation as creation; org-scoped; audited with the
 * id only (PII stays out of audit). A birth-date fix is the legitimate use — results already
 * calculated keep their snapshotted `age_at_test`; only a RE-calculation reads the new date.
 */
export async function updateCandidate(
  db: DbLike,
  ctx: AuthContext,
  candidateId: string,
  input: unknown,
): Promise<CandidateDto> {
  const data = createCandidateSchema.parse(input);
  if (!z.uuid().safeParse(candidateId).success) {
    throw notFound();
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(candidates)
      .set({
        fullName: data.fullName,
        birthDate: data.birthDate,
        testPurpose: data.testPurpose,
        gender: data.gender ?? null,
        education: data.education ?? null,
        externalReference: data.externalReference ?? null,
      })
      .where(
        and(eq(candidates.id, candidateId), eq(candidates.organizationId, ctx.organizationId)),
      )
      .returning();
    if (!row) {
      throw notFound();
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "candidate.updated",
      objectType: "candidate",
      objectId: row.id,
      metadata: { candidateId: row.id },
    });

    return {
      id: row.id,
      fullName: row.fullName,
      birthDate: row.birthDate,
      testPurpose: row.testPurpose,
      gender: row.gender,
      education: row.education,
      externalReference: row.externalReference,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * Deletes a candidate — ONLY when no session references them. A candidate with sessions carries
 * assessment history that must never silently vanish (brief §22); the refusal tells HR to look at
 * the sessions first.
 */
export async function deleteCandidate(
  db: DbLike,
  ctx: AuthContext,
  candidateId: string,
): Promise<{ candidateId: string }> {
  if (!z.uuid().safeParse(candidateId).success) {
    throw notFound();
  }

  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(eq(candidates.id, candidateId), eq(candidates.organizationId, ctx.organizationId)),
      )
      .for("update")
      .limit(1);
    if (!candidate) {
      throw notFound();
    }

    const [session] = await tx
      .select({ id: assessmentSessions.id })
      .from(assessmentSessions)
      .where(eq(assessmentSessions.candidateId, candidate.id))
      .limit(1);
    if (session) {
      throw new ApiError(
        "CANDIDATE_IN_USE",
        "Peserta ini memiliki sesi assessment dan tidak dapat dihapus. Hapus/batalkan sesinya dahulu.",
        409,
      );
    }

    await tx.delete(candidates).where(eq(candidates.id, candidate.id));
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "candidate.deleted",
      objectType: "candidate",
      objectId: candidate.id,
      metadata: { candidateId: candidate.id },
    });

    return { candidateId: candidate.id };
  });
}

/**
 * Hard-deletes a session — ONLY while nothing has happened: `code_generated`/`code_validated`,
 * no attempt rows. The moment a participant has sat anything, the record is assessment history
 * and deletion is refused (cancel/void via status is the tool then). Access codes and tokens go
 * with it; the audit row survives (append-only, no FK to the session).
 */
export async function deleteSession(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<{ sessionId: string }> {
  if (!z.uuid().safeParse(sessionId).success) {
    throw notFound();
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({ id: assessmentSessions.id, status: assessmentSessions.status })
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
      throw notFound();
    }
    if (session.status !== "code_generated" && session.status !== "code_validated") {
      throw new ApiError(
        "SESSION_HAS_DATA",
        "Sesi ini sudah berjalan dan menjadi riwayat assessment — tidak dapat dihapus. Gunakan pembatalan.",
        409,
      );
    }
    const [attempt] = await tx
      .select({ id: subtestAttempts.id })
      .from(subtestAttempts)
      .where(eq(subtestAttempts.sessionId, session.id))
      .limit(1);
    if (attempt) {
      throw new ApiError(
        "SESSION_HAS_DATA",
        "Sesi ini sudah memiliki data pengerjaan dan tidak dapat dihapus.",
        409,
      );
    }

    await tx.delete(participantTokens).where(eq(participantTokens.sessionId, session.id));
    await tx.delete(accessCodes).where(eq(accessCodes.sessionId, session.id));
    await tx.delete(assessmentSessions).where(eq(assessmentSessions.id, session.id));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "session.deleted",
      objectType: "assessment_session",
      objectId: session.id,
      metadata: { sessionId: session.id, statusAtDeletion: session.status },
    });

    return { sessionId: session.id };
  });
}

// ---------------------------------------------------------------------------
// Session creation — version pinning + access code
// ---------------------------------------------------------------------------

export const createSessionSchema = z.object({
  candidateId: z.uuid(),
  expiresInHours: z.number().int().min(1).max(MAX_CODE_TTL_HOURS).default(DEFAULT_CODE_TTL_HOURS),
  scheduledAt: z.iso.datetime().optional(),
  /**
   * `single` (default): satu kode satu kali masuk — tab tertutup berarti minta regenerate ke HR.
   * `multi`: kode yang sama boleh masuk berulang selama tes masih hidup. Sesi yang selesai tidak
   * pernah menerima kode lagi, apa pun kebijakannya.
   */
  reentryPolicy: z.enum(["single", "multi"]).default("single"),
});

export type CreateSessionInput = z.input<typeof createSessionSchema>;

export type CreateSessionDto = {
  sessionId: string;
  candidateId: string;
  status: SessionStatus;
  /** PLAINTEXT — shown to HR exactly once, never stored, never audited, never queryable again. */
  accessCode: string;
  accessCodeMasked: string;
  accessCodeExpiresAt: string;
};

type PinnedMaster = {
  formVersionId: string;
  scoringKeyVersionId: string;
  normSetVersionId: string;
  pinnedTutorialVersions: Record<SubtestCode, string>;
};

/**
 * The published master data a new session pins. Resolved fresh per creation — "published" is a
 * moving target between sessions, frozen only within one.
 */
async function resolvePublishedMaster(tx: DbLike): Promise<PinnedMaster> {
  const [form] = await tx
    .select({ id: assessmentFormVersions.id })
    .from(assessmentFormVersions)
    .where(eq(assessmentFormVersions.status, "published"))
    .orderBy(desc(assessmentFormVersions.version))
    .limit(1);
  if (!form) {
    throw new ApiError("MASTER_DATA_MISSING", MASTER_DATA_MESSAGE, 503);
  }

  const [scoringKey] = await tx
    .select({ id: scoringKeyVersions.id })
    .from(scoringKeyVersions)
    .where(
      and(eq(scoringKeyVersions.formVersionId, form.id), eq(scoringKeyVersions.status, "published")),
    )
    .orderBy(desc(scoringKeyVersions.version))
    .limit(1);
  const [normSet] = await tx
    .select({ id: normSetVersions.id })
    .from(normSetVersions)
    .where(and(eq(normSetVersions.formVersionId, form.id), eq(normSetVersions.status, "published")))
    .orderBy(desc(normSetVersions.version))
    .limit(1);
  if (!scoringKey || !normSet) {
    throw new ApiError("MASTER_DATA_MISSING", MASTER_DATA_MESSAGE, 503);
  }

  // The latest PUBLISHED tutorial per subtest, pinned by id (spec §10A).
  const tutorialRows = await tx
    .select({
      code: subtestVersions.code,
      tutorialVersionId: tutorialVersions.id,
      version: tutorialVersions.version,
    })
    .from(tutorialVersions)
    .innerJoin(subtestVersions, eq(tutorialVersions.subtestVersionId, subtestVersions.id))
    .where(and(eq(subtestVersions.formVersionId, form.id), eq(tutorialVersions.status, "published")))
    .orderBy(desc(tutorialVersions.version));

  const pinned: Partial<Record<SubtestCode, string>> = {};
  for (const row of tutorialRows) {
    const code = row.code as SubtestCode;
    // Rows arrive newest-first; the first one per code wins.
    pinned[code] ??= row.tutorialVersionId;
  }

  const missing = SUBTEST_CODES.filter((code) => !pinned[code]);
  if (missing.length > 0) {
    throw new ApiError(
      "MASTER_DATA_MISSING",
      `Tutorial published belum lengkap untuk subtes: ${missing.join(", ")}.`,
      503,
    );
  }

  return {
    formVersionId: form.id,
    scoringKeyVersionId: scoringKey.id,
    normSetVersionId: normSet.id,
    pinnedTutorialVersions: pinned as Record<SubtestCode, string>,
  };
}

export async function createSession(
  db: DbLike,
  ctx: AuthContext,
  input: unknown,
): Promise<CreateSessionDto> {
  const data = createSessionSchema.parse(input);
  const pepper = getServerConfig().ACCESS_CODE_PEPPER;

  return db.transaction(async (tx) => {
    // Org scoping BEFORE anything else: a candidate id from another org is a miss, full stop.
    const [candidate] = await tx
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(eq(candidates.id, data.candidateId), eq(candidates.organizationId, ctx.organizationId)),
      )
      .limit(1);
    if (!candidate) {
      throw notFound();
    }

    const master = await resolvePublishedMaster(tx);

    const [session] = await tx
      .insert(assessmentSessions)
      .values({
        organizationId: ctx.organizationId,
        candidateId: candidate.id,
        formVersionId: master.formVersionId,
        scoringKeyVersionId: master.scoringKeyVersionId,
        normSetVersionId: master.normSetVersionId,
        pinnedTutorialVersions: master.pinnedTutorialVersions,
        reentryPolicy: data.reentryPolicy,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        createdBy: ctx.userId,
      })
      .returning({ id: assessmentSessions.id, status: assessmentSessions.status });
    if (!session) {
      throw new Error("Sesi gagal dibuat.");
    }

    // The database clock, not the app server's: `expires_at` will be compared against `now()`.
    const [clock] = await tx
      .select({ now: dbNow() })
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, session.id))
      .limit(1);
    if (!clock) {
      throw new Error("Gagal membaca jam server saat membuat kode akses.");
    }
    const expiresAt = new Date(clock.now.getTime() + data.expiresInHours * MS_PER_HOUR);

    // The unique index on code_hash is the collision detector; colliding again after several
    // fresh draws from a 31^8 space means something is broken, so fail loudly rather than loop.
    let plaintext: string | null = null;
    let masked = "";
    for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS && plaintext === null; attempt += 1) {
      const code = generateAccessCode();
      const codeHash = hashAccessCode(code, pepper);
      const inserted = await tx
        .insert(accessCodes)
        .values({
          sessionId: session.id,
          codeHash,
          codeMasked: maskAccessCode(code),
          expiresAt,
          createdBy: ctx.userId,
        })
        .onConflictDoNothing({ target: accessCodes.codeHash })
        .returning({ codeMasked: accessCodes.codeMasked });
      if (inserted.length > 0) {
        plaintext = code;
        masked = inserted[0]?.codeMasked ?? maskAccessCode(code);
      }
    }
    if (plaintext === null) {
      throw new Error("Gagal menghasilkan kode akses unik setelah beberapa percobaan.");
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "session.created",
      objectType: "assessment_session",
      objectId: session.id,
      metadata: {
        sessionId: session.id,
        candidateId: candidate.id,
        formVersionId: master.formVersionId,
        scoringKeyVersionId: master.scoringKeyVersionId,
        normSetVersionId: master.normSetVersionId,
      },
    });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "access_code.generated",
      objectType: "assessment_session",
      objectId: session.id,
      // The MASK only. The hash would be crackable offline against the alphabet; the plaintext
      // would make the audit trail a credential store.
      metadata: { sessionId: session.id, codeMasked: masked, expiresAt: expiresAt.toISOString() },
    });

    return {
      sessionId: session.id,
      candidateId: candidate.id,
      status: session.status,
      accessCode: plaintext,
      accessCodeMasked: masked,
      accessCodeExpiresAt: expiresAt.toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// Bulk session creation (paste from Excel/Word)
// ---------------------------------------------------------------------------

const BULK_MAX_ROWS = 200;

export const bulkCreateSessionsSchema = z.object({
  /** Every row is validated with the SAME rules as single candidate creation. */
  rows: z
    .array(
      createCandidateSchema.pick({
        fullName: true,
        birthDate: true,
        gender: true,
        education: true,
      }).extend({
        testPurpose: z.string().trim().min(1).max(200).default("Rekrutmen"),
      }),
    )
    .min(1)
    .max(BULK_MAX_ROWS),
  expiresInHours: z.number().int().min(1).max(MAX_CODE_TTL_HOURS).default(DEFAULT_CODE_TTL_HOURS),
  /** Bulk default is MULTI (boleh masuk ulang) per product decision; switchable per batch. */
  reentryPolicy: z.enum(["single", "multi"]).default("multi"),
});

export type BulkCreatedRow = {
  candidateId: string;
  sessionId: string;
  fullName: string;
  birthDate: string;
  /** PLAINTEXT — exists once, in this response, for HR to distribute. */
  accessCode: string;
  accessCodeMasked: string;
};

export type BulkCreateSessionsDto = {
  created: readonly BulkCreatedRow[];
  accessCodeExpiresAt: string;
  reentryPolicy: "single" | "multi";
};

/**
 * Creates candidate + session + access code for EVERY row in ONE transaction — all-or-nothing, so
 * a failure at row 137 never leaves a half-imported batch to reconcile by hand. All sessions pin
 * the same published master versions (resolved once), share one TTL and one re-entry policy, and
 * every plaintext code exists only in the response. Audits: per-entity rows plus one
 * `session.bulk_created` summary.
 */
export async function bulkCreateSessions(
  db: DbLike,
  ctx: AuthContext,
  input: unknown,
): Promise<BulkCreateSessionsDto> {
  const data = bulkCreateSessionsSchema.parse(input);
  const pepper = getServerConfig().ACCESS_CODE_PEPPER;

  return db.transaction(async (tx) => {
    const master = await resolvePublishedMaster(tx);

    const [clock] = await tx.select({ now: dbNow() }).from(assessmentFormVersions).limit(1);
    if (!clock) {
      throw new Error("Gagal membaca jam server saat membuat sesi massal.");
    }
    const expiresAt = new Date(clock.now.getTime() + data.expiresInHours * MS_PER_HOUR);

    const created: BulkCreatedRow[] = [];

    for (const row of data.rows) {
      const [candidate] = await tx
        .insert(candidates)
        .values({
          organizationId: ctx.organizationId,
          fullName: row.fullName,
          birthDate: row.birthDate,
          testPurpose: row.testPurpose,
          gender: row.gender ?? null,
          education: row.education ?? null,
          createdBy: ctx.userId,
        })
        .returning({ id: candidates.id });
      if (!candidate) {
        throw new Error("Kandidat gagal dibuat pada impor massal.");
      }

      const [session] = await tx
        .insert(assessmentSessions)
        .values({
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          formVersionId: master.formVersionId,
          scoringKeyVersionId: master.scoringKeyVersionId,
          normSetVersionId: master.normSetVersionId,
          pinnedTutorialVersions: master.pinnedTutorialVersions,
          reentryPolicy: data.reentryPolicy,
          createdBy: ctx.userId,
        })
        .returning({ id: assessmentSessions.id });
      if (!session) {
        throw new Error("Sesi gagal dibuat pada impor massal.");
      }

      let plaintext: string | null = null;
      let masked = "";
      for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS && plaintext === null; attempt += 1) {
        const code = generateAccessCode();
        const inserted = await tx
          .insert(accessCodes)
          .values({
            sessionId: session.id,
            codeHash: hashAccessCode(code, pepper),
            codeMasked: maskAccessCode(code),
            expiresAt,
            createdBy: ctx.userId,
          })
          .onConflictDoNothing({ target: accessCodes.codeHash })
          .returning({ codeMasked: accessCodes.codeMasked });
        if (inserted.length > 0) {
          plaintext = code;
          masked = inserted[0]?.codeMasked ?? maskAccessCode(code);
        }
      }
      if (plaintext === null) {
        throw new Error("Gagal menghasilkan kode akses unik pada impor massal.");
      }

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorType: "user",
        actorId: ctx.userId,
        action: "candidate.created",
        objectType: "candidate",
        objectId: candidate.id,
        metadata: { candidateId: candidate.id, bulk: true },
      });
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorType: "user",
        actorId: ctx.userId,
        action: "session.created",
        objectType: "assessment_session",
        objectId: session.id,
        metadata: {
          sessionId: session.id,
          candidateId: candidate.id,
          formVersionId: master.formVersionId,
          scoringKeyVersionId: master.scoringKeyVersionId,
          normSetVersionId: master.normSetVersionId,
          bulk: true,
        },
      });
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorType: "user",
        actorId: ctx.userId,
        action: "access_code.generated",
        objectType: "assessment_session",
        objectId: session.id,
        metadata: {
          sessionId: session.id,
          codeMasked: masked,
          expiresAt: expiresAt.toISOString(),
          bulk: true,
        },
      });

      created.push({
        candidateId: candidate.id,
        sessionId: session.id,
        fullName: row.fullName,
        birthDate: row.birthDate,
        accessCode: plaintext,
        accessCodeMasked: masked,
      });
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "session.bulk_created",
      objectType: "assessment_session",
      objectId: null,
      metadata: {
        count: created.length,
        reentryPolicy: data.reentryPolicy,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      created,
      accessCodeExpiresAt: expiresAt.toISOString(),
      reentryPolicy: data.reentryPolicy,
    };
  });
}

// ---------------------------------------------------------------------------
// Session list + detail
// ---------------------------------------------------------------------------

export const listSessionsSchema = z.object({
  status: z.string().trim().min(1).max(40).optional(),
  query: z.string().trim().min(1).max(200).optional(),
});

export type ListSessionsInput = z.infer<typeof listSessionsSchema>;

export type SessionListRow = {
  sessionId: string;
  candidateId: string;
  candidateName: string;
  status: SessionStatus;
  currentSubtestCode: SubtestCode | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  accessCode: { masked: string; status: string; expiresAt: string } | null;
  progress: { subtestsCompleted: number; answered: number; skipped: number };
};

/** The newest code per session — regeneration (T20) leaves older rows behind as history. */
function latestCodePerSession(
  rows: readonly {
    sessionId: string;
    codeMasked: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  }[],
): Map<string, SessionListRow["accessCode"]> {
  const byNewest = new Map<string, SessionListRow["accessCode"]>();
  for (const row of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (!byNewest.has(row.sessionId)) {
      byNewest.set(row.sessionId, {
        masked: row.codeMasked,
        status: row.status,
        expiresAt: row.expiresAt.toISOString(),
      });
    }
  }
  return byNewest;
}

export async function listSessions(
  db: DbLike,
  ctx: AuthContext,
  input: ListSessionsInput = {},
): Promise<SessionListRow[]> {
  const filters = listSessionsSchema.parse(input);

  const conditions = [eq(assessmentSessions.organizationId, ctx.organizationId)];
  if (filters.status) {
    conditions.push(eq(assessmentSessions.status, filters.status as SessionStatus));
  }
  if (filters.query) {
    // Parameterized by drizzle; the only user text reaching SQL is a bound LIKE pattern.
    conditions.push(ilike(candidates.fullName, `%${filters.query}%`));
  }

  const base = await db
    .select({
      sessionId: assessmentSessions.id,
      candidateId: assessmentSessions.candidateId,
      candidateName: candidates.fullName,
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
      createdAt: assessmentSessions.createdAt,
      startedAt: assessmentSessions.startedAt,
      completedAt: assessmentSessions.completedAt,
    })
    .from(assessmentSessions)
    .innerJoin(candidates, eq(assessmentSessions.candidateId, candidates.id))
    .where(and(...conditions))
    .orderBy(desc(assessmentSessions.createdAt))
    .limit(SESSION_LIST_LIMIT);

  if (base.length === 0) {
    return [];
  }
  const sessionIds = base.map((row) => row.sessionId);

  // Aggregates fetched per page of ids, folded in JS: no N+1, no fragile lateral SQL.
  const codeRows = await db
    .select({
      sessionId: accessCodes.sessionId,
      codeMasked: accessCodes.codeMasked,
      status: accessCodes.status,
      expiresAt: accessCodes.expiresAt,
      createdAt: accessCodes.createdAt,
    })
    .from(accessCodes)
    .where(inArray(accessCodes.sessionId, sessionIds));
  const codeBySession = latestCodePerSession(codeRows);

  const attemptRows = await db
    .select({ sessionId: subtestAttempts.sessionId, status: subtestAttempts.status })
    .from(subtestAttempts)
    .where(inArray(subtestAttempts.sessionId, sessionIds));

  const responseRows = await db
    .select({
      sessionId: subtestAttempts.sessionId,
      responseStatus: responses.responseStatus,
    })
    .from(responses)
    .innerJoin(subtestAttempts, eq(responses.subtestAttemptId, subtestAttempts.id))
    .where(inArray(subtestAttempts.sessionId, sessionIds));

  const progressBySession = new Map<
    string,
    { subtestsCompleted: number; answered: number; skipped: number }
  >();
  const progressFor = (sessionId: string) => {
    let entry = progressBySession.get(sessionId);
    if (!entry) {
      entry = { subtestsCompleted: 0, answered: 0, skipped: 0 };
      progressBySession.set(sessionId, entry);
    }
    return entry;
  };
  for (const row of attemptRows) {
    if (row.status === "completed") {
      progressFor(row.sessionId).subtestsCompleted += 1;
    }
  }
  for (const row of responseRows) {
    if (row.responseStatus === "answered" || row.responseStatus === "changed") {
      progressFor(row.sessionId).answered += 1;
    } else if (row.responseStatus === "skipped") {
      progressFor(row.sessionId).skipped += 1;
    }
  }

  return base.map((row) => ({
    sessionId: row.sessionId,
    candidateId: row.candidateId,
    candidateName: row.candidateName,
    status: row.status,
    currentSubtestCode: (row.currentSubtestCode as SubtestCode | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    accessCode: codeBySession.get(row.sessionId) ?? null,
    progress: progressBySession.get(row.sessionId) ?? {
      subtestsCompleted: 0,
      answered: 0,
      skipped: 0,
    },
  }));
}

export type SessionDetailDto = {
  sessionId: string;
  status: SessionStatus;
  currentSubtestCode: SubtestCode | null;
  reentryPolicy: "single" | "multi";
  createdAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  candidate: {
    id: string;
    fullName: string;
    birthDate: string;
    gender: string | null;
    education: string | null;
    testPurpose: string;
  };
  accessCode: { masked: string; status: string; expiresAt: string; lastUsedAt: string | null } | null;
  subtests: readonly {
    code: SubtestCode;
    sequence: number;
    title: string;
    durationSeconds: number;
    itemCount: number;
    attempt: {
      status: string;
      completionReason: string | null;
      startedAt: string;
      completedAt: string | null;
      answered: number;
      skipped: number;
    } | null;
  }[];
};

export async function getSessionDetail(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<SessionDetailDto> {
  if (!z.uuid().safeParse(sessionId).success) {
    // A malformed id is the same miss as an unknown one — not a different error to probe with.
    throw notFound();
  }

  const [row] = await db
    .select({
      sessionId: assessmentSessions.id,
      status: assessmentSessions.status,
      currentSubtestCode: assessmentSessions.currentSubtestCode,
      reentryPolicy: assessmentSessions.reentryPolicy,
      createdAt: assessmentSessions.createdAt,
      scheduledAt: assessmentSessions.scheduledAt,
      startedAt: assessmentSessions.startedAt,
      completedAt: assessmentSessions.completedAt,
      formVersionId: assessmentSessions.formVersionId,
      candidateId: candidates.id,
      candidateName: candidates.fullName,
      birthDate: candidates.birthDate,
      gender: candidates.gender,
      education: candidates.education,
      testPurpose: candidates.testPurpose,
    })
    .from(assessmentSessions)
    .innerJoin(candidates, eq(assessmentSessions.candidateId, candidates.id))
    .where(
      and(
        eq(assessmentSessions.id, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw notFound();
  }

  const codeRows = await db
    .select({
      sessionId: accessCodes.sessionId,
      codeMasked: accessCodes.codeMasked,
      status: accessCodes.status,
      expiresAt: accessCodes.expiresAt,
      lastUsedAt: accessCodes.lastUsedAt,
      createdAt: accessCodes.createdAt,
    })
    .from(accessCodes)
    .where(eq(accessCodes.sessionId, row.sessionId))
    .orderBy(desc(accessCodes.createdAt))
    .limit(1);
  const code = codeRows[0] ?? null;

  const subtestRows = await db
    .select({
      id: subtestVersions.id,
      code: subtestVersions.code,
      sequence: subtestVersions.sequence,
      title: subtestVersions.title,
      durationSeconds: subtestVersions.durationSeconds,
      itemCount: subtestVersions.itemCount,
    })
    .from(subtestVersions)
    .where(eq(subtestVersions.formVersionId, row.formVersionId))
    .orderBy(subtestVersions.sequence);

  const attemptRows = await db
    .select({
      id: subtestAttempts.id,
      subtestCode: subtestAttempts.subtestCode,
      status: subtestAttempts.status,
      completionReason: subtestAttempts.completionReason,
      startedAt: subtestAttempts.startedAt,
      completedAt: subtestAttempts.completedAt,
    })
    .from(subtestAttempts)
    .where(eq(subtestAttempts.sessionId, row.sessionId));
  const attemptByCode = new Map(attemptRows.map((attempt) => [attempt.subtestCode, attempt]));

  const responseRows = attemptRows.length
    ? await db
        .select({
          attemptId: responses.subtestAttemptId,
          responseStatus: responses.responseStatus,
        })
        .from(responses)
        .where(
          inArray(
            responses.subtestAttemptId,
            attemptRows.map((attempt) => attempt.id),
          ),
        )
    : [];
  const countsByAttempt = new Map<string, { answered: number; skipped: number }>();
  for (const response of responseRows) {
    let entry = countsByAttempt.get(response.attemptId);
    if (!entry) {
      entry = { answered: 0, skipped: 0 };
      countsByAttempt.set(response.attemptId, entry);
    }
    if (response.responseStatus === "answered" || response.responseStatus === "changed") {
      entry.answered += 1;
    } else if (response.responseStatus === "skipped") {
      entry.skipped += 1;
    }
  }

  return {
    sessionId: row.sessionId,
    status: row.status,
    currentSubtestCode: (row.currentSubtestCode as SubtestCode | null) ?? null,
    reentryPolicy: row.reentryPolicy,
    createdAt: row.createdAt.toISOString(),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    candidate: {
      id: row.candidateId,
      fullName: row.candidateName,
      birthDate: row.birthDate,
      gender: row.gender,
      education: row.education,
      testPurpose: row.testPurpose,
    },
    accessCode: code
      ? {
          masked: code.codeMasked,
          status: code.status,
          expiresAt: code.expiresAt.toISOString(),
          lastUsedAt: code.lastUsedAt?.toISOString() ?? null,
        }
      : null,
    subtests: subtestRows.map((subtest) => {
      const attempt = attemptByCode.get(subtest.code);
      const counts = attempt ? countsByAttempt.get(attempt.id) : undefined;
      return {
        code: subtest.code as SubtestCode,
        sequence: subtest.sequence,
        title: subtest.title,
        durationSeconds: subtest.durationSeconds,
        itemCount: subtest.itemCount,
        attempt: attempt
          ? {
              status: attempt.status,
              completionReason: attempt.completionReason,
              startedAt: attempt.startedAt.toISOString(),
              completedAt: attempt.completedAt?.toISOString() ?? null,
              answered: counts?.answered ?? 0,
              skipped: counts?.skipped ?? 0,
            }
          : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Access code revoke / regenerate (T20, spec §9)
// ---------------------------------------------------------------------------

const CODE_NOT_ACTIVE_MESSAGE = "Kode akses sesi ini sudah tidak aktif.";
const CODE_COMPLETED_MESSAGE =
  "Kode akses sesi ini sudah selesai dipakai; sesi selesai tidak dapat dibuka kembali.";
const SESSION_CLOSED_MESSAGE = "Sesi ini sudah ditutup dan kodenya tidak dapat dibuat ulang.";

/** Session statuses from which a fresh code makes no sense — the session itself is over. */
const REGENERATE_BLOCKED_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "final",
  "void",
  "cancelled",
  "invalidated",
  "expired",
]);

export type RevokeAccessCodeDto = {
  sessionId: string;
  codeMasked: string;
  status: "revoked";
  revokedTokens: number;
};

type LockedSessionRow = { id: string; status: SessionStatus };

/** Org-scoped session lookup under a row lock, so two admins acting at once serialize. */
async function lockHrSession(
  tx: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<LockedSessionRow> {
  if (!z.uuid().safeParse(sessionId).success) {
    throw notFound();
  }
  const [row] = await tx
    .select({ id: assessmentSessions.id, status: assessmentSessions.status })
    .from(assessmentSessions)
    .where(
      and(
        eq(assessmentSessions.id, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .for("update")
    .limit(1);
  if (!row) {
    throw notFound();
  }
  return row;
}

async function latestCode(tx: DbLike, sessionId: string) {
  const [row] = await tx
    .select()
    .from(accessCodes)
    .where(eq(accessCodes.sessionId, sessionId))
    .orderBy(desc(accessCodes.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Kills the code AND every participant token of the session. The code alone would only bar
 * re-entry; a participant already inside holds a token, and a revocation that leaves them typing
 * is not a revocation. The next request they make fails `TOKEN_INVALID` (T12 checks `revoked_at`).
 */
export async function revokeAccessCode(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
  reason?: string,
): Promise<RevokeAccessCodeDto> {
  return db.transaction(async (tx) => {
    const session = await lockHrSession(tx, ctx, sessionId);
    const code = await latestCode(tx, session.id);
    if (!code) {
      throw notFound();
    }
    if (code.status !== "active" && code.status !== "in_use") {
      throw new ApiError("CODE_NOT_ACTIVE", CODE_NOT_ACTIVE_MESSAGE, 409);
    }

    const [clock] = await tx
      .select({ now: dbNow() })
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, session.id))
      .limit(1);
    if (!clock) {
      throw new Error("Gagal membaca jam server saat mencabut kode.");
    }

    await tx
      .update(accessCodes)
      .set({ status: "revoked", revokedAt: clock.now })
      .where(eq(accessCodes.id, code.id));

    const revokedTokens = await tx
      .update(participantTokens)
      .set({ revokedAt: clock.now })
      .where(
        and(eq(participantTokens.sessionId, session.id), isNull(participantTokens.revokedAt)),
      )
      .returning({ id: participantTokens.id });

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "access_code.revoked",
      objectType: "assessment_session",
      objectId: session.id,
      metadata: {
        sessionId: session.id,
        codeMasked: code.codeMasked,
        revokedTokens: revokedTokens.length,
        ...(reason ? { reason } : {}),
      },
    });

    return {
      sessionId: session.id,
      codeMasked: code.codeMasked,
      status: "revoked",
      revokedTokens: revokedTokens.length,
    };
  });
}

export const regenerateAccessCodeSchema = z.object({
  expiresInHours: z.number().int().min(1).max(MAX_CODE_TTL_HOURS).default(DEFAULT_CODE_TTL_HOURS),
});

export type RegenerateAccessCodeDto = {
  sessionId: string;
  /** PLAINTEXT — the one and only time the new code leaves the server. */
  accessCode: string;
  accessCodeMasked: string;
  accessCodeExpiresAt: string;
  previousCodeMasked: string | null;
};

/**
 * Retires the old code as `regenerated` when one exists, then mints a fresh active code. Legacy or
 * repaired sessions can have no code row; the rescue flow still creates the missing entry.
 * Participant tokens survive: regeneration replaces the ENTRY credential, not a session already
 * legitimately underway — killing the session is what `revokeAccessCode` is for.
 */
export async function regenerateAccessCode(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
  input: unknown = {},
): Promise<RegenerateAccessCodeDto> {
  const data = regenerateAccessCodeSchema.parse(input ?? {});
  const pepper = getServerConfig().ACCESS_CODE_PEPPER;

  return db.transaction(async (tx) => {
    const session = await lockHrSession(tx, ctx, sessionId);
    if (REGENERATE_BLOCKED_STATUSES.has(session.status)) {
      throw new ApiError("SESSION_NOT_ACTIVE", SESSION_CLOSED_MESSAGE, 409);
    }

    const code = await latestCode(tx, session.id);
    if (code?.status === "completed") {
      // Spec §9: "kode yang selesai tidak dapat memulai sesi baru" — a finished sitting is not
      // reopened by minting a fresh code; a retest is a NEW session.
      throw new ApiError("CODE_ALREADY_COMPLETED", CODE_COMPLETED_MESSAGE, 409);
    }

    const [clock] = await tx
      .select({ now: dbNow() })
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, session.id))
      .limit(1);
    if (!clock) {
      throw new Error("Gagal membaca jam server saat membuat ulang kode.");
    }
    const expiresAt = new Date(clock.now.getTime() + data.expiresInHours * MS_PER_HOUR);

    if (code) {
      await tx
        .update(accessCodes)
        .set({ status: "regenerated" })
        .where(eq(accessCodes.id, code.id));
    }

    let plaintext: string | null = null;
    let masked = "";
    for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS && plaintext === null; attempt += 1) {
      const fresh = generateAccessCode();
      const inserted = await tx
        .insert(accessCodes)
        .values({
          sessionId: session.id,
          codeHash: hashAccessCode(fresh, pepper),
          codeMasked: maskAccessCode(fresh),
          expiresAt,
          regeneratedFromId: code?.id ?? null,
          createdBy: ctx.userId,
        })
        .onConflictDoNothing({ target: accessCodes.codeHash })
        .returning({ codeMasked: accessCodes.codeMasked });
      if (inserted.length > 0) {
        plaintext = fresh;
        masked = inserted[0]?.codeMasked ?? maskAccessCode(fresh);
      }
    }
    if (plaintext === null) {
      throw new Error("Gagal menghasilkan kode akses unik setelah beberapa percobaan.");
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "access_code.regenerated",
      objectType: "assessment_session",
      objectId: session.id,
      metadata: {
        sessionId: session.id,
        ...(code ? { previousCodeMasked: code.codeMasked } : {}),
        codeMasked: masked,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      sessionId: session.id,
      accessCode: plaintext,
      accessCodeMasked: masked,
      accessCodeExpiresAt: expiresAt.toISOString(),
      previousCodeMasked: code?.codeMasked ?? null,
    };
  });
}
