import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentSessions,
  papiAttempts,
  papiItemVersions,
  papiResponses,
  participantTokens,
} from "../db/schema.ts";
import { SUBTEST_ORDER } from "../domain/session-state.ts";
import { asPapiOptionCode, PAPI_ITEM_COUNT, type PapiOptionCode } from "../papi-factors.ts";
import { getServerConfig } from "../config.ts";
import { hashSessionToken } from "../domain/session-token.ts";
import { writeAudit } from "./audit.ts";
import { dbNow } from "./db-clock.ts";
import { calculatePapiResult } from "./papi-calculate.ts";
import {
  advancePapiStatus,
  ensurePapiAttempt,
  lockPapiSession,
  papiAlreadyClosed,
  papiElapsedSeconds,
  papiIncomplete,
  papiNotAvailable,
  pausePapiSegments,
  selectPapiAttempt,
  touchPapiSegment,
  unansweredPapiItems,
} from "./papi-session.ts";
import {
  resolveParticipantSession,
  toParticipantStatus,
  type ParticipantSessionStatus,
} from "./participant-session.ts";
import { selectNow } from "./db-clock.ts";

const ITEM_NOT_FOUND = "Nomor soal tidak dikenal.";
const OPTION_INVALID = "Pilihan jawaban harus A atau B.";

export type PapiItemDto = {
  number: number;
  optionAText: string;
  optionBText: string;
  selected: PapiOptionCode | null;
};

export type PapiStateDto = {
  sessionStatus: ParticipantSessionStatus;
  serverNow: string;
  nextRoute: string;
  /**
   * Lama mengerjakan dalam detik — naik, bukan hitung mundur.
   * PAPI tidak dibatasi waktu; angka ini murni observasi.
   */
  elapsedSeconds: number;
  itemCount: number;
  answeredCount: number;
  unansweredItemNumbers: readonly number[];
  items: readonly PapiItemDto[];
};

/**
 * Balasan penyimpanan sengaja tidak lagi memuat `answeredCount` maupun
 * `elapsedSeconds`.
 *
 * Keduanya menuntut satu kueri tambahan per klik, dan keduanya sudah diketahui
 * klien: jumlah terjawab dihitung dari state jawaban di layar, sedangkan waktu
 * berjalan sendiri dan disinkronkan lewat heartbeat. Mengirimkannya di sini
 * justru menjadi sumber bug — balasan yang tiba tidak berurutan menimpa
 * penghitung dengan nilai yang lebih lama.
 */
export type PapiSaveDto = {
  itemNumber: number;
  selected: PapiOptionCode;
  savedAt: string;
};

export type PapiHeartbeatDto = {
  serverNow: string;
  sessionStatus: ParticipantSessionStatus;
  elapsedSeconds: number;
};

export type PapiCompleteDto = {
  sessionStatus: ParticipantSessionStatus;
  elapsedSeconds: number;
  completedAt: string;
};

function papiRoute(token: string, status: ParticipantSessionStatus): string {
  switch (status) {
    case "papi_rest":
      return `/test/${token}/papi`;
    case "papi_tutorial":
      return `/test/${token}/papi/tutorial`;
    case "papi_question":
      return `/test/${token}/papi/question`;
    case "finished":
      return `/test/${token}/complete`;
    case "paused":
      return `/test/${token}/paused`;
    default:
      return `/test/${token}/unavailable`;
  }
}

async function readItems(
  tx: DbLike,
  papiFormVersionId: string,
  attemptId: string | null,
): Promise<readonly PapiItemDto[]> {
  const itemRows = await tx
    .select({
      number: papiItemVersions.itemNumber,
      optionAText: papiItemVersions.optionAText,
      optionBText: papiItemVersions.optionBText,
    })
    .from(papiItemVersions)
    .where(eq(papiItemVersions.papiFormVersionId, papiFormVersionId))
    .orderBy(asc(papiItemVersions.itemNumber));

  if (attemptId === null) {
    return itemRows.map((row) => ({ ...row, selected: null }));
  }

  const answerRows = await tx
    .select({ itemNumber: papiResponses.itemNumber, optionCode: papiResponses.optionCode })
    .from(papiResponses)
    .where(eq(papiResponses.papiAttemptId, attemptId));

  const selectedByNumber = new Map(answerRows.map((row) => [row.itemNumber, row.optionCode]));

  return itemRows.map((row) => ({
    ...row,
    selected: selectedByNumber.get(row.number) ?? null,
  }));
}

