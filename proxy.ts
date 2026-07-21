import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (Middleware's name since Next 16) — an OPTIMISTIC guard, not the authorization boundary.
 *
 * It does two things: bounce obviously-anonymous visitors to /login instead of rendering a shell
 * they cannot use, and give `@supabase/ssr` a writable response so it can rotate an expired token
 * (a Server Component cannot — see the setAll comment in `lib/providers/supabase-server.ts`).
 *
 * It decides NOTHING about authorization: role, permissions and `status` are never read here. Real
 * enforcement is `requireHrUser` in the layouts and, later, in mutation handlers, which re-checks
 * the session against the `users` row on every request. Per Next's guidance, proxy runs on every
 * matched request including prefetches, so it stays free of database work.
 *
 * `process.env` is read directly rather than through `getServerConfig()`: this runs in the Edge
 * runtime, where the full server env is not present and only statically-referenced NEXT_PUBLIC_*
 * values are inlined at build time.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser, never getSession: getSession trusts the cookie as-is. Here that would only cost a
  // pointless redirect, but the habit is the bug — so the safe call is the only one used anywhere.
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    const loginUrl = new URL("/login", request.url);
    // Round-trip the destination so a deep link survives the login. `/login` re-validates this as
    // an internal path before redirecting to it — it is attacker-controlled from here on.
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Carries the refreshed auth cookies when setAll rebuilt the response above.
  return response;
}

export const config = { matcher: ["/hr/:path*", "/admin/:path*"] };
