import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Website Builder" };

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-blue-700">
          Website Builder
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="text-sm text-neutral-600">
          New here? Create an account with the same form — your 7-day trial starts right away.
        </p>
      </div>
      <SignInForm />
    </main>
  );
}
