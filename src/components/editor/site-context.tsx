"use client";

import { createContext, useContext } from "react";

/** The sibling pages the link picker can point at. */
export interface SitePageSummary {
  id: string;
  title: string;
  path: string;
}

export interface EditorSite {
  id: string;
  name: string;
  subdomain: string;
  pages: SitePageSummary[];
}

const SiteContext = createContext<EditorSite | null>(null);

export function SiteProvider({
  site,
  children,
}: {
  site: EditorSite;
  children: React.ReactNode;
}) {
  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>;
}

export function useEditorSite(): EditorSite {
  const site = useContext(SiteContext);
  if (!site) throw new Error("useEditorSite must be used inside SiteProvider");
  return site;
}

export function useSitePages(): SitePageSummary[] {
  return useContext(SiteContext)?.pages ?? [];
}
