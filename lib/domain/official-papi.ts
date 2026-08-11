import { z } from "zod";
import {
  PAPI_FACTOR_CODES,
  PAPI_GROUP_CODES,
  PAPI_ITEM_COUNT,
  PAPI_MAX_FACTOR_SCORE,
  type PapiCategory,
  type PapiFactorCode,
  type PapiFactorKind,
  type PapiGroupCode,
} from "../papi-factors.ts";
import officialPapiDataJson from "./official-papi-data.json" with { type: "json" };

const factorCodeSchema = z.enum(PAPI_FACTOR_CODES);
const groupCodeSchema = z.enum(PAPI_GROUP_CODES);
const scoreSchema = z.number().int().min(0).max(PAPI_MAX_FACTOR_SCORE);

const optionSchema = z.object({
  text: z.string().min(1),
  factor: factorCodeSchema,
});

const itemSchema = z.object({
  number: z.number().int().min(1).max(PAPI_ITEM_COUNT),
  optionA: optionSchema,
  optionB: optionSchema,
});

const bandSchema = z
  .object({
    minScore: scoreSchema,
    maxScore: scoreSchema,
    text: z.string().min(1).nullable(),
    pendingOwnerValidation: z.boolean(),
  })
  .refine((band) => band.minScore <= band.maxScore, "minScore harus <= maxScore")
  .refine(
    (band) => (band.text === null) === band.pendingOwnerValidation,
    "text kosong wajib ditandai pendingOwnerValidation",
  );

const officialPapiSchema = z.object({
  source: z.object({
    workbook: z.string().min(1),
    itemSheet: z.string().min(1),
    keySheet: z.string().min(1),
    interpretationSheet: z.string().min(1),
    extractedAt: z.string().min(1),
    note: z.string().min(1),
  }),
  itemCount: z.literal(PAPI_ITEM_COUNT),
  maxScorePerFactor: z.literal(PAPI_MAX_FACTOR_SCORE),
  totalScoreInvariant: z.literal(PAPI_ITEM_COUNT),
  factors: z
    .array(
      z.object({
        code: factorCodeSchema,
        name: z.string().min(1),
        group: groupCodeSchema,
        kind: z.enum(["role", "need"]),
      }),
    )
    .length(PAPI_FACTOR_CODES.length),
  groups: z
    .array(
      z.object({
        code: groupCodeSchema,
        label: z.string().min(1),
        factors: z.array(factorCodeSchema).min(1),
      }),
    )
    .length(PAPI_GROUP_CODES.length),
  categoryBands: z
    .array(
      z.object({
        minScore: scoreSchema,
        maxScore: scoreSchema,
        category: z.enum(["LOW", "MIDDLE", "HIGH"]),
      }),
    )
    .min(1),
  items: z.array(itemSchema).length(PAPI_ITEM_COUNT),
  interpretationBands: z.record(factorCodeSchema, z.array(bandSchema).min(1)),
});

const officialPapi = officialPapiSchema.parse(officialPapiDataJson);

export const PAPI_ENGINE_VERSION = "papi-1.0.0";

export const PAPI_SOURCE = officialPapi.source;

export type PapiFactorDefinition = {
  readonly code: PapiFactorCode;
  readonly name: string;
  readonly group: PapiGroupCode;
  readonly kind: PapiFactorKind;
};

export type PapiGroupDefinition = {
  readonly code: PapiGroupCode;
  readonly label: string;
  readonly factors: readonly PapiFactorCode[];
};

export type PapiItemOption = {
  readonly text: string;
  readonly factor: PapiFactorCode;
};

export type PapiItem = {
  readonly number: number;
  readonly optionA: PapiItemOption;
  readonly optionB: PapiItemOption;
};

export type PapiInterpretationBand = {
  readonly minScore: number;
  readonly maxScore: number;
  readonly text: string | null;
  readonly pendingOwnerValidation: boolean;
};

export const PAPI_FACTORS: readonly PapiFactorDefinition[] = officialPapi.factors;

export const PAPI_GROUPS: readonly PapiGroupDefinition[] = officialPapi.groups;

export const PAPI_ITEMS: readonly PapiItem[] = officialPapi.items;

const FACTOR_BY_CODE = new Map<PapiFactorCode, PapiFactorDefinition>(
  PAPI_FACTORS.map((factor) => [factor.code, factor]),
);

const ITEM_BY_NUMBER = new Map<number, PapiItem>(PAPI_ITEMS.map((item) => [item.number, item]));

export function papiFactor(code: PapiFactorCode): PapiFactorDefinition {
  const factor = FACTOR_BY_CODE.get(code);
  if (!factor) {
    throw new Error(`Faktor PAPI tidak dikenal: ${code}`);
  }
  return factor;
}

export function papiItem(itemNumber: number): PapiItem | null {
  return ITEM_BY_NUMBER.get(itemNumber) ?? null;
}

export function papiRoleFactors(): readonly PapiFactorCode[] {
  return PAPI_FACTORS.filter((factor) => factor.kind === "role").map((factor) => factor.code);
}

export function papiNeedFactors(): readonly PapiFactorCode[] {
  return PAPI_FACTORS.filter((factor) => factor.kind === "need").map((factor) => factor.code);
}

export function papiCategoryForScore(score: number): PapiCategory {
  const band = officialPapi.categoryBands.find(
    (candidate) => score >= candidate.minScore && score <= candidate.maxScore,
  );
  if (!band) {
    throw new Error(`Skor PAPI di luar rentang kategori: ${score}`);
  }
  return band.category;
}

export function papiInterpretationBands(code: PapiFactorCode): readonly PapiInterpretationBand[] {
  const bands = officialPapi.interpretationBands[code];
  if (!bands) {
    throw new Error(`Band interpretasi PAPI tidak ditemukan untuk faktor ${code}`);
  }
  return bands;
}

export function papiInterpretationFor(
  code: PapiFactorCode,
  score: number,
): PapiInterpretationBand | null {
  return (
    papiInterpretationBands(code).find(
      (band) => score >= band.minScore && score <= band.maxScore,
    ) ?? null
  );
}
