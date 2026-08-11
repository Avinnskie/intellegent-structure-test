# IST Assessment Platform

Platform pelaksanaan, skoring, dan pelaporan Intelligenz Struktur Test (IST): backend
server-authoritative di atas Next.js App Router + Supabase (PostgreSQL, Auth, private Storage),
dengan engine sesi peserta, workflow HR, pipeline skoring ber-versi, dan laporan PDF ber-hash.

> **STATUS: PRODUCTION-READY.** Kunci objektif, norma umur, konversi RW/SW/IQ, kategori,
> dan dominansi sudah direkonsiliasi dengan `Kunci IST.xlsx` dan `APLIKASI Skoring IST.xlsx`.
> Konten soal/rubrik GE serta Phase 6–10 (security testing, UAT, pilot, go-live) masih perlu
> validasi pemilik tes. Lihat `docs/plans/PROGRESS.md` dan `docs/OPERATIONS.md`.

## Menjalankan

```bash
npm install

# 1. Env — buat .env.local dan isi (Supabase URL/keys, DATABASE_URL, secrets >= 32 char):
#    APP_BASE_URL, DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
#    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY,
#    SUPABASE_MEDIA_BUCKET, SUPABASE_REPORT_BUCKET,
#    SESSION_TOKEN_SECRET, ACCESS_CODE_PEPPER, TRUSTED_PROXY_MODE

# 2. Database
npm run db:migrate         # skema (drizzle-kit)
npm run db:seed            # master data + scoring workbook resmi (idempotent)
# Untuk database yang pernah memakai scoring placeholder:
npm run db:upgrade-scoring # terbitkan scoring v2 dan arahkan sesi lama secara teraudit
npm run create-admin -- --email admin@example.com --password <pw> \
  --name "Admin" --role super_admin --permissions view_results

# 3. Jalankan
npm run dev                # http://localhost:3000
```

Verifikasi penuh: `npm run lint && npx tsc --noEmit && npm test && npm run build`.

## Arsitektur

```
lib/domain/     Logika murni tanpa I/O: kode akses, token, state machine sesi, timer, usia,
                data norma workbook, skoring objektif, agregat IST. Diuji unit.
lib/server/     Service ber-database (drizzle): engine sesi peserta (state/start/save/complete),
                HR ops, skoring GE, pipeline kalkulasi, hasil, laporan PDF, audit, authz.
                Diuji integrasi terhadap PGlite (Postgres in-process) — tanpa mock.
lib/providers/  Adapter infrastruktur (Supabase Auth, Storage) di balik interface —
                portabilitas ke server kantor (spec §5.5).
lib/db/         Skema drizzle (31 tabel: 24 IST + 7 PAPI), klien, migrasi.
app/api/        Route handlers — kontrak spec §18; error envelope seragam.
app/test/       UI peserta (token route, dikendalikan `nextRoute` server).
app/hr, app/admin  Portal HR / Super Admin (Supabase Auth, server-side session).
tests/          unit / integration / golden (harness dataset ekspektasi-eksplisit).
```

Prinsip yang dipegang di seluruh kode:

- **Server adalah otoritas** — timer, status, dan skor dihitung dari jam database; klien hanya menampilkan.
- **Peserta tidak pernah melihat status internal** (spec §13) — proyeksi `toParticipantStatus` satu pintu.
- **Sesi mem-pin versi** form/kunci/norma/tutorial saat dibuat (spec §10A); hasil menyimpan snapshot
  versi + `engineVersion` sehingga reproducible digit-per-digit.
- **Tidak menebak**: usia di luar band norma → `needs_review`, bukan band terdekat; jawaban hilang → 0.
- **Audit append-only** untuk semua peristiwa penting.
- **Kode akses tersimpan lengkap** di `access_codes.code_masked` (nama kolom historis) agar HR
  dapat melihatnya kembali kapan saja; `code_hash` tetap menjadi kunci pencocokan saat peserta
  memasukkan kode. Konsekuensinya kode terbaca oleh siapa pun yang punya akses database.

## Route utama

| Area    | Route                                 | Fungsi                                              |
| ------- | ------------------------------------- | --------------------------------------------------- |
| Peserta | `/test`                               | Input kode akses                                    |
|         | `/test/{token}/tutorial/{subtes}`     | Tutorial (timer belum berjalan)                     |
|         | `/test/{token}/question/{subtes}/{n}` | Soal + autosave + timer server-anchored             |
|         | `/test/{token}/review/{subtes}`       | Periksa belum-dijawab, tutup subtes                 |
|         | `/test/{token}/papi`                  | Jeda istirahat sebelum PAPI (token tetap berlaku)   |
|         | `/test/{token}/papi/question`         | 90 nomor forced-choice + stopwatch naik             |
|         | `/test/{token}/complete`              | Penutup (tanpa skor)                                |
| HR      | `/hr`                                 | Dashboard metric nyata                              |
|         | `/hr/participants`, `/hr/sessions`    | Registry peserta & sesi (kode akses terlihat penuh) |
|         | `/hr/scoring/{sessionId}/ge`          | Skoring GE 0/1/2, override teraudit                 |
|         | `/hr/results/{sessionId}`             | Hasil + grafik; calculate/review/finalize/override  |
|         | `/hr/reports/{sessionId}`             | Generate & unduh PDF ber-versi                      |
| Admin   | `/admin/audit`                        | Audit log (paginasi, super_admin)                   |

