import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { generateNonce, securityHeaders, type Surface } from "@/lib/security/headers";
import { PREVIEW_PREFIX, sitesHostIsRoutable } from "@/lib/sites/subdomain";

/**
 * Host-based routing, security headers, and Supabase session refresh.
 *
 * (In Next 16 this file is `proxy.ts`; `middleware.ts` is deprecated. The
 * runtime is Node and is not configurable.)
 *
 * Three surfaces on two registrable domains:
 *
 *   yourbuilder.com          → (marketing)
 *   app.yourbuilder.com      → (app)      auth required
 *   {slug}.yourbuilder.site  → (sites)    published customer content
 *
 * dev equivalents:
 *   localhost:3000 | app.localhost:3000 | {slug}.sites.localhost:3000
 *
 * Auth is *refreshed* here but not *enforced* here. Enforcement lives in the
 * (app) layout, so a routing change can never silently unprotect a page.
 */

const MARKETING_HOST = process.env.NEXT_PUBLIC_MARKETING_HOST ?? "localhost:3000";
const APP_HOST = process.env.NEXT_PUBLIC_APP_HOST ?? "app.localhost:3000";
const SITES_HOST = process.env.NEXT_PUBLIC_SITES_HOST ?? "sites.localhost:3000";

function stripPort(host: string): string {
  return host.split(":")[0]!.toLowerCase();
}

export interface Routed {
  surface: Surface;
  /** Set for the published surface: the customer's subdomain label. */
  slug?: string;
}

/**
 * Same-origin preview: /s/{slug}/... resolves to the published surface.
 *
 * Wildcard subdomains require a domain you own, so a deployment without one
 * has nowhere to serve sites from and they become unviewable. This puts them
 * back within reach on the app's own origin.
 *
 * It is a deliberate downgrade, not the intended shape. Published content
 * served here shares an origin with the session cookie, which is exactly the
 * isolation the separate registrable domain exists to provide. That is
 * tolerable only while the account owner is the only person authoring content.
 * Configuring a real NEXT_PUBLIC_SITES_HOST switches this off on its own.
 */
export function routePreviewPath(
  pathname: string,
  sitesHost: string = SITES_HOST,
): { slug: string; path: string } | null {
  if (sitesHostIsRoutable(sitesHost)) return null;
  if (!pathname.startsWith(`${PREVIEW_PREFIX}/`)) return null;

  const [slug, ...segments] = pathname.slice(PREVIEW_PREFIX.length + 1).split("/");
  if (!slug) return null;

  return { slug, path: segments.length > 0 ? `/${segments.join("/")}` : "/" };
}

export function routeHost(hostHeader: string | null): Routed {
  const host = stripPort(hostHeader ?? "");
  const sitesRoot = stripPort(SITES_HOST);
  const appRoot = stripPort(APP_HOST);
  const marketingRoot = stripPort(MARKETING_HOST);

  if (host === appRoot) return { surface: "app" };

  if (host.endsWith(`.${sitesRoot}`)) {
    const slug = host.slice(0, -(sitesRoot.length + 1));
    // Reject nested labels — a.b.sites.example is not a valid site host.
    if (slug && !slug.includes(".")) return { surface: "published", slug };
  }

  if (host === marketingRoot) return { surface: "marketing" };

  // Unknown host: fall back to marketing rather than exposing app routes.
  return { surface: "marketing" };
}

export async function proxy(request: NextRequest) {
  const routed = routeHost(request.headers.get("host"));

  let surface = routed.surface;
  let slug = routed.slug;
  /** What the site itself should treat as the path, once any prefix is off. */
  let contentPath = request.nextUrl.pathname;

  // Only ever an addition to host routing: a real sites host still wins, and
  // routePreviewPath returns null whenever one is configured.
  if (surface !== "published") {
    const preview = routePreviewPath(request.nextUrl.pathname);
    if (preview) {
      surface = "published";
      slug = preview.slug;
      contentPath = preview.path;
    }
  }

  const isSecure = request.nextUrl.protocol === "https:";
  const nonce = generateNonce();

  const headers = securityHeaders(surface, { nonce, isSecure });

  // The nonce and CSP must travel on the REQUEST headers, not only the
  // response. That is how Next discovers the nonce and stamps it onto its own
  // inline bootstrap scripts. Setting it on the response alone leaves those
  // scripts unnonced, and a strict script-src then blocks hydration — which
  // fails loudly in dev and silently in production.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-surface", surface);
  requestHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"]!);

  let response: NextResponse;

  if (surface === "published" && slug) {
    // Rewrite so the renderer receives the slug as a path segment. The target
    // route re-checks x-surface, so hitting /site/foo on the app host 404s
    // rather than serving customer content from the wrong origin.
    const url = request.nextUrl.clone();
    url.pathname = `/site/${slug}${contentPath}`;
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Refresh the Supabase session on app requests only. Published sites are
  // public and must not touch auth cookies at all.
  if (surface === "app") {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );

    // Verifies the token against the auth server and rotates it if needed.
    await supabase.auth.getUser();
  }

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  response.headers.set("x-nonce", nonce);
  response.headers.set("x-surface", surface);

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets. Auth routes ARE
    // included so they receive security headers.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
