/**
 * Menghitung berapa kali basis data dihubungi pada tiap jalur peserta.
 *
 * Dibuat karena menebak sumber kelambatan hampir selalu meleset. Angka di sini
 * berasal dari logger drizzle, jadi ia menangkap SETIAP pernyataan — termasuk
 * yang berada di dalam transaksi, yang luput bila kita hanya menyadap klien.
 *
 * Waktu milidetik di bawah diukur terhadap basis data dalam proses, jadi tidak
 * mencerminkan produksi. Yang penting adalah jumlah kuerinya: di produksi tiap
 * kueri berarti satu perjalanan bolak-balik jaringan, dan itulah yang dirasakan
 * peserta sebagai jeda.
 *
 *   npm run db:probe
 */
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const { PGlite } = await import("@electric-sql/pglite");
const { drizzle } = await import("drizzle-orm/pglite");
const schema = await import(`${ROOT}/lib/db/schema.ts`);
const { setTestEnv } = await import(`${ROOT}/tests/helpers/pglite-db.ts`);
const { createTestDb } = await import(`${ROOT}/tests/helpers/pglite-db.ts`);
const { createPapiSessionFixture } = await import(`${ROOT}/tests/helpers/papi-session-fixture.ts`);
const papi = await import(`${ROOT}/lib/server/papi-participant.ts`);
const session = await import(`${ROOT}/lib/server/participant-session.ts`);

setTestEnv();
const harness = await createTestDb();

let queries = 0;
// Logger drizzle menangkap SETIAP pernyataan, termasuk yang di dalam transaksi.
const db = drizzle(harness.client, {
  schema,
  logger: { logQuery: () => { queries += 1; } },
}) as unknown as typeof harness.db;

async function count(label: string, fn: () => Promise<unknown>) {
  queries = 0;
  const t0 = performance.now();
  try { await fn(); } catch (e) { console.log(`  (${label}: ${(e as Error).message.slice(0,50)})`); }
  console.log(`${label.padEnd(40)} ${String(queries).padStart(3)} kueri  ${(performance.now()-t0).toFixed(0)} ms`);
}

const f = await createPapiSessionFixture(db);
await papi.startPapi(db, f.token);

await count("getSessionState (tiap halaman)", () => session.getSessionState(db, f.token));
await count("getPapiState (muat halaman soal)", () => papi.getPapiState(db, f.token));
await count("savePapiAnswer (satu klik)", () => papi.savePapiAnswer(db, f.token, 1, "A"));
await count("papiHeartbeat (tiap 30 detik)", () => papi.papiHeartbeat(db, f.token));

for (let n = 1; n <= 90; n += 1) await papi.savePapiAnswer(db, f.token, n, "A");
await count("completePapi (tombol kirim)", () => papi.completePapi(db, f.token));

await harness.close();
