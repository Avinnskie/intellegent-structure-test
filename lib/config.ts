import { z } from "zod";

const serverEnvSchema = z.object({
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_MEDIA_BUCKET: z.string().min(1),
  SUPABASE_REPORT_BUCKET: z.string().min(1),
  SESSION_TOKEN_SECRET: z.string().min(32),
  ACCESS_CODE_PEPPER: z.string().min(32),
  ERROR_MONITORING_DSN: z.string().optional(),
});

export type ServerConfig = z.infer<typeof serverEnvSchema>;

export function getServerConfig(): ServerConfig {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Konfigurasi environment tidak lengkap/invalid: ${missing}`);
  }
  return parsed.data;
}
