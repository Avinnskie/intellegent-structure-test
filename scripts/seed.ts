/**
 * Seeds the versioned master data. See `lib/server/seed-core.ts` for what is written.
 *
 * Run with:
 *   npm run db:seed
 *
 * IDEMPOTENT: a re-run finds `form_code='IST-DEFAULT'` already present and writes nothing —
 * it does not duplicate, converge, or crash. To reseed, delete the existing form version and its
 * dependents first; this script will not do that for you, because on a live database those rows
 * are referenced by sessions and results.
 */
import { getDb } from "../lib/db/client.ts";
import { resolveSeedOrganizationName, runSeed, SEED_FORM_CODE } from "../lib/server/seed-core.ts";
import { logInfo } from "../lib/server/logger.ts";

async function main(): Promise<void> {
  const db = getDb();
  const organizationName = resolveSeedOrganizationName();

  try {
    const summary = await runSeed(db, { organizationName });

    logInfo("seed_completed", {
      created: summary.created,
      formVersionId: summary.formVersionId,
      itemVersions: summary.counts.itemVersions,
      itemScoringRules: summary.counts.itemScoringRules,
      normScoreRows: summary.counts.normScoreRows,
    });

    if (!summary.created) {
      console.log(
        `Seed dilewati: form ${SEED_FORM_CODE} sudah ada (${summary.formVersionId}).\n` +
          "Tidak ada baris yang ditulis.",
      );
    } else {
      console.log("Seed selesai — master data default terpasang.");
    }

    const { counts } = summary;
    console.log(
      `\n  org               : ${organizationName} (${summary.organizationId})\n` +
        `  form version      : ${summary.formVersionId}\n` +
        `  subtest_versions  : ${counts.subtestVersions}\n` +
        `  item_versions     : ${counts.itemVersions}\n` +
        `  item_options      : ${counts.itemOptions}\n` +
        `  tutorial_versions : ${counts.tutorialVersions}\n` +
        `  item_scoring_rules: ${counts.itemScoringRules}\n` +
        `  norm_age_bands    : ${counts.normAgeBands}\n` +
        `  norm_score_rows   : ${counts.normScoreRows}`,
    );
  } finally {
    // postgres-js keeps the pool open and would hang the process on exit.
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
