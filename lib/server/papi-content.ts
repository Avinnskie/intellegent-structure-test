import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import {
  assessmentSessions,
  papiAttempts,
  papiFormVersions,
  papiItemVersions,
} from "../db/schema.ts";
import { PAPI_FACTORS } from "../domain/official-papi.ts";
import { describePapiKeyViolation, validatePapiKey } from "../domain/papi-key-validation.ts";
import { PAPI_FACTOR_CODES, type PapiFactorCode } from "../papi-factors.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";

const NOT_FOUND = "Soal PAPI tidak ditemukan.";
const NO_FORM = "Belum ada form PAPI. Jalankan `npm run db:seed` terlebih dahulu.";
const ATTEMPT_RUNNING =
  "Ada peserta yang sedang mengerjakan PAPI. Soal tidak dapat diubah sampai pengerjaan selesai.";

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", NOT_FOUND, 404);
}

export type PapiBankItemDto = {
  readonly id: string;
  readonly itemNumber: number;
  readonly optionAText: string;
  readonly optionAFactor: string;
  readonly optionBText: string;
  readonly optionBFactor: string;
};

export type PapiFactorLegendDto = {
  readonly code: PapiFactorCode;
  readonly name: string;
  readonly group: string;
  readonly kind: "role" | "need";
  readonly occurrences: number;
};

export type PapiQuestionBankDto = {
  readonly formVersionId: string | null;
  readonly title: string;
  readonly version: number;
  readonly engineVersion: string;
  readonly itemCount: number;
  readonly sessionsUsing: number;
  /** Peserta yang sedang mengerjakan; selama > 0 soal dikunci. */
  readonly attemptsInProgress: number;
  readonly editable: boolean;
  readonly lockedReason: string | null;
  readonly items: readonly PapiBankItemDto[];
  readonly legend: readonly PapiFactorLegendDto[];
  readonly keyValid: boolean;
  readonly keyProblems: readonly string[];
};

async function loadItems(db: DbLike, formVersionId: string): Promise<PapiBankItemDto[]> {
  return db
    .select({
      id: papiItemVersions.id,
      itemNumber: papiItemVersions.itemNumber,
      optionAText: papiItemVersions.optionAText,
      optionAFactor: papiItemVersions.optionAFactor,
      optionBText: papiItemVersions.optionBText,
      optionBFactor: papiItemVersions.optionBFactor,
    })
    .from(papiItemVersions)
    .where(eq(papiItemVersions.papiFormVersionId, formVersionId))
    .orderBy(asc(papiItemVersions.itemNumber));
}

/**
 * Berapa peserta yang sedang membuka PAPI pada form ini.
 *
 * Teks item dibaca langsung dari tabel ini oleh `getPapiState`, jadi menyunting
 * saat ada attempt berjalan akan mengganti pertanyaan di tengah pengerjaan.
 * Sesi yang sudah selesai tidak masalah: jawabannya sudah tersimpan sebagai
 * huruf faktor, dan hasilnya sudah dibekukan di `papi_results`.
 */
async function countAttemptsInProgress(db: DbLike, formVersionId: string): Promise<number> {
  const rows = await db
    .select({ id: papiAttempts.id })
    .from(papiAttempts)
    .where(
      and(
        eq(papiAttempts.papiFormVersionId, formVersionId),
        eq(papiAttempts.status, "in_progress"),
      ),
    );
  return rows.length;
}

async function countSessionsUsing(db: DbLike, formVersionId: string): Promise<number> {
  const rows = await db
    .select({ id: assessmentSessions.id })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.papiFormVersionId, formVersionId));
  return rows.length;
}

async function activeForm(db: DbLike) {
  const [row] = await db
    .select({
      id: papiFormVersions.id,
      title: papiFormVersions.title,
      version: papiFormVersions.version,
      engineVersion: papiFormVersions.engineVersion,
      itemCount: papiFormVersions.itemCount,
    })
    .from(papiFormVersions)
    .where(eq(papiFormVersions.status, "published"))
    .orderBy(desc(papiFormVersions.version))
    .limit(1);

  return row ?? null;
}

