import { db } from "@/lib/db";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/supabase/server";
import type { Asset, Page, Site, Symbol as SiteSymbol } from "@/generated/prisma/client";

/**
 * Tenant access control — OWASP A01.
 *
 * ⚠️ RLS DOES NOT PROTECT THESE QUERIES.
 *
 * Prisma connects to Postgres directly with a privileged role, which bypasses
 * row-level security entirely. RLS policies in supabase/migrations are
 * defence-in-depth for anything reaching the database through PostgREST with
 * an anon key — they are NOT the control protecting application queries.
 * "We're on Supabase, RLS has it covered" is false here. These guards are the
 * control.
 *
 * So: these are the ONLY functions permitted to load a tenant-owned record.
 * A bare `db.page.findUnique({ where: { id } })` is an IDOR waiting to happen,
 * and eslint.config.mjs bans that shape outright.
 *
 * All of them throw NotFoundError, never Forbidden. Distinguishing "not yours"
 * from "doesn't exist" leaks which ids are real.
 */

/** The signed-in user's id (the auth.users uuid), or throw. */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

/**
 * The signed-in user plus whether their email is confirmed.
 * Verification gates publishing (Phase 5), never editing.
 */
export async function requireVerifiedUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.email_confirmed_at) {
    throw new UnauthorizedError("Confirm your email address to continue");
  }
  return user.id;
}

export async function requireSite(userId: string, siteId: string): Promise<Site> {
  const site = await db.site.findFirst({ where: { id: siteId, ownerId: userId } });
  if (!site) throw new NotFoundError("Site not found");
  return site;
}

export async function requirePage(userId: string, pageId: string): Promise<Page> {
  const page = await db.page.findFirst({
    where: { id: pageId, site: { ownerId: userId } },
  });
  if (!page) throw new NotFoundError("Page not found");
  return page;
}

export async function requireSymbol(userId: string, symbolId: string): Promise<SiteSymbol> {
  const symbol = await db.symbol.findFirst({
    where: { id: symbolId, site: { ownerId: userId } },
  });
  if (!symbol) throw new NotFoundError("Symbol not found");
  return symbol;
}

export async function requireAsset(userId: string, assetId: string): Promise<Asset> {
  const asset = await db.asset.findFirst({
    where: { id: assetId, site: { ownerId: userId } },
  });
  if (!asset) throw new NotFoundError("Asset not found");
  return asset;
}

/** Convenience for the common "signed in, and owns this site" pair. */
export async function requireOwnedSite(siteId: string): Promise<{ userId: string; site: Site }> {
  const userId = await requireUserId();
  const site = await requireSite(userId, siteId);
  return { userId, site };
}
