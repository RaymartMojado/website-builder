import { z } from "zod";

/**
 * Subdomain rules — OWASP A04.
 *
 * A customer subdomain becomes a real hostname on our published-sites domain,
 * so anything that looks like our own infrastructure has to be unavailable.
 * The reserved list is deliberately generous: names are cheap, and reclaiming
 * one after a customer has published on it is not.
 */

export const RESERVED_SUBDOMAINS = new Set([
  // our surfaces
  "www", "app", "api", "admin", "dashboard", "account", "billing", "auth", "login",
  "logout", "signup", "register", "sites", "editor", "preview", "static", "assets",
  "cdn", "media", "files", "img", "images", "js", "css", "fonts",
  // infrastructure and common conventions
  "mail", "smtp", "imap", "pop", "pop3", "ns", "ns1", "ns2", "dns", "mx", "ftp",
  "ssh", "vpn", "proxy", "gateway", "router", "localhost", "internal", "private",
  "staging", "stage", "dev", "test", "qa", "demo", "sandbox", "beta", "alpha",
  "status", "health", "metrics", "monitor", "grafana", "kibana",
  // brand and trust surfaces an attacker would want
  "support", "help", "docs", "blog", "news", "about", "contact", "legal", "privacy",
  "terms", "security", "abuse", "postmaster", "webmaster", "hostmaster", "root",
  "stripe", "payments", "pay", "checkout", "invoice", "verify", "verification",
  "secure", "ssl", "update", "download",
]);

/**
 * Labels that could be mistaken for a punycode-encoded internationalised
 * domain, which browsers render very differently from what is stored.
 */
const PUNYCODE_PREFIX = "xn--";

export const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Must be at least 3 characters")
  .max(63, "Must be 63 characters or fewer")
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    "Use lowercase letters, numbers and hyphens; must start and end with a letter or number",
  )
  .refine((value) => !value.includes("--"), "Cannot contain consecutive hyphens")
  .refine((value) => !value.startsWith(PUNYCODE_PREFIX), "Cannot start with 'xn--'")
  .refine((value) => !RESERVED_SUBDOMAINS.has(value), "This name is reserved");

export type SubdomainCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateSubdomain(input: string): SubdomainCheck {
  const result = subdomainSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid subdomain" };
  }
  return { ok: true, value: result.data };
}

/** Best-effort suggestion from a site name. Not guaranteed valid or unique. */
export function suggestSubdomain(siteName: string): string {
  return siteName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63)
    .replace(/-$/, "");
}

/** Path prefix for sites previewed on the app's own origin. */
export const PREVIEW_PREFIX = "/s";

/**
 * Whether the configured sites host can actually serve a published site.
 *
 * Wildcard subdomains need a domain you own — `{slug}.myproject.vercel.app`
 * does not resolve — so a deployment without one parks
 * NEXT_PUBLIC_SITES_HOST on the reserved `.invalid` TLD (see DEPLOY.md).
 * Reading that as "no sites domain" is what turns same-origin previews on,
 * and configuring a real host turns them off again with no code change.
 */
export function sitesHostIsRoutable(
  host: string = process.env.NEXT_PUBLIC_SITES_HOST ?? "",
): boolean {
  const bare = host.split(":")[0]!.toLowerCase();
  return bare.length > 0 && bare !== "invalid" && !bare.endsWith(".invalid");
}

/**
 * Where a published site can be reached.
 *
 * Falls back to a path on the app's own origin when there is no sites domain.
 * That fallback gives up the cookie isolation the separate domain exists to
 * provide — customer content ends up on the origin holding the session cookie
 * — and is only defensible while the only author is the person who owns the
 * account. It disappears the moment a real sites host is set.
 */
export function publishedUrl(
  subdomain: string,
  path: string = "/",
  host: string = process.env.NEXT_PUBLIC_SITES_HOST ?? "sites.localhost:3000",
): string {
  const suffix = path === "/" ? "" : path;

  if (!sitesHostIsRoutable(host)) return `${PREVIEW_PREFIX}/${subdomain}${suffix}`;

  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${subdomain}.${host}${suffix}`;
}
