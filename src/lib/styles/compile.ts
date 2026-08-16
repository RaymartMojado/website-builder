import {
  FONT_STACKS,
  BREAKPOINTS,
  NODE_ID_PATTERN,
  type PageDocument,
  type StyleObject,
  type Theme,
} from "@/lib/document/types";

/**
 * Style compilation — OWASP A03.
 *
 * This is the one place user-authored data becomes executable-ish text, so it
 * is written as an ALLOWLIST and nothing escapes it:
 *
 *   - only properties in PROPERTIES are emitted at all
 *   - each value must match that property's matcher exactly
 *   - anything unmatched is DROPPED, never passed through or escaped
 *
 * Escaping was considered and rejected. A value like
 *   `red; } body { display: none } .x {`
 * only needs one missed edge case to break out of its rule, and CSS has many.
 * Matching known-good shapes has no such failure mode.
 *
 * The same function feeds the published renderer and the editor iframe. That
 * identity is what makes the preview genuinely WYSIWYG rather than an
 * approximation.
 */

// ---------------------------------------------------------------------------
// Value matchers
// ---------------------------------------------------------------------------

const LENGTH_UNIT = "(?:px|rem|em|%|vh|vw|vmin|vmax|ch|fr)";
const NUMBER = "-?(?:\\d+\\.?\\d*|\\.\\d+)";

const LENGTH_KEYWORDS = new Set(["auto", "none", "min-content", "max-content", "fit-content", "0"]);

const lengthRe = new RegExp(`^${NUMBER}${LENGTH_UNIT}?$`);
const numberRe = new RegExp(`^${NUMBER}$`);
const hexRe = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const rgbRe = new RegExp(
  `^rgba?\\(\\s*${NUMBER}%?\\s*[,\\s]\\s*${NUMBER}%?\\s*[,\\s]\\s*${NUMBER}%?\\s*(?:[,/]\\s*${NUMBER}%?\\s*)?\\)$`,
  "i",
);
const hslRe = new RegExp(
  `^hsla?\\(\\s*${NUMBER}(?:deg)?\\s*[,\\s]\\s*${NUMBER}%\\s*[,\\s]\\s*${NUMBER}%\\s*(?:[,/]\\s*${NUMBER}%?\\s*)?\\)$`,
  "i",
);
/** Only our own token namespace, and only safe characters inside it. */
const varRe = /^var\(--[a-z0-9-]{1,48}\)$/;

const NAMED_COLORS = new Set([
  "transparent", "currentcolor", "black", "white", "red", "green", "blue", "yellow",
  "orange", "purple", "pink", "gray", "grey", "brown", "cyan", "magenta", "lime",
  "navy", "teal", "olive", "maroon", "silver", "gold", "beige", "ivory", "coral",
]);

function isLength(value: string): boolean {
  // Theme tokens count as lengths — `borderRadius: var(--radius-md)` is the
  // whole point of having a spacing and radius scale. varRe restricts this to
  // our own namespace, so it cannot smuggle anything else in.
  return LENGTH_KEYWORDS.has(value) || lengthRe.test(value) || varRe.test(value);
}

function isColor(value: string): boolean {
  const normalised = value.toLowerCase();
  return (
    NAMED_COLORS.has(normalised) ||
    hexRe.test(value) ||
    rgbRe.test(value) ||
    hslRe.test(value) ||
    varRe.test(value)
  );
}

/** Shorthands like `8px 16px` — up to four lengths, nothing else. */
function isLengthList(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  return parts.length >= 1 && parts.length <= 4 && parts.every(isLength);
}

function keyword(...allowed: string[]) {
  const set = new Set(allowed);
  return (value: string) => set.has(value.toLowerCase());
}

/**
 * Font families are an allowlist of complete stacks, not free text. Accepting
 * arbitrary family names means accepting quotes and commas into the
 * declaration, which is not worth the flexibility.
 *
 * Sourced from FONT_STACKS in the document types so a theme cannot name a
 * stack the compiler will silently drop — that mismatch produced an
 * unstyled-font bug once already.
 */
const ALLOWED_FONTS = new Set<string>([
  "var(--font-body)",
  "var(--font-heading)",
  ...Object.values(FONT_STACKS),
]);

/** Shadows are presets. Parsing arbitrary shadow syntax is not worth the risk. */
const SHADOWS = new Set([
  "none",
  "0 1px 2px rgba(0,0,0,0.06)",
  "0 4px 12px rgba(0,0,0,0.08)",
  "0 12px 32px rgba(0,0,0,0.12)",
]);

