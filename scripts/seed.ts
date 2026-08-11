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
      papiCreated: summary.papi.created,
      papiFormVersionId: summary.papi.papiFormVersionId,
    });

    if (!summary.created) {
      console.log(
        `Seed IST dilewati: form ${SEED_FORM_CODE} sudah ada (${summary.formVersionId}).`,
      );
    } else {
      console.log("Seed selesai — master data default terpasang.");
    }

    console.log(
      summary.papi.created
        ? `Form PAPI dipasang (${summary.papi.itemCount} item).`
        : "Seed PAPI dilewati: form PAPI sudah ada.",
    );

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
        `  norm_score_rows   : ${counts.normScoreRows}\n` +
        `  papi form version : ${summary.papi.papiFormVersionId}\n` +
        `  papi_item_versions: ${summary.papi.itemCount}`,
    );
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
