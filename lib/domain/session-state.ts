import { SUBTEST_CODES, type SubtestCode } from "../ist-subtests.ts";

export const SESSION_STATUSES = [
  "code_generated",
  "code_validated",
  "tutorial",
  "subtest_in_progress",
  "subtest_completed",
  "tutorial_next",
  "papi_pending",
  "papi_tutorial",
  "papi_in_progress",
  "papi_completed",
  "test_completed",
  "needs_ge_scoring",
  "calculated",
  "reviewed",
  "final",
  "paused_by_admin",
  "expired",
  "cancelled",
  "invalidated",
  "needs_review",
  "void",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

const SYSTEM_EXCEPTIONS: readonly SessionStatus[] = ["expired", "cancelled", "invalidated", "void"];

/** Tahap PAPI: peserta memakai token yang sama, boleh istirahat sebelum melanjutkan. */
export const PAPI_STAGE_STATUSES: readonly SessionStatus[] = [
  "papi_pending",
  "papi_tutorial",
  "papi_in_progress",
  "papi_completed",
];

export function isPapiStageStatus(status: SessionStatus): boolean {
  return PAPI_STAGE_STATUSES.includes(status);
}

/**
 * Status tempat HR boleh menutup sesi lebih awal tanpa PAPI
 * (peserta tidak melanjutkan). Dicatat di `papi_skip_reason`.
 */
export const PAPI_SKIPPABLE_STATUSES: readonly SessionStatus[] = [
  "papi_pending",
  "papi_tutorial",
  "papi_in_progress",
];

export function canSkipPapi(status: SessionStatus): boolean {
  return PAPI_SKIPPABLE_STATUSES.includes(status);
}

export const PAUSABLE_STATUSES: readonly SessionStatus[] = [
  "code_validated",
  "tutorial",
  "tutorial_next",
  "subtest_in_progress",
  "subtest_completed",
  "papi_pending",
  "papi_tutorial",
  "papi_in_progress",
];

export const TERMINAL_STATUSES: readonly SessionStatus[] = [
  "final",
  "cancelled",
  "invalidated",
  "void",
  "expired",
];

const FLOW: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  code_generated: ["code_validated"],
  code_validated: ["tutorial"],
  tutorial: ["subtest_in_progress"],
  subtest_in_progress: ["subtest_completed"],
  // IST tuntas: langsung tutup bila sesi tanpa PAPI, atau masuk tahap PAPI.
  subtest_completed: ["tutorial_next", "papi_pending", "test_completed"],
  tutorial_next: ["subtest_in_progress"],
  // Jeda istirahat. Peserta kembali dengan token yang sama; HR boleh menutup lebih awal.
  papi_pending: ["papi_tutorial", "test_completed"],
  papi_tutorial: ["papi_in_progress", "papi_pending", "test_completed"],
  papi_in_progress: ["papi_completed", "papi_pending", "test_completed"],
  papi_completed: ["test_completed"],
  test_completed: ["needs_ge_scoring", "calculated"],
  needs_ge_scoring: ["calculated", "needs_review"],
  calculated: ["reviewed", "final", "needs_review"],
  reviewed: ["final"],
  final: [],
  paused_by_admin: [
    "tutorial",
    "tutorial_next",
    "subtest_in_progress",
    "papi_pending",
    "papi_tutorial",
    "papi_in_progress",
    "cancelled",
    "void",
  ],
  expired: [],
  cancelled: [],
  invalidated: [],
  needs_review: ["calculated", "invalidated"],
  void: [],
};

export function isTerminalStatus(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  if (from === to) return false;
  if (isTerminalStatus(from)) return false;
  if (to === "paused_by_admin") return PAUSABLE_STATUSES.includes(from);
  if (SYSTEM_EXCEPTIONS.includes(to)) return true;

  return FLOW[from].includes(to);
}

export class InvalidTransitionError extends Error {
  readonly from: SessionStatus;
  readonly to: SessionStatus;

  constructor(from: SessionStatus, to: SessionStatus) {
    super(`Transisi status sesi tidak valid: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertSessionTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const SUBTEST_ORDER = SUBTEST_CODES;

export type { SubtestCode };

export function nextSubtestCode(code: SubtestCode): SubtestCode | null {
  return SUBTEST_ORDER[SUBTEST_ORDER.indexOf(code) + 1] ?? null;
}

/**
 * Status setelah subtes IST terakhir ditutup. Sesi baterai berhenti di
 * `papi_pending` supaya peserta boleh istirahat dulu sebelum PAPI.
 */
export function statusAfterFinalSubtest(includesPapi: boolean): SessionStatus {
  return includesPapi ? "papi_pending" : "test_completed";
}
