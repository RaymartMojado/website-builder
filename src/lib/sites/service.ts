import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { requireSite } from "@/lib/auth/guards";
import { assertCanCreateSite } from "@/lib/billing/entitlement";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { validateSubdomain } from "@/lib/sites/subdomain";
import { recordAudit } from "@/lib/audit";
import { DEFAULT_THEME } from "@/lib/document/types";
import { documentFrom, footerTemplate, headerTemplate } from "@/lib/document/templates";
import type { Prisma, Site } from "@/generated/prisma/client";

/** Enough structure that a new site opens onto something, not a void. */
function starterPage(siteName: string) {
  return documentFrom([
    {
      type: "Section",
      children: [
        {
          type: "Container",
          children: [
            { type: "Heading", props: { text: siteName, level: "h1" } },
            {
              type: "Text",
              props: { text: "Drag components from the left, or click one to add it here." },
            },
          ],
        },
      ],
    },
  ]);
}

/**
 * Site CRUD.
 *
 * Every mutation runs the same four checks in the same order — rate limit,
 * entitlement, ownership, validation — so there is one shape to review rather
 * than four variations.
 */

export async function listSites(userId: string): Promise<Site[]> {
  return db.site.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createSite(
  userId: string,
  input: { name: string; subdomain: string },
): Promise<Site> {
  await enforceRateLimit("mutation", userId);
  await assertCanCreateSite(userId);

  const name = input.name.trim();
  if (name.length < 1 || name.length > 100) {
    throw new ValidationError("Site name must be between 1 and 100 characters", "name");
  }

  const subdomain = validateSubdomain(input.subdomain);
  if (!subdomain.ok) throw new ValidationError(subdomain.error, "subdomain");

  // findFirst rather than findUnique: subdomain is unique so they are
  // equivalent here, and the lint rule that guards tenant lookups bans
  // findUnique on this model outright rather than trying to tell the two
  // cases apart.
  const existing = await db.site.findFirst({
    where: { subdomain: subdomain.value },
    select: { id: true },
  });
  if (existing) throw new ValidationError("That address is already taken", "subdomain");

  // A site with no pages has nothing to open, so the home page is created with
  // it rather than left as a step the user has to discover.
  const site = await db.site.create({
    data: {
      ownerId: userId,
      name,
      subdomain: subdomain.value,
      theme: DEFAULT_THEME as unknown as Prisma.InputJsonValue,
      footerDraft: footerTemplate(name) as unknown as Prisma.InputJsonValue,
      pages: {
        create: {
          kind: "HOME",
          path: "/",
          title: "Home",
          order: 0,
          draftContent: starterPage(name) as unknown as Prisma.InputJsonValue,
        },
      },
    },
    include: { pages: { select: { id: true, title: true } } },
  });

  // The header links to pages, so it is written once their ids exist. Without
  // a header a new site has no navigation at all, which is the first thing
  // anyone looks for.
  await db.site.update({
    where: { id: site.id },
    data: {
      headerDraft: headerTemplate(name, site.pages, {
        kind: "page",
        pageId: site.pages[0]!.id,
      }) as unknown as Prisma.InputJsonValue,
    },
  });

  await recordAudit({
    userId,
    action: "site.create",
    targetType: "site",
    targetId: site.id,
    meta: { subdomain: site.subdomain },
  });

  return site;
}

export async function renameSite(
  userId: string,
  siteId: string,
  name: string,
): Promise<Site> {
  await enforceRateLimit("mutation", userId);
  await requireSite(userId, siteId);

  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    throw new ValidationError("Site name must be between 1 and 100 characters", "name");
  }

  const site = await db.site.update({ where: { id: siteId }, data: { name: trimmed } });

  await recordAudit({
    userId,
    action: "site.rename",
    targetType: "site",
    targetId: siteId,
    meta: { name: trimmed },
  });

  return site;
}

export async function changeSubdomain(
  userId: string,
  siteId: string,
  subdomain: string,
): Promise<Site> {
  await enforceRateLimit("mutation", userId);
  const current = await requireSite(userId, siteId);

  const validated = validateSubdomain(subdomain);
  if (!validated.ok) throw new ValidationError(validated.error, "subdomain");
  if (validated.value === current.subdomain) return current;

  const taken = await db.site.findFirst({
    where: { subdomain: validated.value },
    select: { id: true },
  });
  if (taken) throw new ValidationError("That address is already taken", "subdomain");

  const site = await db.site.update({
    where: { id: siteId },
    data: { subdomain: validated.value },
  });

  await recordAudit({
    userId,
    action: "site.subdomain.change",
    targetType: "site",
    targetId: siteId,
    meta: { from: current.subdomain, to: validated.value },
  });

  return site;
}

export async function deleteSite(userId: string, siteId: string): Promise<void> {
  await enforceRateLimit("mutation", userId);
  const site = await requireSite(userId, siteId);

  await db.site.delete({ where: { id: siteId } });

  await recordAudit({
    userId,
    action: "site.delete",
    targetType: "site",
    targetId: siteId,
    meta: { subdomain: site.subdomain, name: site.name },
  });
}

export async function getSiteForOwner(userId: string, siteId: string): Promise<Site> {
  const site = await db.site.findFirst({ where: { id: siteId, ownerId: userId } });
  if (!site) throw new NotFoundError("Site not found");
  return site;
}
