import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import { papiFormVersions, papiItemVersions } from "../db/schema.ts";
import { PAPI_ENGINE_VERSION, PAPI_ITEMS, PAPI_SOURCE } from "../domain/official-papi.ts";
import { PAPI_ITEM_COUNT } from "../papi-factors.ts";

export const PAPI_FORM_CODE = "PAPI-KOSTICK-ID";
export const PAPI_FORM_TITLE = "PAPI Kostick — Kuesioner Kepribadian";

export type SeedPapiSummary = {
  readonly created: boolean;
  readonly papiFormVersionId: string;
  readonly itemCount: number;
  readonly checksum: string;
};

class SeedPapiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedPapiError";
  }
}

/**
 * Sidik jari isi form. Perubahan teks item atau kunci mengubah checksum,
 * sehingga versi form lama tetap dapat dibedakan dari versi baru.
 */
export function papiFormChecksum(): string {
  const payload = PAPI_ITEMS.map(
    (item) =>
      `${item.number}|${item.optionA.factor}|${item.optionA.text}|${item.optionB.factor}|${item.optionB.text}`,
  ).join("\n");

  return createHash("sha256").update(`${PAPI_ENGINE_VERSION}\n${payload}`).digest("hex");
}

async function seedPapiWithin(db: DbLike): Promise<SeedPapiSummary> {
  if (PAPI_ITEMS.length !== PAPI_ITEM_COUNT) {
    throw new SeedPapiError(
      `Jumlah item PAPI (${PAPI_ITEMS.length}) tidak cocok dengan ${PAPI_ITEM_COUNT}.`,
    );
  }

  const checksum = papiFormChecksum();

  const [existing] = await db
    .select({ id: papiFormVersions.id, checksum: papiFormVersions.checksum })
    .from(papiFormVersions)
    .where(eq(papiFormVersions.formCode, PAPI_FORM_CODE))
    .limit(1);

  if (existing) {
    return {
      created: false,
      papiFormVersionId: existing.id,
      itemCount: PAPI_ITEM_COUNT,
      checksum: existing.checksum ?? checksum,
    };
  }

  const [formVersion] = await db
    .insert(papiFormVersions)
    .values({
      formCode: PAPI_FORM_CODE,
      version: 1,
      title: PAPI_FORM_TITLE,
      itemCount: PAPI_ITEM_COUNT,
      engineVersion: PAPI_ENGINE_VERSION,
      status: "published",
      approvedBy: PAPI_SOURCE.workbook,
      checksum,
    })
    .returning({ id: papiFormVersions.id });

  if (!formVersion) {
    throw new SeedPapiError("Gagal membuat papi form version.");
  }

  await db.insert(papiItemVersions).values(
    PAPI_ITEMS.map((item) => ({
      papiFormVersionId: formVersion.id,
      itemNumber: item.number,
      optionAText: item.optionA.text,
      optionAFactor: item.optionA.factor,
      optionBText: item.optionB.text,
      optionBFactor: item.optionB.factor,
    })),
  );

  return {
    created: true,
    papiFormVersionId: formVersion.id,
    itemCount: PAPI_ITEM_COUNT,
    checksum,
  };
}

export async function seedPapiForm(db: DbLike): Promise<SeedPapiSummary> {
  return db.transaction((tx) => seedPapiWithin(tx));
}

export async function insertSeedPapi(db: DbLike): Promise<SeedPapiSummary> {
  return seedPapiWithin(db);
}
