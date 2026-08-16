/**
 * The document format.
 *
 * One format serves four things — page bodies, the site header, the site
 * footer, and symbols — so the renderer, the validator, the operations library
 * and the editor all work on any of them with no special cases.
 *
 * Nodes are stored in a FLAT MAP keyed by id, with children as id references
 * rather than nested objects. Moves, deletes and undo diffs become single-key
 * operations instead of deep-tree surgery, and any node is reachable in one
 * lookup.
 */

export type NodeId = string;

/** CSS property values, camelCased keys. Validated in lib/styles/compile.ts. */
export type StyleObject = Record<string, string | number>;

/** Mobile-first: `base` always applies, `md`/`lg` layer on top via min-width. */
export interface ResponsiveStyle {
  base: StyleObject;
  md?: StyleObject;
  lg?: StyleObject;
}

export type Breakpoint = keyof ResponsiveStyle;

export const BREAKPOINTS: { key: Breakpoint; label: string; minWidth: number; width: number }[] = [
  { key: "base", label: "Mobile", minWidth: 0, width: 390 },
  { key: "md", label: "Tablet", minWidth: 768, width: 820 },
  { key: "lg", label: "Desktop", minWidth: 1024, width: 1280 },
];

export interface DocNode {
  id: NodeId;
  /** Key into the component registry. */
  type: string;
  props: Record<string, unknown>;
  style: ResponsiveStyle;
  children: NodeId[];
  parent: NodeId | null;
}

export interface PageDocument {
  /**
   * Bump when the shape changes, and teach migrate() to handle the old value.
   * Published sites keep rendering from whatever version they were saved at.
   */
  version: 1;
  rootId: NodeId;
  nodes: Record<NodeId, DocNode>;
}

export const DOCUMENT_VERSION = 1 as const;

/** Guards the renderer and the validator against pathological documents. */
export const MAX_NODES = 2000;
export const MAX_DEPTH = 50;

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export interface Theme {
  colors: Record<string, string>;
  fonts: { body: string; heading: string };
  radii: Record<string, string>;
}

/**
 * The font stacks a theme may use.
 *
 * Declared here rather than as free text because the style compiler validates
 * font-family against this exact set — arbitrary family names would mean
 * accepting quotes and commas into a CSS declaration. Themes pick from the
 * list; they do not invent stacks.
 */
export const FONT_STACKS = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, Consolas, monospace",
} as const;

export type FontStack = (typeof FONT_STACKS)[keyof typeof FONT_STACKS];

export const DEFAULT_THEME: Theme = {
  colors: {
    primary: "#2b54d4",
    text: "#11151c",
    muted: "#4c566a",
    background: "#ffffff",
    surface: "#f6f7fa",
    border: "#dce1ea",
  },
  fonts: { body: FONT_STACKS.sans, heading: FONT_STACKS.sans },
  radii: { sm: "4px", md: "8px", lg: "16px", full: "9999px" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Node ids are interpolated into CSS class names, so they must never contain
 * anything that could escape a selector. Generated ids are alphanumeric; this
 * is the check that keeps a hand-edited or hostile document from getting
 * through.
 */
export const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

let counter = 0;

/**
 * Deliberately not crypto.randomUUID(): ids appear in class names, and short
 * readable ones keep generated CSS legible. Uniqueness only has to hold within
 * one document.
 */
export function createNodeId(): NodeId {
  counter = (counter + 1) % 0xffff;
  return `n${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`;
}

export function emptyStyle(): ResponsiveStyle {
  return { base: {} };
}

export function getNode(doc: PageDocument, id: NodeId): DocNode | undefined {
  return doc.nodes[id];
}

/** Root-first walk. Skips ids that are missing rather than throwing. */
export function walk(doc: PageDocument, visit: (node: DocNode, depth: number) => void): void {
  const stack: Array<{ id: NodeId; depth: number }> = [{ id: doc.rootId, depth: 0 }];
  const seen = new Set<NodeId>();

  while (stack.length > 0) {
    const { id, depth } = stack.pop()!;
    if (seen.has(id) || depth > MAX_DEPTH) continue;
    seen.add(id);

    const node = doc.nodes[id];
    if (!node) continue;

    visit(node, depth);
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push({ id: node.children[i]!, depth: depth + 1 });
    }
  }
}

/** Ancestor chain from the node's parent up to the root, nearest first. */
export function ancestorsOf(doc: PageDocument, id: NodeId): DocNode[] {
  const chain: DocNode[] = [];
  let current = doc.nodes[id]?.parent ?? null;
  let guard = 0;

  while (current && guard++ < MAX_DEPTH) {
    const node = doc.nodes[current];
    if (!node) break;
    chain.push(node);
    current = node.parent;
  }
  return chain;
}

export function isDescendant(doc: PageDocument, ancestorId: NodeId, nodeId: NodeId): boolean {
  return ancestorsOf(doc, nodeId).some((node) => node.id === ancestorId);
}
