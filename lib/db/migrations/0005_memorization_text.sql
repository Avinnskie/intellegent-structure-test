-- Daftar kata hafalan subtes ME, terpisah dari teks tutorial.
--
-- Sebelumnya daftar itu menjadi bagian `text_content`, yang juga tampil di
-- halaman tutorial. Akibatnya peserta dapat membacanya sepuasnya sebelum
-- menekan "Mulai menghafal", dan batas tiga menit kehilangan artinya.
--
-- Nullable: hanya ME yang memerlukannya. Delapan subtes lain tetap NULL.
ALTER TABLE "tutorial_versions" ADD COLUMN IF NOT EXISTS "memorization_text" text;
