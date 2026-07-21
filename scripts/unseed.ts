/**
 * Removes the seeded CONTENT and every piece of dev/test transactional data, so the
 * database holds no dummy material — while keeping the structure the portal UIs cannot recreate.
 *
 * Deleted (dummy data):
 *   - ALL sessions and their dependents: reports, subtest_scores, assessment_results, item_scores,
 *     responses, subtest_attempts, participant_tokens, access_codes, assessment_sessions
 *   - ALL candidates (created during dev testing; every session referencing them is gone above)
 *   - The 176 seeded items: item_scoring_rules, item_options, item_versions
 *   - The seeded tutorial_versions
 *
 * Kept (infrastructure — there is NO UI to recreate these, and the question-bank/tutorial CRUD
 * hangs off them):
 *   - organizations and users (HR/admin accounts)
 *   - the assessment_form_versions row, its 9 subtest_versions
 *   - the published scoring_key_versions row (empty of rules until HR adds answer keys)
 *   - norm_set_versions / norm_age_bands / norm_score_rows — they can only be replaced by script
 *     (`db:patch-ge-norms`) or psychologist reconciliation (brief §28); deleting them would make
 *     scoring unrecoverable from the UI.
 *   - audit_logs (append-only by design)
 *
 * IDEMPOTENT: re-running on an already-clean database deletes zero rows and succeeds.
 *
 * Run with:
 *   npm run db:unseed
 */
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
      // Child-before-parent, per the FK graph in lib/db/schema.ts (all FKs are NO ACTION).
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
        "tutorial lewat menu Tutorial Subtes. Rekonsiliasi norma via " +
        "db:patch-ge-norms / psikolog sebelum skoring produksi (brief §28).",
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
