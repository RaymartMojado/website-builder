import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getPublishedPage, getPublishedSite } from "@/lib/sites/published";
import { PREVIEW_PREFIX, sitesHostIsRoutable } from "@/lib/sites/subdomain";
import { migrate } from "@/lib/document/migrate";
import { DEFAULT_THEME, type Theme } from "@/lib/document/types";
import { BASE_CSS, compileStyles } from "@/lib/styles/compile";
import { RenderPage } from "@/components/renderer/RenderNode";

/**
 * Published site renderer.
 *
 * proxy.ts rewrites {slug}.sites-host/anything here. The x-surface check
 * matters: without it /site/{slug} would be reachable on the app host,
 * serving customer content from the origin that holds session cookies. That
 * is the whole reason published sites live on a separate domain.
 */

async function loadPage(slug: string, path: string) {
  const site = await getPublishedSite(slug);
  if (!site) return null;

  const page = await getPublishedPage(site.id, path);
  return { site, page };
}

async function pagePaths(siteId: string): Promise<Map<string, string>> {
  const pages = await db.page.findMany({
    where: { siteId },
    select: { id: true, path: true },
  });
  return new Map(pages.map((page) => [page.id, page.path]));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
}): Promise<Metadata> {
  // The surface check belongs here too, not only in the page component.
  // generateMetadata runs independently of the render, so without it a request
  // to /site/{slug} on the APP host still answers 404 — but with the customer's
  // site name and page title in the response. A quiet cross-surface leak of
  // exactly the kind the separate published domain exists to prevent.
  if ((await headers()).get("x-surface") !== "published") return {};

  const { slug, path } = await params;
  const loaded = await loadPage(slug, `/${(path ?? []).join("/")}`.replace(/\/$/, "") || "/");

  if (!loaded?.page) return { title: loaded?.site.name ?? "Not found" };

  const seo = (loaded.page.seo ?? {}) as { description?: string };
  return {
    title: `${loaded.page.title} · ${loaded.site.name}`,
    description: seo.description,
  };
}

export default async function PublishedSitePage({
  params,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
}) {
  const surface = (await headers()).get("x-surface");
  if (surface !== "published") notFound();

  const { slug, path } = await params;
  const pathname = `/${(path ?? []).join("/")}`.replace(/\/$/, "") || "/";

  const loaded = await loadPage(slug, pathname);
  if (!loaded) notFound();

  const { site, page } = loaded;

  if (site.status === "SUSPENDED") {
    return (
      <main style={suspendedStyle}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>This site is no longer available</h1>
      </main>
    );
  }

  if (!page) notFound();

  const body = migrate(page.publishedContent);
  const header = page.hideHeader ? null : site.headerContent ? migrate(site.headerContent) : null;
  const footer = page.hideFooter ? null : site.footerContent ? migrate(site.footerContent) : null;

  const theme = { ...DEFAULT_THEME, ...((site.theme ?? {}) as Partial<Theme>) } as Theme;

  // BASE_CSS carries defaults for elements with no node of their own — nav
  // links are rendered from props, so nothing generates a rule for them and
  // without this they fall back to blue underlined browser links.
  const css =
    BASE_CSS +
    compileStyles([body, header, footer].filter((doc) => doc !== null), {
      includeTheme: true,
      theme,
    });

  // Empty on a real sites domain, where the site owns the whole origin and
  // stored paths already resolve correctly. Set only for same-origin previews,
  // where every internal path needs to keep the /s/{slug} prefix or it lands
  // on the app instead.
  const basePath = sitesHostIsRoutable() ? "" : `${PREVIEW_PREFIX}/${slug}`;
  const links = { pagePaths: await pagePaths(site.id), basePath: basePath || undefined };

  return (
    <>
      {/* Generated from the allowlisted compiler — see lib/styles/compile.ts */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <RenderPage
        body={body}
        header={header}
        footer={footer}
        // currentPath lets Nav mark the active link with aria-current, so it is
        // announced by a screen reader rather than only being a colour change.
        // It is compared against resolved hrefs, so it carries the same prefix.
        ctx={{ links, mode: "published", currentPath: `${basePath}${pathname}` }}
      />
    </>
  );
}

const suspendedStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "0 24px",
  textAlign: "center",
  font: "16px/1.5 ui-sans-serif, system-ui, sans-serif",
};
