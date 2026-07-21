/**
 * One-off patch for a database seeded BEFORE the T28 fix: the GE norm rows stopped at raw 16, but
 * GE's rubric awards 0/1/2 per item so a perfect GE is 32 — anything above 16 fell to
 * `needs_review`. Adds the missing GE rows per band with the same fabricated formula the seed uses
 * (`SW = 80 + raw*2 + bandIndex`). Idempotent: `norm_row_ux` makes re-runs skip existing rows.
 *
 * Run: npm run db:patch-ge-norms   (a fresh `runSeed` no longer needs this — seed-core is fixed)
 */
import { asc, eq } from "drizzle-orm";
import { getDb } from "../lib/db/client.ts";
import { normAgeBands, normScoreRows, normSetVersions } from "../lib/db/schema.ts";

const GE_MAX_RAW = 32;

async function main(): Promise<void> {
  const db = getDb();

  const normSets = await db.select({ id: normSetVersions.id }).from(normSetVersions);
  let inserted = 0;

  for (const normSet of normSets) {
    const bands = await db
      .select({ id: normAgeBands.id })
      .from(normAgeBands)
      .where(eq(normAgeBands.normSetVersionId, normSet.id))
      .orderBy(asc(normAgeBands.minAge));

    for (const [bandIndex, band] of bands.entries()) {
      const rows = Array.from({ length: GE_MAX_RAW + 1 }, (_, raw) => ({
        normAgeBandId: band.id,
        subtestCode: "GE",
        rawScore: raw,
        standardScore: 80 + raw * 2 + bandIndex,
      }));
      const result = await db
        .insert(normScoreRows)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: normScoreRows.id });
      inserted += result.length;
    }
  }

  console.log(`Selesai: ${inserted} baris norma GE ditambahkan (yang sudah ada dilewati).`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Patch gagal:", error);
  process.exit(1);
});
