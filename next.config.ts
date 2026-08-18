import type { NextConfig } from "next";

const SCRIPT_SRC =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const CSP = [
  "default-src 'self'",
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: CSP },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  /**
   * Halaman peserta tidak boleh disajikan dari cache klien.
   *
   * Router Cache milik Next menyimpan hasil render halaman dinamis selama
   * beberapa saat, termasuk untuk navigasi mundur. Pada aplikasi biasa itu
   * terasa cepat; di sini berbahaya — peserta yang menekan tombol back setelah
   * menutup sebuah subtes dapat melihat kembali halaman soalnya, lengkap dengan
   * tombol jawab yang sudah tidak berlaku, karena penjaga status di server
   * tidak pernah ikut dijalankan.
   *
   * Dengan nol, setiap navigasi memaksa render ulang di server, sehingga
   * pengalihan status selalu diberlakukan.
   *
   * Hanya `dynamic` yang disetel. Next menolak `static` di bawah 30 detik, dan
   * penolakan itu membatalkan SELURUH blok `experimental` — termasuk `dynamic`
   * yang sebenarnya kita butuhkan. Halaman peserta memang dinamis seluruhnya
   * (semuanya membaca sesi dari basis data), jadi `static` tidak relevan.
   */
  experimental: {
    staleTimes: { dynamic: 0 },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
