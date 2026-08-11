import { PAPI_MAX_FACTOR_SCORE } from "../papi-factors.ts";

export function formatPapiElapsed(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0 detik";
  }

  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  if (hours > 0) {
    return `${hours} jam ${minutes} menit`;
  }
  if (minutes > 0) {
    return `${minutes} menit ${seconds} detik`;
  }
  return `${seconds} detik`;
}

export function papiScoreBarPercent(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  const clamped = Math.min(Math.max(score, 0), PAPI_MAX_FACTOR_SCORE);
  return (clamped / PAPI_MAX_FACTOR_SCORE) * 100;
}

export const PAPI_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  LOW: "Rendah",
  MIDDLE: "Sedang",
  HIGH: "Tinggi",
};

export function papiCategoryLabel(category: string): string {
  return PAPI_CATEGORY_LABELS[category] ?? category;
}
