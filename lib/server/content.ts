import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentFormVersions,
  assessmentSessions,
  itemOptions,
  itemScoringRules,
  itemVersions,
  scoringKeyVersions,
  subtestVersions,
  tutorialVersions,
} from "../db/schema.ts";
import { isRichTextEmpty, sanitizeRichText, toPlainText } from "../domain/rich-text.ts";
import { SUBTEST_CODES, type SubtestCode } from "../ist-subtests.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";

/**
 * Teks berformat dari editor HR.
 *
 * Pembersihan dilakukan di sini, bukan hanya di komponen editor. Skema ini
 * dilewati setiap jalur tulis — termasuk permintaan yang dikirim langsung ke
 * API tanpa melalui antarmuka — sehingga inilah batas keamanan yang sebenarnya.
 *
 * Batas panjang diukur pada teks tanpa tag. Kalau markup ikut dihitung, satu
 * soal pendek yang diberi penomoran dan penebalan bisa ditolak hanya karena
 * tagnya, dan pesan galatnya akan membingungkan penyuntingnya.
 */
function richTextSchema(maxPlainLength: number) {
  return z
    .string()
    .max(maxPlainLength * 8, "Teks terlalu panjang.")
    .transform(sanitizeRichText)
    .refine((value) => !isRichTextEmpty(value), "Teks tidak boleh kosong.")
    .refine(
      (value) => toPlainText(value).length <= maxPlainLength,
      `Teks maksimal ${maxPlainLength} karakter.`,
    );
}

const NOT_FOUND_MESSAGE = "Data tidak ditemukan.";
const NO_PUBLISHED_FORM_MESSAGE = "Belum ada versi form berstatus published.";

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
}

async function publishedFormId(db: DbLike): Promise<string> {
  const [form] = await db
    .select({ id: assessmentFormVersions.id })
    .from(assessmentFormVersions)
    .where(eq(assessmentFormVersions.status, "published"))
    .orderBy(desc(assessmentFormVersions.version))
    .limit(1);
  if (!form) {
    throw new ApiError("MASTER_DATA_MISSING", NO_PUBLISHED_FORM_MESSAGE, 503);
  }
  return form.id;
}

export type TutorialVersionDto = {
  id: string;
  version: number;
  status: string;
  textContent: string;
  videoReference: string | null;
  effectiveDate: string | null;
  createdAt: string;
};

export type TutorialSubtestDto = {
  subtestVersionId: string;
  code: SubtestCode;
  title: string;
  versions: readonly TutorialVersionDto[];
};

export async function listTutorials(db: DbLike): Promise<TutorialSubtestDto[]> {
  const formId = await publishedFormId(db);

  const subtests = await db
    .select({ id: subtestVersions.id, code: subtestVersions.code, title: subtestVersions.title })
    .from(subtestVersions)
    .where(eq(subtestVersions.formVersionId, formId))
    .orderBy(asc(subtestVersions.sequence));

  const rows = subtests.length
    ? await db
        .select()
        .from(tutorialVersions)
        .where(
          inArray(
            tutorialVersions.subtestVersionId,
            subtests.map((subtest) => subtest.id),
          ),
        )
        .orderBy(desc(tutorialVersions.version))
    : [];

  return subtests.map((subtest) => ({
    subtestVersionId: subtest.id,
    code: subtest.code as SubtestCode,
    title: subtest.title,
    versions: rows
      .filter((row) => row.subtestVersionId === subtest.id)
      .map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        textContent: row.textContent,
        videoReference: row.videoReference,
        effectiveDate: row.effectiveDate,
        createdAt: row.createdAt.toISOString(),
      })),
  }));
}

export const tutorialContentSchema = z.object({
  textContent: richTextSchema(10_000),
  videoReference: z.string().trim().min(1).max(500).optional(),
});

export type TutorialActionDto = {
  tutorialVersionId: string;
  subtestCode: SubtestCode;
  version: number;
  status: string;
};

