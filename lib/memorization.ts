import type { SubtestCode } from "./ist-subtests.ts";

/**
 * Tahap menghafal pada subtes ME (Merkaufgaben).
 *
 * ME berbeda dari delapan subtes lain: peserta lebih dulu diberi daftar kata
 * untuk dihafal dalam waktu tetap, baru kemudian menjawab soal tanpa melihat
 * daftar itu lagi. Tanpa tahap ini, daftar katanya hanya menjadi bagian teks
 * tutorial yang bisa dibuka-tutup sesuka hati, dan subtesnya kehilangan makna.
 */

/** Lama menghafal, sesuai instruksi baku pada lembar ME. */
export const MEMORIZATION_SECONDS = 180;

const MEMORIZATION_SUBTESTS: ReadonlySet<string> = new Set(["ME"]);

export function needsMemorization(code: SubtestCode): boolean {
  return MEMORIZATION_SUBTESTS.has(code);
}

/**
 * Sisa waktu menghafal.
 *
 * Dihitung dari selisih dua cap waktu, bukan dari akumulasi tick, supaya tetap
 * benar ketika peramban memperlambat atau menghentikan interval — misalnya saat
 * peserta berpindah tab. Menghitung tick akan membuat waktu menghafal
 * memanjang diam-diam, dan itu keuntungan yang tidak adil.
 */
export function memorizationRemaining(
  startedAtMs: number,
  nowMs: number,
  totalSeconds: number = MEMORIZATION_SECONDS,
): number {
  const elapsed = Math.floor((nowMs - startedAtMs) / 1000);
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return totalSeconds;
  }
  return Math.max(0, totalSeconds - elapsed);
}

/** Benar bila waktu menghafal sudah habis. */
export function isMemorizationOver(
  startedAtMs: number,
  nowMs: number,
  totalSeconds: number = MEMORIZATION_SECONDS,
): boolean {
  return memorizationRemaining(startedAtMs, nowMs, totalSeconds) === 0;
}

/** Format mm:ss untuk hitung mundur. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
