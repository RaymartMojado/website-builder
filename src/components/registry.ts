import type { ComponentType } from "react";
import type { z } from "zod";
import type { ResponsiveStyle } from "@/lib/document/types";
import { field, defaultsFor, schemaFor, type FieldMap } from "./fields";
import * as blocks from "./blocks";
import type { BlockProps } from "./blocks";

/**
 * The component registry — the hub.
 *
 * Both the editor and the renderer read from here. One entry defines what a
 * node type is called, what props it accepts, how it validates, what the
 * inspector shows, and how it renders. Nothing about a component lives
 * anywhere else.
 */

export type Category = "layout" | "content" | "media" | "structural";

export interface ComponentDef {
  type: string;
  label: string;
  category: Category;
  /** Icon name from lucide-react, resolved in the palette. */
  icon: string;
  fields: FieldMap;
  schema: z.ZodObject<z.ZodRawShape>;
  defaultProps: Record<string, unknown>;
  defaultStyle: ResponsiveStyle;
  acceptsChildren: boolean;
  /** Hidden from the palette — created by the system, not dragged in. */
  internal?: boolean;
  /** Child types this node will accept, when it is fussy about them. */
  allowedChildren?: string[];
  render: ComponentType<BlockProps>;
}

interface DefineInput {
  type: string;
  label: string;
  category: Category;
  icon: string;
  fields?: FieldMap;
  defaultStyle?: ResponsiveStyle;
  acceptsChildren?: boolean;
  internal?: boolean;
  allowedChildren?: string[];
  render: ComponentType<BlockProps>;
}

function define(input: DefineInput): ComponentDef {
  const fields = input.fields ?? {};
  return {
    type: input.type,
    label: input.label,
    category: input.category,
    icon: input.icon,
    fields,
    schema: schemaFor(fields),
    defaultProps: defaultsFor(fields),
    defaultStyle: input.defaultStyle ?? { base: {} },
    acceptsChildren: input.acceptsChildren ?? false,
    internal: input.internal,
    allowedChildren: input.allowedChildren,
    render: input.render,
  };
}

