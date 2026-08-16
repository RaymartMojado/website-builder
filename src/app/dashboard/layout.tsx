import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/billing/entitlement";
import { signOutAction } from "@/app/signin/actions";
import { TrialBanner } from "./trial-banner";

/**
 * The auth boundary for the whole app surface.
 *
 * Enforced here rather than in proxy.ts so that adding a route under
 * /dashboard cannot accidentally ship unprotected — there is no matcher
 * pattern to forget to update.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const headerList = await headers();
  if (headerList.get("x-surface") === "published") redirect("/");

  // The editor is a full-viewport tool, so it opts out of the dashboard chrome
  // while still sitting behind this same auth boundary.
  const isEditor = headerList.get("x-pathname")?.includes("/dashboard/editor");

  if (isEditor) return <>{children}</>;

  const entitlement = await getEntitlement(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <span className="font-mono text-xs uppercase tracking-widest text-blue-700">
            Website Builder
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600">{user.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <TrialBanner
        plan={entitlement.plan}
        trialEndsAt={entitlement.trialEndsAt?.toISOString() ?? null}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
