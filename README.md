# IST Assessment Platform

Platform pelaksanaan, skoring, dan pelaporan Intelligenz Struktur Test (IST): backend
server-authoritative di atas Next.js App Router + Supabase (PostgreSQL, Auth, private Storage),
dengan engine sesi peserta, workflow HR, pipeline skoring ber-versi, dan laporan PDF ber-hash.

> **STATUS: BELUM PRODUCTION-READY.** Seluruh kunci jawaban, norma, dan formula agregat adalah
> **PLACEHOLDER berlabel** sampai rekonsiliasi psikolog (brief §28). Phase 6–10 (security testing,
> UAT, pilot, go-live) belum berjalan. Lihat `docs/plans/PROGRESS.md` dan `docs/OPERATIONS.md`.

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
npm run db:seed            # master data placeholder (idempotent)
npm run create-admin -- --email admin@example.com --password <pw> \
  --name "Admin" --role super_admin --permissions view_results

# 3. Jalankan
npm run dev                # http://localhost:3000
```

Verifikasi penuh: `npm run lint && npx tsc --noEmit && npm test && npm run build`.

## Arsitektur

```
lib/domain/     Logika murni tanpa I/O: kode akses, token, state machine sesi, timer, usia,
                norma (band eksak), skoring objektif, agregat PLACEHOLDER. Diuji unit.
lib/server/     Service ber-database (drizzle): engine sesi peserta (state/start/save/complete),
                HR ops, skoring GE, pipeline kalkulasi, hasil, laporan PDF, audit, authz.
                Diuji integrasi terhadap PGlite (Postgres in-process) — tanpa mock.
lib/providers/  Adapter infrastruktur (Supabase Auth, Storage) di balik interface —
                portabilitas ke server kantor (spec §5.5).
lib/db/         Skema drizzle (24 tabel), klien, migrasi.
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
- **Audit append-only** untuk semua peristiwa penting; kode akses hanya tersimpan sebagai hash + mask.

## Route utama

| Area | Route | Fungsi |
| --- | --- | --- |
| Peserta | `/test` | Input kode akses |
| | `/test/{token}/tutorial/{subtes}` | Tutorial (timer belum berjalan) |
| | `/test/{token}/question/{subtes}/{n}` | Soal + autosave + timer server-anchored |
| | `/test/{token}/review/{subtes}` | Periksa belum-dijawab, tutup subtes |
| | `/test/{token}/complete` | Penutup (tanpa skor) |
| HR | `/hr` | Dashboard metric nyata |
| | `/hr/participants`, `/hr/sessions` | Registry peserta & sesi (kode tampil sekali) |
| | `/hr/scoring/{sessionId}/ge` | Skoring GE 0/1/2, override teraudit |
| | `/hr/results/{sessionId}` | Hasil + grafik; calculate/review/finalize/override |
| | `/hr/reports/{sessionId}` | Generate & unduh PDF ber-versi |
| Admin | `/admin/audit` | Audit log (paginasi, super_admin) |

Urutan subtes tetap: `SE → WA → AN → GE → RA → ZR → FA → WU → ME`.

Halaman `/hr/tutorials`, `/hr/question-bank`, `/admin/users`, `/admin/tutorials`,
`/admin/question-bank` masih menampilkan data prototype — pengelolaan konten adalah scope Phase 6+.

## Placeholder vs siap produksi

| Siap dipakai | Masih placeholder |
| --- | --- |
| Engine sesi (timer, resume, timeout, anti-double-attempt) | Soal/konten IST (fabrikasi) |
| Workflow HR + kode akses (hash, revoke, regenerate) | Kunci jawaban & rubrik GE |
| Pipeline kalkulasi + snapshot versi + audit | Tabel norma & band usia |
| Laporan PDF ber-hash + storage privat | Formula IQ/kategori/dominansi (`PLACEHOLDER_*`) |

Penggantian resmi = seed baru + `tests/golden/cases.json` resmi + bump `ENGINE_VERSION` — lihat
`docs/OPERATIONS.md`.

## Dokumen

- `DEVELOPMENT_BRIEF.md` / `DEVELOPMENT_SPEC.md` — kebutuhan & spesifikasi.
- `docs/plans/2026-07-14-ist-production-phase1-5.md` — rencana eksekusi Phase 1–5.
- `docs/plans/PROGRESS.md` — status per task.
- `docs/OPERATIONS.md` — runbook operator + daftar yang belum ada.
- `DESIGN.md` — design system baseline UI.
