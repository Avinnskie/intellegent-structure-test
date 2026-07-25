/**
 * Golden dataset generator (T28, brief §22).
 *
 * Produces `tests/golden/cases.json` from the immutable workbook reference data. The integration
 * harness then drives the real application and compares every persisted number with these cases.
 *
 * The workbook defines scoring age as YEAR(test)-YEAR(birth), so dayOffset deliberately does not
 * change the scoring band when both dates remain in their respective years.
 *
 * Run: npm run golden:generate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  categoryForIq,
  dominanceProfile,
  iqFromCompositeStandard,
} from "../lib/domain/aggregate.ts";
import {
  OFFICIAL_AGE_BANDS,
  officialCompositeStandardScore,
  officialStandardScoreFor,
} from "../lib/domain/official-ist.ts";
import { SUBTEST_CODES, type SubtestCode } from "../lib/ist-subtests.ts";
import { GOLDEN_SCENARIOS, type AnswerPlan } from "./golden-scenarios.ts";

export const GOLDEN_AGE_BANDS = OFFICIAL_AGE_BANDS;

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
        dominance: "Seimbang" | "Eksak" | "Non Eksak";
      }
    | { resultStatus: "needs_review"; reason: string };
};

function buildExpected(
  age: { years: number; dayOffset: number },
  plans: GoldenCase["plans"],
  geScores: readonly (0 | 1 | 2)[],
): GoldenCase["expected"] {
  const scoringAge = age.years;
  const band = GOLDEN_AGE_BANDS.find(
    (candidateBand) => scoringAge >= candidateBand.minAge && scoringAge <= candidateBand.maxAge,
  );
  if (!band) {
    return { resultStatus: "needs_review", reason: "NO_AGE_BAND" };
  }

  const rw = {} as Record<SubtestCode, number>;
  for (const code of SUBTEST_CODES) {
    rw[code] =
      code === "GE" ? geScores.reduce<number>((sum, s) => sum + s, 0) : plans[code].correct;
  }
  const sw = {} as Record<SubtestCode, number>;
  for (const code of SUBTEST_CODES) {
    const score = officialStandardScoreFor(band.label, code, rw[code]);
    if (score === null) {
      throw new Error(`Norma ${band.label}/${code}/${rw[code]} tidak tersedia.`);
    }
    sw[code] = score;
  }
  const totalRw = SUBTEST_CODES.reduce((sum, code) => sum + rw[code], 0);
  const totalSw = officialCompositeStandardScore(band.label, totalRw);
  if (totalSw === null) {
    return {
      resultStatus: "needs_review",
      reason: `MISSING_NORM_ROW:TOTAL:${totalRw}`,
    };
  }
  const iq = iqFromCompositeStandard(totalSw);
  return {
    resultStatus: "draft",
    ageAtTest: scoringAge,
    bandLabel: band.label,
    rw,
    sw,
    totalRw,
    totalSw,
    iq,
    iqCategory: categoryForIq(iq),
    dominance: dominanceProfile(sw).dominance,
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
  return {
    name,
    description,
    age,
    plans,
    geScores,
    timeoutSubtest,
    expected: buildExpected(age, plans, geScores),
  };
}

export function buildGoldenCases(): GoldenCase[] {
  return GOLDEN_SCENARIOS.map((scenario) =>
    makeCase(
      scenario.name,
      scenario.description,
      scenario.age,
      scenario.plans,
      scenario.geScores,
      scenario.timeoutSubtest ?? null,
    ),
  );
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