type TutorialRow = {
  id: string;
  subtestVersionId: string;
  version: number;
  status: string;
  code: string;
};

async function lockTutorial(tx: DbLike, tutorialId: string): Promise<TutorialRow> {
  if (!z.uuid().safeParse(tutorialId).success) {
    throw notFound();
  }
  const [row] = await tx
    .select({
      id: tutorialVersions.id,
      subtestVersionId: tutorialVersions.subtestVersionId,
      version: tutorialVersions.version,
      status: tutorialVersions.status,
      code: subtestVersions.code,
    })
    .from(tutorialVersions)
    .innerJoin(subtestVersions, eq(tutorialVersions.subtestVersionId, subtestVersions.id))
    .where(eq(tutorialVersions.id, tutorialId))
    .for("update", { of: tutorialVersions })
    .limit(1);
  if (!row) {
    throw notFound();
  }
  return row;
}

/**
 * Menyunting tutorial langsung di tempat.
 *
 * Alur draft -> terbit -> arsip sengaja dibuang: untuk teks instruksi, ia
 * menambah tiga langkah tanpa memberi jaminan yang berarti. Statusnya tetap
 * `published` karena pembuatan sesi baru mencari tutorial berstatus itu.
 *
 * Perubahan ikut terlihat oleh sesi yang sedang berjalan. Itu memang
 * konsekuensinya, dan untuk teks instruksi justru yang diinginkan — perbaikan
 * salah ketik langsung sampai ke peserta berikutnya tanpa menunggu terbit.
 */
export async function updateTutorial(
  db: DbLike,
  ctx: AuthContext,
  tutorialId: string,
  input: unknown,
): Promise<TutorialActionDto> {
  const data = tutorialContentSchema.parse(input);

  return db.transaction(async (tx) => {
    const tutorial = await lockTutorial(tx, tutorialId);

    await tx
      .update(tutorialVersions)
      .set({
        textContent: data.textContent,
        videoReference: data.videoReference ?? null,
        status: "published",
      })
      .where(eq(tutorialVersions.id, tutorial.id));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "tutorial.updated",
      objectType: "tutorial_version",
      objectId: tutorial.id,
      metadata: { subtestCode: tutorial.code, version: tutorial.version },
    });

    return {
      tutorialVersionId: tutorial.id,
      subtestCode: tutorial.code as SubtestCode,
      version: tutorial.version,
      status: "published",
    };
  });
}

/**
 * Menghapus tutorial secara permanen, dengan dua pengaman.
 *
 * Keduanya bukan kehati-hatian berlebih — masing-masing menutup kerusakan yang
 * sudah terbukti bisa terjadi di sistem ini:
 *
 * 1. Sesi menyimpan id tutorial di `pinned_tutorial_versions`. Menghapus baris
 *    yang sedang dipakai membuat layar tutorial peserta kosong di tengah tes,
 *    dan barisnya tidak bisa dikembalikan.
 * 2. Pembuatan sesi baru menolak jalan bila ada subtes tanpa tutorial terbit —
 *    itulah galat `MASTER_DATA_MISSING`. Menghapus yang terakhir untuk satu
 *    subtes akan mematikan pembuatan sesi untuk seluruh organisasi.
 */
