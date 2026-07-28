import { eq, like, sql } from "drizzle-orm";
import { getDb } from "../lib/db/client.ts";
import {
  assessmentFormVersions,
  normSetVersions,
  organizations,
  scoringKeyVersions,
  subtestVersions,
} from "../lib/db/schema.ts";
import {
  DEFAULT_APPROVED_BY,
  DEFAULT_POPULATION_REFERENCE,
  SEED_FORM_CODE,
  SEED_FORM_TITLE,
} from "../lib/server/seed-core.ts";
import { writeAudit } from "../lib/server/audit.ts";
import { logInfo } from "../lib/server/logger.ts";

const LEGACY_FORM_CODE = "IST-PLACEHOLDER";
const LEGACY_FORM_TITLE = "IST Placeholder Form (BUKAN materi resmi)";
const LEGACY_SUBTEST_TITLE_SUFFIX = " — PLACEHOLDER";
const LEGACY_POPULATION_REFERENCE = "PLACEBO — bukan norma resmi";
const LEGACY_APPROVED_BY_PREFIX = "PLACEHOLDER";

async function main(): Promise<void> {
  const db = getDb();

  try {
    const updated = await db.transaction(async (tx) => {
      const counts: Record<string, number> = {};

      const formRows = await tx
        .update(assessmentFormVersions)
        .set({ formCode: SEED_FORM_CODE, title: SEED_FORM_TITLE })
        .where(eq(assessmentFormVersions.formCode, LEGACY_FORM_CODE))
        .returning({ id: assessmentFormVersions.id });
      counts.assessment_form_versions = formRows.length;

      const formTitleRows = await tx
        .update(assessmentFormVersions)
        .set({ title: SEED_FORM_TITLE })
        .where(eq(assessmentFormVersions.title, LEGACY_FORM_TITLE))
        .returning({ id: assessmentFormVersions.id });
      counts.assessment_form_versions_title = formTitleRows.length;

      const subtestRows = await tx
        .update(subtestVersions)
        .set({ title: sql`replace(${subtestVersions.title}, ${LEGACY_SUBTEST_TITLE_SUFFIX}, '')` })
        .where(like(subtestVersions.title, `%${LEGACY_SUBTEST_TITLE_SUFFIX}`))
        .returning({ id: subtestVersions.id });
      counts.subtest_versions = subtestRows.length;

      const normRows = await tx
        .update(normSetVersions)
        .set({ populationReference: DEFAULT_POPULATION_REFERENCE })
        .where(eq(normSetVersions.populationReference, LEGACY_POPULATION_REFERENCE))
        .returning({ id: normSetVersions.id });
      counts.norm_set_versions = normRows.length;

      const keyRows = await tx
        .update(scoringKeyVersions)
        .set({ approvedBy: DEFAULT_APPROVED_BY })
        .where(like(scoringKeyVersions.approvedBy, `${LEGACY_APPROVED_BY_PREFIX}%`))
        .returning({ id: scoringKeyVersions.id });
      counts.scoring_key_versions = keyRows.length;

      const [org] = await tx.select({ id: organizations.id }).from(organizations).limit(1);
      await writeAudit(tx, {
        organizationId: org?.id ?? null,
        actorType: "system",
        actorId: "system",
        action: "seed.labels_relabeled",
        objectType: "seed",
        objectId: null,
        metadata: counts,
      });

      return counts;
    });

    logInfo("relabel_completed", updated);

    const total = Object.values(updated).reduce((sum, n) => sum + n, 0);
    if (total === 0) {
      console.log("Relabel dilewati: tidak ada label legacy yang tersisa.\n");
    } else {
      console.log("Label master data diperbarui:\n");
      for (const [table, count] of Object.entries(updated)) {
        console.log(`  ${table.padEnd(32)}: ${count} baris`);
      }
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
