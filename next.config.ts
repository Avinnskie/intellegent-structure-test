import type { NextConfig } from "next";

/**
 * Baseline security headers (T33, spec §19). CSP is deliberately conservative-but-workable:
 * `'unsafe-inline'` stays until the nonce-based CSP lands in Phase 6 (see docs/OPERATIONS.md) —
 * Next's inline runtime scripts need it without nonces. connect-src allows only self + Supabase.
 */
// React dev mode needs eval() for debugging features (callstack reconstruction); it never uses
// eval in production. The allowance is scoped to development only — production CSP stays strict.
const SCRIPT_SRC =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const CSP = [
  "default-src 'self'",
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline'",
  // Signed media URLs (question images, tutorial videos) are served from the Supabase project.
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
  // HSTS only where TLS is guaranteed; a dev localhost must not get pinned to https.
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
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
