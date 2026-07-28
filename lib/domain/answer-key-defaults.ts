import type { IstQuestion } from "../ist-questions.ts";
import { officialChoiceKeyFor, officialNumericAcceptedValuesFor } from "./official-ist.ts";

export const ENGINE_VERSION = "1.0.0";

export const MANUAL_GE_DEFAULT_RUBRIC =
  "0 = tidak cocok, 1 = konsep sebagian, 2 = konsep umum tepat (rujuk Kunci IST)";

export type AnswerKeyRule =
  | {
      readonly ruleType: "option_match";
      readonly payload: { readonly correctOptionCodes: readonly string[] };
      readonly maxScore: 1;
    }
  | {
      readonly ruleType: "numeric_match";
      readonly payload: { readonly acceptedValues: readonly string[] };
      readonly maxScore: 1;
    }
  | {
      readonly ruleType: "manual_ge";
      readonly payload: { readonly rubric: string };
      readonly maxScore: 2;
    };

class MissingOfficialAnswerKeyError extends Error {
  readonly itemNumber: number;

  constructor(itemNumber: number) {
    super(`Kunci IST resmi tidak ditemukan untuk item ${itemNumber}.`);
    this.name = "MissingOfficialAnswerKeyError";
    this.itemNumber = itemNumber;
  }
}

class UnexpectedQuestionKindError extends Error {
  constructor() {
    super("Jenis soal IST tidak dikenali.");
    this.name = "UnexpectedQuestionKindError";
  }
}

function assertNever(value: never): never {
  void value;
  throw new UnexpectedQuestionKindError();
}

export function defaultAnswerKeyFor(question: IstQuestion): AnswerKeyRule {
  switch (question.kind) {
    case "choice": {
      const correctOptionCode = officialChoiceKeyFor(question.globalNumber);
      if (!correctOptionCode) {
        throw new MissingOfficialAnswerKeyError(question.globalNumber);
      }
      return {
        ruleType: "option_match",
        payload: { correctOptionCodes: [correctOptionCode] },
        maxScore: 1,
      };
    }
    case "numeric": {
      const acceptedValues = officialNumericAcceptedValuesFor(question.globalNumber);
      if (!acceptedValues) {
        throw new MissingOfficialAnswerKeyError(question.globalNumber);
      }
      return {
        ruleType: "numeric_match",
        payload: { acceptedValues },
        maxScore: 1,
      };
    }
    case "short-text":
      return {
        ruleType: "manual_ge",
        payload: { rubric: MANUAL_GE_DEFAULT_RUBRIC },
        maxScore: 2,
      };
    default:
      return assertNever(question);
  }
}