type Matcher = (value: string) => boolean;

/**
 * The complete set of properties a document may express. Adding one is a
 * deliberate act: it needs a matcher, and the matcher needs a test.
 */
const PROPERTIES: Record<string, Matcher> = {
  // layout
  display: keyword("block", "flex", "inline-flex", "grid", "inline-block", "none"),
  flexDirection: keyword("row", "column", "row-reverse", "column-reverse"),
  flexWrap: keyword("nowrap", "wrap", "wrap-reverse"),
  justifyContent: keyword(
    "flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly",
  ),
  alignItems: keyword("flex-start", "flex-end", "center", "baseline", "stretch"),
  gap: isLength,
  rowGap: isLength,
  columnGap: isLength,
  gridTemplateColumns: (value) =>
    /^(?:repeat\(\d{1,2},\s*(?:minmax\(0,\s*1fr\)|1fr)\)|(?:\s*(?:\d+fr|auto|min-content|max-content))+)$/.test(
      value,
    ),
  flexGrow: numberRe.test.bind(numberRe),
  flexShrink: numberRe.test.bind(numberRe),

  // box
  width: isLength,
  minWidth: isLength,
  maxWidth: isLength,
  height: isLength,
  minHeight: isLength,
  maxHeight: isLength,
  padding: isLengthList,
  paddingTop: isLength,
  paddingRight: isLength,
  paddingBottom: isLength,
  paddingLeft: isLength,
  margin: isLengthList,
  marginTop: isLength,
  marginRight: isLength,
  marginBottom: isLength,
  marginLeft: isLength,

  // appearance
  color: isColor,
  backgroundColor: isColor,
  opacity: (value) => numberRe.test(value) && Number(value) >= 0 && Number(value) <= 1,
  borderRadius: isLengthList,
  // The 1–4 value shorthand is valid CSS and is how you get a single edge —
  // `0 0 1px 0` for a header's bottom rule.
  borderWidth: isLengthList,
  borderStyle: keyword("none", "solid", "dashed", "dotted"),
  borderColor: isColor,
  boxShadow: (value) => SHADOWS.has(value),

  // type
  fontFamily: (value) => ALLOWED_FONTS.has(value),
  fontSize: isLength,
  fontWeight: keyword("100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold"),
  fontStyle: keyword("normal", "italic"),
  lineHeight: (value) => numberRe.test(value) || isLength(value),
  letterSpacing: isLength,
  textAlign: keyword("left", "center", "right", "justify"),
  textTransform: keyword("none", "uppercase", "lowercase", "capitalize"),
  textDecoration: keyword("none", "underline", "line-through"),

  // media
  objectFit: keyword("cover", "contain", "fill", "none", "scale-down"),
  overflow: keyword("visible", "hidden", "auto", "scroll"),
  aspectRatio: (value) => /^\d{1,3}\s*\/\s*\d{1,3}$/.test(value),
};

export const ALLOWED_PROPERTIES = Object.freeze(Object.keys(PROPERTIES));

/**
 * A cheap structural veto applied before any matcher runs.
 *
 * The matchers should already reject all of these, but a value containing a
 * brace or a comment marker is never legitimate, and failing closed here means
 * a future matcher bug cannot become an injection.
 */
