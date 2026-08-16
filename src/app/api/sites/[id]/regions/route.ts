import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSite, requireUserId } from "@/lib/auth/guards";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { validateDocument } from "@/lib/document/validate";
import { toClientError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Autosave for the site-wide shared regions.
 *
 * Separate from the page draft endpoint because the ownership check is
 * different — a region belongs to the SITE, not to the page that happens to be
 * open. Validation is identical: shared regions are ordinary documents, so
 * they go through exactly the same A08 check.
 */

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    await enforceRateLimit("autosave", userId);
    await requireSite(userId, id);

    const body = (await request.json().catch(() => null)) as {
      header?: unknown;
      footer?: unknown;
    } | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const data: Prisma.SiteUpdateInput = {};

    for (const region of ["header", "footer"] as const) {
      if (body[region] === undefined) continue;

      const result = validateDocument(body[region]);
      if (!result.ok) {
        return NextResponse.json(
          { error: `${region} failed validation`, details: result.errors },
          { status: 422 },
        );
      }

      const column = region === "header" ? "headerDraft" : "footerDraft";
      data[column] = result.document as unknown as Prisma.InputJsonValue;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    }

    const updated = await db.site.update({
      where: { id },
      data,
      select: { updatedAt: true },
    });

    return NextResponse.json({ ok: true, savedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    const { status, message } = toClientError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
