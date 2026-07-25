import type { DbLike } from "../db/client.ts";
import { itemOptions, itemVersions, subtestVersions, tutorialVersions } from "../db/schema.ts";
import { allQuestions, type IstQuestion } from "../ist-questions.ts";
import { subtests } from "../ist-subtests.ts";

const INSERT_BATCH_SIZE = 500;
const SECONDS_PER_MINUTE = 60;

const ITEM_TYPE_BY_KIND = {
  choice: "choice",
  "short-text": "short_text",
  numeric: "numeric",
} as const satisfies Record<IstQuestion["kind"], (typeof itemVersions.$inferInsert)["itemType"]>;

export type SeedContent = {
  readonly subtestVersionIdByCode: ReadonlyMap<string, string>;
  readonly itemIdByNumber: ReadonlyMap<number, string>;
  readonly optionCount: number;
  readonly tutorialCount: number;
};

class SeedContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedContentError";
  }
}

function chunk<T>(rows: readonly T[], size: number): readonly T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }
  return batches;
}

async function insertSubtestVersions(
  db: DbLike,
  formVersionId: string,
): Promise<ReadonlyMap<string, string>> {
  const rows = await db
    .insert(subtestVersions)
    .values(
      subtests.map((subtest, index) => ({
        formVersionId,
        code: subtest.code,
        sequence: index + 1,
        title: subtest.title,
        durationSeconds: subtest.durationMinutes * SECONDS_PER_MINUTE,
        itemCount: subtest.itemCount,
      })),
    )
    .returning({ id: subtestVersions.id, code: subtestVersions.code });
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function insertItems(
  db: DbLike,
  subtestVersionIdByCode: ReadonlyMap<string, string>,
): Promise<ReadonlyMap<number, string>> {
  const values = allQuestions.map((question) => {
    const subtestVersionId = subtestVersionIdByCode.get(question.subtestCode);
    if (!subtestVersionId) {
      throw new SeedContentError(
        `Subtest version tidak ditemukan untuk kode ${question.subtestCode}.`,
      );
    }
    return {
      subtestVersionId,
      itemNumber: question.globalNumber,
      itemType: ITEM_TYPE_BY_KIND[question.kind],
      prompt: question.prompt,
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

function itemIdFor(itemIdByNumber: ReadonlyMap<number, string>, question: IstQuestion): string {
  const id = itemIdByNumber.get(question.globalNumber);
  if (!id) {
    throw new SeedContentError(
      `Item version tidak ditemukan untuk nomor ${question.globalNumber}.`,
    );
  }
  return id;
}

async function insertOptions(
  db: DbLike,
  itemIdByNumber: ReadonlyMap<number, string>,
): Promise<number> {
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
  subtestVersionIdByCode: ReadonlyMap<string, string>,
): Promise<number> {
  const values = subtests.map((subtest) => {
    const subtestVersionId = subtestVersionIdByCode.get(subtest.code);
    if (!subtestVersionId) {
      throw new SeedContentError(`Subtest version tidak ditemukan untuk kode ${subtest.code}.`);
    }
    return {
      subtestVersionId,
      version: 1,
      textContent: `${subtest.tutorialSummary}\n\n${subtest.examplePrompt}`,
      videoReference: null,
      status: "published" as const,
    };
  });
  await db.insert(tutorialVersions).values(values);
  return values.length;
}

export async function insertSeedContent(db: DbLike, formVersionId: string): Promise<SeedContent> {
  const subtestVersionIdByCode = await insertSubtestVersions(db, formVersionId);
  const itemIdByNumber = await insertItems(db, subtestVersionIdByCode);
  const optionCount = await insertOptions(db, itemIdByNumber);
  const tutorialCount = await insertTutorials(db, subtestVersionIdByCode);
  return { subtestVersionIdByCode, itemIdByNumber, optionCount, tutorialCount };
}
