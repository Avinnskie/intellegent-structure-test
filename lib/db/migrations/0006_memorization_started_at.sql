-- Kapan peserta mulai menghafal pada subtes ME.
--
-- Sebelumnya waktu mulai hanya hidup di state komponen, sehingga menyegarkan
-- halaman memberi tiga menit baru — berkali-kali, tanpa batas. Menyimpannya di
-- basis data membuat hitungan mundur bertahan melintasi refresh dan perangkat.
--
-- Disimpan pada sesi, bukan pada `subtest_attempts`, karena tahap menghafal
-- berlangsung SEBELUM attempt subtes dibuat: timer subtes baru berjalan setelah
-- menghafal selesai.
ALTER TABLE "assessment_sessions"
  ADD COLUMN IF NOT EXISTS "memorization_started_at" timestamp with time zone;
