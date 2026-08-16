/**
 * Phase 2/3 verification against the running stack.
 *
 * Signs in for real, captures the cookies @supabase/ssr would set, and drives
 * the authenticated routes with them. Everything the unit tests mock out —
 * auth, ownership, the autosave contract — is real here.
 *
 * Run with: npx tsx scripts/verify-editor.ts
 */
import "dotenv/config";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { db } from "../src/lib/db";
import { createSite } from "../src/lib/sites/service";
import type { PageDocument } from "../src/lib/document/types";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

const APP_ORIGIN = `http://${process.env.NEXT_PUBLIC_APP_HOST ?? "app.localhost:3000"}`;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * Signs in through @supabase/ssr with an in-memory cookie jar, so the cookies
 * we send are byte-identical to the ones a browser would hold — including the
 * chunked-cookie naming, which is easy to get wrong by hand.
 */
async function sessionCookieHeader(email: string, password: string): Promise<string> {
  const jar = new Map<string, string>();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
        setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
          for (const { name, value } of cookies) jar.set(name, value);
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed: ${error.message}`);

  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function main() {
  console.log("\nEditor verification\n");

  const suffix = randomUUID().slice(0, 8);
  const password = "correct-horse-battery-staple";

  // Two users, so the IDOR check has someone to be excluded.
  const owner = await admin.auth.admin.createUser({
    email: `owner-${suffix}@vitest.local`,
    password,
    email_confirm: true,
  });
  const intruder = await admin.auth.admin.createUser({
    email: `intruder-${suffix}@vitest.local`,
    password,
    email_confirm: true,
  });

  const ownerId = owner.data.user!.id;
  const intruderId = intruder.data.user!.id;

  // Goes through the real service rather than raw Prisma, so this exercises
  // the same path a user does — including the header and footer a new site is
  // supposed to get.
  const created = await createSite(ownerId, {
    name: "Verify Editor",
    subdomain: `verify-editor-${suffix}`,
  });

  const site = await db.site.findFirstOrThrow({
    where: { id: created.id },
    include: { pages: true },
  });

  const pageId = site.pages[0]!.id;
  const document = site.pages[0]!.draftContent as unknown as PageDocument;

  const ownerCookies = await sessionCookieHeader(`owner-${suffix}@vitest.local`, password);
  const intruderCookies = await sessionCookieHeader(`intruder-${suffix}@vitest.local`, password);
  check("signed in and captured session cookies", ownerCookies.length > 0);

  // --- the editor route ----------------------------------------------------
  const editor = await fetch(`${APP_ORIGIN}/dashboard/editor/${pageId}`, {
    headers: { cookie: ownerCookies },
    redirect: "manual",
  });
  const editorHtml = await editor.text();

  check("editor route loads for the owner", editor.status === 200, `got ${editor.status}`);
  check("editor renders the canvas iframe", editorHtml.includes('title="Page canvas"'));
  check("editor renders the component palette", editorHtml.includes("Components"));
  check("editor renders the breakpoint switcher", editorHtml.includes("Tablet"));
  check("editor offers a small-screen fallback", editorHtml.includes("wider screen"));

  // --- unauthenticated -----------------------------------------------------
  const anonymous = await fetch(`${APP_ORIGIN}/dashboard/editor/${pageId}`, { redirect: "manual" });
  check(
    "signed-out visitors are redirected to sign in",
    anonymous.status === 307 || anonymous.status === 302,
    `got ${anonymous.status}`,
  );

  // --- IDOR on the editor route -------------------------------------------
  const stolen = await fetch(`${APP_ORIGIN}/dashboard/editor/${pageId}`, {
    headers: { cookie: intruderCookies },
    redirect: "manual",
  });
  check("another user cannot open the editor", stolen.status === 404, `got ${stolen.status}`);

  // --- autosave ------------------------------------------------------------
  const save = async (cookie: string, body: unknown) =>
    fetch(`${APP_ORIGIN}/api/pages/${pageId}/draft`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const edited = structuredClone(document);
  const headingId = Object.values(edited.nodes).find((node) => node.type === "Heading")!.id;
  edited.nodes[headingId]!.props.text = "Saved from the verifier";

  const ok = await save(ownerCookies, { document: edited });
  check("autosave accepts a valid document", ok.status === 200, `got ${ok.status}`);

  const stored = await db.page.findFirst({ where: { id: pageId }, select: { draftContent: true } });
  const storedDoc = stored!.draftContent as unknown as typeof edited;
  check(
    "autosave persisted the change",
    storedDoc.nodes[headingId]?.props.text === "Saved from the verifier",
  );

  // --- validation is real --------------------------------------------------
  const unknownType = structuredClone(edited);
  unknownType.nodes[headingId]!.type = "EvilComponent";
  const rejectedType = await save(ownerCookies, { document: unknownType });
  check("autosave rejects unknown component types", rejectedType.status === 422, `got ${rejectedType.status}`);

  const badStyle = structuredClone(edited);
  badStyle.nodes[headingId]!.style.base = { color: "red; } body { display:none } .x {" };
  const rejectedStyle = await save(ownerCookies, { document: badStyle });
  check("autosave rejects an injected style value", rejectedStyle.status === 422, `got ${rejectedStyle.status}`);

  const orphaned = structuredClone(edited);
  orphaned.nodes[headingId]!.parent = "nonexistent";
  const rejectedTree = await save(ownerCookies, { document: orphaned });
  check("autosave rejects a broken tree", rejectedTree.status === 422, `got ${rejectedTree.status}`);

  const afterRejections = await db.page.findFirst({
    where: { id: pageId },
    select: { draftContent: true },
  });
  const untouched = afterRejections!.draftContent as unknown as typeof edited;
  check(
    "a rejected document is not partially applied",
    untouched.nodes[headingId]?.type === "Heading" &&
      untouched.nodes[headingId]?.props.text === "Saved from the verifier",
  );

  // --- shared regions ------------------------------------------------------
  const siteWithRegions = await db.site.findFirst({
    where: { id: site.id },
    select: { headerDraft: true, footerDraft: true },
  });

  check("a new site gets a header", siteWithRegions?.headerDraft !== null);
  check("a new site gets a footer", siteWithRegions?.footerDraft !== null);

  const headerDoc = siteWithRegions!.headerDraft as unknown as PageDocument;
  const navNode = Object.values(headerDoc.nodes).find((node) => node.type === "Nav");
  const logoNode = Object.values(headerDoc.nodes).find((node) => node.type === "Logo");

  check("the header contains a Nav", Boolean(navNode));
  check("the header contains a Logo", Boolean(logoNode));
  check(
    "the nav is seeded from the site's pages",
    Array.isArray(navNode?.props.items) && (navNode!.props.items as unknown[]).length === 1,
  );

  // The editor must load the header alongside the page, or there is nothing to show.
  check("editor loads the header into the canvas", editorHtml.includes("Header"));

  const saveRegion = async (cookie: string, body: unknown) =>
    fetch(`${APP_ORIGIN}/api/sites/${site.id}/regions`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const editedHeader = structuredClone(headerDoc);
  const logoId = logoNode!.id;
  editedHeader.nodes[logoId]!.props.text = "Renamed Logo";

  const headerSave = await saveRegion(ownerCookies, { header: editedHeader });
  check("header autosave accepts a valid document", headerSave.status === 200, `got ${headerSave.status}`);

  const afterHeaderSave = await db.site.findFirst({
    where: { id: site.id },
    select: { headerDraft: true },
  });
  const savedHeader = afterHeaderSave!.headerDraft as unknown as PageDocument;
  check("header autosave persisted", savedHeader.nodes[logoId]?.props.text === "Renamed Logo");

  const badHeader = structuredClone(editedHeader);
  badHeader.nodes[logoId]!.style.base = { color: "red; } body { display:none } .x {" };
  const rejectedHeader = await saveRegion(ownerCookies, { header: badHeader });
  check("header autosave rejects injection", rejectedHeader.status === 422, `got ${rejectedHeader.status}`);

  const stolenRegion = await saveRegion(intruderCookies, { header: editedHeader });
  check("another user cannot edit the header", stolenRegion.status === 404, `got ${stolenRegion.status}`);

  // --- IDOR on the write path ---------------------------------------------
  const stolenSave = await save(intruderCookies, { document: edited });
  check("another user cannot autosave this page", stolenSave.status === 404, `got ${stolenSave.status}`);

  const anonSave = await fetch(`${APP_ORIGIN}/api/pages/${pageId}/draft`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document: edited }),
  });
  check("signed-out autosave is refused", anonSave.status === 401, `got ${anonSave.status}`);

  // --- cleanup -------------------------------------------------------------
  await admin.auth.admin.deleteUser(ownerId);
  await admin.auth.admin.deleteUser(intruderId);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
