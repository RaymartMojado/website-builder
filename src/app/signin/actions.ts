"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, clearRateLimit } from "@/lib/security/rate-limit";
import { recordAudit } from "@/lib/audit";

/**
 * Sign-in and sign-up — OWASP A07.
 *
 * Failures return one generic message regardless of cause. "No account with
 * that email" versus "wrong password" is an account enumeration oracle, and
 * Supabase's own error strings distinguish them, so they are deliberately not
 * forwarded.
 */

const GENERIC_FAILURE = "Those details didn't work. Check them and try again.";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export interface AuthFormState {
  error?: string;
  notice?: string;
}

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headerList.get("x-real-ip") ?? "unknown";
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { email, password } = parsed.data;
  const ip = await clientIp();

  // Limited per IP *and* per account: an IP limit alone lets a botnet spread a
  // credential-stuffing run across addresses, and an account limit alone lets
  // one IP walk the whole user list.
  const [byIp, byAccount] = await Promise.all([
    checkRateLimit("auth", `ip:${ip}`),
    checkRateLimit("auth", `email:${email.toLowerCase()}`),
  ]);

  if (!byIp.success || !byAccount.success) {
    await recordAudit({ action: "auth.login.ratelimited", meta: { email } });
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await recordAudit({ action: "auth.login.failed", meta: { email, reason: error.message } });
    return { error: GENERIC_FAILURE };
  }

  // A correct password is not a guess, so it should not consume the budget
  // that exists to slow guessing down.
  await Promise.all([
    clearRateLimit("auth", `ip:${ip}`),
    clearRateLimit("auth", `email:${email.toLowerCase()}`),
  ]);

  await recordAudit({ action: "auth.login.success", meta: { email } });
  redirect("/dashboard");
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { email, password } = parsed.data;

  const limit = await checkRateLimit("signup", `ip:${await clientIp()}`);
  if (!limit.success) return { error: "Too many sign-ups from here. Try again later." };

  const supabase = await createSupabaseServerClient();
  const origin = (await headers()).get("origin") ?? "";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    // Same generic response either way — a distinct "already registered"
    // message would confirm which addresses have accounts.
    await recordAudit({ action: "auth.signup.failed", meta: { email, reason: error.message } });
    return { error: GENERIC_FAILURE };
  }

  // No session means email confirmation is required before signing in.
  if (!data.session) {
    return { notice: "Check your email to confirm your address, then sign in." };
  }

  await recordAudit({ action: "auth.signup.success", meta: { email } });
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/signin");
}
