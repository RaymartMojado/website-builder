import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * The auth boundary for the whole app surface.
 *
 * Enforced here rather than in proxy.ts so that adding a route under
 * /dashboard cannot accidentally ship unprotected — there is no matcher
 * pattern to forget to update.
 *
 * It renders no chrome. Deciding that here meant branching on the request
 * pathname, which a shared layout does not get to re-evaluate on a client-side
 * navigation, so the editor inherited the dashboard's chrome until a refresh.
 * The chrome now lives in the (chrome) route group beside the editor, where
 * the router picks it per route instead.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const headerList = await headers();
  if (headerList.get("x-surface") === "published") redirect("/");

  return <>{children}</>;
}
