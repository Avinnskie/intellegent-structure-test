import { OFFICIAL_AGE_BANDS } from "../lib/domain/official-ist.ts";
import type { SubtestCode } from "../lib/ist-subtests.ts";

export type AnswerPlan = {
  readonly correct: number;
  readonly wrong: number;
  readonly skip: number;
};

export type GoldenScenario = {
  readonly name: string;
  readonly description: string;
  readonly age: { readonly years: number; readonly dayOffset: number };
  readonly plans: Record<Exclude<SubtestCode, "GE">, AnswerPlan>;
  readonly geScores: readonly (0 | 1 | 2)[];
  readonly timeoutSubtest?: SubtestCode;
};

function uniformPlans(plan: AnswerPlan): GoldenScenario["plans"] {
  return {
    SE: plan,
    WA: plan,
    AN: plan,
    RA: plan,
    ZR: plan,
    FA: plan,
    WU: plan,
    ME: plan,
  };
}

const moderate: AnswerPlan = { correct: 10, wrong: 4, skip: 2 };

const bandScenarios: readonly GoldenScenario[] = OFFICIAL_AGE_BANDS.map((band, index) => {
  const plan: AnswerPlan = { correct: 8 + index, wrong: 3, skip: 2 };
  const years = Math.floor((band.minAge + band.maxAge) / 2);
  return {
    name: `band-${index}-usia-${years}`,
    description: `Usia ${years} jatuh di band ${band.label}; RW seragam ${plan.correct}.`,
    age: { years, dayOffset: 0 },
    plans: uniformPlans(plan),
    geScores: [2, 1, 0, 2, 1],
  };
});

const birthdayScenarios: readonly GoldenScenario[] = [
  {
    name: "ulang-tahun-tepat-hari-tes",
    description: "Ulang tahun ke-20 tepat pada hari tes: usia skoring tetap 20.",
    age: { years: 20, dayOffset: 0 },
    plans: uniformPlans(moderate),
    geScores: [1, 1, 1],
  },
  {
    name: "ulang-tahun-besok",
    description: "Ulang tahun ke-20 besok: Excel tetap memakai usia skoring 20.",
    age: { years: 20, dayOffset: 1 },
    plans: uniformPlans(moderate),
    geScores: [1, 1, 1],
  },
  {
    name: "ulang-tahun-kemarin",
    description: "Ulang tahun ke-20 kemarin: usia skoring tetap 20.",
    age: { years: 20, dayOffset: -1 },
    plans: uniformPlans(moderate),
    geScores: [1, 1, 1],
  },
];

const edgeScenarios: readonly GoldenScenario[] = [
  {
    name: "raw-minimum",
    description: "Semua salah atau kosong; GE tidak dijawab. RW semua subtes adalah 0.",
    age: { years: 30, dayOffset: 0 },
    plans: uniformPlans({ correct: 0, wrong: 5, skip: 3 }),
    geScores: [],
  },
  {
    name: "raw-maksimum",
    description: "Semua benar; semua 16 jawaban GE diberi skor 2.",
    age: { years: 30, dayOffset: 0 },
    plans: uniformPlans({ correct: 20, wrong: 0, skip: 0 }),
    geScores: Array.from({ length: 16 }, () => 2 as const),
  },
  {
    name: "ge-semua-nol",
    description: "Semua GE dijawab tetapi penilai memberi 0.",
    age: { years: 25, dayOffset: 0 },
    plans: uniformPlans(moderate),
    geScores: Array.from({ length: 16 }, () => 0 as const),
  },
  {
    name: "timeout-jawaban-parsial",
    description: "SE ditutup timeout setelah lima jawaban benar; subtes lain normal.",
    age: { years: 28, dayOffset: 0 },
    plans: {
      ...uniformPlans(moderate),
      SE: { correct: 5, wrong: 0, skip: 0 },
    },
    geScores: [2, 2, 1],
    timeoutSubtest: "SE",
  },
  {
    name: "usia-di-luar-band",
    description: "Usia 61 di atas batas norma workbook dan harus masuk needs_review.",
    age: { years: 61, dayOffset: 0 },
    plans: uniformPlans(moderate),
    geScores: [1, 1],
  },
];

export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = [
  ...bandScenarios,
  ...birthdayScenarios,
  ...edgeScenarios,
];
