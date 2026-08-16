"use client";

import { useEffect, useMemo, useState } from "react";
import * as icons from "lucide-react";
import type { PageDocument, Theme } from "@/lib/document/types";
import { useEditor } from "@/store/editor";
import { useAutosave } from "@/hooks/use-autosave";
import { Canvas } from "./canvas";
import { Palette, DragGhost } from "./palette";
import { LayerTree } from "./layer-tree";
import { Inspector } from "./inspector";
import { Toolbar } from "./toolbar";
import { SiteProvider, type EditorSite } from "./site-context";
import { KeyboardHelp, useKeyboardShortcuts } from "./keyboard";

/**
 * Editor layout: palette and layers on the left, canvas in the middle,
 * inspector on the right.
 *
 * The editor is desktop-only, and says so rather than shipping a broken
 * small-screen canvas. Someone on a phone gets a real screen with links out,
 * not a cramped version of a tool that needs the width.
 */
export function EditorShell({
  document: initialDocument,
  header,
  footer,
  pageId,
  pageTitle,
  site,
  theme,
}: {
  document: PageDocument;
  header: PageDocument | null;
  footer: PageDocument | null;
  pageId: string;
  pageTitle: string;
  site: EditorSite;
  theme: Theme;
}) {
  const [tab, setTab] = useState<"components" | "layers">("components");

  // Load the documents once per page. Swapping pages resets history too — undo
  // must never reach across into a document you are no longer looking at.
  useEffect(() => {
    useEditor.getState().reset({
      page: initialDocument,
      header,
      footer,
      pageId,
      siteId: site.id,
      pageCount: site.pages.length,
    });
  }, [initialDocument, header, footer, pageId, site.id, site.pages.length]);

  useAutosave(pageId, site.id);
  useKeyboardShortcuts();

  // Real page paths, so nav links in the canvas show their true destinations.
  const links = useMemo(
    () => ({ pagePaths: new Map(site.pages.map((page) => [page.id, page.path])) }),
    [site.pages],
  );

  return (
    <SiteProvider site={site}>
      <div className="hidden h-screen flex-col overflow-hidden bg-neutral-100 lg:flex">
        <Toolbar pageId={pageId} pageTitle={pageTitle} />
        <SharedRegionBanner />

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[260px] shrink-0 flex-col border-r border-neutral-200 bg-white">
            <div role="tablist" className="flex border-b border-neutral-200">
              {(
                [
                  ["components", "Components"],
                  ["layers", "Layers"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`flex-1 px-3 py-2 text-[12px] font-medium transition-colors ${
                    tab === key
                      ? "border-b-2 border-blue-600 text-neutral-900"
                      : "text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {tab === "components" ? <Palette /> : <LayerTree />}
            </div>
          </aside>

          <Canvas theme={theme} links={links} />

          <aside className="w-[280px] shrink-0 overflow-auto border-l border-neutral-200 bg-white">
            <Inspector />
          </aside>
        </div>

        <DragGhost />
        <KeyboardHelp />
      </div>

      <SmallScreenNotice site={site} />
    </SiteProvider>
  );
}

/**
 * Editing the header or footer changes every page, so it says so — with a
 * count, not a vague warning. Making a global edit FEEL global is the
 * difference between a useful feature and a support ticket.
 */
function SharedRegionBanner() {
  const target = useEditor((state) => state.target);
  const pageCount = useEditor((state) => state.pageCount);

  if (target === "page") return null;

  const label = target === "header" ? "site header" : "site footer";
  const pages = pageCount === 1 ? "1 page" : `${pageCount} pages`;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-3 py-1.5">
      <p className="text-[12px] text-blue-900">
        <icons.Globe size={12} className="mr-1.5 inline align-[-1px]" />
        Editing the <strong className="font-semibold">{label}</strong> — changes apply to all{" "}
        {pages}.
      </p>
      <button
        type="button"
        onClick={() => useEditor.getState().setTarget("page")}
        className="rounded border border-blue-300 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-100"
      >
        Back to the page
      </button>
    </div>
  );
}

function SmallScreenNotice({ site }: { site: EditorSite }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center lg:hidden">
      <icons.MonitorSmartphone size={32} className="text-neutral-400" />
      <h1 className="text-lg font-semibold">The editor needs a wider screen</h1>
      <p className="max-w-sm text-sm text-neutral-600">
        Building a layout means seeing the canvas and both panels at once. Open this on a desktop
        and it will be here waiting.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <a
          href={`http://${site.subdomain}.${process.env.NEXT_PUBLIC_SITES_HOST ?? "sites.localhost:3000"}`}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          View the live site
        </a>
        <a href="/dashboard" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">
          Back to your sites
        </a>
      </div>
    </main>
  );
}
