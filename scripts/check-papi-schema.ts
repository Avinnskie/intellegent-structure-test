import { sql } from "drizzle-orm";
import { getDb } from "../lib/db/client.ts";

/**
 * Memeriksa apakah migrasi 0003_papi_module sudah terpasang di database aktif.
 * Dipakai saat halaman hasil melempar "Failed query: select includes_papi ...".
 */

const REQUIRED_TABLES = [
  "papi_form_versions",
  "papi_item_versions",
  "papi_attempts",
  "papi_attempt_segments",
  "papi_responses",
  "papi_results",
  "papi_factor_scores",
] as const;

const REQUIRED_COLUMNS = [
  "includes_papi",
  "papi_form_version_id",
  "papi_skip_reason",
  "papi_skipped_by",
  "papi_skipped_at",
] as const;

const REQUIRED_ENUM_VALUES = [
  "papi_pending",
  "papi_tutorial",
  "papi_in_progress",
  "papi_completed",
] as const;

async function main(): Promise<void> {
  const db = getDb();

  const tableRows = await db.execute<{ table_name: string }>(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'papi\\_%'
  `);
  const columnRows = await db.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'assessment_sessions'
      and (column_name like 'papi\\_%' or column_name = 'includes_papi')
  `);
  const enumRows = await db.execute<{ enumlabel: string }>(sql`
    select e.enumlabel from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'session_status'
  `);
  const formRows = await db
    .execute<{ count: string }>(
      sql`
    select count(*)::text as count from papi_form_versions where status = 'published'
  `,
    )
    .catch(() => null);

  const tables = new Set(tableRows.map((row) => row.table_name));
  const columns = new Set(columnRows.map((row) => row.column_name));
  const enums = new Set(enumRows.map((row) => row.enumlabel));

  const missingTables = REQUIRED_TABLES.filter((name) => !tables.has(name));
  const missingColumns = REQUIRED_COLUMNS.filter((name) => !columns.has(name));
  const missingEnums = REQUIRED_ENUM_VALUES.filter((name) => !enums.has(name));

  const report = (label: string, missing: readonly string[], total: number) =>
    console.log(
      `  ${missing.length === 0 ? "OK  " : "GAGAL"} ${label}: ${total - missing.length}/${total}` +
        (missing.length > 0 ? ` — hilang: ${missing.join(", ")}` : ""),
    );

  console.log("\nPemeriksaan skema PAPI (migrasi 0003_papi_module)\n");
  report("tabel", missingTables, REQUIRED_TABLES.length);
  report("kolom assessment_sessions", missingColumns, REQUIRED_COLUMNS.length);
  report("nilai enum session_status", missingEnums, REQUIRED_ENUM_VALUES.length);

  const publishedForms = Number(formRows?.[0]?.count ?? 0);
  console.log(
    `  ${publishedForms > 0 ? "OK  " : "GAGAL"} form PAPI published: ${publishedForms}` +
      (publishedForms === 0 ? " — jalankan `npm run db:seed`" : ""),
  );

  const schemaOk =
    missingTables.length === 0 && missingColumns.length === 0 && missingEnums.length === 0;

  if (!schemaOk) {
    console.log("\nSkema belum lengkap. Jalankan:\n\n  npm run db:migrate\n");
    process.exitCode = 1;
    return;
  }
  if (publishedForms === 0) {
    console.log(
      "\nSkema sudah ada, tetapi form PAPI belum di-seed. Jalankan:\n\n  npm run db:seed\n",
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nSkema PAPI lengkap dan form sudah terpasang.\n");
}

main().catch((error) => {
  console.error("Pemeriksaan gagal:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
