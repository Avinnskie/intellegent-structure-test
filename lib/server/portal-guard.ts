import { redirect } from "next/navigation";
import { ApiError } from "../api/errors.ts";
import { getDb } from "../db/client.ts";
import { requireHrUser, type AuthContext, type UserRole } from "./authz.ts";

/**
 * The layout-side wrapper around `requireHrUser`: same check, but it renders a redirect instead of
 * an error envelope, because a page cannot hand a human a 401.
 *
 * ⚠️ THIS GATES ENTRY AND FULL PAGE LOADS ONLY — NOT EVERY REQUEST. Layouts do not re-render on
 * client-side navigation (Partial Rendering), so a user deactivated mid-session keeps moving
 * between /hr pages until a hard reload. `proxy.ts` runs on those RSC requests but only validates
 * the Supabase session; it never reads `status`, `role` or `permissions`.
 *
 * So this is a UX gate — it stops the shell rendering for a stranger — NOT the security boundary.
 * The boundary is `requireHrUser`/`requirePermission` called at the data source and in every Server
 * Action; see the warning on `requireHrUser`, which the next tasks must follow. It is only
 * harmless today because these pages render static demo data and there is no data layer yet.
 *
 * Kept out of `authz.ts` because it imports `next/navigation`, which would drag the Next runtime
 * into the plain-Node test runner that exercises the authorization rules.
 */
export async function requirePortalUser(requiredRole?: UserRole): Promise<AuthContext> {
  let context: AuthContext;

  try {
    context = await requireHrUser(getDb());
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    if (error instanceof ApiError && error.code === "FORBIDDEN") {
      // Authenticated but not provisioned, or deactivated. `denied=1` gives the login page the
      // copy to explain why, instead of showing a bare form to someone who just passed it.
      redirect("/login?denied=1");
    }
    // Anything else (the database being down, say) is NOT an auth failure. Bouncing it to /login
    // would dress an outage up as a login problem and leave the user retrying credentials that
    // were never the issue — let it reach the error boundary.
    throw error;
  }

  if (requiredRole && context.role !== requiredRole) {
    // A real, active user in the wrong portal — send them to the one they do have, not to a login
    // form they have already satisfied.
    redirect("/hr");
  }

  return context;
}
