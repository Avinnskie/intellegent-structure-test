-- Sesi yang hanya berisi PAPI, tanpa IST.
--
-- Kebalikan dari `includes_papi` yang sudah ada. Keduanya dipisah, bukan
-- digabung menjadi satu kolom "jenis sesi", karena sesi lama tidak menyimpan
-- informasi itu dan harus tetap terbaca apa adanya.
--
-- Default 1 agar seluruh sesi yang sudah tersimpan tetap dianggap memuat IST —
-- dan itu memang benar, karena sebelum ini IST selalu wajib.
ALTER TABLE "assessment_sessions" ADD COLUMN IF NOT EXISTS "includes_ist" integer DEFAULT 1 NOT NULL;
