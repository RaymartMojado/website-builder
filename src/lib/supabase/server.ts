import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for server components, server actions, and route handlers.
 *
 * Uses the ANON key and the caller's cookies, so it acts as the signed-in user
 * and is subject to RLS. Never use the service-role key here.
 *
 * Cookies are host-only — @supabase/ssr does not set a `domain` attribute, so
 * the session cookie for app.yourbuilder.com is unreachable from published
 * customer sites on the separate sites domain. Do not add one.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies. Harmless: proxy.ts refreshes
            // the session on every request, so the write is never needed here.
          }
        },
      },
    },
  );
}

/**
 * The authenticated user, or null.
 *
 * Always getUser(), never getSession(). getSession() reads the cookie without
 * verifying it against the auth server, so a forged cookie would pass. This is
 * the single most common Supabase auth mistake.
 */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