const FORBIDDEN = /[{}\\;]|\/\*|\*\/|<|>|url\s*\(|expression\s*\(|@import|javascript:|data:/i;

export function isSafeValue(value: string): boolean {
  return !FORBIDDEN.test(value);
}

function camelToKebab(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Names the properties in a style object that would be dropped, and why.
 *
 * The compiler drops bad values silently, which is right at render time — one
 * bad declaration should not blank a live page. But a WRITE should be refused,
 * or the stored document quietly diverges from what renders. This is what lets
 * the server-side validator reject at the door instead of trusting the
 * compiler to clean up later.
 */
export function findInvalidDeclarations(
  style: StyleObject,
): { property: string; reason: "unknown-property" | "unsafe-value" | "invalid-value" }[] {
  const problems: { property: string; reason: "unknown-property" | "unsafe-value" | "invalid-value" }[] = [];

  for (const [property, rawValue] of Object.entries(style)) {
    const matcher = PROPERTIES[property];
    if (!matcher) {
      problems.push({ property, reason: "unknown-property" });
      continue;
    }

    const value = String(rawValue).trim();
    if (!isSafeValue(value)) {
      problems.push({ property, reason: "unsafe-value" });
      continue;
    }
    if (!value || !matcher(value)) {
      problems.push({ property, reason: "invalid-value" });
    }
  }

  return problems;
}

/** Returns the declarations that survive validation, in `prop: value` form. */
export function compileDeclarations(style: StyleObject): string[] {
  const declarations: string[] = [];

  for (const [property, rawValue] of Object.entries(style)) {
    const matcher = PROPERTIES[property];
    if (!matcher) continue; // unknown property — dropped

    const value = String(rawValue).trim();
    if (!value || !isSafeValue(value) || !matcher(value)) continue; // dropped

    declarations.push(`${camelToKebab(property)}:${value}`);
  }

  return declarations;
}

// ---------------------------------------------------------------------------
// Document → stylesheet
// ---------------------------------------------------------------------------

/** The class applied to a node's rendered element. */
export function nodeClass(nodeId: string): string {
  return `n_${nodeId}`;
}

/**
 * Defaults for elements the compiler cannot address by node id.
 *
 * A Nav renders its items from props, so the anchors have no node of their own
 * and no generated rule. Without this they would inherit the browser's blue
 * underlined link styling and look nothing like the nav the author designed.
 *
 * Fixed text — never interpolated from user data.
 */
export const BASE_CSS = [
  "[data-nav-item]{color:inherit;text-decoration:none}",
  "[data-nav-item][aria-current=page]{font-weight:700}",
  "[data-nav-item]:hover{text-decoration:underline}",
].join("");

export function compileTheme(theme: Theme): string {
  const declarations: string[] = [];

  for (const [name, value] of Object.entries(theme.colors ?? {})) {
    if (/^[a-z0-9-]{1,32}$/i.test(name) && isSafeValue(value) && isColor(value)) {
      declarations.push(`--color-${name.toLowerCase()}:${value}`);
    }
  }

  for (const [role, stack] of Object.entries(theme.fonts ?? {})) {
    if (/^[a-z]{1,16}$/i.test(role) && ALLOWED_FONTS.has(stack)) {
      declarations.push(`--font-${role.toLowerCase()}:${stack}`);
    }
  }

  for (const [name, value] of Object.entries(theme.radii ?? {})) {
    if (/^[a-z0-9-]{1,16}$/i.test(name) && isSafeValue(value) && isLength(value)) {
      declarations.push(`--radius-${name.toLowerCase()}:${value}`);
    }
  }

  return declarations.length > 0 ? `:root{${declarations.join(";")}}` : "";
}

export interface CompileOptions {
  /** Prefix every selector, so editor chrome cannot collide with node styles. */
  scope?: string;
  includeTheme?: boolean;
  theme?: Theme;
}

/**
 * Compiles one or more documents into a single stylesheet.
 *
 * Accepts several documents because a published page is a composition —
 * header, body, footer and expanded symbols — and their rules must share one
 * cascade. Base rules come first, then each breakpoint's media block, so a
 * larger breakpoint always wins regardless of node ordering.
 */
export function compileStyles(
  documents: PageDocument | PageDocument[],
  options: CompileOptions = {},
): string {
  const docs = Array.isArray(documents) ? documents : [documents];
  const scope = options.scope ? `${options.scope} ` : "";

  const byBreakpoint = new Map<string, string[]>();
  for (const { key } of BREAKPOINTS) byBreakpoint.set(key, []);

  for (const doc of docs) {
    for (const node of Object.values(doc.nodes ?? {})) {
      // Ids are interpolated straight into a selector.
      if (!NODE_ID_PATTERN.test(node.id)) continue;
      const selector = `${scope}.${nodeClass(node.id)}`;

      for (const { key } of BREAKPOINTS) {
        const style = node.style?.[key];
        if (!style) continue;

        const declarations = compileDeclarations(style);
        if (declarations.length === 0) continue;

        byBreakpoint.get(key)!.push(`${selector}{${declarations.join(";")}}`);
      }
    }
  }

  const chunks: string[] = [];

  if (options.includeTheme && options.theme) {
    const themeCss = compileTheme(options.theme);
    if (themeCss) chunks.push(themeCss);
  }

  for (const { key, minWidth } of BREAKPOINTS) {
    const rules = byBreakpoint.get(key)!;
    if (rules.length === 0) continue;

    chunks.push(minWidth === 0 ? rules.join("") : `@media(min-width:${minWidth}px){${rules.join("")}}`);
  }

  return chunks.join("");
}
