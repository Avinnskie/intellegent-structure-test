import { and, eq } from "drizzle-orm";
import { getDb } from "../lib/db/client.ts";
import { subtestVersions } from "../lib/db/schema.ts";
import { runSeed } from "../lib/server/seed-core.ts";

const E2E_SE_DURATION_SECONDS = 45;
const STANDARD_SE_DURATION_SECONDS = 6 * 60;

async function main(): Promise<void> {
  const isRestore = process.argv.includes("--restore");
  const durationSeconds = isRestore ? STANDARD_SE_DURATION_SECONDS : E2E_SE_DURATION_SECONDS;

  const db = getDb();
  const summary = await runSeed(db);

  const updated = await db
    .update(subtestVersions)
    .set({ durationSeconds })
    .where(
      and(eq(subtestVersions.formVersionId, summary.formVersionId), eq(subtestVersions.code, "SE")),
    )
    .returning({ id: subtestVersions.id });

  if (updated.length !== 1) {
    throw new Error("Gagal mengubah durasi SE.");
  }
  console.log(
    isRestore
      ? `Durasi SE dikembalikan ke ${durationSeconds}s.`
      : `Seed E2E siap: form ${summary.formVersionId}, durasi SE = ${durationSeconds}s (DEV ONLY; kembalikan dengan --restore).`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed E2E gagal:", error);
  process.exit(1);
});
