/**
 * Seeds ONE published set of versioned master data: a form version, its 9 subtests, 176 items,
 * tutorials, a scoring key, and a norm set.
 *
 * Lives in `lib/server/` rather than in the script so `scripts/seed.ts` and
 * `tests/integration/seed.test.ts` run the SAME code — a seed verified only by a re-implementation
 * of itself is not verified.
 */
import { eq } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import { defaultAnswerKeyFor } from "../domain/answer-key-defaults.ts";
import { allQuestions, questionsBySubtest, type IstQuestion } from "../ist-questions.ts";
import { subtests } from "../ist-subtests.ts";
import {
  assessmentFormVersions,
  itemOptions,
  itemScoringRules,
  itemVersions,
  normAgeBands,
  normScoreRows,
  normSetVersions,
  organizations,
  scoringKeyVersions,
  subtestVersions,
  tutorialVersions,
} from "../db/schema.ts";
import { writeAudit } from "./audit.ts";

/** The idempotency key: the seed is a no-op when a form version with this code already exists. */
export const SEED_FORM_CODE = "IST-DEFAULT";
export const SEED_FORM_TITLE = "IST Assessment Form";
export const DEFAULT_SEED_ORG_NAME = "IST Assessment";

export const DEFAULT_APPROVED_BY = "System";
export const DEFAULT_POPULATION_REFERENCE = "Default norm set";
const SECONDS_PER_MINUTE = 60;

/**
 * Postgres caps a statement at 65535 bind parameters; the largest row here binds 4, so this is far
 * under the limit. It exists to keep ~1500 norm rows from becoming ~1500 round trips.
 */
const INSERT_BATCH_SIZE = 500;

/** The domain tags kinds with a hyphen; the DB enum uses an underscore. Bridge it in one place. */
const ITEM_TYPE_BY_KIND = {
  choice: "choice",
  "short-text": "short_text",
  numeric: "numeric",
} as const satisfies Record<IstQuestion["kind"], (typeof itemVersions.$inferInsert)["itemType"]>;

/** Fabricated bands. Contiguous and closed so `min_age <= max_age` holds for every row. */
export const SEED_AGE_BANDS = [
  { label: "15–19", minAge: 15, maxAge: 19 },
  { label: "20–24", minAge: 20, maxAge: 24 },
  { label: "25–29", minAge: 25, maxAge: 29 },
  { label: "30–34", minAge: 30, maxAge: 34 },
  { label: "35–39", minAge: 35, maxAge: 39 },
  { label: "40–44", minAge: 40, maxAge: 44 },
  { label: "45–49", minAge: 45, maxAge: 49 },
  { label: "50–60", minAge: 50, maxAge: 60 },
] as const;

export type SeedCounts = {
  subtestVersions: number;
  itemVersions: number;
  itemOptions: number;
  tutorialVersions: number;
  itemScoringRules: number;
  normAgeBands: number;
  normScoreRows: number;
};

export type SeedSummary = {
  /** False when a form version with `SEED_FORM_CODE` already existed and nothing was written. */
  created: boolean;
  organizationId: string;
  formVersionId: string;
  counts: SeedCounts;
};

function chunk<T>(rows: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }
  return batches;
}

/** `SEED_ORG_NAME` env override, matching `scripts/create-admin-user.ts` exactly. */
export function resolveSeedOrganizationName(): string {
  return process.env.SEED_ORG_NAME?.trim() || DEFAULT_SEED_ORG_NAME;
}

/**
 * Single-company tenancy: one organization, looked up BY NAME so this seed and
 * `scripts/create-admin-user.ts` converge on the SAME row regardless of which runs first. Creating a
 * second org here would strand the admin account in a tenant with no master data.
 */
async function ensureOrganization(db: DbLike, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, name))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await db.insert(organizations).values({ name }).returning({
    id: organizations.id,
  });
  if (!created) {
    throw new Error("Gagal membuat organisasi.");
  }
  return created.id;
}

function tutorialTextFor(summary: string, examplePrompt: string): string {
  return `${summary}\n\n${examplePrompt}`;
}

