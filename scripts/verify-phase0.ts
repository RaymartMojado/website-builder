/**
 * Phase 0 end-to-end verification.
 *
 * Exercises the whole chain against the running stack: Supabase signup → the
 * profile trigger → entitlement → site creation → the published subdomain
 * responding over HTTP. Anything the unit tests mock out is real here.
 *
 * Run with: npx tsx scripts/verify-phase0.ts
 */
import "dotenv/config";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { db } from "../src/lib/db";
import type { Prisma } from "../src/generated/prisma/client";
import { createSite, listSites } from "../src/lib/sites/service";
import { getEntitlement } from "../src/lib/billing/entitlement";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

const APP_ORIGIN = "http://127.0.0.1:3000";
const SITES_HOST = process.env.NEXT_PUBLIC_SITES_HOST ?? "sites.localhost:3000";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/**
 * Host-header requests go through curl, not fetch().
 *
 * undici treats Host as a forbidden header and drops it silently, so every
 * fetch() lands on whatever host the URL names — which makes a routing test
 * look like it passed while testing nothing.
 */
function request(host: string, path = "/"): { status: number; headers: string; body: string } {
  const raw = execFileSync(
    "curl",
    ["-s", "-i", "-H", `Host: ${host}`, `${APP_ORIGIN}${path}`],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );

  // Skip any 1xx/redirect preamble blocks and keep the final response.
  const blocks = raw.split(/\r?\n\r?\n/);
  const headers = blocks[0] ?? "";
  const body = blocks.slice(1).join("\n\n");
  const status = Number(/^HTTP\/[\d.]+ (\d{3})/m.exec(headers)?.[1] ?? 0);

  return { status, headers: headers.toLowerCase(), body };
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const email = `verify-${suffix}@example.test`;
  const subdomain = `verify-${suffix}`;

  console.log("\nPhase 0 verification\n");

  // 1. Signup → profile trigger
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "correct-horse-battery-staple",
    email_confirm: true,
    user_metadata: { name: "Verify Bot" },
  });
  check("supabase signup", !error, error?.message);
  const userId = data.user!.id;

  const profile = await db.profile.findUnique({ where: { id: userId } });
  check("profile row created by trigger", profile !== null);
  check("profile email matches", profile?.email === email);

  // 2. Entitlement stub
  const entitlement = await getEntitlement(userId);
  check("new user is trialing", entitlement.plan === "trialing");
  check("trial allows publishing", entitlement.canPublish);
  check(
    "trial ends ~7 days out",
    !!entitlement.trialEndsAt &&
      Math.round((entitlement.trialEndsAt.getTime() - Date.now()) / 86_400_000) === 7,
  );

  // 3. Site creation through the real service path
  const site = await createSite(userId, { name: "Verify Site", subdomain });
  check("site created", site.subdomain === subdomain);
  check("site listed for owner", (await listSites(userId)).some((s) => s.id === site.id));

  // 4. Reserved subdomains rejected
  const reserved = await createSite(userId, { name: "Nope", subdomain: "admin" })
    .then(() => null)
    .catch((e: Error) => e);
  check("reserved subdomain rejected", reserved !== null);

  // 5. Duplicate subdomain rejected
  const dupe = await createSite(userId, { name: "Dupe", subdomain })
    .then(() => null)
    .catch((e: Error) => e);
  check("duplicate subdomain rejected", dupe !== null);

  // 6. Audit trail
  const audits = await db.auditLog.findMany({ where: { userId, action: "site.create" } });
  check("site.create audited", audits.length === 1);

  // 7. The published subdomain actually serves over HTTP.
  //
  // A new site's page exists only as a draft, and the renderer serves 404 for
  // an unpublished path — correct behaviour, so publish first rather than
  // loosening the check.
  const homePage = await db.page.findFirstOrThrow({
    where: { siteId: site.id },
    select: { id: true, draftContent: true },
  });
  await db.page.update({
    where: { id: homePage.id },
    data: { publishedContent: homePage.draftContent as Prisma.InputJsonValue },
  });
  await db.site.update({
    where: { id: site.id },
    data: { headerContent: site.headerDraft ?? undefined, footerContent: site.footerDraft ?? undefined },
  });

  const published = request(`${subdomain}.${SITES_HOST}`);
  check("published subdomain responds 200", published.status === 200, `got ${published.status}`);
  check("published surface tagged correctly", published.headers.includes("x-surface: published"));
  check("published page renders the site name", published.body.includes("Verify Site"));
  // Next needs a nonce + 'strict-dynamic' to hydrate; what matters for a page
  // built from customer content is that nothing *unnonced* can execute.
  check("published CSP carries a nonce", /script-src[^;]*'nonce-/.test(published.headers));
  check("published CSP uses strict-dynamic", published.headers.includes("'strict-dynamic'"));
  check(
    "published CSP allows no unsafe-inline script",
    !/script-src[^;]*'unsafe-inline'/.test(published.headers),
  );
  check("published CSP has no Stripe", !published.headers.includes("stripe"));

  // 8. Direct /site/{slug} on the app host must NOT serve customer content.
  // This is the check that makes the separate published domain meaningful.
  const leaked = request(process.env.NEXT_PUBLIC_APP_HOST ?? "app.localhost:3000", `/site/${subdomain}`);
  check("app host cannot serve published content", leaked.status === 404, `got ${leaked.status}`);
  check("app host leaks no site name", !leaked.body.includes("Verify Site"));

  // 9. Unknown subdomain 404s
  const missing = request(`no-such-site-${suffix}.${SITES_HOST}`);
  check("unknown subdomain 404s", missing.status === 404, `got ${missing.status}`);

  // 10. No session cookie may ever carry a Domain attribute — that is what
  // would make it readable from a customer's published site.
  const appResponse = request(process.env.NEXT_PUBLIC_APP_HOST ?? "app.localhost:3000", "/signin");
  check("no Domain-scoped cookies on the app surface", !/set-cookie:[^\n]*domain=/i.test(appResponse.headers));

  // Cleanup
  await admin.auth.admin.deleteUser(userId);
  const gone = await db.profile.findUnique({ where: { id: userId } });
  check("delete cascades profile and sites", gone === null);
  check("site removed with owner", (await db.site.findFirst({ where: { id: site.id } })) === null);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