const definitions: ComponentDef[] = [
  // ---- structural -------------------------------------------------------
  define({
    type: "Root",
    label: "Page",
    category: "structural",
    icon: "File",
    acceptsChildren: true,
    internal: true,
    defaultStyle: {
      base: {
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        fontFamily: "var(--font-body)",
        color: "var(--color-text)",
        backgroundColor: "var(--color-background)",
      },
    },
    render: blocks.Root,
  }),

  define({
    type: "Header",
    label: "Header",
    category: "structural",
    icon: "PanelTop",
    acceptsChildren: true,
    internal: true,
    defaultStyle: {
      // A nav bar is a band, not a section: it should read as chrome and get
      // out of the way. 10px of vertical padding around a 24px logo lands at
      // ~44px, which is the height people expect a header to be.
      //
      // nowrap on purpose. Wrapping put the logo on one line and the links on
      // another, which stops looking like a nav bar at all — the links should
      // stay beside the logo and the nav itself handles narrow widths.
      base: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "nowrap",
        paddingTop: "10px",
        paddingBottom: "10px",
        paddingLeft: "20px",
        paddingRight: "20px",
        backgroundColor: "var(--color-background)",
        borderStyle: "solid",
        borderWidth: "0 0 1px 0",
        borderColor: "var(--color-border)",
      },
      md: { paddingLeft: "32px", paddingRight: "32px" },
    },
    render: blocks.Header,
  }),
  define({
    type: "Footer",
    label: "Footer",
    category: "structural",
    icon: "PanelBottom",
    acceptsChildren: true,
    internal: true,
    defaultStyle: {
      base: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        paddingTop: "32px",
        paddingBottom: "32px",
        paddingLeft: "20px",
        paddingRight: "20px",
        backgroundColor: "var(--color-surface)",
        color: "var(--color-muted)",
        fontSize: "14px",
      },
      md: { paddingLeft: "32px", paddingRight: "32px" },
    },
    render: blocks.Footer,
  }),
  define({
    type: "Nav",
    label: "Navigation",
    category: "structural",
    icon: "Menu",
    fields: { items: field.menu("Menu items") },
    defaultStyle: {
      base: {
        display: "flex",
        alignItems: "center",
        // Links stay on one line. Wrapping them stacked "Home" above "About",
        // which reads as a broken list rather than navigation. A drawer for
        // genuinely narrow screens needs a client runtime and arrives with the
        // site script in a later phase.
        flexWrap: "nowrap",
        gap: "18px",
        fontSize: "15px",
        fontWeight: "500",
      },
      md: { gap: "26px" },
    },
    render: blocks.Nav,
  }),
  define({
    type: "Logo",
    label: "Logo",
    category: "structural",
    icon: "Sparkles",
    fields: {
      text: field.text("Text", "Your site", { max: 60 }),
      src: field.image("Image (optional)"),
      alt: field.alt("Image description"),
      link: field.link("Links to"),
    },
    defaultStyle: {
      base: {
        display: "inline-flex",
        alignItems: "center",
        height: "24px",
        fontFamily: "var(--font-heading)",
        fontSize: "17px",
        fontWeight: "700",
        letterSpacing: "-0.01em",
        color: "var(--color-text)",
        textDecoration: "none",
      },
    },
    render: blocks.Logo,
  }),

  // ---- layout -----------------------------------------------------------
  define({
    type: "Section",
    label: "Section",
    category: "layout",
    icon: "Rows3",
    acceptsChildren: true,
    defaultStyle: {
      base: { paddingTop: "48px", paddingBottom: "48px", paddingLeft: "20px", paddingRight: "20px" },
      md: { paddingTop: "80px", paddingBottom: "80px", paddingLeft: "32px", paddingRight: "32px" },
    },
    render: blocks.Section,
  }),
  define({
    type: "Container",
    label: "Container",
    category: "layout",
    icon: "Square",
    acceptsChildren: true,
    defaultStyle: {
      base: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        width: "100%",
        maxWidth: "1100px",
        marginLeft: "auto",
        marginRight: "auto",
      },
    },
    render: blocks.Container,
  }),
  define({
    type: "Columns",
    label: "Columns",
    category: "layout",
    icon: "Columns3",
    acceptsChildren: true,
    defaultStyle: {
      // Stacks on mobile, side by side from tablet up — the responsive default
      // people expect, so they do not have to discover the breakpoint switcher
      // before their first layout works.
      base: { display: "flex", flexDirection: "column", gap: "16px" },
      md: { flexDirection: "row", gap: "32px" },
    },
    render: blocks.Columns,
  }),
  define({
    type: "Spacer",
    label: "Spacer",
    category: "layout",
    icon: "MoveVertical",
    defaultStyle: { base: { height: "48px" } },
    render: blocks.Spacer,
  }),
  define({
    type: "Divider",
    label: "Divider",
    category: "layout",
    icon: "Minus",
    defaultStyle: {
      base: { borderStyle: "solid", borderWidth: "0", borderColor: "var(--color-border)", height: "1px", backgroundColor: "var(--color-border)" },
    },
    render: blocks.Divider,
  }),

  // ---- content ----------------------------------------------------------
  define({
    type: "Heading",
    label: "Heading",
    category: "content",
    icon: "Heading",
    fields: {
      text: field.text("Text", "Your headline here", { max: 300 }),
      level: field.enum(
        "Level",
        [
          { value: "h1", label: "H1 — page title" },
          { value: "h2", label: "H2 — section" },
          { value: "h3", label: "H3 — subsection" },
          { value: "h4", label: "H4" },
        ],
        "h2",
      ),
    },
    defaultStyle: {
      base: {
        fontFamily: "var(--font-heading)",
        fontSize: "32px",
        fontWeight: "700",
        lineHeight: "1.15",
        letterSpacing: "-0.02em",
        margin: "0",
      },
      md: { fontSize: "44px" },
    },
    render: blocks.Heading,
  }),
  define({
    type: "Text",
    label: "Text",
    category: "content",
    icon: "Type",
    fields: {
      text: field.textarea("Text", "Write something worth reading.", { max: 5000 }),
    },
    defaultStyle: {
      base: { fontSize: "16px", lineHeight: "1.6", color: "var(--color-muted)", margin: "0", maxWidth: "65ch" },
      md: { fontSize: "18px" },
    },
    render: blocks.Text,
  }),
  define({
    type: "Button",
    label: "Button",
    category: "content",
    icon: "MousePointerClick",
    fields: {
      label: field.text("Label", "Get started", { max: 100 }),
      link: field.link("Links to"),
    },
    defaultStyle: {
      base: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "12px",
        paddingBottom: "12px",
        paddingLeft: "22px",
        paddingRight: "22px",
        backgroundColor: "var(--color-primary)",
        color: "#ffffff",
        borderRadius: "var(--radius-md)",
        borderStyle: "none",
        borderWidth: "0",
        fontSize: "15px",
        fontWeight: "600",
        textDecoration: "none",
      },
    },
    render: blocks.Button,
  }),

  // ---- media ------------------------------------------------------------
  define({
    type: "Image",
    label: "Image",
    category: "media",
    icon: "Image",
    fields: {
      src: field.image("Source"),
      alt: field.alt(),
    },
    defaultStyle: {
      base: { width: "100%", height: "auto", borderRadius: "var(--radius-md)", objectFit: "cover" },
    },
    render: blocks.Image,
  }),
];

export const registry: Record<string, ComponentDef> = Object.fromEntries(
  definitions.map((definition) => [definition.type, definition]),
);

export function getDef(type: string): ComponentDef | undefined {
  return registry[type];
}

/**
 * Everything a user may drag from the palette, grouped for display.
 *
 * Structural pieces (Nav, Logo) belong in the header or footer rather than in
 * a page body, so the palette only offers them while a shared region is the
 * edit target — see `paletteGroupsFor`.
 */
export const paletteGroups: { category: Category; label: string; items: ComponentDef[] }[] = (
  [
    ["layout", "Layout"],
    ["content", "Content"],
    ["media", "Media"],
    ["structural", "Site"],
  ] as const
).map(([category, label]) => ({
  category,
  label,
  items: definitions.filter((definition) => definition.category === category && !definition.internal),
}));

export function paletteGroupsFor(target: "page" | "header" | "footer") {
  return paletteGroups.filter((group) =>
    group.category === "structural" ? target !== "page" : true,
  );
}

export function canAcceptChild(parentType: string, childType: string): boolean {
  const parent = getDef(parentType);
  if (!parent?.acceptsChildren) return false;
  if (parent.allowedChildren) return parent.allowedChildren.includes(childType);
  return true;
}
