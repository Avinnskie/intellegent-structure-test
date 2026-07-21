/**
 * Golden dataset generator (T28, brief §22).
 *
 * Produces `tests/golden/cases.json`: curated candidates whose expected numbers are computed HERE
 * with explicit arithmetic — deliberately NOT by importing the engine's aggregate functions, so the
 * golden test compares two independent derivations of the same placeholder rules:
 *
 *   RW  = number of correct answers (chosen by construction) / sum of GE scores
 *   SW  = 80 + RW*2 + bandIndex          (the seed's fabricated norm table, seed-core.ts)
 *   IQ  = round(totalSW / 9)             (placeholder, aggregate.ts)
 *   category thresholds 90/110/120       (placeholder)
 *   dominance = highest group mean, ties verbal → numerik → figural
 *
 * When the psychologist signs off the official key/norms (brief §28), the official dataset replaces
 * this file and the seed together; the harness in tests/golden/golden.test.ts stays as-is.
 *
 * Ages are stored RELATIVE (`years` + `dayOffset` against the test date) because the golden test
 * runs "today": birthDate = (testDate - years) + dayOffset days. dayOffset +1 means the birthday
 * is tomorrow — the candidate is still `years - 1`.
 *
 * Run: npm run golden:generate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUBTEST_CODES, type SubtestCode } from "../lib/ist-subtests.ts";

// Mirrors seed-core.ts SEED_AGE_BANDS — asserted equal in the golden test so they cannot drift.
export const GOLDEN_AGE_BANDS = [
  { label: "15–19", minAge: 15, maxAge: 19 },
  { label: "20–24", minAge: 20, maxAge: 24 },
  { label: "25–29", minAge: 25, maxAge: 29 },
  { label: "30–34", minAge: 30, maxAge: 34 },
  { label: "35–39", minAge: 35, maxAge: 39 },
  { label: "40–44", minAge: 40, maxAge: 44 },
  { label: "45–49", minAge: 45, maxAge: 49 },
  { label: "50–60", minAge: 50, maxAge: 60 },
] as const;

type AnswerPlan = {
  /** Items answered CORRECTLY (the first N of the deck). */
  correct: number;
  /** Items answered WRONG right after the correct ones. */
  wrong: number;
  /** Items SKIPPED after that (row exists, no value). The rest are never touched. */
  skip: number;
};

export type GoldenCase = {
  name: string;
  description: string;
  age: { years: number; dayOffset: number };
  /** Per non-GE subtest. GE is driven by `geScores` instead. */
  plans: Record<Exclude<SubtestCode, "GE">, AnswerPlan>;
  /** One entry per ANSWERED GE item, in deck order; its length = answered count. */
  geScores: readonly (0 | 1 | 2)[];
  /** When set, this subtest is closed by TIMEOUT (backdated expiry + sweep), not by hand. */
  timeoutSubtest: SubtestCode | null;
  expected:
    | {
        resultStatus: "draft";
        ageAtTest: number;
        bandLabel: string;
        rw: Record<SubtestCode, number>;
        sw: Record<SubtestCode, number>;
        totalRw: number;
        totalSw: number;
        iq: number;
        iqCategory: string;
        dominance: "verbal" | "numerik" | "figural";
      }
    | { resultStatus: "needs_review"; reason: string };
};

function categoryFor(score: number): string {
  if (score < 90) return "Di bawah rata-rata";
  if (score < 110) return "Rata-rata";
  if (score < 120) return "Di atas rata-rata";
  return "Superior";
}

const GROUPS: Record<"verbal" | "numerik" | "figural", readonly SubtestCode[]> = {
  verbal: ["SE", "WA", "AN", "GE", "ME"],
  numerik: ["RA", "ZR"],
  figural: ["FA", "WU"],
};

function uniformPlans(plan: AnswerPlan): GoldenCase["plans"] {
  return { SE: plan, WA: plan, AN: plan, RA: plan, ZR: plan, FA: plan, WU: plan, ME: plan };
}

function buildExpected(
  age: { years: number; dayOffset: number },
  plans: GoldenCase["plans"],
  geScores: readonly (0 | 1 | 2)[],
): GoldenCase["expected"] {
  const effectiveAge = age.dayOffset > 0 ? age.years - 1 : age.years;
  const bandIndex = GOLDEN_AGE_BANDS.findIndex(
    (band) => effectiveAge >= band.minAge && effectiveAge <= band.maxAge,
  );
  if (bandIndex === -1) {
    return { resultStatus: "needs_review", reason: "NO_AGE_BAND" };
  }

  const rw = {} as Record<SubtestCode, number>;
  for (const code of SUBTEST_CODES) {
    rw[code] = code === "GE" ? geScores.reduce<number>((sum, s) => sum + s, 0) : plans[code].correct;
  }
  const sw = {} as Record<SubtestCode, number>;
  for (const code of SUBTEST_CODES) {
    sw[code] = 80 + rw[code] * 2 + bandIndex;
  }
  const totalRw = SUBTEST_CODES.reduce((sum, code) => sum + rw[code], 0);
  const totalSw = SUBTEST_CODES.reduce((sum, code) => sum + sw[code], 0);
  const iq = Math.round(totalSw / 9);

  const means = {
    verbal: GROUPS.verbal.reduce((sum, code) => sum + sw[code], 0) / GROUPS.verbal.length,
    numerik: GROUPS.numerik.reduce((sum, code) => sum + sw[code], 0) / GROUPS.numerik.length,
    figural: GROUPS.figural.reduce((sum, code) => sum + sw[code], 0) / GROUPS.figural.length,
  };
  let dominance: "verbal" | "numerik" | "figural" = "verbal";
  for (const group of ["verbal", "numerik", "figural"] as const) {
    if (means[group] > means[dominance]) {
      dominance = group;
    }
  }

  const band = GOLDEN_AGE_BANDS[bandIndex];
  if (!band) {
    throw new Error("unreachable: bandIndex checked above");
  }
  return {
    resultStatus: "draft",
    ageAtTest: effectiveAge,
    bandLabel: band.label,
    rw,
    sw,
    totalRw,
    totalSw,
    iq,
    iqCategory: categoryFor(iq),
    dominance,
  };
}

