import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a local dev server + the DEV Supabase database (T34).
 *
 * Prasyarat (didokumentasikan, belum di-CI — itu Phase 6):
 *   1. `.env.local` terisi dan `npm run db:migrate && npm run db:seed-e2e` sudah jalan
 *      (seed-e2e memendekkan durasi SE ke 15 detik — DEV ONLY).
 *   2. Akun HR: `npm run create-admin -- --email <E2E_HR_EMAIL> --password <E2E_HR_PASSWORD>
 *      --name "E2E HR" --role super_admin --permissions view_results`
 *   3. Env untuk suite: E2E_HR_EMAIL + E2E_HR_PASSWORD (dibaca test), opsional E2E_BASE_URL.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