export async function getPapiState(db: DbLike, token: string): Promise<PapiStateDto> {
  return db.transaction(async (tx) => {
    const session = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, session.sessionId);
    const locked = await lockPapiSession(tx, session.sessionId);

    if (!locked.includesPapi || locked.papiFormVersionId === null) {
      throw papiNotAvailable();
    }

    const participantStatus = toParticipantStatus(locked.status);
    const attempt = await selectPapiAttempt(tx, session.sessionId);
    const items = await readItems(tx, locked.papiFormVersionId, attempt?.id ?? null);
    const elapsedSeconds = attempt ? await papiElapsedSeconds(tx, attempt.id) : 0;
    const answeredCount = items.filter((item) => item.selected !== null).length;

    return {
      sessionStatus: participantStatus,
      serverNow: now.toISOString(),
      nextRoute: papiRoute(token, participantStatus),
      elapsedSeconds,
      itemCount: PAPI_ITEM_COUNT,
      answeredCount,
      unansweredItemNumbers: items
        .filter((item) => item.selected === null)
        .map((item) => item.number),
      items,
    };
  });
}

/** Peserta menekan "mulai" atau kembali setelah istirahat. Idempoten. */
export async function startPapi(db: DbLike, token: string): Promise<PapiStateDto> {
  await db.transaction(async (tx) => {
    const session = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, session.sessionId);
    const locked = await lockPapiSession(tx, session.sessionId);

    if (!locked.includesPapi || locked.papiFormVersionId === null) {
      throw papiNotAvailable();
    }
    if (locked.status === "papi_completed" || locked.status === "test_completed") {
      throw papiAlreadyClosed();
    }
    if (
      locked.status !== "papi_pending" &&
      locked.status !== "papi_tutorial" &&
      locked.status !== "papi_in_progress"
    ) {
      throw papiNotAvailable();
    }

    const attempt = await ensurePapiAttempt(tx, session, locked.papiFormVersionId, now);

    if (locked.status !== "papi_in_progress") {
      if (locked.status === "papi_pending") {
        await advancePapiStatus(tx, session.sessionId, "papi_pending", "papi_tutorial");
        await advancePapiStatus(tx, session.sessionId, "papi_tutorial", "papi_in_progress");
      } else {
        await advancePapiStatus(tx, session.sessionId, locked.status, "papi_in_progress");
      }
    } else {
      // Kembali setelah istirahat pada attempt yang sama.
      await tx
        .update(papiAttempts)
        .set({ resumeCount: attempt.resumeCount + 1 })
        .where(eq(papiAttempts.id, attempt.id));
    }

    await touchPapiSegment(tx, attempt.id, now);
  });

  return getPapiState(db, token);
}

/**
 * Menyimpan satu jawaban PAPI.
 *
 * Jalur ini sengaja dibuat sependek mungkin karena dijalankan 90 kali per
 * peserta, satu kali tiap klik. Versi sebelumnya membungkus delapan kueri
 * berurutan dalam satu transaksi — termasuk `SELECT ... FOR UPDATE` atas baris
 * sesi, pemindaian 90 baris jawaban untuk menghitung sisa, dan agregasi seluruh
 * segmen waktu. Di lingkungan produksi, dengan basis data di belakang jaringan,
 * setiap kueri menambah satu perjalanan bolak-balik dan klik terasa berat.
 *
 * Lebih buruk lagi, kunci baris itu membuat klik-klik berurutan saling
 * mengantre: peserta yang menjawab cepat justru paling terdampak.
 *
 * Sekarang hanya ada satu UPDATE. Seluruh syarat — token sah, sesi berada di
 * tahap PAPI, attempt masih berjalan — dipindahkan ke dalam WHERE lewat
 * subkueri, sehingga basis data memeriksanya sendiri secara atomik tanpa
 * transaksi dan tanpa kunci.
 */
