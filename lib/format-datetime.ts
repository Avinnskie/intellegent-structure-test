/**
 * Format tanggal dan jam untuk seluruh antarmuka.
 *
 * Sebelumnya tiap tempat memanggil `toLocaleString("id-ID")` langsung, tanpa
 * menyebut zona waktu. Akibatnya jam mengikuti zona waktu mesin yang merender:
 * di komputer HR hasilnya WIB, tetapi di Vercel — yang berjalan pada UTC —
 * hasilnya tujuh jam lebih awal. Halaman detail sesi karena itu menampilkan
 * pukul 06.45 untuk pengerjaan yang sebenarnya pukul 13.45.
 *
 * Zona waktu kini dikunci ke WIB, jadi hasilnya sama di mana pun kode berjalan.
 * Itu juga menghilangkan selisih antara render server dan klien yang membuat
 * React memperingatkan ketidakcocokan hidrasi.
 *
 * Kalau nanti ada organisasi di WITA atau WIT, konstanta ini yang perlu
 * berubah menjadi preferensi per organisasi — bukan memanggil ulang
 * `toLocaleString` di tiap komponen.
 */
export const APP_TIME_ZONE = "Asia/Jakarta";

const LOCALE = "id-ID";

const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_ONLY = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE,
  dateStyle: "medium",
});

const TIME_ONLY = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE,
  timeStyle: "short",
});

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Tanggal dan jam WIB, mis. "14 Agu 2026, 13.45". Nilai kosong menjadi "—". */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  return date ? `${DATE_TIME.format(date)} WIB` : "—";
}

/** Tanggal saja, tanpa jam. */
export function formatDate(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_ONLY.format(date) : "—";
}

/** Jam saja, untuk kolom yang tanggalnya sudah jelas dari konteks. */
export function formatTime(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  return date ? `${TIME_ONLY.format(date)} WIB` : "—";
}
