import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { getDb } from "../lib/db/client.ts";

/**
 * Menjalankan migrasi lewat driver aplikasi, bukan lewat drizzle-kit.
 *
 * Dibuat karena `drizzle-kit migrate` pernah gagal tanpa memberi pesan apa pun
 * — hanya kode keluar 1 — sehingga tidak ada yang bisa ditelusuri. Skrip ini
 * memakai koneksi yang sama dengan aplikasi dan mencetak galat asli dari
 * PostgreSQL beserta kodenya.
 *
 * PENTING soal cara mengenali migrasi yang sudah jalan:
 *
 * drizzle mencatat SHA-256 dari ISI BERKAS SQL, bukan nama tag-nya. Versi
 * pertama skrip ini mencatat nama tag, sehingga ia tidak mengenali satu pun
 * migrasi lama dan mencoba menjalankan ulang `0000` dari awal — yang langsung
 * gagal dengan "type access_code_status already exists".
 *
 * Algoritmanya di bawah menyalin persis milik drizzle-orm (lihat
 * `node_modules/drizzle-orm/migrator.js`), jadi keduanya membaca dan menulis
 * tabel riwayat yang sama tanpa saling bertabrakan.
 *
 *   npm run db:migrate:apply                        lihat status saja
 *   npm run db:migrate:apply -- --yes               jalankan yang tertunda
 *   npm run db:migrate:apply -- --mark-applied=TAG  catat tanpa menjalankan
 *
 * `--mark-applied` untuk keadaan yang sudah terjadi di sini: sebuah migrasi
 * benar-benar sudah diterapkan ke basis data, tetapi tidak tercatat di tabel
 * riwayat — entah karena dulu dijalankan lewat `drizzle-kit push`, atau karena
 * isi berkasnya berubah setelah diterapkan sehingga hash-nya tidak lagi cocok.
 *
 * Menjalankan ulang migrasi semacam itu selalu gagal ("type ... already
 * exists"), dan kegagalannya menghalangi migrasi berikutnya. Yang dibutuhkan
 * bukan menjalankannya lagi, melainkan mengakui bahwa ia sudah ada.
 */

const MIGRATIONS = new URL("../lib/db/migrations/", import.meta.url);

type JournalEntry = { readonly tag: string; readonly when: number };

/** Sama persis dengan drizzle-orm: SHA-256 atas seluruh isi berkas. */
function migrationHash(fileContent: string): string {
  return crypto.createHash("sha256").update(fileContent).digest("hex");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--yes");
  const markTag = argv
    .find((arg) => arg.startsWith("--mark-applied="))
    ?.slice("--mark-applied=".length);
  const db = getDb();
  const sql = db.$client;

  try {
    const journal = JSON.parse(
      await readFile(new URL("meta/_journal.json", MIGRATIONS), "utf8"),
    ) as { entries: JournalEntry[] };

    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const applied = await sql.unsafe<{ hash: string }[]>(
      `SELECT hash FROM drizzle.__drizzle_migrations`,
    );
    const sudah = new Set(applied.map((row) => row.hash));

    const rencana: { entry: JournalEntry; content: string; hash: string; pending: boolean }[] = [];
    for (const entry of journal.entries) {
      const content = await readFile(new URL(`${entry.tag}.sql`, MIGRATIONS), "utf8");
      const hash = migrationHash(content);
      rencana.push({ entry, content, hash, pending: !sudah.has(hash) });
    }

    console.log("");
    for (const item of rencana) {
      console.log(`  ${item.pending ? "TERTUNDA" : "sudah   "}  ${item.entry.tag}`);
    }

    const tertunda = rencana.filter((item) => item.pending);
    console.log("");

    if (markTag !== undefined) {
      const target = rencana.find((item) => item.entry.tag === markTag);
      if (!target) {
        console.error(`Tidak ada migrasi bernama "${markTag}" di jurnal.\n`);
        process.exitCode = 1;
        return;
      }
      if (!target.pending) {
        console.log(`${markTag} memang sudah tercatat. Tidak ada yang diubah.\n`);
        return;
      }

      await sql.unsafe(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
        [target.hash, target.entry.when],
      );
      console.log(
        `${markTag} dicatat sebagai sudah diterapkan — SQL-nya TIDAK dijalankan.\n` +
          "Pastikan perubahan skema dari migrasi itu memang sudah ada di basis data.\n",
      );
      return;
    }

    if (tertunda.length === 0) {
      console.log("Semua migrasi sudah diterapkan.\n");
      return;
    }

    if (!execute) {
      console.log(
        `${tertunda.length} migrasi tertunda. Untuk menjalankannya:\n` +
          "  npm run db:migrate:apply -- --yes\n",
      );
      return;
    }

    for (const item of tertunda) {
      const statements = item.content
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement !== "");

      try {
        // Satu transaksi per migrasi: gagal di tengah tidak meninggalkan
        // separuh perubahan.
        await sql.begin(async (tx) => {
          for (const statement of statements) {
            await tx.unsafe(statement);
          }
          await tx.unsafe(
            `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
            [item.hash, item.entry.when],
          );
        });
        console.log(`  JALAN   ${item.entry.tag}`);
      } catch (error) {
        console.error(`\n  GAGAL   ${item.entry.tag}\n`);
        const detail = error as { message?: string; code?: string; detail?: string };
        console.error(`  pesan : ${detail.message ?? String(error)}`);
        if (detail.code) console.error(`  kode  : ${detail.code}`);
        if (detail.detail) console.error(`  detail: ${detail.detail}`);
        console.error("");
        process.exitCode = 1;
        return;
      }
    }

    console.log(`\n${tertunda.length} migrasi diterapkan.\n`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  const detail = error as { message?: string; code?: string };
  console.error(detail.message ?? String(error));
  if (detail.code) console.error(`kode: ${detail.code}`);
  process.exit(1);
});