export async function savePapiAnswer(
  db: DbLike,
  token: string,
  rawItemNumber: number,
  rawOption: string,
): Promise<PapiSaveDto> {
  const option = asPapiOptionCode(rawOption);
  if (option === null) {
    throw new ApiError("VALIDATION_ERROR", OPTION_INVALID, 422);
  }
  if (!Number.isInteger(rawItemNumber) || rawItemNumber < 1 || rawItemNumber > PAPI_ITEM_COUNT) {
    throw new ApiError("ITEM_NOT_FOUND", ITEM_NOT_FOUND, 404);
  }

  const tokenHash = hashSessionToken(token, getServerConfig().SESSION_TOKEN_SECRET);

  const eligibleAttempts = db
    .select({ id: papiAttempts.id })
    .from(papiAttempts)
    .innerJoin(assessmentSessions, eq(papiAttempts.sessionId, assessmentSessions.id))
    .innerJoin(participantTokens, eq(participantTokens.sessionId, assessmentSessions.id))
    .where(
      and(
        eq(participantTokens.tokenHash, tokenHash),
        isNull(participantTokens.revokedAt),
        eq(assessmentSessions.status, "papi_in_progress"),
        eq(assessmentSessions.includesPapi, 1),
        eq(papiAttempts.status, "in_progress"),
      ),
    );

  const updated = await db
    .update(papiResponses)
    .set({ optionCode: option, responseStatus: "answered", answeredAt: dbNow() })
    .where(
      and(
        eq(papiResponses.itemNumber, rawItemNumber),
        inArray(papiResponses.papiAttemptId, eligibleAttempts),
      ),
    )
    .returning({ id: papiResponses.id, answeredAt: papiResponses.answeredAt });

  const row = updated[0];
  if (!row) {
    // Nol baris bisa berarti banyak hal: token dicabut, sesi sudah ditutup,
    // atau nomor soal di luar jangkauan. Jalur lambat dipanggil hanya di sini,
    // semata untuk memberi pesan galat yang tepat — bukan yang asal menebak.
    await explainSaveRejection(db, token);
    throw papiAlreadyClosed();
  }

  return {
    itemNumber: rawItemNumber,
    selected: option,
    savedAt: (row.answeredAt ?? new Date()).toISOString(),
  };
}

/**
 * Menentukan alasan sebenarnya sebuah penyimpanan ditolak.
 *
 * Dipanggil hanya pada jalur galat, jadi biayanya tidak pernah dibayar peserta
 * yang mengerjakan dengan normal.
 */
async function explainSaveRejection(db: DbLike, token: string): Promise<never> {
  const session = await resolveParticipantSession(db, token);
  const locked = await lockPapiSession(db, session.sessionId);

  if (!locked.includesPapi) {
    throw papiNotAvailable();
  }
  if (locked.status !== "papi_in_progress") {
    throw papiAlreadyClosed();
  }

  const attempt = await selectPapiAttempt(db, session.sessionId);
  if (!attempt || attempt.status !== "in_progress") {
    throw papiAlreadyClosed();
  }

  throw new ApiError("ITEM_NOT_FOUND", ITEM_NOT_FOUND, 404);
}

export async function papiHeartbeat(db: DbLike, token: string): Promise<PapiHeartbeatDto> {
  return db.transaction(async (tx) => {
    const session = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, session.sessionId);
    const locked = await lockPapiSession(tx, session.sessionId);
    const attempt = await selectPapiAttempt(tx, session.sessionId);

    if (attempt && locked.status === "papi_in_progress" && attempt.status === "in_progress") {
      await touchPapiSegment(tx, attempt.id, now);
    }

    return {
      serverNow: now.toISOString(),
      sessionStatus: toParticipantStatus(locked.status),
      elapsedSeconds: attempt ? await papiElapsedSeconds(tx, attempt.id) : 0,
    };
  });
}

