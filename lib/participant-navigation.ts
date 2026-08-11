/**
 * Aturan nomor soal aktif saat navigasi dilakukan di sisi klien.
 *
 * Halaman soal tetap menerima `currentLocal` dari server, sementara peserta
 * berpindah nomor tanpa render ulang. Keduanya harus hidup berdampingan:
 * prop server hanya boleh mengambil alih ketika nilainya **benar-benar
 * berubah**, bukan setiap kali komponen dirender.
 *
 * Versi pertama fitur ini membandingkan posisi klien dengan prop server, yang
 * membuat setiap perpindahan langsung dibatalkan pada render berikutnya —
 * peserta terkunci di nomor yang sama. Karena itu perbandingannya dilakukan
 * antara nilai prop sekarang dan nilai prop yang terakhir dilihat.
 */

export type ActiveItemState = {
  /** Nomor yang sedang ditampilkan. */
  readonly activeLocal: number;
  /** Nilai `currentLocal` terakhir yang berasal dari server. */
  readonly seenServerLocal: number;
};

export function resolveActiveItem(state: ActiveItemState, serverLocal: number): ActiveItemState {
  if (state.seenServerLocal === serverLocal) {
    // Server tidak bernavigasi; posisi pilihan peserta dipertahankan.
    return state;
  }
  return { activeLocal: serverLocal, seenServerLocal: serverLocal };
}

/** Perpindahan yang dipicu peserta. Nilai prop server sengaja tidak disentuh. */
export function moveActiveItem(state: ActiveItemState, localNumber: number): ActiveItemState {
  return { activeLocal: localNumber, seenServerLocal: state.seenServerLocal };
}

/**
 * Jawaban sementara per soal, disimpan di klien.
 *
 * Karena perpindahan nomor tidak lagi meminta ulang halaman ke server, prop
 * `items` beserta `savedValue`-nya hanya diambil sekali saat subtes dibuka.
 * Tanpa penyimpanan lokal, kembali ke soal sebelumnya akan menampilkan isian
 * kosong meski jawabannya sudah tersimpan di server.
 */
export type DraftMap = Readonly<Record<string, string>>;

export function seedDrafts(
  items: readonly { readonly itemVersionId: string; readonly savedValue?: string | null }[],
): DraftMap {
  return Object.fromEntries(items.map((item) => [item.itemVersionId, item.savedValue ?? ""]));
}

export function readDraft(drafts: DraftMap, itemVersionId: string): string {
  return drafts[itemVersionId] ?? "";
}

export function writeDraft(drafts: DraftMap, itemVersionId: string, value: string): DraftMap {
  if (drafts[itemVersionId] === value) {
    return drafts;
  }
  return { ...drafts, [itemVersionId]: value };
}