export async function deleteTutorial(
  db: DbLike,
  ctx: AuthContext,
  tutorialId: string,
): Promise<{ tutorialVersionId: string; subtestCode: SubtestCode }> {
  return db.transaction(async (tx) => {
    const tutorial = await lockTutorial(tx, tutorialId);

    const [used] = await tx
      .select({ total: count() })
      .from(assessmentSessions)
      .where(
        sql`${assessmentSessions.pinnedTutorialVersions}::jsonb @> ${JSON.stringify({
          [tutorial.code]: tutorial.id,
        })}::jsonb`,
      );
    if ((used?.total ?? 0) > 0) {
      throw new ApiError(
        "TUTORIAL_IN_USE",
        `Tutorial ini dipakai ${used?.total} sesi yang sudah dibuat. Sunting isinya, jangan dihapus.`,
        409,
      );
    }

    const [remaining] = await tx
      .select({ total: count() })
      .from(tutorialVersions)
      .where(
        and(
          eq(tutorialVersions.subtestVersionId, tutorial.subtestVersionId),
          eq(tutorialVersions.status, "published"),
          ne(tutorialVersions.id, tutorial.id),
        ),
      );
    if ((remaining?.total ?? 0) === 0) {
      throw new ApiError(
        "LAST_TUTORIAL",
        `Ini satu-satunya tutorial untuk subtes ${tutorial.code}. Menghapusnya membuat sesi baru gagal dibuat.`,
        409,
      );
    }

    await tx.delete(tutorialVersions).where(eq(tutorialVersions.id, tutorial.id));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "tutorial.deleted",
      objectType: "tutorial_version",
      objectId: tutorial.id,
      metadata: { subtestCode: tutorial.code, version: tutorial.version },
    });

    return { tutorialVersionId: tutorial.id, subtestCode: tutorial.code as SubtestCode };
  });
}

export type QuestionBankItemDto = {
  itemVersionId: string;
  itemNumber: number;
  localNumber: number;
  itemType: string;
  prompt: string;
  placeholder: string | null;
  mediaReference: string | null;
  status: string;
  options: readonly { optionCode: string; label: string }[];
};

export type QuestionBankSubtestDto = {
  code: SubtestCode;
  title: string;
  itemCount: number;
  items: readonly QuestionBankItemDto[];
};

export async function listQuestionBank(db: DbLike): Promise<QuestionBankSubtestDto[]> {
  const formId = await publishedFormId(db);

  const subtests = await db
    .select({
      id: subtestVersions.id,
      code: subtestVersions.code,
      title: subtestVersions.title,
      itemCount: subtestVersions.itemCount,
    })
    .from(subtestVersions)
    .where(eq(subtestVersions.formVersionId, formId))
    .orderBy(asc(subtestVersions.sequence));
  const subtestIds = subtests.map((subtest) => subtest.id);

  const items = subtestIds.length
    ? await db
        .select()
        .from(itemVersions)
        .where(inArray(itemVersions.subtestVersionId, subtestIds))
        .orderBy(asc(itemVersions.sequence))
    : [];
  const options = items.length
    ? await db
        .select()
        .from(itemOptions)
        .where(
          inArray(
            itemOptions.itemVersionId,
            items.map((item) => item.id),
          ),
        )
        .orderBy(asc(itemOptions.sequence))
    : [];

  return subtests.map((subtest) => ({
    code: subtest.code as SubtestCode,
    title: subtest.title,
    itemCount: subtest.itemCount,
    items: items
      .filter((item) => item.subtestVersionId === subtest.id)
      .map((item) => ({
        itemVersionId: item.id,
        itemNumber: item.itemNumber,
        localNumber: item.sequence,
        itemType: item.itemType,
        prompt: item.prompt,
        placeholder: item.placeholder,
        mediaReference: item.mediaReference,
        status: item.status,
        options: options
          .filter((option) => option.itemVersionId === item.id)
          .map((option) => ({ optionCode: option.optionCode, label: option.label })),
      })),
  }));
}

async function publishedScoringKeyId(db: DbLike): Promise<string> {
  const formId = await publishedFormId(db);
  const [key] = await db
    .select({ id: scoringKeyVersions.id })
    .from(scoringKeyVersions)
    .where(
      and(eq(scoringKeyVersions.formVersionId, formId), eq(scoringKeyVersions.status, "published")),
    )
    .orderBy(desc(scoringKeyVersions.version))
    .limit(1);
  if (!key) {
    throw new ApiError("MASTER_DATA_MISSING", "Belum ada kunci skoring berstatus published.", 503);
  }
  return key.id;
}

