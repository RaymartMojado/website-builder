import { getCurrentUser } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/billing/entitlement";
import { signOutAction } from "@/app/signin/actions";
import { TrialBanner } from "../trial-banner";

/**
 * The dashboard chrome: header, trial banner, and the centred column.
 *
 * This lives in a route group rather than behind a condition in the parent
 * layout. The parent used to read the pathname from a request header and
 * return bare children for the editor, which was correct on a full page load
 * and wrong on every client-side navigation: Next reuses a shared layout
 * across soft navigations instead of re-rendering it, so opening the editor
 * from the dashboard kept the chrome that had been rendered for the dashboard.
 * The editor appeared squeezed into `max-w-5xl` under a header and banner, and
 * a manual refresh "fixed" it — the tell-tale shape of layout state decided at
 * request time rather than by the route tree.
 *
 * `(chrome)` does not appear in the URL, so /dashboard is unchanged. The editor
 * sits outside this group and is therefore full-viewport by construction, with
 * no condition anywhere that a future route could get wrong.
 */
export default async function ChromeLayout({ children }: { children: React.ReactNode }) {
  // Non-null in practice: the parent layout is the auth boundary and has
  // already redirected anyone without a session. Reading it again is a
  // deduped cache hit, not a second round trip to the auth server.
  const user = await getCurrentUser();
  const entitlement = user ? await getEntitlement(user.id) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <span className="font-mono text-xs uppercase tracking-widest text-blue-700">
            Website Builder
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600">{user?.email}</span>
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

      {entitlement ? (
        <TrialBanner
          plan={entitlement.plan}
          trialEndsAt={entitlement.trialEndsAt?.toISOString() ?? null}
        />
      ) : null}

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
