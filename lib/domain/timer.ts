export function getRemainingSeconds(expiresAtMs: number, nowMs: number = Date.now()): number {
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

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

export function getAttemptRemainingSeconds(
  expiresAt: Date,
  durationSeconds: number,
  now: Date,
): number {
  return getDisplayRemainingSeconds(expiresAt.getTime(), durationSeconds / 60, now.getTime());
}
