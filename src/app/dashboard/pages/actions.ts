"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePage, requireUserId, requireSite } from "@/lib/auth/guards";
import { assertCanPublish } from "@/lib/billing/entitlement";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { recordAudit } from "@/lib/audit";
import { toClientError } from "@/lib/errors";
import { blankPage } from "@/lib/document/templates";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Page-level actions used by the editor.
 *
 * Publishing copies draft → published in one statement, which is atomic and
 * trivially revertible. Phase 5 widens that into a transaction across every
 * page, symbol and shared region on the site.
 */

export interface PageActionState {
  error?: string;
  ok?: boolean;
}

export async function publishPageAction(
  _prev: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  try {
    const userId = await requireUserId();
    const pageId = String(formData.get("pageId") ?? "");

    await enforceRateLimit("mutation", userId);
    const page = await requirePage(userId, pageId);

    // Gated on publishing, never on editing.
    await assertCanPublish(userId);

    const site = await requireSite(userId, page.siteId);

    // One transaction across the page AND the shared regions. Publishing them
    // separately produces a live site whose header knows about a page the nav
    // does not — the classic partial-publish inconsistency.
    await db.$transaction([
      db.page.update({
        where: { id: pageId },
        data: { publishedContent: page.draftContent as Prisma.InputJsonValue },
      }),
      db.site.update({
        where: { id: site.id },
        data: {
          headerContent: (site.headerDraft ?? undefined) as Prisma.InputJsonValue | undefined,
          footerContent: (site.footerDraft ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      }),
      db.pageVersion.create({
        data: { pageId, content: page.draftContent as Prisma.InputJsonValue },
      }),
    ]);

    await recordAudit({ userId, action: "page.publish", targetType: "page", targetId: pageId });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return { error: toClientError(error).message };
  }
}

export async function createPageAction(
  _prev: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  try {
    const userId = await requireUserId();
    const siteId = String(formData.get("siteId") ?? "");
    const title = String(formData.get("title") ?? "").trim();

    await enforceRateLimit("mutation", userId);
    await requireSite(userId, siteId);

    if (!title) return { error: "Give the page a title" };

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const path = `/${slug || "page"}`;

    const clash = await db.page.findFirst({ where: { siteId, path }, select: { id: true } });
    if (clash) return { error: `A page already exists at ${path}` };

    const count = await db.page.count({ where: { siteId } });

    await db.page.create({
      data: {
        siteId,
        path,
        title,
        order: count,
        draftContent: blankPage() as unknown as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return { error: toClientError(error).message };
  }
}
