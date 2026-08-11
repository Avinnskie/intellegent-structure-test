export const PAPI_FACTOR_CODES = [
  "N",
  "G",
  "A",
  "L",
  "P",
  "I",
  "T",
  "V",
  "X",
  "S",
  "B",
  "O",
  "R",
  "D",
  "C",
  "Z",
  "E",
  "K",
  "F",
  "W",
] as const;

export type PapiFactorCode = (typeof PAPI_FACTOR_CODES)[number];

export const PAPI_GROUP_CODES = [
  "WORK_DIRECTION",
  "LEADERSHIP",
  "ACTIVITY",
  "SOCIAL_NATURE",
  "WORK_STYLE",
  "TEMPERAMENT",
  "FOLLOWERSHIP",
] as const;

export type PapiGroupCode = (typeof PAPI_GROUP_CODES)[number];
export type PapiFactorKind = "role" | "need";

export type PapiCategory = "LOW" | "MIDDLE" | "HIGH";

export const PAPI_ITEM_COUNT = 90;

export const PAPI_MAX_FACTOR_SCORE = 9;

export const PAPI_TOTAL_SCORE_INVARIANT = PAPI_ITEM_COUNT;

export const PAPI_OPTION_CODES = ["A", "B"] as const;

export type PapiOptionCode = (typeof PAPI_OPTION_CODES)[number];

export function asPapiFactorCode(value: string | null | undefined): PapiFactorCode | null {
  return PAPI_FACTOR_CODES.includes(value as PapiFactorCode) ? (value as PapiFactorCode) : null;
}

export function asPapiOptionCode(value: string | null | undefined): PapiOptionCode | null {
  return PAPI_OPTION_CODES.includes(value as PapiOptionCode) ? (value as PapiOptionCode) : null;
}
