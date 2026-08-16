"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/guards";
import { createSite, deleteSite, renameSite } from "@/lib/sites/service";
import { toClientError } from "@/lib/errors";

export interface SiteActionState {
  error?: string;
  field?: string;
}

/**
 * Server actions are a mutation surface like any other: they authenticate,
 * authorise, and validate. `requireUserId()` first, always — the client can
 * call these directly.
 *
 * Errors go through toClientError so a Prisma failure surfaces as a generic
 * message rather than leaking schema details.
 */

export async function createSiteAction(
  _prev: SiteActionState,
  formData: FormData,
): Promise<SiteActionState> {
  try {
    const userId = await requireUserId();
    await createSite(userId, {
      name: String(formData.get("name") ?? ""),
      subdomain: String(formData.get("subdomain") ?? ""),
    });
  } catch (error) {
    const { message } = toClientError(error);
    const field = (error as { field?: string })?.field;
    return { error: message, field };
  }

  revalidatePath("/dashboard");
  return {};
}

export async function renameSiteAction(
  _prev: SiteActionState,
  formData: FormData,
): Promise<SiteActionState> {
  try {
    const userId = await requireUserId();
    await renameSite(userId, String(formData.get("siteId") ?? ""), String(formData.get("name") ?? ""));
  } catch (error) {
    return { error: toClientError(error).message };
  }

  revalidatePath("/dashboard");
  return {};
}

export async function deleteSiteAction(
  _prev: SiteActionState,
  formData: FormData,
): Promise<SiteActionState> {
  try {
    const userId = await requireUserId();
    await deleteSite(userId, String(formData.get("siteId") ?? ""));
  } catch (error) {
    return { error: toClientError(error).message };
  }

  revalidatePath("/dashboard");
  return {};
}