function makeCase(
  name: string,
  description: string,
  age: { years: number; dayOffset: number },
  plans: GoldenCase["plans"],
  geScores: readonly (0 | 1 | 2)[],
  timeoutSubtest: SubtestCode | null = null,
): GoldenCase {
  return { name, description, age, plans, geScores, timeoutSubtest, expected: buildExpected(age, plans, geScores) };
}

export function buildGoldenCases(): GoldenCase[] {
  const moderate: AnswerPlan = { correct: 10, wrong: 4, skip: 2 };
  const cases: GoldenCase[] = [];

  // One case per age band, with per-band variety in the answer pattern so different bands also
  // exercise different raw scores (band 0 → 8 correct, band 1 → 9, ...).
  GOLDEN_AGE_BANDS.forEach((band, index) => {
    const plan: AnswerPlan = { correct: 8 + index, wrong: 3, skip: 2 };
    cases.push(
      makeCase(
        `band-${index}-usia-${band.minAge + 2}`,
        `Usia ${band.minAge + 2} jatuh di band ${band.label}; RW seragam ${plan.correct}.`,
        { years: band.minAge + 2, dayOffset: 0 },
        uniformPlans(plan),
        [2, 1, 0, 2, 1] as const,
      ),
    );
  });

  // Birthday boundaries: the same `years` lands in DIFFERENT bands depending on one day.
  cases.push(
    makeCase(
      "ulang-tahun-tepat-hari-tes",
      "Ulang tahun ke-20 TEPAT pada hari tes: usia 20, band 20–24.",
      { years: 20, dayOffset: 0 },
      uniformPlans(moderate),
      [1, 1, 1] as const,
    ),
    makeCase(
      "ulang-tahun-besok",
      "Ulang tahun ke-20 BESOK: usia masih 19, band 15–19.",
      { years: 20, dayOffset: 1 },
      uniformPlans(moderate),
      [1, 1, 1] as const,
    ),
    makeCase(
      "ulang-tahun-kemarin",
      "Ulang tahun ke-20 kemarin: usia 20, band 20–24 — beda band dari kasus 'besok'.",
      { years: 20, dayOffset: -1 },
      uniformPlans(moderate),
      [1, 1, 1] as const,
    ),
  );

  // Extremes.
  cases.push(
    makeCase(
      "raw-minimum",
      "Semua salah atau kosong; GE tidak dijawab sama sekali. RW 0 di semua subtes.",
      { years: 30, dayOffset: 0 },
      uniformPlans({ correct: 0, wrong: 5, skip: 3 }),
      [] as const,
    ),
    makeCase(
      "raw-maksimum",
      "Semua benar; 16 GE dijawab dan semuanya diberi skor 2 (RW GE = 32).",
      { years: 30, dayOffset: 0 },
      uniformPlans({ correct: 20, wrong: 0, skip: 0 }),
      Array.from({ length: 16 }, () => 2 as const),
    ),
    makeCase(
      "ge-semua-nol",
      "16 GE dijawab, penilai memberi 0 semua — jawaban ada tetapi RW GE = 0.",
      { years: 25, dayOffset: 0 },
      uniformPlans(moderate),
      Array.from({ length: 16 }, () => 0 as const),
    ),
  );

  // Timeout with partial answers: SE dies by the clock after 5 correct answers.
  cases.push(
    makeCase(
      "timeout-jawaban-parsial",
      "SE ditutup timeout setelah 5 jawaban benar; sisanya normal. RW SE = 5.",
      { years: 28, dayOffset: 0 },
      { ...uniformPlans(moderate), SE: { correct: 5, wrong: 0, skip: 0 } },
      [2, 2, 1] as const,
      "SE",
    ),
  );

  // Outside every band: 14 years old → needs_review, no result row.
  cases.push(
    makeCase(
      "usia-di-luar-band",
      "Usia 14 di bawah band termuda (15–19): sesi ke needs_review, TANPA baris hasil.",
      { years: 14, dayOffset: 0 },
      uniformPlans(moderate),
      [1, 1] as const,
    ),
  );

  return cases;
}

// CLI: `node --experimental-strip-types scripts/generate-golden-cases.ts`
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const cases = buildGoldenCases();
  const outPath = join(dirname(fileURLToPath(import.meta.url)), "../tests/golden/cases.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(cases, null, 2)}\n`);
  console.log(`${cases.length} golden cases → ${outPath}`);
}
