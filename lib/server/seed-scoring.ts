import type { DbLike } from "../db/client.ts";
import {
  itemScoringRules,
  normAgeBands,
  normScoreRows,
  normSetVersions,
  scoringKeyVersions,
} from "../db/schema.ts";
import { defaultAnswerKeyFor } from "../domain/answer-key-defaults.ts";
import { OFFICIAL_AGE_BANDS, officialNormRowsForBand } from "../domain/official-ist.ts";
import { allQuestions, type IstQuestion } from "../ist-questions.ts";
import { subtests } from "../ist-subtests.ts";

const INSERT_BATCH_SIZE = 500;

export const DEFAULT_APPROVED_BY = "System";
export const DEFAULT_POPULATION_REFERENCE = "APLIKASI Skoring IST.xlsx";
export const SEED_AGE_BANDS = OFFICIAL_AGE_BANDS;

export type SeedScoringSummary = {
  readonly ruleCount: number;
  readonly bandCount: number;
  readonly normRowCount: number;
};

class SeedScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedScoringError";
  }
}

function chunk<T>(rows: readonly T[], size: number): readonly T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }
  return batches;
}

function itemIdFor(itemIdByNumber: ReadonlyMap<number, string>, question: IstQuestion): string {
  const id = itemIdByNumber.get(question.globalNumber);
  if (!id) {
    throw new SeedScoringError(
      `Item version tidak ditemukan untuk nomor ${question.globalNumber}.`,
    );
  }
  return id;
}

async function insertScoringKey(
  db: DbLike,
  formVersionId: string,
  itemIdByNumber: ReadonlyMap<number, string>,
  version: number,
) {
  const [keyVersion] = await db
    .insert(scoringKeyVersions)
    .values({
      formVersionId,
      version,
      status: "published",
      approvedBy: DEFAULT_APPROVED_BY,
    })
    .returning({ id: scoringKeyVersions.id });
  if (!keyVersion) {
    throw new SeedScoringError("Gagal membuat scoring key version.");
  }

  const values = allQuestions.map((question) => {
    const rule = defaultAnswerKeyFor(question);
    return {
      scoringKeyVersionId: keyVersion.id,
      itemVersionId: itemIdFor(itemIdByNumber, question),
      ruleType: rule.ruleType,
      rulePayload: rule.payload,
      maxScore: rule.maxScore,
    };
  });
  for (const batch of chunk(values, INSERT_BATCH_SIZE)) {
    await db.insert(itemScoringRules).values(batch);
  }
  return { scoringKeyVersionId: keyVersion.id, ruleCount: values.length };
}

async function insertNormSet(db: DbLike, formVersionId: string, version: number) {
  const [normSet] = await db
    .insert(normSetVersions)
    .values({
      formVersionId,
      version,
      populationReference: DEFAULT_POPULATION_REFERENCE,
      status: "published",
      approvedBy: DEFAULT_APPROVED_BY,
    })
    .returning({ id: normSetVersions.id });
  if (!normSet) {
    throw new SeedScoringError("Gagal membuat norm set version.");
  }

  const bandRows = await db
    .insert(normAgeBands)
    .values(
      SEED_AGE_BANDS.map((band) => ({
        normSetVersionId: normSet.id,
        label: band.label,
        minAge: band.minAge,
        maxAge: band.maxAge,
      })),
    )
    .returning({ id: normAgeBands.id, label: normAgeBands.label });
  const bandIdByLabel = new Map(bandRows.map((row) => [row.label, row.id]));

  const scoreRows = SEED_AGE_BANDS.flatMap((band) => {
    const normAgeBandId = bandIdByLabel.get(band.label);
    const referenceRows = officialNormRowsForBand(band.label);
    if (!normAgeBandId || !referenceRows) {
      throw new SeedScoringError(`Norma resmi tidak ditemukan untuk band ${band.label}.`);
    }
    return referenceRows.map((row) => ({ normAgeBandId, ...row }));
  });
  for (const batch of chunk(scoreRows, INSERT_BATCH_SIZE)) {
    await db.insert(normScoreRows).values(batch);
  }
  return {
    normSetVersionId: normSet.id,
    bandCount: bandRows.length,
    normRowCount: scoreRows.length,
  };
}

export type OfficialScoringInstallSummary = SeedScoringSummary & {
  readonly version: number;
  readonly scoringKeyVersionId: string;
  readonly normSetVersionId: string;
};

export async function insertOfficialScoringVersion(
  db: DbLike,
  formVersionId: string,
  itemIdByNumber: ReadonlyMap<number, string>,
  version: number,
): Promise<OfficialScoringInstallSummary> {
  const key = await insertScoringKey(db, formVersionId, itemIdByNumber, version);
  const norms = await insertNormSet(db, formVersionId, version);
  return { version, ...key, ...norms };
}

export async function insertSeedScoring(
  db: DbLike,
  formVersionId: string,
  itemIdByNumber: ReadonlyMap<number, string>,
): Promise<SeedScoringSummary> {
  return insertOfficialScoringVersion(db, formVersionId, itemIdByNumber, 1);
}

export function maxRawScoreFor(subtest: { readonly code: string; readonly itemCount: number }) {
  return subtest.code === "GE" ? subtest.itemCount * 2 : subtest.itemCount;
}

export const EXPECTED_NORM_ROW_COUNT =
  SEED_AGE_BANDS.length *
  (subtests.reduce((total, subtest) => total + maxRawScoreFor(subtest) + 1, 0) + 181);
