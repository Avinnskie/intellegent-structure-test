import { defineConfig } from "drizzle-kit";

const COMMANDS_REQUIRING_DATABASE = ["migrate", "push", "pull", "studio"];

const directDatabaseUrl = process.env.DIRECT_DATABASE_URL ?? "";
const needsDatabase = process.argv.some((argument) =>
  COMMANDS_REQUIRING_DATABASE.includes(argument),
);

if (needsDatabase && !directDatabaseUrl) {
  throw new Error(
    "DIRECT_DATABASE_URL wajib diisi untuk drizzle-kit. Salin .env.example ke .env.local lalu isi dari Supabase Dashboard → Connect → ORMs.",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: directDatabaseUrl },
});
