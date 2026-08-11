import { count, isNotNull } from "drizzle-orm";
import { getDb } from "../lib/db/client.ts";
import {
  accessCodes,
  assessmentResults,
  assessmentSessions,
  auditLogs,
  candidates,
  itemScores,
  papiAttempts,
  papiAttemptSegments,
  papiFactorScores,
  papiResponses,
  papiResults,
  participantTokens,
  reports,
  responses,
  subtestAttempts,
  subtestScores,
} from "../lib/db/schema.ts";

/**
 * Menghapus data pengerjaan lama tanpa menyentuh bank soal.
 *
 * `db:unseed` TIDAK cocok untuk ini: ia ikut menghapus `item_versions`,
 * `item_options`, `tutorial_versions`, dan `item_scoring_rules`.
 *
 * Tabel yang TIDAK PERNAH disentuh skrip ini:
 *   assessment_form_versions, subtest_versions, item_versions, item_options,
 *   tutorial_versions, scoring_key_versions, item_scoring_rules,
 *   norm_set_versions, norm_age_bands, norm_score_rows,
 *   papi_form_versions, papi_item_versions, organizations, users
 *
 * Jalankan tanpa argumen untuk melihat hitungan saja (tidak menghapus apa pun).
 */

type PurgeTable = Parameters<ReturnType<typeof getDb>["delete"]>[0];

type PurgeEntry = { readonly name: string; readonly table: PurgeTable };

type Flags = {
  readonly execute: boolean;
  readonly includeCandidates: boolean;
  readonly includeAudit: boolean;
};

function parseFlags(argv: readonly string[]): Flags {
  return {
    execute: argv.includes("--yes"),
    includeCandidates: argv.includes("--with-candidates"),
    includeAudit: argv.includes("--with-audit"),
  };
}

/**
 * Urutan penting: anak dihapus sebelum induk. Dua tabel punya referensi ke
 * dirinya sendiri (`superseded_by_id`, `regenerated_from_id`) sehingga harus
 * dikosongkan lebih dulu, kalau tidak penghapusan ditolak foreign key.
 */
const PURGE_ORDER = [
  { name: "reports", table: reports },
  { name: "subtest_scores", table: subtestScores },
  { name: "assessment_results", table: assessmentResults },
  { name: "item_scores", table: itemScores },
  { name: "responses", table: responses },
  { name: "subtest_attempts", table: subtestAttempts },
  { name: "papi_factor_scores", table: papiFactorScores },
  { name: "papi_results", table: papiResults },
  { name: "papi_attempt_segments", table: papiAttemptSegments },
  { name: "papi_responses", table: papiResponses },
  { name: "papi_attempts", table: papiAttempts },
  { name: "participant_tokens", table: participantTokens },
  { name: "access_codes", table: accessCodes },
  { name: "assessment_sessions", table: assessmentSessions },
] as const satisfies readonly PurgeEntry[];

/**
 * Memakai query builder drizzle, bukan SQL mentah: bentuk kembalian
 * `db.execute` berbeda antar driver (postgres-js mengembalikan array,
 * PGlite mengembalikan `{ rows }`), sehingga mudah salah baca.
 */
async function countRows(db: ReturnType<typeof getDb>, table: PurgeTable): Promise<number> {
  const [row] = await db.select({ total: count() }).from(table);
  return row?.total ?? 0;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const db = getDb();

  try {
    const plan: PurgeEntry[] = [...PURGE_ORDER];
    if (flags.includeCandidates) {
      plan.push({ name: "candidates", table: candidates });
    }
    if (flags.includeAudit) {
      plan.push({ name: "audit_logs", table: auditLogs });
    }

    console.log(
      flags.execute ? "\nMENGHAPUS data pengerjaan\n" : "\nPRATINJAU (tidak menghapus)\n",
    );

    let total = 0;
    for (const entry of plan) {
      const before = await countRows(db, entry.table);
      total += before;
      console.log(`  ${entry.name.padEnd(24)} ${String(before).padStart(7)} baris`);
    }
    console.log(`  ${"TOTAL".padEnd(24)} ${String(total).padStart(7)} baris`);

    if (!flags.execute) {
      console.log(
        "\nTidak ada yang dihapus. Untuk benar-benar menghapus:\n" +
          "  npm run db:purge-sessions -- --yes\n\n" +
          "Opsi tambahan:\n" +
          "  --with-candidates   ikut menghapus data peserta\n" +
          "  --with-audit        ikut menghapus audit log\n\n" +
          "Bank soal, tutorial, kunci skoring, dan norma tidak pernah disentuh.\n",
      );
      return;
    }

    await db.transaction(async (tx) => {
      // Referensi ke diri sendiri dikosongkan dulu agar penghapusan tidak ditolak.
      await tx
        .update(assessmentResults)
        .set({ supersededById: null })
        .where(isNotNull(assessmentResults.supersededById));
      await tx
        .update(papiResults)
        .set({ supersededById: null })
        .where(isNotNull(papiResults.supersededById));
      await tx
        .update(accessCodes)
        .set({ regeneratedFromId: null })
        .where(isNotNull(accessCodes.regeneratedFromId));

      for (const entry of plan) {
        await tx.delete(entry.table);
      }
    });

    console.log("\nSelesai. Menghitung ulang:\n");
    for (const entry of plan) {
      console.log(
        `  ${entry.name.padEnd(24)} ${String(await countRows(db, entry.table)).padStart(7)} baris`,
      );
    }
    console.log("");
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
