import {
  asPapiOptionCode,
  PAPI_FACTOR_CODES,
  PAPI_ITEM_COUNT,
  PAPI_TOTAL_SCORE_INVARIANT,
  type PapiCategory,
  type PapiFactorCode,
  type PapiGroupCode,
  type PapiOptionCode,
} from "../papi-factors.ts";
import {
  PAPI_ENGINE_VERSION,
  PAPI_FACTORS,
  PAPI_GROUPS,
  PAPI_ITEMS,
  papiCategoryForScore,
  papiInterpretationFor,
  papiItem,
} from "./official-papi.ts";

export type PapiAnswerSheet = Readonly<Record<number, PapiOptionCode | null | undefined>>;

export type PapiFactorScore = {
  readonly code: PapiFactorCode;
  readonly name: string;
  readonly group: PapiGroupCode;
  readonly kind: "role" | "need";
  readonly score: number;
  readonly category: PapiCategory;
  readonly interpretation: string | null;
  readonly interpretationPending: boolean;
};

export type PapiGroupScore = {
  readonly code: PapiGroupCode;
  readonly label: string;
  readonly factors: readonly PapiFactorCode[];
  readonly total: number;
  readonly average: number;
};

export type PapiProfile = {
  readonly engineVersion: string;
  readonly factorScores: readonly PapiFactorScore[];
  readonly groupScores: readonly PapiGroupScore[];
  readonly roleTotal: number;
  readonly needTotal: number;
  readonly totalScore: number;
  readonly pendingInterpretationFactors: readonly PapiFactorCode[];
};

export class PapiIncompleteAnswersError extends Error {
  readonly missingItemNumbers: readonly number[];

  constructor(missingItemNumbers: readonly number[]) {
    super(
      `Lembar PAPI belum lengkap: ${missingItemNumbers.length} dari ${PAPI_ITEM_COUNT} nomor belum dijawab.`,
    );
    this.name = "PapiIncompleteAnswersError";
    this.missingItemNumbers = missingItemNumbers;
  }
}

export function findUnansweredPapiItems(answers: PapiAnswerSheet): readonly number[] {
  return PAPI_ITEMS.filter((item) => asPapiOptionCode(answers[item.number] ?? null) === null).map(
    (item) => item.number,
  );
}

export function isPapiAnswerSheetComplete(answers: PapiAnswerSheet): boolean {
  return findUnansweredPapiItems(answers).length === 0;
}

export function papiFactorForAnswer(
  itemNumber: number,
  option: PapiOptionCode,
): PapiFactorCode | null {
  const item = papiItem(itemNumber);
  if (!item) {
    return null;
  }
  return option === "A" ? item.optionA.factor : item.optionB.factor;
}

function emptyTally(): Record<PapiFactorCode, number> {
  return Object.fromEntries(PAPI_FACTOR_CODES.map((code) => [code, 0])) as Record<
    PapiFactorCode,
    number
  >;
}

export function tallyPapiFactorScores(
  answers: PapiAnswerSheet,
): Readonly<Record<PapiFactorCode, number>> {
  const missing = findUnansweredPapiItems(answers);
  if (missing.length > 0) {
    throw new PapiIncompleteAnswersError(missing);
  }

  const tally = emptyTally();
  for (const item of PAPI_ITEMS) {
    const option = asPapiOptionCode(answers[item.number] ?? null);
    if (option === null) {
      throw new PapiIncompleteAnswersError([item.number]);
    }
    tally[option === "A" ? item.optionA.factor : item.optionB.factor] += 1;
  }

  const total = Object.values(tally).reduce((sum, value) => sum + value, 0);
  if (total !== PAPI_TOTAL_SCORE_INVARIANT) {
    throw new Error(
      `Invarian skoring PAPI dilanggar: total ${total}, seharusnya ${PAPI_TOTAL_SCORE_INVARIANT}.`,
    );
  }

  return tally;
}

export function buildPapiProfile(answers: PapiAnswerSheet): PapiProfile {
  const tally = tallyPapiFactorScores(answers);

  const factorScores: PapiFactorScore[] = PAPI_FACTORS.map((factor) => {
    const score = tally[factor.code];
    const band = papiInterpretationFor(factor.code, score);
    return {
      code: factor.code,
      name: factor.name,
      group: factor.group,
      kind: factor.kind,
      score,
      category: papiCategoryForScore(score),
      interpretation: band?.text ?? null,
      interpretationPending: band === null || band.pendingOwnerValidation,
    };
  });

  const groupScores: PapiGroupScore[] = PAPI_GROUPS.map((group) => {
    const total = group.factors.reduce((sum, code) => sum + tally[code], 0);
    return {
      code: group.code,
      label: group.label,
      factors: group.factors,
      total,
      average: Number((total / group.factors.length).toFixed(2)),
    };
  });

  const sumByKind = (kind: "role" | "need") =>
    PAPI_FACTORS.filter((factor) => factor.kind === kind).reduce(
      (sum, factor) => sum + tally[factor.code],
      0,
    );

  return {
    engineVersion: PAPI_ENGINE_VERSION,
    factorScores,
    groupScores,
    roleTotal: sumByKind("role"),
    needTotal: sumByKind("need"),
    totalScore: PAPI_TOTAL_SCORE_INVARIANT,
    pendingInterpretationFactors: factorScores
      .filter((factor) => factor.interpretationPending)
      .map((factor) => factor.code),
  };
}
