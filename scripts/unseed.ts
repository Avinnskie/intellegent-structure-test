import { getDb } from "../lib/db/client.ts";
import {
  accessCodes,
  assessmentResults,
  assessmentSessions,
  candidates,
  itemOptions,
  itemScores,
  itemScoringRules,
  itemVersions,
  organizations,
  participantTokens,
  reports,
  responses,
  subtestAttempts,
  subtestScores,
  tutorialVersions,
} from "../lib/db/schema.ts";
import { writeAudit } from "../lib/server/audit.ts";
import { logInfo } from "../lib/server/logger.ts";

async function main(): Promise<void> {
  const db = getDb();

  try {
    const deleted = await db.transaction(async (tx) => {
      const counts: Record<string, number> = {};
      const wipe = async (label: string, table: Parameters<typeof tx.delete>[0]) => {
        const rows = await tx.delete(table).returning();
        counts[label] = rows.length;
      };

      await wipe("reports", reports);
      await wipe("subtest_scores", subtestScores);
      await wipe("assessment_results", assessmentResults);
      await wipe("item_scores", itemScores);
      await wipe("responses", responses);
      await wipe("subtest_attempts", subtestAttempts);
      await wipe("participant_tokens", participantTokens);
      await wipe("access_codes", accessCodes);
      await wipe("assessment_sessions", assessmentSessions);
      await wipe("candidates", candidates);

      await wipe("item_scoring_rules", itemScoringRules);
      await wipe("item_options", itemOptions);
      await wipe("item_versions", itemVersions);
      await wipe("tutorial_versions", tutorialVersions);

      const [org] = await tx.select({ id: organizations.id }).from(organizations).limit(1);
      await writeAudit(tx, {
        organizationId: org?.id ?? null,
        actorType: "system",
        actorId: "system",
        action: "seed.content_removed",
        objectType: "seed",
        objectId: null,
        metadata: counts,
      });

      return counts;
    });

    logInfo("unseed_completed", deleted);

    console.log("Data dummy dihapus. Struktur form/subtes/scoring key/norm set dipertahankan.\n");
    for (const [table, count] of Object.entries(deleted)) {
      console.log(`  ${table.padEnd(19)}: ${count} baris dihapus`);
    }
    console.log(
      "\nLangkah berikutnya: tambahkan soal (beserta kunci jawaban) lewat menu Bank Soal dan " +
        "tutorial lewat menu Tutorial Subtes. Pulihkan scoring workbook melalui db:seed atau " +
        "db:upgrade-scoring sebelum melakukan kalkulasi.",
    );
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
