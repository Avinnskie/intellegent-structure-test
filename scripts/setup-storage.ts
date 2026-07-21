/**
 * Creates the two PRIVATE storage buckets the app reads and writes: item media and generated PDF
 * reports. Both hold data that must never be publicly addressable — a public report bucket would
 * expose candidate results to anyone holding a URL, with no auth in front of it.
 *
 * Run with:
 *   npx dotenv -e .env.local -e .env -- node --experimental-strip-types scripts/setup-storage.ts
 *
 * IDEMPOTENT: existing buckets are left alone. A bucket that already exists but is PUBLIC is
 * reported as an error rather than silently flipped — see below.
 *
 * Uses SUPABASE_SECRET_KEY, which bypasses every RLS policy. This is why it is a CLI script and
 * never an endpoint: nothing on a request path may load this file.
 */
import { createClient } from "@supabase/supabase-js";
import { getServerConfig } from "../lib/config.ts";
import { logInfo } from "../lib/server/logger.ts";

type BucketOutcome = "created" | "exists";

async function ensurePrivateBucket(
  storage: ReturnType<typeof createClient>["storage"],
  name: string,
): Promise<BucketOutcome> {
  const { data: existing, error: getError } = await storage.getBucket(name);

  if (existing) {
    if (existing.public) {
      // Not auto-fixed: flipping a live bucket to private can break whatever is already reading it,
      // and a public bucket here means someone made a decision we should not silently reverse.
      throw new Error(
        `Bucket "${name}" sudah ada tetapi PUBLIC. Ubah ke private di dashboard Supabase ` +
          "sebelum melanjutkan — bucket ini menyimpan data kandidat.",
      );
    }
    return "exists";
  }

  // The SDK reports a missing bucket as an error, so only a genuine failure should propagate.
  if (getError && !/not found|does not exist/i.test(getError.message)) {
    throw new Error(`Gagal membaca bucket "${name}": ${getError.message}`);
  }

  const { error: createError } = await storage.createBucket(name, { public: false });
  if (createError) {
    // A racing run can create it between our get and our create; that is success, not failure.
    if (/already exists/i.test(createError.message)) {
      return "exists";
    }
    throw new Error(`Gagal membuat bucket "${name}": ${createError.message}`);
  }

  return "created";
}

async function main(): Promise<void> {
  const config = getServerConfig();

  const supabase = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const buckets = [config.SUPABASE_MEDIA_BUCKET, config.SUPABASE_REPORT_BUCKET];

  for (const name of buckets) {
    const outcome = await ensurePrivateBucket(supabase.storage, name);
    logInfo("storage_bucket_ready", { bucket: name, outcome });
    console.log(`Bucket "${name}": ${outcome === "created" ? "dibuat (private)" : "sudah ada"}.`);
  }

  console.log("\nSelesai. Kedua bucket private.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
