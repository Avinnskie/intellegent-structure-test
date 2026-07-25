import { z } from "zod";
import type { SubtestCode } from "../ist-subtests.ts";
import { SUBTEST_CODES } from "../ist-subtests.ts";
import officialIstDataJson from "./official-ist-data.json" with { type: "json" };
import type { NormRow } from "./norms.ts";

const choiceCodeSchema = z.enum(["a", "b", "c", "d", "e"]);
const standardScoresSchema = z.object({
  SE: z.array(z.number().int()).length(21),
  WA: z.array(z.number().int()).length(21),
  AN: z.array(z.number().int()).length(21),
  GE: z.array(z.number().int()).length(33),
  RA: z.array(z.number().int()).length(21),
  ZR: z.array(z.number().int()).length(21),
  FA: z.array(z.number().int()).length(21),
  WU: z.array(z.number().int()).length(21),
  ME: z.array(z.number().int()).length(21),
});
const bandSchema = z.object({
  label: z.string().min(1),
  minAge: z.number().int().min(0),
  maxAge: z.number().int().max(60),
  standardScores: standardScoresSchema,
  compositeStandardScores: z.array(z.number().int()).length(181),
});
const officialDataSchema = z.object({
  source: z.object({
    workbook: z.string().min(1),
    answerKeyWorkbook: z.string().min(1),
    scoringSheet: z.string().min(1),
    keySheet: z.string().min(1),
  }),
  choiceKeys: z.record(z.string(), choiceCodeSchema),
  acceptedNumericValues: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  normBands: z.array(bandSchema).length(13),
});

const officialData = officialDataSchema.parse(officialIstDataJson);

export const COMPOSITE_NORM_CODE = "TOTAL";

export type OfficialAgeBand = {
  readonly label: string;
  readonly minAge: number;
  readonly maxAge: number;
};

export const OFFICIAL_AGE_BANDS: readonly OfficialAgeBand[] = officialData.normBands.map(
  ({ label, minAge, maxAge }) => ({ label, minAge, maxAge }),
);

function bandForLabel(label: string) {
  return officialData.normBands.find((band) => band.label === label) ?? null;
}

export function officialNormRowsForBand(label: string): readonly NormRow[] | null {
  const band = bandForLabel(label);
  if (!band) {
    return null;
  }

  const subtestRows = SUBTEST_CODES.flatMap((code) =>
    band.standardScores[code].map((standardScore, rawScore) => ({
      subtestCode: code,
      rawScore,
      standardScore,
    })),
  );
  const compositeRows = band.compositeStandardScores.map((standardScore, rawScore) => ({
    subtestCode: COMPOSITE_NORM_CODE,
    rawScore,
    standardScore,
  }));
  return [...subtestRows, ...compositeRows];
}

export function officialCompositeStandardScore(
  label: string,
  totalRawScore: number,
): number | null {
  const band = bandForLabel(label);
  if (!band || !Number.isInteger(totalRawScore)) {
    return null;
  }
  return band.compositeStandardScores[totalRawScore] ?? null;
}

export function officialChoiceKeyFor(itemNumber: number): z.infer<typeof choiceCodeSchema> | null {
  return officialData.choiceKeys[String(itemNumber)] ?? null;
}

export function officialNumericAcceptedValuesFor(itemNumber: number): readonly string[] | null {
  return officialData.acceptedNumericValues[String(itemNumber)] ?? null;
}

export function officialStandardScoreFor(
  label: string,
  code: SubtestCode,
  rawScore: number,
): number | null {
  const band = bandForLabel(label);
  if (!band || !Number.isInteger(rawScore)) {
    return null;
  }
  return band.standardScores[code][rawScore] ?? null;
}
