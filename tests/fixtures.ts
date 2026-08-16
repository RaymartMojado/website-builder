import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Test fixtures.
 *
 * Profiles are normally created by the auth trigger on auth.users insert.
 * Tests insert profile rows directly with generated uuids — the guards care
 * about ownership, not about how the identity came to exist, and going through
 * Supabase Auth for every test would be slow and flaky.
 */

/**
 * Every fixture email lives on this domain so cleanup can target exactly what
 * the tests created. An earlier version deleted every profile, which cascaded
 * into the seeded demo account and any site you were working on — running the
 * suite quietly emptied your dev database.
 */
export const TEST_EMAIL_DOMAIN = "vitest.local";

export interface TestUser {
  id: string;
  email: string;
}

export function testEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const id = randomUUID();
  const email = testEmail(label);
  await db.profile.create({ data: { id, email, name: label } });
  return { id, email };
}

export async function createTestSite(ownerId: string, subdomain?: string) {
  const slug = subdomain ?? `site-${randomUUID().slice(0, 8)}`;
  return db.site.create({
    data: { ownerId, name: `Site ${slug}`, subdomain: slug },
  });
}

export async function createTestPage(siteId: string, path = "/") {
  return db.page.create({
    data: { siteId, path, title: "Home", draftContent: { version: 1, rootId: "r", nodes: {} } },
  });
}

export async function createTestSymbol(siteId: string, name = "Header") {
  return db.symbol.create({
    data: { siteId, name, draftContent: { version: 1, rootId: "r", nodes: {} } },
  });
}

export async function createTestAsset(siteId: string) {
  const key = `${siteId}/${randomUUID()}.png`;
  return db.asset.create({
    data: { siteId, key, url: `https://example.test/${key}`, mime: "image/png", sizeBytes: 1024 },
  });
}

/**
 * Removes only what these suites create — profiles on TEST_EMAIL_DOMAIN, which
 * cascade to their sites, pages, symbols and assets.
 *
 * Scoped on purpose. A blanket deleteMany here shares a database with the dev
 * server and would take your seeded demo data with it every test run.
 */
export async function resetDatabase() {
  const testProfiles = await db.profile.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const ids = testProfiles.map((p) => p.id);

  await db.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await db.profile.deleteMany({ where: { id: { in: ids } } });
}