/** Peserta memilih istirahat: segmen ditutup, status kembali ke jeda, token tetap sama. */
export async function pausePapi(db: DbLike, token: string): Promise<PapiStateDto> {
  await db.transaction(async (tx) => {
    const session = await resolveParticipantSession(tx, token);
    const locked = await lockPapiSession(tx, session.sessionId);
    const attempt = await selectPapiAttempt(tx, session.sessionId);

    if (!attempt || locked.status !== "papi_in_progress") {
      return;
    }

    await pausePapiSegments(tx, attempt.id);
    await advancePapiStatus(tx, session.sessionId, "papi_in_progress", "papi_pending");

    await writeAudit(tx, {
      organizationId: session.organizationId,
      actorType: "participant",
      actorId: session.sessionId,
      action: "papi.paused",
      objectType: "papi_attempt",
      objectId: attempt.id,
      metadata: { sessionId: session.sessionId },
    });
  });

  return getPapiState(db, token);
}

export async function completePapi(db: DbLike, token: string): Promise<PapiCompleteDto> {
  return db.transaction(async (tx) => {
    const session = await resolveParticipantSession(tx, token);
    const now = await selectNow(tx, session.sessionId);
    const locked = await lockPapiSession(tx, session.sessionId);

    if (!locked.includesPapi) {
      throw papiNotAvailable();
    }
    if (locked.status !== "papi_in_progress") {
      throw papiAlreadyClosed();
    }

    const attempt = await selectPapiAttempt(tx, session.sessionId);
    if (!attempt || attempt.status !== "in_progress") {
      throw papiAlreadyClosed();
    }

    // Tidak ada jawaban kosong yang diam-diam dihitung. Wajib 90 dari 90.
    const missing = await unansweredPapiItems(tx, attempt.id);
    if (missing.length > 0) {
      throw papiIncomplete(missing);
    }

    await pausePapiSegments(tx, attempt.id);
    const elapsedSeconds = await papiElapsedSeconds(tx, attempt.id);

    const closed = await tx
      .update(papiAttempts)
      .set({ status: "completed", completionReason: "manual", completedAt: now })
      .where(and(eq(papiAttempts.id, attempt.id), eq(papiAttempts.status, "in_progress")))
      .returning({ id: papiAttempts.id });

    if (closed.length === 0) {
      throw papiAlreadyClosed();
    }

    await tx
      .update(papiResponses)
      .set({ lockedAt: now, responseStatus: "locked" })
      .where(eq(papiResponses.papiAttemptId, attempt.id));

    await advancePapiStatus(tx, session.sessionId, "papi_in_progress", "papi_completed");

    await writeAudit(tx, {
      organizationId: session.organizationId,
      actorType: "participant",
      actorId: session.sessionId,
      action: "papi.completed",
      objectType: "papi_attempt",
      objectId: attempt.id,
      metadata: { sessionId: session.sessionId, elapsedSeconds },
    });

    const finalStatus = await calculatePapiResult(tx, {
      organizationId: session.organizationId,
      sessionId: session.sessionId,
      attemptId: attempt.id,
      papiFormVersionId: attempt.papiFormVersionId,
      elapsedSeconds,
      now,
    });

    return {
      sessionStatus: toParticipantStatus(finalStatus),
      elapsedSeconds,
      completedAt: now.toISOString(),
    };
  });
}

/**
 * Peserta menutup layar jeda dan memulai IST.
 *
 * Titik ini hanya ada karena urutan dibalik: PAPI sudah terkunci dan terskor,
 * IST belum tersentuh. Idempoten — peserta yang menekan tombol dua kali, atau
 * kembali ke tautan lama setelah IST dimulai, tidak boleh membuat galat.
 */
export async function startIstAfterPapi(db: DbLike, token: string): Promise<void> {
  await db.transaction(async (tx) => {
    const session = await resolveParticipantSession(tx, token);
    const locked = await lockPapiSession(tx, session.sessionId);

    if (locked.status === "tutorial" || locked.status === "subtest_in_progress") {
      return;
    }
    if (locked.status !== "papi_completed") {
      throw papiNotAvailable();
    }

    await tx
      .update(assessmentSessions)
      .set({ status: "tutorial", currentSubtestCode: SUBTEST_ORDER[0] })
      .where(eq(assessmentSessions.id, session.sessionId));
  });
}
