import { getDb } from "../lib/db/client.ts";
import { upgradeOfficialScoring } from "../lib/server/upgrade-official-scoring.ts";

async function main(): Promise<void> {
  const db = getDb();
  try {
    const summary = await upgradeOfficialScoring(db);
    console.log(
      [
        summary.created ? "Versi scoring resmi dibuat." : "Versi scoring resmi sudah terpasang.",
        `Kunci jawaban: ${summary.ruleCount} aturan`,
        `Norma: ${summary.bandCount} kelompok umur, ${summary.normRowCount} baris`,
        `Sesi yang diarahkan ke versi resmi: ${summary.repinnedSessionCount}`,
      ].join("\n"),
    );
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
