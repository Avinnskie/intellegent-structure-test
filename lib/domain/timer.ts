/**
 * Seconds left until `expiresAtMs`, clamped at 0 once the attempt has expired.
 *
 * Fails closed on non-finite input: `Math.max(0, NaN)` is `NaN`, so the clamp
 * alone would let a NaN expiry render as "NaN" in the participant's countdown.
 */
export function getRemainingSeconds(expiresAtMs: number, nowMs: number = Date.now()): number {
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

/**
 * Remaining seconds capped at the subtest duration.
 *
 * The cap guards a client whose clock is skewed backwards: without it, such a
 * client would be shown more time than the subtest actually allows. The result is
 * additionally floored at 0 so a non-finite or negative duration fails closed
 * rather than producing a negative countdown.
 */
export function getDisplayRemainingSeconds(
  expiresAtMs: number,
  durationMinutes: number,
  nowMs: number = Date.now(),
): number {
  if (!Number.isFinite(durationMinutes)) {
    return 0;
  }

  const durationSeconds = Math.max(0, durationMinutes * 60);

  return Math.max(0, Math.min(durationSeconds, getRemainingSeconds(expiresAtMs, nowMs)));
}

/**
 * Seconds left on a subtest attempt: `getDisplayRemainingSeconds` in the units the database uses.
 *
 * `subtest_attempts.duration_seconds` is stored in SECONDS, but the display cap above is expressed
 * in MINUTES, so every server caller was writing `duration / 60` at the call site. Three of them had
 * grown their own copy of that conversion, each with its own `SECONDS_PER_MINUTE`. The unit mismatch
 * is a real trap — `getDisplayRemainingSeconds(expiresAt, durationSeconds)` silently caps at 60x the
 * intended ceiling, which is indistinguishable from "no cap" — so it is bridged here, once, rather
 * than trusted to each caller.
 */
export function getAttemptRemainingSeconds(
  expiresAt: Date,
  durationSeconds: number,
  now: Date,
): number {
  return getDisplayRemainingSeconds(expiresAt.getTime(), durationSeconds / 60, now.getTime());
}
