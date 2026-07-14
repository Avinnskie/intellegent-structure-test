# IST Assessment

Website untuk pelaksanaan, skoring, dan pelaporan Intelligenz Struktur Test (IST). Dibangun dengan Next.js App Router, React, TypeScript, dan Tailwind CSS.

Baseline UI telah memvalidasi alur pengguna, struktur halaman, aturan timer, navigasi subtes, akses kode peserta, dan dashboard hasil. Project sekarang memasuki production development. Implementasi saat ini masih memakai data fiktif/in-memory sampai backend, scoring tervalidasi, security, UAT, dan pilot memenuhi exit gate pada `DEVELOPMENT_BRIEF.md`.

Target deployment awal menggunakan Vercel untuk aplikasi Next.js serta Supabase untuk PostgreSQL, autentikasi HR/Admin, dan private Storage. Integrasi dibuat melalui provider/adapter agar aplikasi dapat dipindahkan ke Node.js/Docker, PostgreSQL, object storage, dan OIDC/SSO pada server kantor.

## Menjalankan

```bash
npm install
npm run dev    # development server di http://localhost:3000
npm run build  # production build
npm test       # unit test (node:test)
```

## Route utama

### Peserta (tanpa akun)

| Route            | Fungsi                                                      |
| ---------------- | ----------------------------------------------------------- |
| `/`              | Input kode akses (demo: `IST-7K4M9Q2D`)                     |
| `/test/tutorial` | Tutorial per subtes, timer belum berjalan                   |
| `/test/session`  | Pengerjaan soal: jawab, lewati, review belum dijawab, timer |
| `/test/complete` | Halaman penutup                                             |

Urutan subtes tetap: `SE -> WA -> AN -> GE -> RA -> ZR -> FA -> WU -> ME` (total 72 menit kerja).

### HR Admin

| Route                                      | Fungsi                                         |
| ------------------------------------------ | ---------------------------------------------- |
| `/hr`                                      | Dashboard metric dan sesi terbaru              |
| `/hr/participants`, `/hr/participants/new` | Registry dan pembuatan peserta                 |
| `/hr/sessions`, `/hr/sessions/new`         | Daftar sesi, generate/revoke/regenerate kode   |
| `/hr/sessions/[sessionId]`                 | Detail dan progres sesi                        |
| `/hr/scoring/[sessionId]/ge`               | Skoring GE rubrik 0/1/2                        |
| `/hr/results/[sessionId]`                  | Hasil, grafik sembilan subtes, finalisasi      |
| `/hr/reports/[sessionId]`                  | Preview laporan (unduh terkunci sebelum final) |
| `/hr/tutorials`                            | Daftar, versi, dan publikasi tutorial          |
| `/hr/question-bank`                        | Versi subtes, tambah, dan perbarui soal        |

### Super Admin

| Route                  | Fungsi                       |
| ---------------------- | ---------------------------- |
| `/admin/users`         | Pengelolaan akun HR          |
| `/admin/tutorials`     | Pengelolaan tutorial global  |
| `/admin/question-bank` | Pengelolaan bank soal global |
| `/admin/audit`         | Audit log                    |

## Struktur

- `app/` — route App Router
- `components/participant|hr|ui/` — komponen per surface
- `lib/ist-data.ts` — mock data fiktif
- `lib/ist-logic.ts` — logic murni (usia, urutan subtes, validasi & generate kode)
- `tests/` — unit test untuk logic
- `DESIGN.md` — design system dan baseline UI

Acuan utama: `DEVELOPMENT_BRIEF.md` (roadmap sampai go-live) dan `DEVELOPMENT_SPEC.md` (spesifikasi lengkap) pada root project ini.
