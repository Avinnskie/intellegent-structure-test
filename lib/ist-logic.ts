import { demoSession, type AccessCodeStatus } from "./ist-data.ts";
import { subtests, type Subtest } from "./ist-subtests.ts";

export function calculateExactAge(birthDateIso: string, testDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const testDate = new Date(testDateIso);

  let age = testDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasBirthdayPassed =
    testDate.getUTCMonth() > birthDate.getUTCMonth() ||
    (testDate.getUTCMonth() === birthDate.getUTCMonth() &&
      testDate.getUTCDate() >= birthDate.getUTCDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return age;
}

export function getRemainingSeconds(expiresAtMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

export function getDisplayRemainingSeconds(
  expiresAtMs: number,
  durationMinutes: number,
  nowMs: number = Date.now(),
): number {
  return Math.min(durationMinutes * 60, getRemainingSeconds(expiresAtMs, nowMs));
}

export function formatDuration(minutes: number): string {
  return `${minutes} menit`;
}

export function getSubtestByCode(code: string | null): Subtest {
  return subtests.find((subtest) => subtest.code === code) ?? subtests[0];
}

export function getNextSubtestCode(currentCode: string): string | null {
  const currentIndex = subtests.findIndex((subtest) => subtest.code === currentCode);
  const nextSubtest = subtests[currentIndex + 1];

  return nextSubtest?.code ?? null;
}

export function getFirstPendingSubtest(completedCodes: readonly string[]): string | null {
  const pending = subtests.find((subtest) => !completedCodes.includes(subtest.code));

  return pending?.code ?? null;
}

export const ACCESS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ACCESS_CODE_LENGTH = 8;

export function generateAccessCode(random: () => number = Math.random): string {
  const body = Array.from({ length: ACCESS_CODE_LENGTH }, () => {
    const index = Math.floor(random() * ACCESS_CODE_ALPHABET.length);
    return ACCESS_CODE_ALPHABET[index];
  }).join("");

  return `IST-${body}`;
}

export function getAccessCodeStatus(code: string): AccessCodeStatus {
  if (code === demoSession.accessCode) {
    return demoSession.accessStatus;
  }

  if (code === "IST-EXPIRED1") {
    return "expired";
  }

  if (code === "IST-COMPLETE") {
    return "completed";
  }

  return "revoked";
}

export function validateAccessCode(code: string): {
  readonly ok: boolean;
  readonly status: AccessCodeStatus;
  readonly nextRoute: string | null;
  readonly message: string;
} {
  const normalizedCode = code.trim().toUpperCase();
  const status = getAccessCodeStatus(normalizedCode);

  if (normalizedCode === demoSession.accessCode && status === "active") {
    return {
      ok: true,
      status,
      nextRoute: `/test/tutorial?code=${normalizedCode}&subtest=SE`,
      message: "Kode valid.",
    };
  }

  const statusMessageMap: Record<AccessCodeStatus, string> = {
    active: "Kode aktif, tetapi sesi demo ini tidak cocok dengan data yang tersedia.",
    in_use: "Kode sedang digunakan di perangkat lain.",
    completed: "Kode sudah digunakan untuk sesi yang selesai.",
    expired: "Masa berlaku kode sudah habis.",
    revoked: "Kode tidak aktif atau tidak dikenal.",
    regenerated: "Kode lama sudah digantikan dengan kode baru.",
  };

  return {
    ok: false,
    status,
    nextRoute: null,
    message: statusMessageMap[status],
  };
}
