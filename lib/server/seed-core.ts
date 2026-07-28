import { eq } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import {
  assessmentFormVersions,
  itemOptions,
  itemScoringRules,
  itemVersions,
  normAgeBands,
  normScoreRows,
  organizations,
  subtestVersions,
  tutorialVersions,
} from "../db/schema.ts";
import { allQuestions, questionsBySubtest } from "../ist-questions.ts";
import { subtests } from "../ist-subtests.ts";
import { writeAudit } from "./audit.ts";
import { insertSeedContent } from "./seed-content.ts";
import { DEFAULT_APPROVED_BY, insertSeedScoring } from "./seed-scoring.ts";

export {
  DEFAULT_APPROVED_BY,
  DEFAULT_POPULATION_REFERENCE,
  EXPECTED_NORM_ROW_COUNT,
  maxRawScoreFor,
  SEED_AGE_BANDS,
} from "./seed-scoring.ts";

export const SEED_FORM_CODE = "IST-DEFAULT";
export const SEED_FORM_TITLE = "IST Assessment Form";
export const DEFAULT_SEED_ORG_NAME = "IST Assessment";
export const EXPECTED_ITEM_COUNT = allQuestions.length;

export type SeedCounts = {
  readonly subtestVersions: number;
  readonly itemVersions: number;
  readonly itemOptions: number;
  readonly tutorialVersions: number;
  readonly itemScoringRules: number;
  readonly normAgeBands: number;
  readonly normScoreRows: number;
};

export type SeedSummary = {
  readonly created: boolean;
  readonly organizationId: string;
  readonly formVersionId: string;
  readonly counts: SeedCounts;
};

class SeedCoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedCoreError";
  }
}

export function resolveSeedOrganizationName(): string {
  return process.env.SEED_ORG_NAME?.trim() || DEFAULT_SEED_ORG_NAME;
}

async function ensureOrganization(db: DbLike, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, name))
    .limit(1);
  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(organizations)
    .values({ name })
    .returning({ id: organizations.id });
  if (!created) {
    throw new SeedCoreError("Gagal membuat organisasi.");
  }
  return created.id;
}

async function countSeeded(db: DbLike): Promise<SeedCounts> {
  const [items, options, subtestRows, tutorials, rules, bands, scoreRows] = await Promise.all([
    db.select({ id: itemVersions.id }).from(itemVersions),
    db.select({ id: itemOptions.id }).from(itemOptions),
    db.select({ id: subtestVersions.id }).from(subtestVersions),
    db.select({ id: tutorialVersions.id }).from(tutorialVersions),
    db.select({ id: itemScoringRules.id }).from(itemScoringRules),
    db.select({ id: normAgeBands.id }).from(normAgeBands),
    db.select({ id: normScoreRows.id }).from(normScoreRows),
  ]);
  return {
    subtestVersions: subtestRows.length,
    itemVersions: items.length,
    itemOptions: options.length,
    tutorialVersions: tutorials.length,
    itemScoringRules: rules.length,
    normAgeBands: bands.length,
    normScoreRows: scoreRows.length,
  };
}

async function seedWithin(db: DbLike, organizationName: string): Promise<SeedSummary> {
  const organizationId = await ensureOrganization(db, organizationName);
  const [existingForm] = await db
    .select({ id: assessmentFormVersions.id })
    .from(assessmentFormVersions)
    .where(eq(assessmentFormVersions.formCode, SEED_FORM_CODE))
    .limit(1);
  if (existingForm) {
    return {
      created: false,
      organizationId,
      formVersionId: existingForm.id,
      counts: await countSeeded(db),
    };
  }

  const [formVersion] = await db
    .insert(assessmentFormVersions)
    .values({
      formCode: SEED_FORM_CODE,
      version: 1,
      title: SEED_FORM_TITLE,
      status: "published",
      approvedBy: DEFAULT_APPROVED_BY,
    })
    .returning({ id: assessmentFormVersions.id });
  if (!formVersion) {
    throw new SeedCoreError("Gagal membuat assessment form version.");
  }

  const content = await insertSeedContent(db, formVersion.id);
  const scoring = await insertSeedScoring(db, formVersion.id, content.itemIdByNumber);
  const counts: SeedCounts = {
    subtestVersions: content.subtestVersionIdByCode.size,
    itemVersions: content.itemIdByNumber.size,
    itemOptions: content.optionCount,
    tutorialVersions: content.tutorialCount,
    itemScoringRules: scoring.ruleCount,
    normAgeBands: scoring.bandCount,
    normScoreRows: scoring.normRowCount,
  };

  await writeAudit(db, {
    organizationId,
    actorType: "system",
    actorId: "system",
    action: "seed.create",
    objectType: "assessment_form_version",
    objectId: formVersion.id,
    metadata: { formCode: SEED_FORM_CODE, source: "seed", ...counts },
  });
  return { created: true, organizationId, formVersionId: formVersion.id, counts };
}

export async function runSeed(
  db: DbLike,
  options: { readonly organizationName?: string } = {},
): Promise<SeedSummary> {
  const organizationName = options.organizationName ?? resolveSeedOrganizationName();
  return db.transaction((tx) => seedWithin(tx, organizationName));
}

for (const subtest of subtests) {
  if (questionsBySubtest[subtest.code].length !== subtest.itemCount) {
    throw new SeedCoreError(
      `Jumlah soal ${subtest.code} (${questionsBySubtest[subtest.code].length}) ` +
        `tidak cocok dengan itemCount (${subtest.itemCount}).`,
    );
  }
}
