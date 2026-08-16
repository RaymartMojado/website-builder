import type { PageDocument } from "./types";
import { createDocument, insertNode, makeNode } from "./operations";
import { getDef } from "@/components/registry";
import type { Link } from "@/lib/links/types";

/**
 * Starter documents.
 *
 * Built with the same operations the editor uses, so a template cannot express
 * anything a user could not build by hand — and cannot drift into a shape the
 * validator rejects.
 */

interface Spec {
  type: string;
  props?: Record<string, unknown>;
  style?: { base?: Record<string, string>; md?: Record<string, string> };
  children?: Spec[];
}

function build(doc: PageDocument, spec: Spec, parentId: string): string | null {
  const def = getDef(spec.type);
  if (!def) return null;

  const node = makeNode(
    spec.type,
    { ...def.defaultProps, ...(spec.props ?? {}) },
    {
      base: { ...def.defaultStyle.base, ...(spec.style?.base ?? {}) },
      ...(def.defaultStyle.md || spec.style?.md
        ? { md: { ...def.defaultStyle.md, ...(spec.style?.md ?? {}) } }
        : {}),
      ...(def.defaultStyle.lg ? { lg: { ...def.defaultStyle.lg } } : {}),
    },
  );

  const id = insertNode(doc, node, { parentId });
  if (!id) return null;

  for (const child of spec.children ?? []) build(doc, child, id);
  return id;
}

export function documentFrom(children: Spec[]): PageDocument {
  const doc = createDocument("Root");
  for (const child of children) build(doc, child, doc.rootId);
  return doc;
}

/**
 * The default site header: logo on the left, nav on the right.
 *
 * Created with the site so a new build looks like a website immediately rather
 * than a floating block of text. Menu items are seeded from the pages that
 * exist, because a nav with nothing in it teaches nobody what a nav is for.
 */
export function headerTemplate(
  siteName: string,
  pages: { id: string; title: string }[],
  homeLink: Link,
): PageDocument {
  return documentFrom([
    {
      type: "Header",
      style: { base: { borderWidth: "0 0 1px 0" } },
      children: [
        { type: "Logo", props: { text: siteName, link: homeLink } },
        {
          type: "Nav",
          props: {
            items: pages.map((page, index) => ({
              id: `m${index}${page.id.slice(-6)}`,
              label: page.title,
              link: { kind: "page", pageId: page.id },
            })),
          },
        },
      ],
    },
  ]);
}

export function footerTemplate(siteName: string): PageDocument {
  const year = String(new Date().getFullYear());
  return documentFrom([
    {
      type: "Footer",
      children: [{ type: "Text", props: { text: `© ${year} ${siteName}` }, style: { base: { fontSize: "14px" } } }],
    },
  ]);
}

export function blankPage(): PageDocument {
  return documentFrom([
    {
      type: "Section",
      children: [
        {
          type: "Container",
          children: [
            { type: "Heading", props: { text: "Your new page", level: "h1" } },
            { type: "Text", props: { text: "Start building by dragging components from the left." } },
          ],
        },
      ],
    },
  ]);
}

/** A landing page with enough structure that the editor has something to chew on. */
export function homeTemplate(siteName: string, aboutLink: Link): PageDocument {
  return documentFrom([
    {
      type: "Section",
      style: {
        base: { backgroundColor: "var(--color-surface)", paddingTop: "64px", paddingBottom: "64px" },
        md: { paddingTop: "112px", paddingBottom: "112px" },
      },
      children: [
        {
          type: "Container",
          style: { base: { gap: "20px", maxWidth: "760px" } },
          children: [
            { type: "Heading", props: { text: siteName, level: "h1" } },
            {
              type: "Text",
              props: {
                text: "A small shop with strong opinions about coffee, built with a website builder that had not been written yet.",
              },
              style: { base: { fontSize: "18px" }, md: { fontSize: "20px" } },
            },
            { type: "Button", props: { label: "Read our story", link: aboutLink } },
          ],
        },
      ],
    },
    {
      type: "Section",
      children: [
        {
          type: "Container",
          children: [
            { type: "Heading", props: { text: "What we do", level: "h2" }, style: { base: { fontSize: "28px" }, md: { fontSize: "34px" } } },
            {
              type: "Columns",
              children: [
                {
                  type: "Container",
                  style: { base: { gap: "8px", maxWidth: "none" } },
                  children: [
                    { type: "Heading", props: { text: "Roast", level: "h3" }, style: { base: { fontSize: "20px" }, md: { fontSize: "20px" } } },
                    { type: "Text", props: { text: "Small batches, every week, never sitting on a shelf." } },
                  ],
                },
                {
                  type: "Container",
                  style: { base: { gap: "8px", maxWidth: "none" } },
                  children: [
                    { type: "Heading", props: { text: "Brew", level: "h3" }, style: { base: { fontSize: "20px" }, md: { fontSize: "20px" } } },
                    { type: "Text", props: { text: "Filter and espresso, pulled by people who taste it first." } },
                  ],
                },
                {
                  type: "Container",
                  style: { base: { gap: "8px", maxWidth: "none" } },
                  children: [
                    { type: "Heading", props: { text: "Share", level: "h3" }, style: { base: { fontSize: "20px" }, md: { fontSize: "20px" } } },
                    { type: "Text", props: { text: "A room worth sitting in, and no rush to leave it." } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
}

export function aboutTemplate(homeLink: Link): PageDocument {
  return documentFrom([
    {
      type: "Section",
      children: [
        {
          type: "Container",
          style: { base: { gap: "20px", maxWidth: "720px" } },
          children: [
            { type: "Heading", props: { text: "About us", level: "h1" } },
            {
              type: "Text",
              props: {
                text: "This second page exists to prove a point: the nav link that brought you here resolves through a page id, not a hard-coded URL. Rename the path and the link follows.",
              },
            },
            { type: "Divider" },
            { type: "Heading", props: { text: "Find us", level: "h2" }, style: { base: { fontSize: "24px" }, md: { fontSize: "28px" } } },
            { type: "Text", props: { text: "Open every day except the ones we are not." } },
            { type: "Button", props: { label: "Back home", link: homeLink } },
          ],
        },
      ],
    },
  ]);
}