export async function listPapiQuestionBank(db: DbLike): Promise<PapiQuestionBankDto> {
  const form = await activeForm(db);

  if (!form) {
    return {
      formVersionId: null,
      title: "",
      version: 0,
      engineVersion: "",
      itemCount: 0,
      sessionsUsing: 0,
      attemptsInProgress: 0,
      editable: false,
      lockedReason: NO_FORM,
      items: [],
      legend: [],
      keyValid: false,
      keyProblems: [NO_FORM],
    };
  }

  const items = await loadItems(db, form.id);
  const validation = validatePapiKey(items);
  const attemptsInProgress = await countAttemptsInProgress(db, form.id);

  return {
    formVersionId: form.id,
    title: form.title,
    version: form.version,
    engineVersion: form.engineVersion,
    itemCount: form.itemCount,
    sessionsUsing: await countSessionsUsing(db, form.id),
    attemptsInProgress,
    editable: attemptsInProgress === 0,
    lockedReason: attemptsInProgress > 0 ? ATTEMPT_RUNNING : null,
    items,
    legend: PAPI_FACTORS.map((factor) => ({
      code: factor.code,
      name: factor.name,
      group: factor.group,
      kind: factor.kind,
      occurrences: validation.frequencies[factor.code],
    })),
    keyValid: validation.valid,
    keyProblems: validation.violations.map(describePapiKeyViolation),
  };
}

export const updatePapiItemSchema = z.object({
  optionAText: z.string().trim().min(1).max(500),
  optionAFactor: z.enum(PAPI_FACTOR_CODES),
  optionBText: z.string().trim().min(1).max(500),
  optionBFactor: z.enum(PAPI_FACTOR_CODES),
});

export type UpdatePapiItemDto = {
  readonly itemId: string;
  readonly itemNumber: number;
  readonly keyValid: boolean;
  readonly keyProblems: readonly string[];
  readonly legend: readonly PapiFactorLegendDto[];
};

/**
 * Menyunting satu nomor pada bank soal yang sedang dipakai.
 *
 * Kunci divalidasi utuh setiap penyimpanan, bukan per baris: satu huruf yang
 * salah membuat skor faktor bisa melampaui 9 dan baru ketahuan jauh kemudian.
 * Penyimpanan tetap diterima meski kunci sementara tidak sah — HR memang perlu
 * beberapa langkah untuk menukar sepasang huruf — tetapi masalahnya dilaporkan
 * seketika, dan skoring menolak lembar yang kuncinya rusak.
 */
export async function updatePapiItem(
  db: DbLike,
  ctx: AuthContext,
  itemId: string,
  input: unknown,
): Promise<UpdatePapiItemDto> {
  const data = updatePapiItemSchema.parse(input);
  if (!z.uuid().safeParse(itemId).success) {
    throw notFound();
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: papiItemVersions.id,
        itemNumber: papiItemVersions.itemNumber,
        formVersionId: papiItemVersions.papiFormVersionId,
        optionAText: papiItemVersions.optionAText,
        optionAFactor: papiItemVersions.optionAFactor,
        optionBText: papiItemVersions.optionBText,
        optionBFactor: papiItemVersions.optionBFactor,
      })
      .from(papiItemVersions)
      .where(eq(papiItemVersions.id, itemId))
      .limit(1);

    if (!row) {
      throw notFound();
    }

    if ((await countAttemptsInProgress(tx, row.formVersionId)) > 0) {
      throw new ApiError("PAPI_ATTEMPT_RUNNING", ATTEMPT_RUNNING, 409);
    }

    await tx
      .update(papiItemVersions)
      .set({
        optionAText: data.optionAText,
        optionAFactor: data.optionAFactor,
        optionBText: data.optionBText,
        optionBFactor: data.optionBFactor,
      })
      .where(eq(papiItemVersions.id, itemId));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "papi_item.updated",
      objectType: "papi_item_version",
      objectId: itemId,
      metadata: {
        itemNumber: row.itemNumber,
        // Nilai sebelum dan sesudah dicatat agar perubahan kunci dapat ditelusuri.
        before: {
          optionAText: row.optionAText,
          optionAFactor: row.optionAFactor,
          optionBText: row.optionBText,
          optionBFactor: row.optionBFactor,
        },
        after: data,
      },
    });

    const items = await loadItems(tx, row.formVersionId);
    const validation = validatePapiKey(items);

    return {
      itemId,
      itemNumber: row.itemNumber,
      keyValid: validation.valid,
      keyProblems: validation.violations.map(describePapiKeyViolation),
      legend: PAPI_FACTORS.map((factor) => ({
        code: factor.code,
        name: factor.name,
        group: factor.group,
        kind: factor.kind,
        occurrences: validation.frequencies[factor.code],
      })),
    };
  });
}