export type ItemAnswerKeyDto = {
  itemVersionId: string;
  ruleType: string;
  correctOptionCodes: readonly string[] | null;
  acceptedValues: readonly string[] | null;
  geKeywords: {
    readonly score2: readonly string[];
    readonly score1: readonly string[];
    readonly score0: readonly string[];
    readonly matchMode: "token" | "contains" | "exact";
  } | null;
};

export async function getItemAnswerKey(
  db: DbLike,
  ctx: AuthContext,
  itemId: string,
): Promise<ItemAnswerKeyDto> {
  void ctx;
  if (!z.uuid().safeParse(itemId).success) {
    throw notFound();
  }
  const keyId = await publishedScoringKeyId(db);
  const [rule] = await db
    .select({ ruleType: itemScoringRules.ruleType, rulePayload: itemScoringRules.rulePayload })
    .from(itemScoringRules)
    .where(
      and(eq(itemScoringRules.itemVersionId, itemId), eq(itemScoringRules.scoringKeyVersionId, keyId)),
    )
    .limit(1);
  if (!rule) {
    throw notFound();
  }

  const payload = (rule.rulePayload ?? {}) as {
    correctOptionCodes?: string[];
    acceptedValues?: string[];
    autoScore?: boolean;
    keywords?: { score2?: string[]; score1?: string[]; score0?: string[] };
    matchMode?: "token" | "contains" | "exact";
  };
  return {
    itemVersionId: itemId,
    ruleType: rule.ruleType,
    correctOptionCodes: rule.ruleType === "option_match" ? (payload.correctOptionCodes ?? []) : null,
    acceptedValues: rule.ruleType === "numeric_match" ? (payload.acceptedValues ?? []) : null,
    geKeywords:
      rule.ruleType === "manual_ge" && payload.autoScore === true && payload.keywords
        ? {
            score2: payload.keywords.score2 ?? [],
            score1: payload.keywords.score1 ?? [],
            score0: payload.keywords.score0 ?? [],
            matchMode: payload.matchMode ?? "token",
          }
        : null,
  };
}

const optionInputSchema = z.object({
  optionCode: z.string().trim().min(1).max(10),
  label: z.string().trim().min(1).max(500),
});

const itemContentSchema = z.object({
  prompt: richTextSchema(2000),
  placeholder: z.string().trim().min(1).max(200).optional(),
  mediaReference: z.string().trim().min(1).max(500).nullable().optional(),
});

const keywordListSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(50)
  .default([])
  .transform((list) => Array.from(new Set(list.map((entry) => entry.trim()).filter(Boolean))));

const geKeywordsSchema = z.object({
  score2: keywordListSchema,
  score1: keywordListSchema,
  score0: keywordListSchema,
  matchMode: z.enum(["token", "contains", "exact"]).optional(),
});

export type GeKeywordsInput = z.infer<typeof geKeywordsSchema>;

const GE_MANUAL_RUBRIC = "Dinilai manual oleh HR.";

function buildGePayload(input: GeKeywordsInput | undefined): Record<string, unknown> {
  if (!input) {
    return { rubric: GE_MANUAL_RUBRIC };
  }
  return {
    autoScore: true,
    matchMode: input.matchMode ?? "token",
    keywords: {
      score2: input.score2,
      score1: input.score1,
      score0: input.score0,
    },
  };
}

export const updateItemSchema = itemContentSchema.extend({
  options: z.array(optionInputSchema).max(10).optional(),
  correctOptionCodes: z.array(z.string().trim().min(1).max(10)).min(1).max(5).optional(),
  acceptedValues: z.array(z.string().trim().min(1).max(64)).min(1).max(10).optional(),
  geKeywords: geKeywordsSchema.optional(),
});

export type UpdateItemDto = { itemVersionId: string; itemNumber: number };

