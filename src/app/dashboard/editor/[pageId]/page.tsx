import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage, requireUserId } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/errors";
import { migrate } from "@/lib/document/migrate";
import { DEFAULT_THEME, type Theme } from "@/lib/document/types";
import { EditorShell } from "@/components/editor/editor-shell";

export const metadata = { title: "Editor · Website Builder" };

export default async function EditorPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const userId = await requireUserId();
  const { pageId } = await params;

  // Ownership first. The guard throws NotFoundError, which is the correct
  // decision but the wrong response type — left uncaught it surfaces as a 500,
  // which both looks like a bug and tells an attacker they hit something real.
  const page = await requirePage(userId, pageId).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const site = await db.site.findFirst({
    where: { id: page.siteId, ownerId: userId },
    select: {
      id: true,
      name: true,
      subdomain: true,
      theme: true,
      headerDraft: true,
      footerDraft: true,
      pages: {
        select: { id: true, title: true, path: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!site) notFound();

  const theme = { ...DEFAULT_THEME, ...((site.theme ?? {}) as Partial<Theme>) } as Theme;

  return (
    <EditorShell
      document={migrate(page.draftContent)}
      // Shared regions are loaded alongside the page so the canvas can compose
      // the whole thing — the header you see while editing is the real one.
      header={site.headerDraft ? migrate(site.headerDraft) : null}
      footer={site.footerDraft ? migrate(site.footerDraft) : null}
      pageId={page.id}
      pageTitle={page.title}
      site={{ id: site.id, name: site.name, subdomain: site.subdomain, pages: site.pages }}
      theme={theme}
    />
  );
}
