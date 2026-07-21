import type { IstQuestion } from "../ist-questions.ts";

/**
 * Stamped onto every `assessment_results.engine_version`. Bump on any change to aggregate/scoring
 * behavior (brief §22: reproducibility).
 */
export const ENGINE_VERSION = "0.2.0";

export const MANUAL_GE_DEFAULT_RUBRIC = "0 = salah, 1 = sebagian, 2 = tepat";

export type AnswerKeyRule =
  | { ruleType: "option_match"; payload: { correctOptionCodes: string[] }; maxScore: 1 }
  | { ruleType: "numeric_match"; payload: { acceptedValues: string[] }; maxScore: 1 }
  | { ruleType: "manual_ge"; payload: { rubric: string }; maxScore: 2 };

/**
 * Deterministic default answer key derivation used by the seed and the golden fixtures. The choice
 * key is a pure function of the item number so seed and tests stay in sync.
 */
export function defaultAnswerKeyFor(question: IstQuestion): AnswerKeyRule {
  if (question.kind === "choice") {
    const codes = ["a", "b", "c", "d", "e"] as const;
    return {
      ruleType: "option_match",
      payload: { correctOptionCodes: [codes[question.globalNumber % 5]] },
      maxScore: 1,
    };
  }

  if (question.kind === "numeric") {
    const value = String(question.globalNumber * 2);
    return {
      ruleType: "numeric_match",
      payload: { acceptedValues: [value, `${value}.0`] },
      maxScore: 1,
    };
  }

  return {
    ruleType: "manual_ge",
    payload: { rubric: MANUAL_GE_DEFAULT_RUBRIC },
    maxScore: 2,
  };
}
