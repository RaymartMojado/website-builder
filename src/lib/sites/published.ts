import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * Public lookups for the published surface.
 *
 * These are deliberately NOT in lib/auth/guards.ts: published content is
 * public by definition, so there is no owner to check. Keeping them separate
 * means the guards stay unambiguously about tenant isolation.
 *
 * Nothing here returns draft content. A visitor must never be able to see
 * work the owner has not published.
 */

export interface PublishedSite {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  theme: unknown;
  headerContent: unknown;
  footerContent: unknown;
  menus: unknown;
  headCode: string | null;
  bodyCode: string | null;
}

export async function getPublishedSite(subdomain: string): Promise<PublishedSite | null> {
  const site = await db.site.findFirst({
    where: { subdomain },
    select: {
      id: true,
      name: true,
      status: true,
      theme: true,
      headerContent: true,
      footerContent: true,
      menus: true,
      headCode: true,
      bodyCode: true,
    },
  });
  return site as PublishedSite | null;
}

/** A published page by path. Returns null when the page exists only as a draft. */
export async function getPublishedPage(siteId: string, path: string) {
  return db.page.findFirst({
    // DbNull, not null: for a Json column Prisma distinguishes a SQL NULL
    // (never published) from a JSON `null` value.
    where: { siteId, path, publishedContent: { not: Prisma.DbNull } },
    select: {
      id: true,
      title: true,
      path: true,
      seo: true,
      hideHeader: true,
      hideFooter: true,
      publishedContent: true,
    },
  });
}
