import { SUBTEST_CODES, type SubtestCode } from "../ist-subtests.ts";

/**
 * Session state machine of spec §13 / brief §12.
 *
 * Pure module: no DB, no config, no I/O. The literal order below mirrors the
 * `session_status` pgEnum in `lib/db/schema.ts` and is asserted against it in
 * `tests/unit/session-state.test.ts` so the two cannot drift.
 */
export const SESSION_STATUSES = [
  "code_generated",
  "code_validated",
  "tutorial",
  "subtest_in_progress",
  "subtest_completed",
  "tutorial_next",
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

/**
 * Exception states an admin or the system may force onto any non-terminal
 * session. All four are terminal, so they can only ever end a session.
 *
 * Two exception states are deliberately absent, each for its own reason:
 *
 * - `paused_by_admin` is narrower — see `PAUSABLE_STATUSES` below.
 * - `needs_review` is not an admin action at all but the outcome of a
 *   calculation that found no matching norm band (spec §15), so it is
 *   reachable through `FLOW` only.
 */
const SYSTEM_EXCEPTIONS: readonly SessionStatus[] = ["expired", "cancelled", "invalidated", "void"];

/**
 * States that may be paused. Unlike the other exceptions, `paused_by_admin` is
 * NOT reachable from every non-terminal state, because it is the only exception
 * that resumes back into testing (see `FLOW.paused_by_admin`).
 *
 * Were pause reachable from `calculated` or `reviewed`, an admin could rewind a
 * scored session into testing in two hops — `calculated -> paused_by_admin ->
 * subtest_in_progress` — which the direct edge `calculated -> subtest_in_progress`
 * forbids. That extends "hasil final terkunci" (brief §22) one step earlier: a
 * scored session must never re-enter testing, not just a final one.
 *
 * Pause exists to freeze a *live* test, so restricting it to live states costs
 * nothing: pausing an already-scored session is meaningless anyway.
 */
export const PAUSABLE_STATUSES: readonly SessionStatus[] = [
  "code_validated",
  "tutorial",
  "tutorial_next",
  "subtest_in_progress",
  "subtest_completed",
];

/**
 * Locked states. Nothing leaves them — this is what makes "hasil final terkunci"
 * (brief §22) enforceable rather than a convention.
 */
export const TERMINAL_STATUSES: readonly SessionStatus[] = [
  "final",
  "cancelled",
  "invalidated",
  "void",
  "expired",
];

/**
 * Legal targets per state. Every `SessionStatus` needs a key, so a new enum
 * value cannot silently reach `undefined.includes` in `canTransition`.
 *
 * `calculated` does not lead back to `needs_ge_scoring`: a recalculation writes
 * a new result row and leaves the session at `calculated`.
 */
const FLOW: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  code_generated: ["code_validated"],
  code_validated: ["tutorial"],
  tutorial: ["subtest_in_progress"],
  subtest_in_progress: ["subtest_completed"],
  subtest_completed: ["tutorial_next", "test_completed"],
  tutorial_next: ["subtest_in_progress"],
  test_completed: ["needs_ge_scoring", "calculated"],
  // Resumes into a live testing state, which is why entry is gated on
  // PAUSABLE_STATUSES rather than the blanket exception fast-path.
  needs_ge_scoring: ["calculated", "needs_review"],
  calculated: ["reviewed", "final", "needs_review"],
  reviewed: ["final"],
  final: [],
  paused_by_admin: ["tutorial", "tutorial_next", "subtest_in_progress", "cancelled", "void"],
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
  // Pause is gated on its own set, not on "any non-terminal state", because it
  // is the only exception that leads back into testing.
  if (to === "paused_by_admin") return PAUSABLE_STATUSES.includes(from);
  if (SYSTEM_EXCEPTIONS.includes(to)) return true;

  return FLOW[from].includes(to);
}

export class InvalidTransitionError extends Error {
  // Declared explicitly: Node's type stripping does not support TypeScript
  // constructor parameter properties.
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

/** Fixed subtest order: SE -> WA -> AN -> GE -> RA -> ZR -> FA -> WU -> ME. */
export const SUBTEST_ORDER = SUBTEST_CODES;

export type { SubtestCode };

/** The next subtest in the fixed order, or `null` after the last one. */
export function nextSubtestCode(code: SubtestCode): SubtestCode | null {
  return SUBTEST_ORDER[SUBTEST_ORDER.indexOf(code) + 1] ?? null;
}
