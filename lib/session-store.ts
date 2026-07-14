// Simulasi resume policy produksi (spec §12) memakai sessionStorage.
// Pada produksi, state attempt, expires_at, dan daftar subtes yang sudah
// ditutup bersumber dari server; browser hanya menampilkan sisa waktu.

export type AttemptState = {
  readonly expiresAt: number;
  readonly responses: Readonly<Record<number, string>>;
  readonly skippedItems: readonly number[];
  readonly currentItem: number;
};

const ATTEMPT_PREFIX = "ist-attempt";
const COMPLETED_KEY = "ist-completed-subtests";

const attemptCache = new Map<string, AttemptState | null>();
const listeners = new Set<() => void>();

function keyFor(subtestCode: string): string {
  return `${ATTEMPT_PREFIX}-${subtestCode}`;
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function readStoredAttempt(subtestCode: string): AttemptState | null {
  try {
    const raw = window.sessionStorage.getItem(keyFor(subtestCode));

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as AttemptState).expiresAt !== "number" ||
      typeof (parsed as AttemptState).currentItem !== "number"
    ) {
      return null;
    }

    const attempt = parsed as AttemptState;

    return {
      expiresAt: attempt.expiresAt,
      responses: attempt.responses ?? {},
      skippedItems: attempt.skippedItems ?? [],
      currentItem: attempt.currentItem,
    };
  } catch {
    return null;
  }
}

function persistAttempt(subtestCode: string, attempt: AttemptState): void {
  try {
    window.sessionStorage.setItem(keyFor(subtestCode), JSON.stringify(attempt));
  } catch {
    // Storage penuh/diblokir: prototype tetap berjalan tanpa resume.
  }
}

export function subscribeAttempts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAttemptSnapshot(subtestCode: string): AttemptState | null {
  if (!attemptCache.has(subtestCode)) {
    attemptCache.set(subtestCode, readStoredAttempt(subtestCode));
  }

  return attemptCache.get(subtestCode) ?? null;
}

export function getServerAttemptSnapshot(): AttemptState | null {
  return null;
}

export function startAttempt(subtestCode: string, durationMinutes: number): void {
  if (getAttemptSnapshot(subtestCode)) {
    return;
  }

  const attempt: AttemptState = {
    expiresAt: Date.now() + durationMinutes * 60 * 1000,
    responses: {},
    skippedItems: [],
    currentItem: 1,
  };

  attemptCache.set(subtestCode, attempt);
  persistAttempt(subtestCode, attempt);
  notify();
}

export function setAttemptState(subtestCode: string, attempt: AttemptState): void {
  attemptCache.set(subtestCode, attempt);
  persistAttempt(subtestCode, attempt);
  notify();
}

export function finishAttempt(subtestCode: string): void {
  attemptCache.set(subtestCode, null);

  try {
    window.sessionStorage.removeItem(keyFor(subtestCode));
  } catch {
    // Abaikan; cache in-memory tetap konsisten.
  }

  notify();
}

export function loadCompletedSubtests(): readonly string[] {
  try {
    const raw = window.sessionStorage.getItem(COMPLETED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter((code): code is string => typeof code === "string")
      : [];
  } catch {
    return [];
  }
}

export function markSubtestCompleted(subtestCode: string): void {
  const completed = loadCompletedSubtests();

  if (completed.includes(subtestCode)) {
    return;
  }

  try {
    window.sessionStorage.setItem(COMPLETED_KEY, JSON.stringify([...completed, subtestCode]));
  } catch {
    // Abaikan; guard akan membaca daftar yang lama.
  }
}