export const createItemSchema = itemContentSchema
  .extend({
    subtestCode: z.enum(SUBTEST_CODES),
    itemType: z.enum(["choice", "numeric", "short_text"]),
    options: z.array(optionInputSchema).max(10).optional(),
    correctOptionCodes: z.array(z.string().trim().min(1).max(10)).min(1).max(5).optional(),
    acceptedValues: z.array(z.string().trim().min(1).max(64)).min(1).max(10).optional(),
    geKeywords: geKeywordsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.itemType === "choice") {
      if (!data.options || data.options.length < 2) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "Soal pilihan minimal memiliki 2 opsi." });
      }
      if (!data.correctOptionCodes?.length) {
        ctx.addIssue({ code: "custom", path: ["correctOptionCodes"], message: "Kunci pilihan wajib diisi." });
      }
      const codes = new Set(data.options?.map((option) => option.optionCode) ?? []);
      if (codes.size !== (data.options?.length ?? 0)) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "Kode opsi tidak boleh duplikat." });
      }
      for (const code of data.correctOptionCodes ?? []) {
        if (!codes.has(code)) {
          ctx.addIssue({ code: "custom", path: ["correctOptionCodes"], message: `Kode opsi ${code} tidak ada.` });
        }
      }
      return;
    }
    if (data.itemType === "numeric" && !data.acceptedValues?.length) {
      ctx.addIssue({ code: "custom", path: ["acceptedValues"], message: "Kunci angka wajib diisi." });
    }
    if (data.options?.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Opsi hanya untuk soal pilihan." });
    }
    if (data.itemType !== "short_text" && data.geKeywords) {
      ctx.addIssue({
        code: "custom",
        path: ["geKeywords"],
        message: "Kunci kata kunci hanya untuk soal GE (jawaban singkat).",
      });
    }
    if (data.itemType === "short_text") {
      if (data.correctOptionCodes?.length) {
        ctx.addIssue({
          code: "custom",
          path: ["correctOptionCodes"],
          message: "Soal GE tidak memakai kunci opsi.",
        });
      }
      if (data.acceptedValues?.length) {
        ctx.addIssue({
          code: "custom",
          path: ["acceptedValues"],
          message: "Soal GE tidak memakai kunci angka.",
        });
      }
      if (data.geKeywords) {
        const hasAny =
          data.geKeywords.score2.length > 0 ||
          data.geKeywords.score1.length > 0 ||
          data.geKeywords.score0.length > 0;
        if (!hasAny) {
          ctx.addIssue({
            code: "custom",
            path: ["geKeywords"],
            message: "Isi minimal satu kata kunci pada salah satu tingkat skor.",
          });
        }
      }
    }
  });