Urutan subtes tetap: `SE → WA → AN → GE → RA → ZR → FA → WU → ME`.

## Catatan performa sesi peserta

Perpindahan antar soal IST dilakukan **di sisi klien**. Seluruh soal satu subtes sudah
dikirim saat halaman dimuat, jadi tombol berikutnya/sebelumnya dan lompatan lewat sidebar
hanya mengubah state React.

Sebelumnya tiap perpindahan memakai `router.push`, yang memicu render server penuh:
resolusi token, pembacaan sesi, **transaksi** `startSubtest`, dan penandatanganan URL media
ke Supabase Storage. Semua itu dikerjakan ulang hanya untuk menampilkan soal yang datanya
sudah ada di browser.

URL media kini ditandatangani sekali untuk seluruh subtes secara paralel, bukan satu per
soal, sehingga navigasi klien tetap memiliki medianya.

**URL tidak disinkronkan saat berpindah soal.** Next App Router menambal
`history.pushState`/`replaceState`; karena nomor soal adalah segmen dinamis rute,
mengubahnya memicu navigasi Next, komponen dipasang ulang, dan peserta terlempar balik ke
soal semula. Konsekuensinya memuat ulang halaman di tengah subtes mendarat pada nomor yang
tertulis di URL — jawaban tidak terpengaruh karena sudah tersimpan di server.

Yang tetap melalui server: masuk subtes, menutup subtes, autosave jawaban, heartbeat, dan
kedaluwarsa waktu — semuanya tetap server-authoritative.

## Baterai IST + PAPI Kostick

Satu kode akses menjalankan dua instrumen berurutan. Setelah subtes IST terakhir ditutup,
sesi berhenti di `papi_pending` — peserta boleh istirahat, menutup browser, lalu kembali
memakai **kode akses yang sama**. Skoring IST sengaja ditahan sampai tahap PAPI selesai
atau dilewati, agar laporan gabungan memuat kedua bagian.

```
subtest_completed ─┬─ (tanpa PAPI) ─→ test_completed → needs_ge_scoring / calculated
                   └─ papi_pending ⇄ papi_tutorial ⇄ papi_in_progress → papi_completed
                                   └──────── HR tutup lebih awal ────────→ test_completed
```

| Aspek          | IST                                                   | PAPI                                                   |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Waktu          | Hitung mundur per subtes, `expires_at` di database    | **Stopwatch naik, tanpa batas** — durasi hanya direkam |
| Skoring        | RW → SW → IQ lewat norma umur                         | Ipsatif, 20 faktor 0–9, total selalu 90                |
| Jawaban hilang | Dihitung 0                                            | **Ditolak** — 90 dari 90 wajib terisi                  |
| Tabel          | `subtest_attempts`, `responses`, `assessment_results` | `papi_attempts`, `papi_responses`, `papi_results`      |

Durasi PAPI dihitung dari `papi_attempt_segments`, bukan selisih mulai–selesai. Segmen
terbuka dihitung sampai heartbeat terakhir, sehingga jeda istirahat dan tab yang
ditinggalkan tidak menggelembungkan waktu pengerjaan.

Skor PAPI **tidak boleh dipakai membandingkan antar-peserta**: karena totalnya dipaksa 90,
skor tinggi pada satu faktor memaksa faktor lain turun. Sistem sengaja tidak menyediakan
fitur perangkingan kandidat berdasarkan faktor PAPI.

Rute peserta: `/test/{token}/papi` (jeda istirahat) → `/test/{token}/papi/tutorial` →
`/test/{token}/papi/question`.

Bank soal PAPI: `/hr/papi-question-bank`. Teks pernyataan dan huruf faktor disunting
langsung per nomor — tanpa alur draft. Dua penjagaan tetap berlaku:

1. **Terkunci saat ada peserta mengerjakan.** `getPapiState` membaca teks item secara live,
   jadi menyunting ketika `papi_attempts.status = 'in_progress'` akan menggeser pertanyaan di
   tengah pengerjaan. Penyuntingan ditolak sampai attempt tersebut ditutup.
2. **Kunci divalidasi utuh setiap penyimpanan**, bukan per baris: 90 nomor, tiap huruf tepat
   9 kali, tiap pasangan Role-lawan-Role atau Need-lawan-Need, tanpa pasangan duplikat.
   Penyimpanan tetap diterima meski kunci sementara rusak — menukar sepasang huruf memang
   butuh beberapa langkah — tetapi masalahnya dilaporkan seketika lewat indikator sebaran
   huruf, dan lembar jawaban tidak akan lolos skoring selama kunci belum kembali sah.

