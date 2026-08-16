import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * PKCE / email-confirmation callback.
 *
 * Supabase redirects here with a `code` to exchange for a session. `next` is
 * validated as a same-origin relative path — accepting an arbitrary value
 * would be an open redirect, which is exactly what a phishing flow wants from
 * a post-login handoff.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requested = url.searchParams.get("next") ?? "/dashboard";

  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/signin?error=missing_code", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/signin?error=exchange_failed", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
