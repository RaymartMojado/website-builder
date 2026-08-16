import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import {
  requireAsset,
  requirePage,
  requireSite,
  requireSymbol,
} from "@/lib/auth/guards";
import {
  createTestAsset,
  createTestPage,
  createTestSite,
  createTestSymbol,
  createTestUser,
  resetDatabase,
  type TestUser,
} from "./fixtures";

/**
 * OWASP A01 — the regression net for tenant isolation.
 *
 * Every tenant-owned object type is fetched with user A's id and user B's
 * object id, and must come back NotFound. Adding a new tenant-owned model
 * means adding a case here; that is the whole point.
 */

let alice: TestUser;
let bob: TestUser;

let bobSiteId: string;
let bobPageId: string;
let bobSymbolId: string;
let bobAssetId: string;

let aliceSiteId: string;

beforeAll(async () => {
  await resetDatabase();

  alice = await createTestUser("alice");
  bob = await createTestUser("bob");

  const bobSite = await createTestSite(bob.id);
  bobSiteId = bobSite.id;
  bobPageId = (await createTestPage(bobSiteId)).id;
  bobSymbolId = (await createTestSymbol(bobSiteId)).id;
  bobAssetId = (await createTestAsset(bobSiteId)).id;

  aliceSiteId = (await createTestSite(alice.id)).id;
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("cross-tenant access is rejected", () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["requireSite", () => requireSite(alice.id, bobSiteId)],
    ["requirePage", () => requirePage(alice.id, bobPageId)],
    ["requireSymbol", () => requireSymbol(alice.id, bobSymbolId)],
    ["requireAsset", () => requireAsset(alice.id, bobAssetId)],
  ];

  for (const [name, call] of cases) {
    it(`${name} throws NotFound for another user's object`, async () => {
      await expect(call()).rejects.toBeInstanceOf(NotFoundError);
    });
  }

  it("does not distinguish 'not yours' from 'does not exist'", async () => {
    // Identical error for a real id owned by someone else and a fabricated id.
    // A different message or status would confirm which ids are real.
    const notYours = await requireSite(alice.id, bobSiteId).catch((error: Error) => error);
    const notReal = await requireSite(alice.id, "cuid-that-never-existed").catch(
      (error: Error) => error,
    );

    expect(notYours).toBeInstanceOf(NotFoundError);
    expect(notReal).toBeInstanceOf(NotFoundError);
    expect((notYours as Error).message).toBe((notReal as Error).message);
    expect((notYours as NotFoundError).status).toBe((notReal as NotFoundError).status);
  });
});

describe("same-tenant access is allowed", () => {
  it("owner can load their own site", async () => {
    const site = await requireSite(alice.id, aliceSiteId);
    expect(site.id).toBe(aliceSiteId);
    expect(site.ownerId).toBe(alice.id);
  });

  it("owner can load their own page, symbol and asset", async () => {
    await expect(requirePage(bob.id, bobPageId)).resolves.toMatchObject({ id: bobPageId });
    await expect(requireSymbol(bob.id, bobSymbolId)).resolves.toMatchObject({ id: bobSymbolId });
    await expect(requireAsset(bob.id, bobAssetId)).resolves.toMatchObject({ id: bobAssetId });
  });
});

describe("deleting a profile cascades", () => {
  it("removes the user's sites and everything under them", async () => {
    const doomed = await createTestUser("doomed");
    const site = await createTestSite(doomed.id);
    const page = await createTestPage(site.id);

    await db.profile.delete({ where: { id: doomed.id } });

    expect(await db.site.findFirst({ where: { id: site.id } })).toBeNull();
    expect(await db.page.findFirst({ where: { id: page.id } })).toBeNull();
  });
});
