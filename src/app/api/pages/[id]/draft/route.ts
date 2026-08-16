import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePage, requireUserId } from "@/lib/auth/guards";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { validateDocument } from "@/lib/document/validate";
import { toClientError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Editor autosave.
 *
 * The client posts a whole document and asks us to store it, so this is the
 * A08 boundary: the payload is validated in full server-side before it is
 * written, and a document that fails is rejected ENTIRELY rather than
 * partially applied.
 *
 * Writes `draftContent` only. Publishing is a separate, deliberate act.
 */

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    // High-frequency write path by design, but not unbounded.
    await enforceRateLimit("autosave", userId);

    // Ownership, before we spend anything on parsing the body.
    await requirePage(userId, id);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const result = validateDocument((body as { document?: unknown }).document);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Document failed validation", details: result.errors },
        { status: 422 },
      );
    }

    const updated = await db.page.update({
      where: { id },
      data: { draftContent: result.document as unknown as Prisma.InputJsonValue },
      select: { updatedAt: true },
    });

    return NextResponse.json({ ok: true, savedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    const { status, message } = toClientError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
