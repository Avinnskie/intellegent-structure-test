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
      throw new Error(
        `Bucket "${name}" sudah ada tetapi PUBLIC. Ubah ke private di dashboard Supabase ` +
          "sebelum melanjutkan — bucket ini menyimpan data kandidat.",
      );
    }
    return "exists";
  }

  if (getError && !/not found|does not exist/i.test(getError.message)) {
    throw new Error(`Gagal membaca bucket "${name}": ${getError.message}`);
  }

  const { error: createError } = await storage.createBucket(name, { public: false });
  if (createError) {
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
