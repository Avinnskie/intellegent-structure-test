import { and, eq, isNull } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import { assessmentSessions } from "../db/schema.ts";
import { MEMORIZATION_SECONDS, memorizationRemaining } from "../memorization.ts";
import { resolveParticipantSession } from "./participant-session.ts";

/**
 * Tahap menghafal subtes ME, dengan sauh waktu di sisi server.
 *
 * Versi pertama menyimpan waktu mulai di state komponen. Akibatnya menyegarkan
 * halaman memberi tiga menit baru — dan peserta dapat mengulanginya tanpa
 * batas, yang membuat subtes ME kehilangan seluruh maknanya.
 *
 * Sekarang waktu mulai ditulis SEKALI ke basis data. Panggilan berikutnya
 * membaca nilai yang sama, jadi hitung mundur bertahan melintasi refresh,
 * penggantian tab, bahkan penggantian perangkat.
 */

export type MemorizationStateDto = {
  /** Detik tersisa; nol berarti waktu menghafal sudah habis. */
  readonly remainingSeconds: number;
  readonly totalSeconds: number;
};

/**
 * Memulai tahap menghafal, atau melanjutkan yang sudah berjalan.
 *
 * Idempoten: pemanggilan kedua tidak menyetel ulang sauh. Itulah inti
 * perbaikannya — `WHERE memorization_started_at IS NULL` membuat penulisan
 * hanya berhasil sekali, bahkan bila dua permintaan tiba bersamaan.
 */
export async function beginOrResumeMemorization(
  db: DbLike,
  token: string,
): Promise<MemorizationStateDto> {
  const session = await resolveParticipantSession(db, token);

  await db
    .update(assessmentSessions)
    .set({ memorizationStartedAt: new Date() })
    .where(
      and(
        eq(assessmentSessions.id, session.sessionId),
        isNull(assessmentSessions.memorizationStartedAt),
      ),
    );

  const [row] = await db
    .select({ startedAt: assessmentSessions.memorizationStartedAt })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, session.sessionId))
    .limit(1);

  const startedAt = row?.startedAt ?? new Date();
  return {
    remainingSeconds: memorizationRemaining(startedAt.getTime(), Date.now()),
    totalSeconds: MEMORIZATION_SECONDS,
  };
}

/** Membaca sisa waktu tanpa memulai apa pun. Null bila belum pernah dimulai. */
export async function readMemorizationState(
  db: DbLike,
  token: string,
): Promise<MemorizationStateDto | null> {
  const session = await resolveParticipantSession(db, token);

  const [row] = await db
    .select({ startedAt: assessmentSessions.memorizationStartedAt })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.id, session.sessionId))
    .limit(1);

  if (!row?.startedAt) {
    return null;
  }
  return {
    remainingSeconds: memorizationRemaining(row.startedAt.getTime(), Date.now()),
    totalSeconds: MEMORIZATION_SECONDS,
  };
}
