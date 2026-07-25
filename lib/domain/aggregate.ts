import type { SubtestCode } from "../ist-subtests.ts";

/**
 * Engine version stamped onto every result row — re-exported from the answer-key defaults module,
 * which owns it, so the two can never disagree about which engine produced a result. Bump on ANY
 * change to aggregate/scoring behavior (brief §22: reproducibility).
 */
export { ENGINE_VERSION } from "./answer-key-defaults.ts";

/** Chart and report ordering per spec §16 — NOT the sitting order (ME sits last, charts mid). */
export const CHART_ORDER: readonly SubtestCode[] = [
  "SE",
  "WA",
  "AN",
  "GE",
  "ME",
  "RA",
  "ZR",
  "FA",
  "WU",
];

/** The workbook maps composite SW to IQ with `ROUND(1.5 * SW - 50, 0)`. */
export function iqFromCompositeStandard(compositeStandardScore: number): number {
  return Math.round(compositeStandardScore * 1.5 - 50);
}

export type SubtestCategory =
  "Sangat Rendah" | "Rendah" | "Sedang" | "Cukup" | "Tinggi" | "Sangat Tinggi";

export function categoryForSubtestStandardScore(standardScore: number): SubtestCategory {
  if (standardScore <= 80) return "Sangat Rendah";
  if (standardScore <= 94) return "Rendah";
  if (standardScore <= 99) return "Sedang";
  if (standardScore <= 104) return "Cukup";
  if (standardScore <= 118) return "Tinggi";
  return "Sangat Tinggi";
}

export type IqCategory =
  | "Mentally Defective"
  | "Borderline Defective"
  | "Low Average"
  | "Average"
  | "High Average"
  | "Superior"
  | "Very Superior"
  | "Genius";

export function categoryForIq(iqScore: number): IqCategory {
  if (iqScore <= 65) return "Mentally Defective";
  if (iqScore <= 79) return "Borderline Defective";
  if (iqScore <= 90) return "Low Average";
  if (iqScore <= 110) return "Average";
  if (iqScore <= 119) return "High Average";
  if (iqScore <= 127) return "Superior";
  if (iqScore <= 139) return "Very Superior";
  return "Genius";
}

export type Dominance = "Seimbang" | "Eksak" | "Non Eksak";

export type DominanceProfile = {
  readonly dominance: Dominance;
  readonly exactScore: number;
  readonly nonExactScore: number;
  readonly difference: number;
};

/**
 * Excel compares GE+RA ("exact") against AN+ZR ("non-exact"). A gap up to ten points is balanced.
 */
export function dominanceProfile(scores: Readonly<Record<SubtestCode, number>>): DominanceProfile {
  const exactScore = scores.GE + scores.RA;
  const nonExactScore = scores.AN + scores.ZR;
  const difference = Math.abs(exactScore - nonExactScore);
  const dominance =
    difference <= 10 ? "Seimbang" : exactScore > nonExactScore ? "Eksak" : "Non Eksak";
  return { dominance, exactScore, nonExactScore, difference };
}
