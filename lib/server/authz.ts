import { eq } from "drizzle-orm";
import { ApiError } from "../api/errors.ts";
import { getServerConfig } from "../config.ts";
import type { DbLike } from "../db/client.ts";
import { users } from "../db/schema.ts";

/** "hr_admin" | "super_admin" — derived from the table so it cannot drift from the enum. */
export type UserRole = (typeof users.$inferSelect)["role"];

/**
 * Everything an authorization decision is allowed to depend on. Built only by `resolveHrUser`, so
 * a caller cannot assemble one from unverified request data.
 */
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

/**
 * The Supabase auth user for the current request, or null when anonymous.
 *
 * `auth.getUser()` — never `auth.getSession()`: getSession returns whatever the cookie claims
 * without verifying it, and the cookie is attacker-supplied data. getUser revalidates the JWT with
 * the auth server, so its answer is the only one safe to authorize against.
 *
 * The provider is imported dynamically because it pulls in `next/headers`, which does not resolve
 * outside the Next runtime. The import is evaluated on call, not on module load, so
 * `tests/integration/authz.test.ts` can import this module and exercise the DB-side logic below
 * against real PGlite without mocking the database or stubbing Next.
 */
export async function getAuthUser(): Promise<{ id: string } | null> {
  const { createSupabaseServerClient } = await import("../providers/supabase-server.ts");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }
  return { id: data.user.id };
}

/**
 * Maps a VERIFIED Supabase auth id onto its `users` row.
 *
 * The `users` row — not the JWT — is the authorization source of truth: role and permissions live
 * in our database, so a revoked privilege takes effect on the next request instead of whenever the
 * token happens to expire.
 *
 * Split out from `requireHrUser` so the authorization rules are reachable from tests with a real
 * database and no Supabase runtime. Callers on a request path should use `requireHrUser`; passing
 * an unverified id here is the one way to defeat this module.
 */
export async function resolveHrUser(db: DbLike, authUserId: string): Promise<AuthContext> {
  const [row] = await db.select().from(users).where(eq(users.id, authUserId)).limit(1);

  if (!row) {
    // 403, not 401: they proved who they are, they just are not provisioned here. A 401 would
    // send them back to a login they can already pass, and loop them.
    throw new ApiError("FORBIDDEN", NOT_PROVISIONED_MESSAGE, 403);
  }

  if (row.status !== "active") {
    // A deactivated user keeps a valid Supabase session until its token expires, so the status
    // check has to happen per request or deactivation would not actually deactivate anything.
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

/**
 * The authorization gate for HR/Admin surfaces: authenticated (Supabase) AND provisioned and active
 * (`users`). `proxy.ts` is an optimistic cookie check that this deliberately re-does against
 * verified state.
 *
 * ⚠️ CALLING THIS IN A LAYOUT DOES NOT PROTECT THE PAGES UNDER IT. Next's layouts do not re-render
 * on client-side navigation (Partial Rendering), so `app/hr/layout.tsx` runs on ENTRY and on full
 * page loads — NOT on every request. A user deactivated mid-session keeps navigating within /hr
 * until a hard reload: the proxy does run on those RSC requests, but it only checks that the
 * Supabase session is valid and never reads `status`, `role` or `permissions`.
 *
 * THE INVARIANT EVERY LATER TASK MUST HOLD: authorization is re-checked AT THE DATA SOURCE and in
 * EVERY Server Action / route handler — call `requireHrUser` (or `requirePermission` on a context
 * resolved there) in the data layer itself. Never inherit a decision from the layout, and never
 * treat "the layout already checked" as sufficient. Next's own guidance is explicit that layout
 * checks are not recommended as the boundary, because nested segments and Server Actions bypass
 * them (see node_modules/next/dist/docs/01-app/02-guides/authentication.md, "Layouts and auth
 * checks"). The layout gate is UX — it keeps the shell from rendering for a stranger — not security.
 *
 * ⚠️ DO NOT CALL INSIDE `db.transaction()`. It type-checks against a transaction handle, but
 * `getAuthUser()` is a network round-trip to Supabase Auth, which would hold a pooled connection
 * open across it — bad under the transaction pooler's low connection limit. Correct shape: resolve
 * the `AuthContext` BEFORE opening the transaction and pass `ctx` in. `resolveHrUser(tx, id)` is
 * the half meant to compose inside one.
 */
export async function requireHrUser(db: DbLike): Promise<AuthContext> {
  const authUser = await getAuthUser();

  if (!authUser) {
    throw new ApiError("UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE, 401);
  }
  return resolveHrUser(db, authUser.id);
}

/**
 * Asserts a granted permission, LITERALLY, for every role.
 *
 * `super_admin` does NOT bypass this — spec §4.3 requires that reading participant results is a
 * grant someone made on purpose, not something a role confers by implication. A super_admin without
 * `view_results` administers the system and cannot read results; that separation is the entire
 * point of the rule and is why the check is a plain array membership test with no role branch. Do
 * not add one.
 *
 * `hr_admin` is the role that carries `view_results` in practice, but it carries it because the
 * grant is written on the row, not because of the role name.
 */
export function requirePermission(ctx: AuthContext, permission: string): void {
  if (!ctx.permissions.includes(permission)) {
    throw new ApiError("FORBIDDEN", NO_PERMISSION_MESSAGE, 403);
  }
}

/**
 * CSRF defense for mutation handlers (spec §19). HR/Admin auth rides on cookies, which the browser
 * attaches to cross-site requests too, so a state-changing handler has to prove the request came
 * from our own origin.
 *
 * NO CALL SITES YET, BY DESIGN — CSRF is not unwired, so please do not "fix" it by bolting this
 * onto something. Today's only mutation surface is Server Actions, which Next protects natively by
 * comparing Origin against Host. This is the guard for the `app/api/**` route handlers that arrive
 * later: those get no built-in protection, and each one must call this.
 *
 * MISSING `Origin` IS REJECTED (fail closed). The trade-off: a cross-site attack is browser-driven
 * and every browser that can run this app sends `Origin` on POST — including same-origin form
 * posts — so an absent header does not describe any attack we would otherwise catch; it describes a
 * non-browser client (curl, a future integration script) or a browser old enough that this app does
 * not run in it. Failing closed follows OWASP's recommendation, and costs us only that non-browser
 * callers must set `Origin` explicitly. The alternative, treating absence as same-origin, makes the
 * header optional — and a check an attacker can skip by omitting the thing being checked is not a
 * check. Pinned by test: "assertSameOrigin rejects a request with no Origin header".
 *
 * Compares HOST (host + port), per plan and OWASP: scheme is excluded because a TLS-terminating
 * proxy can leave `APP_BASE_URL` and the browser's `Origin` disagreeing on it.
 *
 * `appBaseUrl` is injectable so the check is testable without a fully populated server env;
 * request-path callers omit it and get the validated config.
 */
export function assertSameOrigin(request: Request, appBaseUrl?: string): void {
  const origin = request.headers.get("origin");

  if (origin === null) {
    throw new ApiError("CSRF_REJECTED", CSRF_MESSAGE, 403);
  }

  const expected = appBaseUrl ?? getServerConfig().APP_BASE_URL;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // "null" (a sandboxed iframe or a redirected cross-origin request) and any other non-URL land
    // here. Unparseable can never match, so this is the same rejection, not a special case.
    throw new ApiError("CSRF_REJECTED", CSRF_MESSAGE, 403);
  }

  if (originHost !== new URL(expected).host) {
    throw new ApiError("CSRF_REJECTED", CSRF_MESSAGE, 403);
  }
}
