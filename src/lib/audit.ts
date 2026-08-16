import { headers } from "next/headers";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Audit log — OWASP A09.
 *
 * Records who did what to which object. Writes are best-effort: a logging
 * failure must never fail the operation being logged, but it must be visible
 * in the server logs.
 */

export interface AuditEntry {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Prisma.InputJsonValue;
}

/** Best-effort client IP from the usual proxy headers. */
async function clientIp(): Promise<string | null> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return headerList.get("x-real-ip");
  } catch {
    return null; // outside a request context, e.g. a test or a script
  }
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ip: await clientIp(),
        meta: entry.meta ?? {},
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", entry.action, error);
  }
}
