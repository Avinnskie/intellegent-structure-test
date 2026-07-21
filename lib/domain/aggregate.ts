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

export const IQ_DIVISOR = 9;

/** Mean of the nine standard scores, rounded. */
export function iqFromTotalStandard(totalStandardScore: number): number {
  return Math.round(totalStandardScore / IQ_DIVISOR);
}

export const IQ_CATEGORY_BOUNDS = {
  average: 90,
  aboveAverage: 110,
  superior: 120,
} as const;

export type ScoreCategory =
  | "Di bawah rata-rata"
  | "Rata-rata"
  | "Di atas rata-rata"
  | "Superior";

/** Banding on a standard score. Boundaries are inclusive-lower, tested at each edge. */
export function categoryForStandardScore(standardScore: number): ScoreCategory {
  if (standardScore < IQ_CATEGORY_BOUNDS.average) {
    return "Di bawah rata-rata";
  }
  if (standardScore < IQ_CATEGORY_BOUNDS.aboveAverage) {
    return "Rata-rata";
  }
  if (standardScore < IQ_CATEGORY_BOUNDS.superior) {
    return "Di atas rata-rata";
  }
  return "Superior";
}

export const DOMINANCE_GROUPS = {
  verbal: ["SE", "WA", "AN", "GE", "ME"],
  numerik: ["RA", "ZR"],
  figural: ["FA", "WU"],
} as const satisfies Record<string, readonly SubtestCode[]>;

export type Dominance = keyof typeof DOMINANCE_GROUPS;

export type DominanceProfile = {
  dominance: Dominance;
  groupMeans: Record<Dominance, number>;
};

/**
 * The group with the highest mean standard score wins; a tie goes to the FIRST group in
 * verbal → numerik → figural order (documented, deterministic — never dependent on object key
 * enumeration).
 */
export function dominanceProfile(scores: Readonly<Record<SubtestCode, number>>): DominanceProfile {
  const order: readonly Dominance[] = ["verbal", "numerik", "figural"];

  const groupMeans = {} as Record<Dominance, number>;
  for (const group of order) {
    const codes = DOMINANCE_GROUPS[group];
    const total = codes.reduce((sum, code) => sum + scores[code], 0);
    groupMeans[group] = total / codes.length;
  }

  let dominance: Dominance = "verbal";
  for (const group of order) {
    if (groupMeans[group] > groupMeans[dominance]) {
      dominance = group;
    }
  }

  return { dominance, groupMeans };
}
