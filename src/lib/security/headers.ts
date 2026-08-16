/**
 * Security headers — OWASP A05.
 *
 * The app and published customer sites get DIFFERENT policies. They are not
 * variations on a theme:
 *
 *   app       — runs our own React, talks to Supabase and Stripe, never framed.
 *   published — renders attacker-controlled content. Next's own hydration
 *               scripts are allowed via nonce; nothing a customer authors is.
 *
 * Both surfaces run React, so both need the nonce + 'strict-dynamic' pair:
 * Next emits inline bootstrap scripts, and those chunks load further chunks.
 * 'strict-dynamic' lets a nonce'd script load its dependencies while still
 * blocking anything injected into the document — which is exactly the property
 * we want on a page built from user content.
 */

export type Surface = "app" | "marketing" | "published";

const SHARED: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "off",
};

// Only meaningful over HTTPS; omitted on localhost so dev doesn't pin http→https.
const HSTS = "max-age=63072000; includeSubDomains; preload";

const isDev = process.env.NODE_ENV === "development";

/**
 * 'unsafe-eval' is required in development: React uses eval() to reconstruct
 * server-side error stacks in the browser. Neither React nor Next use eval in
 * production, so it is never added there.
 */
function scriptSrc(nonce: string, allowCustomCode: boolean): string {
  if (allowCustomCode) {
    // Custom code injection (Pro, opt-in, per site). A nonce is pointless here
    // — the customer's own inline scripts cannot carry one — and browsers that
    // honour nonces *ignore* 'unsafe-inline' when a nonce or 'strict-dynamic'
    // is present. So this site drops the strict policy entirely and takes the
    // permissive one. That trade is the reason the feature is opt-in and warned.
    return `script-src 'self' 'unsafe-inline' https:${isDev ? " 'unsafe-eval'" : ""}`;
  }

  const sources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDev) sources.push("'unsafe-eval'");
  return `script-src ${sources.join(" ")}`;
}

/**
 * Styles keep 'unsafe-inline' on both surfaces, deliberately:
 *   - published: node styles compile to an inline <style> block, which is the
 *     whole rendering model. This is why the property allowlist in
 *     lib/styles/compile.ts is load-bearing rather than defence-in-depth.
 *   - app: Next and Tailwind inject inline styles, and nonce-ing them is
 *     fragile across dev/prod. Style injection is a far lower severity than
 *     script injection, so this is a considered trade, not an oversight.
 */
const STYLE_SRC = "style-src 'self' 'unsafe-inline'";

function connectSrc(surface: Surface): string {
  const sources = ["'self'"];

  if (surface !== "published") {
    // The browser Supabase client calls the auth and REST endpoints directly.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      sources.push(supabaseUrl);
      // Supabase Realtime upgrades to a websocket on the same origin.
      sources.push(supabaseUrl.replace(/^http/, "ws"));
    }
    sources.push("https://api.stripe.com");
  }

  // Turbopack's HMR channel in development.
  if (isDev) sources.push("ws:", "wss:");

  return `connect-src ${sources.join(" ")}`;
}

function appCsp(nonce: string): string {
  return [
    "default-src 'self'",
    scriptSrc(nonce, false),
    STYLE_SRC,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    connectSrc("app"),
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * @param allowCustomCode set when the site owner has enabled custom code
 *   injection (a Pro feature). It relaxes script-src for that site ONLY.
 */
function publishedCsp(nonce: string, allowCustomCode: boolean): string {
  return [
    "default-src 'self'",
    scriptSrc(nonce, allowCustomCode),
    STYLE_SRC,
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    connectSrc("published"),
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export interface HeaderOptions {
  nonce?: string;
  isSecure?: boolean;
  allowCustomCode?: boolean;
}

export function securityHeaders(
  surface: Surface,
  { nonce = "", isSecure = true, allowCustomCode = false }: HeaderOptions = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...SHARED };

  if (isSecure) headers["Strict-Transport-Security"] = HSTS;

  if (surface === "published") {
    headers["Content-Security-Policy"] = publishedCsp(nonce, allowCustomCode);
  } else {
    headers["Content-Security-Policy"] = appCsp(nonce);
    headers["X-Frame-Options"] = "DENY";
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(self)";
  }

  return headers;
}

/** Web Crypto is available in both the Edge and Node runtimes. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
