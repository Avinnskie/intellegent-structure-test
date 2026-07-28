import { z } from "zod";

const emptyStringAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const serverEnvSchema = z.object({
  APP_BASE_URL: z.string().trim().min(1).superRefine((value, ctx) => {
    try {
      const url = new URL(value);
      if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "APP_BASE_URL harus origin tanpa path.",
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "APP_BASE_URL harus origin tanpa path.",
      });
    }
  }),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_MEDIA_BUCKET: z.string().min(1),
  SUPABASE_REPORT_BUCKET: z.string().min(1),
  SESSION_TOKEN_SECRET: z.string().min(32),
  ACCESS_CODE_PEPPER: z.string().min(32),
  ERROR_MONITORING_DSN: z
    .string()
    .optional()
    .transform((value) => value || undefined),

  TRUSTED_PROXY_MODE: z.preprocess(
    emptyStringAsUndefined,
    z.enum(["vercel", "trusted-depth", "peer"]).default("vercel"),
  ),

  TRUSTED_PROXY_DEPTH: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().min(1).optional(),
  ),
});

const serverConfigSchema = serverEnvSchema.superRefine((env, ctx) => {
  if (env.TRUSTED_PROXY_MODE === "trusted-depth" && env.TRUSTED_PROXY_DEPTH === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["TRUSTED_PROXY_DEPTH"],
      message: "TRUSTED_PROXY_DEPTH wajib diisi saat TRUSTED_PROXY_MODE=trusted-depth.",
    });
  }
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

function parseServerConfig(): ServerConfig {
  const parsed = serverConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const invalidPaths = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Konfigurasi environment tidak lengkap/invalid: ${invalidPaths}`);
  }
  return parsed.data;
}

let cached: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  return (cached ??= parseServerConfig());
}

export function resetServerConfigCache(): void {
  cached = undefined;
}
