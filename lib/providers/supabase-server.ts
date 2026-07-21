import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerConfig } from "../config.ts";

/**
 * The AuthProvider seam: every server-side read of the HR/Admin session goes through here, so
 * swapping Supabase Auth for another provider is a change to this file plus `authz.ts`, not to
 * every layout and route handler.
 *
 * Uses the PUBLISHABLE key deliberately — this client acts as the signed-in user and must stay
 * subject to their privileges. `SUPABASE_SECRET_KEY` bypasses them and belongs only in
 * `scripts/create-admin-user.ts`, never on a request path.
 *
 * This module imports `next/headers`, so it is only importable inside the Next runtime. `authz.ts`
 * therefore reaches it through a dynamic import, which keeps the DB-side authorization logic
 * loadable from the plain-Node test runner.
 */
export async function createSupabaseServerClient() {
  const config = getServerConfig();
  const cookieStore = await cookies();

  return createServerClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components get a READ-ONLY cookie store, so a token refresh triggered from a
            // layout throws here. Swallowing is correct rather than lazy: `proxy.ts` runs before
            // every matched request and writes the refreshed cookies onto a real response, so the
            // rotated token is already persisted by the time a layout observes the session.
            // Rethrowing would turn a routine refresh into a 500 on every protected page.
          }
        },
      },
    },
  );
}
