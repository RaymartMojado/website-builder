import { z } from "zod";

/**
 * Links reference pages by ID, never by URL string.
 *
 * Rename a page's path and every link follows automatically. Delete a page and
 * we can say exactly what breaks. A builder that stores `href: "/about"` as
 * text starts producing 404s the first time someone reorganises their site.
 *
 * It is also the security boundary for URLs — OWASP A03. The scheme allowlist
 * lives in the schema, so `javascript:` cannot even be persisted, let alone
 * rendered.
 */

/** http and https only for external links; mailto/tel have their own kinds. */
const SAFE_URL = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    // Relative paths are fine and common.
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Links must be http(s) or a path starting with /");

export const linkSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("page"),
    pageId: z.string().min(1).max(64),
    hash: z.string().max(64).regex(/^[A-Za-z0-9_-]*$/).optional(),
  }),
  z.object({
    kind: z.literal("external"),
    url: SAFE_URL,
    newTab: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("email"), address: z.email().max(320) }),
  z.object({
    kind: z.literal("phone"),
    // Digits, spaces and the usual punctuation. Nothing that could carry a scheme.
    number: z.string().trim().max(32).regex(/^[+0-9][0-9\s().-]*$/, "Enter a valid phone number"),
  }),
  z.object({ kind: z.literal("asset"), assetId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("none") }),
]);

export type Link = z.infer<typeof linkSchema>;

export const NO_LINK: Link = { kind: "none" };

/** Context the resolver needs to turn a Link into an href. */
export interface LinkContext {
  /** pageId → published path. */
  pagePaths: Map<string, string>;
  /** assetId → public URL. */
  assetUrls?: Map<string, string>;
  /**
   * Prefix for links that stay inside the site, set only when the site is
   * being previewed on the app's own origin at /s/{slug}. Stored paths are
   * relative to the site root, so without this every nav link would resolve
   * against the app instead — "/about" would land on the app's own /about.
   */
  basePath?: string;
}

export interface ResolvedLink {
  href: string | undefined;
  target?: "_blank";
  rel?: string;
  /** True when the link pointed at something that no longer exists. */
  broken: boolean;
}

export function resolveLink(link: Link | undefined | null, ctx: LinkContext): ResolvedLink {
  if (!link || link.kind === "none") return { href: undefined, broken: false };

  switch (link.kind) {
    case "page": {
      const path = ctx.pagePaths.get(link.pageId);
      // A deleted page renders as a non-link rather than a wrong link. The
      // editor surfaces this properly via the referrer check before delete.
      if (!path) return { href: undefined, broken: true };
      const target = `${ctx.basePath ?? ""}${path}`;
      return { href: link.hash ? `${target}#${link.hash}` : target, broken: false };
    }

    case "external":
      return {
        href: link.url,
        ...(link.newTab
          ? // noopener is the point: without it the opened page can navigate
            // this one via window.opener.
            { target: "_blank" as const, rel: "noopener noreferrer" }
          : {}),
        broken: false,
      };

    case "email":
      return { href: `mailto:${link.address}`, broken: false };

    case "phone":
      return { href: `tel:${link.number.replace(/[^\d+]/g, "")}`, broken: false };

    case "asset": {
      const url = ctx.assetUrls?.get(link.assetId);
      return { href: url, broken: !url };
    }
  }
}

/** Parses unknown input into a Link, falling back to none. */
export function parseLink(value: unknown): Link {
  const result = linkSchema.safeParse(value);
  return result.success ? result.data : NO_LINK;
}

export function describeLink(link: Link, ctx: LinkContext): string {
  switch (link.kind) {
    case "none":
      return "No link";
    case "page":
      return ctx.pagePaths.get(link.pageId) ?? "Deleted page";
    case "external":
      return link.url;
    case "email":
      return link.address;
    case "phone":
      return link.number;
    case "asset":
      return "File";
  }
}