async function insertSubtestVersions(
  db: DbLike,
  formVersionId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .insert(subtestVersions)
    .values(
      subtests.map((subtest, index) => ({
        formVersionId,
        code: subtest.code,
        sequence: index + 1,
        title: `${subtest.title}`,
        durationSeconds: subtest.durationMinutes * SECONDS_PER_MINUTE,
        itemCount: subtest.itemCount,
      })),
    )
    .returning({ id: subtestVersions.id, code: subtestVersions.code });

  // Keyed by code rather than trusting RETURNING to echo insertion order.
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function insertItems(
  db: DbLike,
  subtestVersionIdByCode: Map<string, string>,
): Promise<Map<number, string>> {
  const values = allQuestions.map((question) => {
    const subtestVersionId = subtestVersionIdByCode.get(question.subtestCode);
    if (!subtestVersionId) {
      throw new Error(`Subtest version tidak ditemukan untuk kode ${question.subtestCode}.`);
    }

    return {
      subtestVersionId,
      itemNumber: question.globalNumber,
      itemType: ITEM_TYPE_BY_KIND[question.kind],
      prompt: question.prompt,
      // FA/WU carry their illustration as prose in the prompt until media assets are attached
      // via the question bank editor.
      mediaReference: null,
      placeholder: question.kind === "choice" ? null : question.placeholder,
      sequence: question.localNumber,
      status: "active" as const,
    };
  });

  const rows = await db
    .insert(itemVersions)
    .values(values)
    .returning({ id: itemVersions.id, itemNumber: itemVersions.itemNumber });

  return new Map(rows.map((row) => [row.itemNumber, row.id]));
}

function itemIdFor(itemIdByNumber: Map<number, string>, question: IstQuestion): string {
  const id = itemIdByNumber.get(question.globalNumber);
  if (!id) {
    throw new Error(`Item version tidak ditemukan untuk nomor ${question.globalNumber}.`);
  }
  return id;
}

async function insertOptions(db: DbLike, itemIdByNumber: Map<number, string>): Promise<number> {
  const values = allQuestions.flatMap((question) =>
    question.kind === "choice"
      ? question.options.map((option, index) => ({
          itemVersionId: itemIdFor(itemIdByNumber, question),
          optionCode: option.id,
          label: option.label,
          sequence: index + 1,
        }))
      : [],
  );

  for (const batch of chunk(values, INSERT_BATCH_SIZE)) {
    await db.insert(itemOptions).values(batch);
  }
  return values.length;
}

async function insertTutorials(
  db: DbLike,
  subtestVersionIdByCode: Map<string, string>,
): Promise<number> {
  const values = subtests.map((subtest) => {
    const subtestVersionId = subtestVersionIdByCode.get(subtest.code);
    if (!subtestVersionId) {
      throw new Error(`Subtest version tidak ditemukan untuk kode ${subtest.code}.`);
    }

    return {
      subtestVersionId,
      version: 1,
      textContent: tutorialTextFor(subtest.tutorialSummary, subtest.examplePrompt),
      // Even FA/WU ship text-only: no video asset exists yet, and a dangling reference would fail
      // at the participant's tutorial step rather than here.
      videoReference: null,
      status: "published" as const,
    };
  });

  await db.insert(tutorialVersions).values(values);
  return values.length;
}

async function insertScoringKey(
  db: DbLike,
  formVersionId: string,
  itemIdByNumber: Map<number, string>,
): Promise<number> {
  const [keyVersion] = await db
    .insert(scoringKeyVersions)
    .values({
      formVersionId,
      version: 1,
      status: "published",
      approvedBy: DEFAULT_APPROVED_BY,
    })
    .returning({ id: scoringKeyVersions.id });
  if (!keyVersion) {
    throw new Error("Gagal membuat scoring key version.");
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
  return values.length;
}

async function insertNormSet(
  db: DbLike,
  formVersionId: string,
): Promise<{ bands: number; rows: number }> {
  const [normSet] = await db
    .insert(normSetVersions)
    .values({
      formVersionId,
      version: 1,
      populationReference: DEFAULT_POPULATION_REFERENCE,
      status: "published",
      approvedBy: DEFAULT_APPROVED_BY,
    })
    .returning({ id: normSetVersions.id });
  if (!normSet) {
    throw new Error("Gagal membuat norm set version.");
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

  const scoreRows = SEED_AGE_BANDS.flatMap((band, bandIndex) => {
    const normAgeBandId = bandIdByLabel.get(band.label);
    if (!normAgeBandId) {
      throw new Error(`Norm age band tidak ditemukan untuk label ${band.label}.`);
    }

    return subtests.flatMap((subtest) =>
      // Raw 0..maxRaw inclusive. maxRaw is NOT itemCount for GE: its rubric awards 0/1/2 per item
      // (maxScore 2), so a perfect GE is 32, not 16 — the golden harness (T28) caught a table that
      // stopped at 16 and sent every GE raw above it to needs_review.
      Array.from({ length: maxRawScoreFor(subtest) + 1 }, (_, rawScore) => ({
        normAgeBandId,
        subtestCode: subtest.code,
        rawScore,
        // Fabricated, and deliberately band-DEPENDENT: an age-band lookup test that used a
        // band-invariant table would pass even if band selection were broken entirely.
        standardScore: 80 + rawScore * 2 + bandIndex,
      })),
    );
  });

  for (const batch of chunk(scoreRows, INSERT_BATCH_SIZE)) {
    await db.insert(normScoreRows).values(batch);
  }

  return { bands: bandRows.length, rows: scoreRows.length };
}

async function seedWithin(db: DbLike, organizationName: string): Promise<SeedSummary> {
  const organizationId = await ensureOrganization(db, organizationName);

  // The idempotency guard. Inside the transaction so a concurrent seed cannot slip between the
  // check and the insert; `form_code_version_ux` is the backstop if one somehow does.
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
    throw new Error("Gagal membuat assessment form version.");
  }

  const subtestVersionIdByCode = await insertSubtestVersions(db, formVersion.id);
  const itemIdByNumber = await insertItems(db, subtestVersionIdByCode);
  const optionCount = await insertOptions(db, itemIdByNumber);
  const tutorialCount = await insertTutorials(db, subtestVersionIdByCode);
  const ruleCount = await insertScoringKey(db, formVersion.id, itemIdByNumber);
  const norms = await insertNormSet(db, formVersion.id);

  const counts: SeedCounts = {
    subtestVersions: subtestVersionIdByCode.size,
    itemVersions: itemIdByNumber.size,
    itemOptions: optionCount,
    tutorialVersions: tutorialCount,
    itemScoringRules: ruleCount,
    normAgeBands: norms.bands,
    normScoreRows: norms.rows,
  };

  await writeAudit(db, {
    organizationId,
    actorType: "system",
    actorId: "system",
    action: "seed.create",
    objectType: "assessment_form_version",
    objectId: formVersion.id,
    // Counts and codes only — no prompts, and never a rule payload: the keys are server-only (§19).
    metadata: { formCode: SEED_FORM_CODE, source: "seed", ...counts },
  });

  return { created: true, organizationId, formVersionId: formVersion.id, counts };
}

/** Reads back what is already there, so a skipped re-run still reports the real row counts. */
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

/**
 * Idempotent: re-running is a no-op that reports `created: false`, never a duplicate or a throw.
 *
 * Everything runs in ONE transaction — ~2500 rows across 9 tables. A half-written form version is
 * worse than no form version at all: it would be published, referenced by `form_code`, and missing
 * items nobody would notice until a participant hit the gap mid-test.
 */
export async function runSeed(
  db: DbLike,
  options: { organizationName?: string } = {},
): Promise<SeedSummary> {
  const organizationName = options.organizationName ?? resolveSeedOrganizationName();
  return db.transaction((tx) => seedWithin(tx, organizationName));
}

/** Total questions the seed expects to write; asserted by the integration test. */
export const EXPECTED_ITEM_COUNT = allQuestions.length;

/** GE's rubric awards up to 2 per item; every other subtest is 0/1 per item. */
export function maxRawScoreFor(subtest: { code: string; itemCount: number }): number {
  return subtest.code === "GE" ? subtest.itemCount * 2 : subtest.itemCount;
}

/** 8 bands × (8 subtests × 21 raw values + GE × 33) = 1608. */
export const EXPECTED_NORM_ROW_COUNT =
  SEED_AGE_BANDS.length *
  subtests.reduce((total, subtest) => total + maxRawScoreFor(subtest) + 1, 0);

// Guards against `questionsBySubtest` and `subtests` drifting apart: the seed writes
// `subtest_versions.item_count` from one and the items from the other, and a mismatch would make
// the participant UI's progress bar lie.
for (const subtest of subtests) {
  if (questionsBySubtest[subtest.code].length !== subtest.itemCount) {
    throw new Error(
      `Jumlah soal ${subtest.code} (${questionsBySubtest[subtest.code].length}) ` +
        `tidak cocok dengan itemCount (${subtest.itemCount}).`,
    );
  }
}
