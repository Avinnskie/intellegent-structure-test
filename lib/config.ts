import { z } from "zod";

/** An unset variable and one present-but-empty (`KEY=` in a .env file) must mean the same thing. */
const emptyStringAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const serverEnvSchema = z.object({
  APP_BASE_URL: z.url(),
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

  /**
   * How the client's IP is derived from `X-Forwarded-For` for rate limiting. This is a SECURITY
   * decision, not a preference: pick the wrong one and the header becomes attacker-controlled, every
   * request lands in a fresh bucket, and the limiter is silently gone with all tests still green.
   *
   * - `vercel` — trust the LEFTMOST entry. Correct only where the platform OVERWRITES the header
   *   with the real peer (Vercel does). Directly exposed, this trusts the caller.
   * - `trusted-depth` — take the Nth entry from the RIGHT, per `TRUSTED_PROXY_DEPTH`. This is the
   *   mode for the company reverse proxy of spec §5.5, whose nginx `proxy_add_x_forwarded_for`
   *   APPENDS the real peer, leaving everything to its left forgeable.
   * - `peer` — ignore the header entirely. No per-client attribution is possible, so every caller
   *   shares one bucket: strictly fail-closed, and a blunt instrument.
   */
  TRUSTED_PROXY_MODE: z.preprocess(
    emptyStringAsUndefined,
    z.enum(["vercel", "trusted-depth", "peer"]).default("vercel"),
  ),

  /** Number of trusted proxies in front of the app. Required by, and only used by, `trusted-depth`. */
  TRUSTED_PROXY_DEPTH: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().min(1).optional(),
  ),
});

const serverConfigSchema = serverEnvSchema.superRefine((env, ctx) => {
  // A `trusted-depth` deployment with no depth would silently fall back to a guess about the proxy
  // chain. The migration in spec §5.5 must state the depth, not inherit one.
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

/**
 * Memoized because this schema is not cheap and the call sites are hot: every participant request
 * resolves a session token, which reads `SESSION_TOKEN_SECRET` from here, and re-parsing ~12 vars
 * through zod plus a `superRefine` on each one is pure waste. The environment is fixed at boot in
 * every deployment target we have, so there is nothing to invalidate.
 *
 * A FAILED parse is deliberately NOT cached — it throws, so there is no value to keep, and a
 * process that starts before its env is populated can still recover once it is.
 */
let cached: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  return (cached ??= parseServerConfig());
}

/**
 * TEST-ONLY. Drops the memo so a test can swap `process.env` and observe a fresh parse.
 *
 * Production has no caller and must not grow one: config changing under a running process is not a
 * thing we support, and a reset would let one request see a different secret than the next.
 */
export function resetServerConfigCache(): void {
  cached = undefined;
}
