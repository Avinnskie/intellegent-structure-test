import type { SessionStatus } from "@/lib/domain/session-state.ts";

/**
 * HR-facing labels for the FULL internal status vocabulary. HR is the audience that IS allowed to
 * see scoring states (unlike participants — spec §13); the labels only translate, never hide.
 */
export const SESSION_STATUS_LABELS: Readonly<Record<SessionStatus, string>> = {
  code_generated: "Kode dibuat",
  code_validated: "Kode divalidasi",
  tutorial: "Tutorial",
  subtest_in_progress: "Sedang mengerjakan",
  subtest_completed: "Subtes selesai",
  tutorial_next: "Menuju subtes berikutnya",
  test_completed: "Tes selesai",
  needs_ge_scoring: "Kunci GE perlu dilengkapi",
  calculated: "Terhitung",
  reviewed: "Direview",
  final: "Final",
  paused_by_admin: "Dijeda admin",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
  invalidated: "Diinvalidasi",
  needs_review: "Perlu review",
  void: "Void",
};

export const ACCESS_CODE_STATUS_LABELS: Readonly<Record<string, string>> = {
  active: "Aktif",
  in_use: "Sedang dipakai",
  completed: "Selesai",
  expired: "Kedaluwarsa",
  revoked: "Dicabut",
  regenerated: "Dibuat ulang",
};

export function sessionStatusLabel(status: SessionStatus): string {
  return SESSION_STATUS_LABELS[status] ?? status;
}

export function accessCodeStatusLabel(status: string): string {
  return ACCESS_CODE_STATUS_LABELS[status] ?? status;
}