export async function createQuestionItem(
  db: DbLike,
  ctx: AuthContext,
  input: unknown,
): Promise<UpdateItemDto> {
  const data = createItemSchema.parse(input);

  return db.transaction(async (tx) => {
    const formId = await publishedFormId(tx);
    const [subtest] = await tx
      .select({ id: subtestVersions.id, itemCount: subtestVersions.itemCount })
      .from(subtestVersions)
      .where(
        and(eq(subtestVersions.formVersionId, formId), eq(subtestVersions.code, data.subtestCode)),
      )
      .for("update")
      .limit(1);
    if (!subtest) {
      throw notFound();
    }

    const [latestInSubtest] = await tx
      .select({ itemNumber: itemVersions.itemNumber, sequence: itemVersions.sequence })
      .from(itemVersions)
      .where(eq(itemVersions.subtestVersionId, subtest.id))
      .orderBy(desc(itemVersions.sequence))
      .limit(1);
    const [latestGlobal] = await tx
      .select({ itemNumber: itemVersions.itemNumber })
      .from(itemVersions)
      .orderBy(desc(itemVersions.itemNumber))
      .limit(1);
    const itemNumber = Math.max(latestGlobal?.itemNumber ?? 0, latestInSubtest?.itemNumber ?? 0) + 1;
    const sequence = (latestInSubtest?.sequence ?? 0) + 1;

    const [item] = await tx
      .insert(itemVersions)
      .values({
        subtestVersionId: subtest.id,
        itemNumber,
        itemType: data.itemType,
        prompt: data.prompt,
        placeholder: data.placeholder ?? null,
        mediaReference: data.mediaReference ?? null,
        sequence,
        status: "active",
      })
      .returning({ id: itemVersions.id });
    if (!item) {
      throw new Error("Soal gagal dibuat.");
    }

    if (data.itemType === "choice") {
      await tx.insert(itemOptions).values(
        (data.options ?? []).map((option, index) => ({
          itemVersionId: item.id,
          optionCode: option.optionCode,
          label: option.label,
          sequence: index + 1,
        })),
      );
    }

    const keyId = await publishedScoringKeyId(tx);
    await tx.insert(itemScoringRules).values({
      scoringKeyVersionId: keyId,
      itemVersionId: item.id,
      ruleType:
        data.itemType === "choice"
          ? "option_match"
          : data.itemType === "numeric"
            ? "numeric_match"
            : "manual_ge",
      rulePayload:
        data.itemType === "choice"
          ? { correctOptionCodes: data.correctOptionCodes ?? [] }
          : data.itemType === "numeric"
            ? { acceptedValues: data.acceptedValues ?? [] }
            : buildGePayload(data.geKeywords),
      maxScore: data.itemType === "short_text" ? 2 : 1,
    });

    await tx
      .update(subtestVersions)
      .set({ itemCount: subtest.itemCount + 1 })
      .where(eq(subtestVersions.id, subtest.id));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "item.created",
      objectType: "item_version",
      objectId: item.id,
      metadata: { itemNumber, subtestCode: data.subtestCode, itemType: data.itemType },
    });

    return { itemVersionId: item.id, itemNumber };
  });
}

