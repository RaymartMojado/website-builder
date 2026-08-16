/**
 * Creates a demo account with a two-page site, so the dashboard and editor
 * have something in them. Local Supabase only — refuses to run anywhere else.
 *
 * Run with: npx tsx scripts/seed-demo.ts
 */
import "dotenv/config";
import { WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import { db } from "../src/lib/db";
import { aboutTemplate, footerTemplate, headerTemplate, homeTemplate } from "../src/lib/document/templates";
import { DEFAULT_THEME } from "../src/lib/document/types";
import type { Prisma } from "../src/generated/prisma/client";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!SUPABASE_URL.includes("localhost") && !SUPABASE_URL.includes("127.0.0.1")) {
  throw new Error(`Refusing to seed demo data into a non-local Supabase: ${SUPABASE_URL}`);
}

const EMAIL = "demo@example.test";
const PASSWORD = "demo-password-123";

const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const json = (value: unknown) => value as Prisma.InputJsonValue;

async function seedSite(ownerId: string, name: string, subdomain: string) {
  const site = await db.site.create({
    data: { ownerId, name, subdomain, theme: json(DEFAULT_THEME) },
  });

  const footer = footerTemplate(name);

  // Both pages exist before their content, because each page's links reference
  // the other by id — which is exactly the property that makes renaming a path
  // safe later on.
  const home = await db.page.create({
    data: {
      siteId: site.id,
      kind: "HOME",
      path: "/",
      title: "Home",
      order: 0,
      draftContent: json({ version: 1, rootId: "pending", nodes: {} }),
    },
  });

  const about = await db.page.create({
    data: {
      siteId: site.id,
      path: "/about",
      title: "About",
      order: 1,
      draftContent: json({ version: 1, rootId: "pending", nodes: {} }),
    },
  });

  const homeDoc = homeTemplate(name, { kind: "page", pageId: about.id });
  const aboutDoc = aboutTemplate({ kind: "page", pageId: home.id });

  // The header links to pages, so it is built once their ids exist.
  const header = headerTemplate(
    name,
    [
      { id: home.id, title: "Home" },
      { id: about.id, title: "About" },
    ],
    { kind: "page", pageId: home.id },
  );

  // Seeded sites are published, so there is something to look at immediately —
  // shared regions included, or the live site would have no navigation.
  await db.site.update({
    where: { id: site.id },
    data: {
      headerDraft: json(header),
      headerContent: json(header),
      footerDraft: json(footer),
      footerContent: json(footer),
    },
  });

  await db.page.update({
    where: { id: home.id },
    data: { draftContent: json(homeDoc), publishedContent: json(homeDoc) },
  });
  await db.page.update({
    where: { id: about.id },
    data: { draftContent: json(aboutDoc), publishedContent: json(aboutDoc) },
  });

  return site;
}

async function main() {
  const { data: existing } = await admin.auth.admin.listUsers();
  for (const user of existing.users) {
    if (user.email === EMAIL) await admin.auth.admin.deleteUser(user.id);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Demo User" },
  });
  if (error) throw error;

  const userId = data.user!.id;

  await seedSite(userId, "Acme Coffee", "acme-coffee");
  await seedSite(userId, "Studio Nine", "studio-nine");

  const sitesHost = process.env.NEXT_PUBLIC_SITES_HOST ?? "sites.localhost:3000";

  console.log(`
Demo account ready.

  Sign in at   http://${process.env.NEXT_PUBLIC_APP_HOST ?? "app.localhost:3000"}/signin
  Email        ${EMAIL}
  Password     ${PASSWORD}

  Published    http://acme-coffee.${sitesHost}
               http://acme-coffee.${sitesHost}/about
               http://studio-nine.${sitesHost}
`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
