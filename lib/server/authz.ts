import { eq } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import { logInfo } from "./logger.ts";
import type { DbLike } from "../db/client.ts";
import { users } from "../db/schema.ts";

export type UserRole = (typeof users.$inferSelect)["role"];

export type AuthContext = {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: UserRole;
  readonly permissions: readonly string[];
  readonly displayName: string;
};

const UNAUTHENTICATED_MESSAGE = "Anda belum masuk. Silakan login terlebih dahulu.";
const NOT_PROVISIONED_MESSAGE = "Akun Anda belum terdaftar pada portal ini. Hubungi Super Admin.";
const INACTIVE_MESSAGE = "Akun Anda dinonaktifkan. Hubungi Super Admin.";
const NO_PERMISSION_MESSAGE = "Anda tidak memiliki izin untuk tindakan ini.";
const CSRF_MESSAGE = "Permintaan ditolak karena asal permintaan tidak dikenal.";

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;

  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  try {
    const url = normalizedValue.startsWith("http") ? new URL(normalizedValue) : new URL(`https://${normalizedValue}`);
    return url.origin;
  } catch {
    return null;
  }
}

function getTrustedOrigins(): Set<string> {
  const candidates = [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_BASE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined,
    process.env.NODE_ENV !== "production" ? "http://127.0.0.1:3000" : undefined,
  ];

  return new Set(
    candidates
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );
}

function isTrustedOrigin(request: Request, trustedOrigins = getTrustedOrigins()): boolean {
  const requestOrigin = normalizeOrigin(request.headers.get("origin") ?? undefined);

  if (!requestOrigin) {
    return false;
  }

  return trustedOrigins.has(requestOrigin);
}

export async function getAuthUser(): Promise<{ id: string } | null> {
  const { createSupabaseServerClient } = await import("../providers/supabase-server.ts");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }
  return { id: data.user.id };
}

export async function resolveHrUser(db: DbLike, authUserId: string): Promise<AuthContext> {
  const [row] = await db.select().from(users).where(eq(users.id, authUserId)).limit(1);

  if (!row) {
    throw new ApiError("FORBIDDEN", NOT_PROVISIONED_MESSAGE, 403);
  }

  if (row.status !== "active") {
    throw new ApiError("FORBIDDEN", INACTIVE_MESSAGE, 403);
  }

  return {
    userId: row.id,
    organizationId: row.organizationId,
    role: row.role,
    permissions: row.permissions,
    displayName: row.displayName,
  };
}

export async function requireHrUser(db: DbLike): Promise<AuthContext> {
  const authUser = await getAuthUser();

  if (!authUser) {
    throw new ApiError("UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE, 401);
  }
  return resolveHrUser(db, authUser.id);
}

export function requirePermission(ctx: AuthContext, permission: string): void {
  if (!ctx.permissions.includes(permission)) {
    throw new ApiError("FORBIDDEN", NO_PERMISSION_MESSAGE, 403);
  }
}

export function assertSameOrigin(request: Request, appBaseUrl?: string): void {
  const trustedOrigins = getTrustedOrigins();
  const overrideOrigin = normalizeOrigin(appBaseUrl);
  if (overrideOrigin) {
    trustedOrigins.add(overrideOrigin);
  }

  if (!isTrustedOrigin(request, trustedOrigins)) {
    logInfo("csrf_rejected", {
      origin: request.headers.get("origin") ?? null,
      referer: request.headers.get("referer") ?? null,
      host: request.headers.get("host") ?? null,
      forwardedHost: request.headers.get("x-forwarded-host") ?? null,
      forwardedProto: request.headers.get("x-forwarded-proto") ?? null,
      trustedOrigins: [...trustedOrigins].join(","),
    });
    throw new ApiError("CSRF_REJECTED", CSRF_MESSAGE, 403);
  }
}
