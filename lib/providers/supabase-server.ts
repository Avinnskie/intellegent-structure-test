import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerConfig } from "../config.ts";

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
          }
        },
      },
    },
  );
}