export async function updateQuestionItem(
  db: DbLike,
  ctx: AuthContext,
  itemId: string,
  input: unknown,
): Promise<UpdateItemDto> {
  const data = updateItemSchema.parse(input);
  if (!z.uuid().safeParse(itemId).success) {
    throw notFound();
  }

  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: itemVersions.id, itemNumber: itemVersions.itemNumber })
      .from(itemVersions)
      .where(eq(itemVersions.id, itemId))
      .for("update")
      .limit(1);
    if (!item) {
      throw notFound();
    }

    await tx
      .update(itemVersions)
      .set({
        prompt: data.prompt,
        placeholder: data.placeholder ?? null,
        ...(data.mediaReference !== undefined ? { mediaReference: data.mediaReference } : {}),
      })
      .where(eq(itemVersions.id, item.id));

    if (data.options) {
      const existing = await tx
        .select({ optionCode: itemOptions.optionCode })
        .from(itemOptions)
        .where(eq(itemOptions.itemVersionId, item.id));
      const validCodes = new Set(existing.map((option) => option.optionCode));
      for (const option of data.options) {
        if (!validCodes.has(option.optionCode)) {
          throw new ApiError(
            "INVALID_OPTION_CODE",
            `Kode opsi ${option.optionCode} tidak ada pada soal ini.`,
            422,
          );
        }
        await tx
          .update(itemOptions)
          .set({ label: option.label })
          .where(
            and(
              eq(itemOptions.itemVersionId, item.id),
              eq(itemOptions.optionCode, option.optionCode),
            ),
          );
      }
    }

    let keyUpdated = false;
    if (data.correctOptionCodes || data.acceptedValues || data.geKeywords) {
      const keyId = await publishedScoringKeyId(tx);
      const [rule] = await tx
        .select({ id: itemScoringRules.id, ruleType: itemScoringRules.ruleType })
        .from(itemScoringRules)
        .where(
          and(
            eq(itemScoringRules.itemVersionId, item.id),
            eq(itemScoringRules.scoringKeyVersionId, keyId),
          ),
        )
        .for("update")
        .limit(1);
      if (!rule) {
        throw notFound();
      }

      if (rule.ruleType === "option_match") {
        if (!data.correctOptionCodes) {
          throw new ApiError(
            "INVALID_ANSWER_KEY",
            "Soal pilihan memakai kunci berupa kode opsi (correctOptionCodes).",
            422,
          );
        }
        const existing = await tx
          .select({ optionCode: itemOptions.optionCode })
          .from(itemOptions)
          .where(eq(itemOptions.itemVersionId, item.id));
        const validCodes = new Set(existing.map((option) => option.optionCode));
        for (const code of data.correctOptionCodes) {
          if (!validCodes.has(code)) {
            throw new ApiError(
              "INVALID_OPTION_CODE",
              `Kode opsi ${code} tidak ada pada soal ini.`,
              422,
            );
          }
        }
        await tx
          .update(itemScoringRules)
          .set({ rulePayload: { correctOptionCodes: data.correctOptionCodes } })
          .where(eq(itemScoringRules.id, rule.id));
      } else if (rule.ruleType === "numeric_match") {
        if (!data.acceptedValues) {
          throw new ApiError(
            "INVALID_ANSWER_KEY",
            "Soal angka memakai kunci berupa varian nilai (acceptedValues).",
            422,
          );
        }
        await tx
          .update(itemScoringRules)
          .set({ rulePayload: { acceptedValues: data.acceptedValues.map((value) => value.trim()) } })
          .where(eq(itemScoringRules.id, rule.id));
      } else {
        if (data.correctOptionCodes || data.acceptedValues) {
          throw new ApiError(
            "INVALID_ANSWER_KEY",
            "Soal GE memakai kunci berupa daftar kata (geKeywords).",
            422,
          );
        }
        if (!data.geKeywords) {
          throw new ApiError(
            "INVALID_ANSWER_KEY",
            "Kunci soal GE (geKeywords) wajib diisi untuk memperbarui kunci.",
            422,
          );
        }
        const hasAny =
          data.geKeywords.score2.length > 0 ||
          data.geKeywords.score1.length > 0 ||
          data.geKeywords.score0.length > 0;
        if (!hasAny) {
          throw new ApiError(
            "INVALID_ANSWER_KEY",
            "Isi minimal satu kata kunci pada salah satu tingkat skor.",
            422,
          );
        }
        await tx
          .update(itemScoringRules)
          .set({ rulePayload: buildGePayload(data.geKeywords) })
          .where(eq(itemScoringRules.id, rule.id));
      }
      keyUpdated = true;
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "item.updated",
      objectType: "item_version",
      objectId: item.id,
      metadata: {
        itemNumber: item.itemNumber,
        optionsUpdated: data.options?.length ?? 0,
        keyUpdated,
      },
    });

    return { itemVersionId: item.id, itemNumber: item.itemNumber };
  });
}

export const itemStatusSchema = z.object({ status: z.enum(["active", "inactive"]) });

export async function setQuestionItemStatus(
  db: DbLike,
  ctx: AuthContext,
  itemId: string,
  input: unknown,
): Promise<UpdateItemDto> {
  const data = itemStatusSchema.parse(input);
  if (!z.uuid().safeParse(itemId).success) {
    throw notFound();
  }

  return db.transaction(async (tx) => {
    const [item] = await tx
      .update(itemVersions)
      .set({ status: data.status })
      .where(eq(itemVersions.id, itemId))
      .returning({ id: itemVersions.id, itemNumber: itemVersions.itemNumber });
    if (!item) {
      throw notFound();
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "item.status_changed",
      objectType: "item_version",
      objectId: item.id,
      metadata: { itemNumber: item.itemNumber, status: data.status },
    });

    return { itemVersionId: item.id, itemNumber: item.itemNumber };
  });
}