Perubahan tercatat di audit lengkap dengan nilai sebelum dan sesudah, sehingga perubahan
kunci dapat ditelusuri.

Sisi HR: checkbox **Sertakan PAPI Kostick** pada modal buat sesi dan impor massal
(default aktif, di-pin ke `papi_form_version` yang published); `/hr/results/{sessionId}`
menampilkan radar 20 faktor, kartu per kelompok, dan tabel detail; tombol
**Tutup tanpa PAPI** pada daftar sesi memanggil `POST /api/hr/sessions/{id}/papi/skip`
(teraudit, `papi_skip_reason` tersimpan di sesi, hasil IST tetap diproses).

Laporan PDF: satu dokumen memuat halaman IST lalu halaman PAPI, lengkap dengan radar 20
faktor yang digambar sebagai vektor SVG (`lib/domain/papi-radar-geometry.ts`) — tajam pada
perbesaran berapa pun dan tidak memerlukan browser saat laporan dihasilkan di server. Bila tahap PAPI dilewati,
laporan tetap memuat halaman penjelas berisi alasannya — bagian yang tidak dikerjakan
dinyatakan, bukan dihilangkan diam-diam.

### Yang masih perlu validasi pemilik tes

Workbook `PAPI SCORING.xlsx` memiliki tiga rentang skor yang formulanya menghasilkan
`FALSE`, yaitu **G 8–9**, **V 8–9**, dan **E 7–8**. Rentang itu tidak diisi teks karangan;
`official-papi-data.json` menandainya `pendingOwnerValidation`, dan hasil menyimpannya di
`papi_results.pending_interpretation_factors` agar psikolog melengkapi narasinya.

### Pengujian modul PAPI

`npm test` menjalankan seluruhnya, termasuk integrasi terhadap PGlite (Postgres in-process,
tanpa mock — lihat `tests/helpers/pglite-db.ts`; migrasi diterapkan per-statement karena
`ALTER TYPE ... ADD VALUE` tidak boleh dipakai pada transaksi yang sama dengan pembuatannya).

| Berkas                                  | Cakupan                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `tests/unit/papi-scoring.test.ts`       | Kunci 90 item, tiap huruf 9×, 45 Role vs 45 Need, invariant total 90, penolakan jawaban kosong |
| `tests/unit/papi-session-state.test.ts` | Transisi dua tahap, jeda istirahat, penutupan lebih awal, status terminal                      |
| `tests/unit/papi-format.test.ts`        | Format durasi dan lebar bar skor                                                               |
| `tests/unit/papi-report-pdf.test.ts`    | Laporan gabungan, halaman PAPI dilewati, determinisme render                                   |
| `tests/integration/papi-flow.test.ts`   | Attempt, autosave, resume token sama, akumulasi segmen waktu, penguncian setelah kirim         |
| `tests/integration/papi-skip.test.ts`   | Penutupan lebih awal oleh HR, penonaktifan kode akses, audit, isolasi antar-organisasi         |

Halaman `/hr/tutorials`, `/hr/question-bank`, `/admin/users`, `/admin/tutorials`,
`/admin/question-bank` sudah terhubung ke data produksi — pengelolaan konten tersedia untuk HR.

## Status data scoring

| Sudah direkonsiliasi dengan workbook                       | Masih perlu validasi pemilik tes               |
| ---------------------------------------------------------- | ---------------------------------------------- |
| Engine sesi (timer, resume, timeout, anti-double-attempt)  | UAT psikolog dan pilot operasional             |
| Modul PAPI: kunci 90 item, skoring ipsatif, elapsed segmen | Narasi 3 rentang cut-off (G 8–9, V 8–9, E 7–8) |
| Workflow HR + kode akses (hash, revoke, regenerate)        | Validasi lisensi/hak penggunaan materi         |
| Kunci pilihan/numerik dan 13 band norma umur               |                                                |
| Konversi RW→SW, total RW→SW komposit→IQ                    |                                                |
| Kategori subtes/IQ dan dominansi Eksak/Non Eksak/Seimbang  |                                                |
| Pipeline kalkulasi + snapshot versi + audit                |                                                |
| Laporan PDF ber-hash + storage privat                      |                                                |

Referensi scoring dibekukan di `lib/domain/official-ist-data.json` dan dilindungi oleh unit,
integrasi, serta 21 kasus golden end-to-end.

## Dokumen

- `DEVELOPMENT_BRIEF.md` / `DEVELOPMENT_SPEC.md` — kebutuhan & spesifikasi.
- `docs/plans/2026-07-14-ist-production-phase1-5.md` — rencana eksekusi Phase 1–5.
- `docs/plans/PROGRESS.md` — status per task.
- `docs/OPERATIONS.md` — runbook operator + daftar yang belum ada.
- `DESIGN.md` — design system baseline UI.
