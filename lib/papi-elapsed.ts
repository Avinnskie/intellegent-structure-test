/**
 * Aturan penghitung waktu PAPI.
 *
 * Dipisahkan dari komponen karena bug-nya halus dan hanya muncul di produksi:
 * penghitung kadang melompat mundur, kadang seperti ter-reset.
 *
 * Penyebabnya bukan jam yang salah, melainkan urutan. Dulu setiap balasan
 * penyimpanan jawaban ikut membawa `elapsedSeconds`, dan balasan itu tidak
 * selalu tiba sesuai urutan pengirimannya — permintaan yang berangkat lebih
 * dulu bisa sampai belakangan. Ketika balasan lama tiba terakhir, nilainya
 * menimpa nilai yang lebih baru, dan peserta melihat waktunya mundur.
 *
 * Di jaringan lokal hampir tidak terlihat. Di produksi, dengan latensi yang
 * beragam, sering.
 */

export type ElapsedState = {
  /** Nilai dari server yang menjadi titik sauh. */
  readonly baselineSeconds: number;
  /** Nilai `Date.now()` saat sauh itu diterima. */
  readonly anchoredAtMs: number;
};

export function createElapsedState(baselineSeconds: number, nowMs: number): ElapsedState {
  return { baselineSeconds: Math.max(0, baselineSeconds), anchoredAtMs: nowMs };
}

/** Waktu yang ditampilkan: sauh terakhir ditambah waktu yang berlalu sejak itu. */
export function readElapsedSeconds(state: ElapsedState, nowMs: number): number {
  const drift = Math.floor((nowMs - state.anchoredAtMs) / 1000);
  return state.baselineSeconds + Math.max(0, drift);
}

/**
 * Menerima nilai baru dari server, tetapi hanya bila ia memajukan penghitung.
 *
 * Inilah pengamannya: apa pun urutan tibanya balasan, penghitung tidak pernah
 * mundur. Nilai yang lebih kecil dari yang sedang tampil diabaikan — ia pasti
 * berasal dari permintaan yang lebih lama.
 *
 * Toleransi satu detik mencegah sauh disetel ulang terus-menerus oleh selisih
 * pembulatan yang tidak berarti.
 */
export function reconcileElapsed(
  state: ElapsedState,
  serverSeconds: number,
  nowMs: number,
): ElapsedState {
  if (!Number.isFinite(serverSeconds) || serverSeconds < 0) {
    return state;
  }
  const shown = readElapsedSeconds(state, nowMs);
  if (serverSeconds <= shown + 1) {
    return state;
  }
  return createElapsedState(serverSeconds, nowMs);
}
