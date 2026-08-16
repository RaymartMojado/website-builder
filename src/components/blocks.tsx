import type { ReactNode } from "react";
import type { LinkContext } from "@/lib/links/types";
import { parseLink, resolveLink } from "@/lib/links/types";

/**
 * The block components.
 *
 * These render in BOTH the editor iframe and the published page — same
 * components, same output. Editor affordances (outlines, drop indicators) are
 * overlaid separately rather than baked in here, because the moment a block
 * renders differently in the two places, WYSIWYG stops being true.
 *
 * `attrs` carries the generated class plus the data attributes the editor uses
 * for hit-testing. Every block must spread it onto its root element.
 */

export interface RenderContext {
  links: LinkContext;
  mode: "published" | "editor";
  /** The path being rendered, so Nav can mark the current page. */
  currentPath?: string;
}

export interface BlockAttrs {
  className: string;
  "data-node-id": string;
  "data-node-type": string;
}

export interface BlockProps {
  props: Record<string, unknown>;
  attrs: BlockAttrs;
  children: ReactNode;
  ctx: RenderContext;
  /** True when the node accepts children but has none — used for empty states. */
  isEmpty: boolean;
}

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

/** Placeholder shown in the editor so empty containers stay reachable. */
function EmptySlot({ label }: { label: string }) {
  return (
    <div
      data-empty-slot=""
      style={{
        border: "1px dashed rgba(43,84,212,0.45)",
        borderRadius: 4,
        padding: "18px 12px",
        textAlign: "center",
        font: "500 12px/1.4 ui-sans-serif, system-ui, sans-serif",
        color: "rgba(43,84,212,0.85)",
        background: "rgba(43,84,212,0.03)",
      }}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Root({ attrs, children, ctx, isEmpty }: BlockProps) {
  return (
    <div {...attrs}>
      {isEmpty && ctx.mode === "editor" ? <EmptySlot label="Drag a section here" /> : children}
    </div>
  );
}

export function Section({ attrs, children, ctx, isEmpty }: BlockProps) {
  return (
    <section {...attrs}>
      {isEmpty && ctx.mode === "editor" ? <EmptySlot label="Drop content here" /> : children}
    </section>
  );
}

export function Container({ attrs, children, ctx, isEmpty }: BlockProps) {
  return (
    <div {...attrs}>
      {isEmpty && ctx.mode === "editor" ? <EmptySlot label="Drop content here" /> : children}
    </div>
  );
}

export function Columns({ attrs, children, ctx, isEmpty }: BlockProps) {
  return (
    <div {...attrs}>
      {isEmpty && ctx.mode === "editor" ? <EmptySlot label="Drop columns here" /> : children}
    </div>
  );
}

export function Spacer({ attrs }: BlockProps) {
  return <div {...attrs} aria-hidden="true" />;
}

export function Divider({ attrs }: BlockProps) {
  return <hr {...attrs} />;
}

/**
 * Heading level is a prop, so the layer tree can warn about skipped levels and
 * the output keeps a real document outline instead of styled divs.
 */
export function Heading({ props, attrs }: BlockProps) {
  const level = str(props.level, "h2");
  const text = str(props.text, "Heading");
  const Tag = (["h1", "h2", "h3", "h4", "h5", "h6"].includes(level) ? level : "h2") as "h2";
  return <Tag {...attrs}>{text}</Tag>;
}

export function Text({ props, attrs }: BlockProps) {
  const text = str(props.text, "Text");
  // Rendered as React children, never dangerouslySetInnerHTML — this is the
  // XSS boundary for authored content. Newlines are preserved via white-space
  // in the default style rather than by injecting <br>.
  return <p {...attrs}>{text}</p>;
}

export function Button({ props, attrs, ctx }: BlockProps) {
  const label = str(props.label, "Button");
  const resolved = resolveLink(parseLink(props.link), ctx.links);

  // Without an href this is not a link, so it renders as a button element
  // rather than an anchor a keyboard user cannot reach.
  if (!resolved.href) {
    return (
      <button {...attrs} type="button">
        {label}
      </button>
    );
  }

  return (
    <a {...attrs} href={resolved.href} target={resolved.target} rel={resolved.rel}>
      {label}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Shared regions
// ---------------------------------------------------------------------------

/**
 * Site header. Lives in its own document, rendered above every page body, so
 * editing it once changes the whole site.
 */
export function Header({ attrs, children, ctx, isEmpty }: BlockProps) {
  return (
    <header {...attrs}>
      {isEmpty && ctx.mode === "editor" ? <EmptySlot label="Drop a logo or nav here" /> : children}
    </header>
  );
}

export function Footer({ attrs, children, ctx, isEmpty }: BlockProps) {
  return (
    <footer {...attrs}>
      {isEmpty && ctx.mode === "editor" ? <EmptySlot label="Drop footer content here" /> : children}
    </footer>
  );
}

/**
 * Navigation.
 *
 * Items come from props rather than children, so the whole menu is one
 * editable value in the inspector instead of a fiddly nest of nodes. Renders a
 * real <nav> with an accessible name, and marks the current page with
 * aria-current so it is announced, not just coloured.
 */
export function Nav({ props, attrs, ctx }: BlockProps) {
  const items = Array.isArray(props.items) ? (props.items as MenuItemProp[]) : [];

  if (items.length === 0) {
    return (
      <nav {...attrs} aria-label="Main">
        {ctx.mode === "editor" ? <EmptySlot label="Add menu items in the panel on the right" /> : null}
      </nav>
    );
  }

  return (
    <nav {...attrs} aria-label="Main">
      {items.map((item) => {
        const resolved = resolveLink(parseLink(item.link), ctx.links);
        const isCurrent = Boolean(
          resolved.href && ctx.currentPath && resolved.href === ctx.currentPath,
        );

        // A broken link renders as plain text rather than an anchor to nowhere.
        if (!resolved.href) {
          return (
            <span key={item.id} data-nav-item="">
              {item.label}
            </span>
          );
        }

        return (
          <a
            key={item.id}
            data-nav-item=""
            href={resolved.href}
            target={resolved.target}
            rel={resolved.rel}
            aria-current={isCurrent ? "page" : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

interface MenuItemProp {
  id: string;
  label: string;
  link: unknown;
}

/**
 * Site logo — an image when one is set, the site name as text otherwise.
 *
 * The text fallback matters: a brand-new site has no logo file, and a blank
 * space where the identity should be makes the header look broken.
 */
export function Logo({ props, attrs, ctx }: BlockProps) {
  const text = str(props.text, "Your site");
  const src = str(props.src);
  const alt = str(props.alt) || text;
  const resolved = resolveLink(parseLink(props.link), ctx.links);

  const content = src ? (
    // The image fills the node's own box rather than sizing itself.
    //
    // `width: auto` used to be hardcoded here, and because an inline style
    // outranks the compiled class, the node's width was inert: the anchor
    // resized and the picture inside it did not. `border-radius` had the same
    // problem from the other direction — it applied to the anchor, while the
    // square image sat on top of the rounded corners it was meant to have.
    //
    // `contain` rather than `fill`: a logo is the one image on a site that must
    // never be stretched. It does mean a width-only change re-boxes the image
    // without scaling it, since the aspect ratio is then held by the height.
    // eslint-disable-next-line @next/next/no-img-element -- see Image below
    <img
      src={src}
      alt={alt}
      style={{
        height: "100%",
        width: "100%",
        objectFit: "contain",
        display: "block",
        borderRadius: "inherit",
      }}
    />
  ) : (
    text
  );

  if (!resolved.href) {
    return (
      <span {...attrs} role="img" aria-label={src ? alt : undefined}>
        {content}
      </span>
    );
  }

  return (
    <a {...attrs} href={resolved.href} aria-label={src ? alt : undefined}>
      {content}
    </a>
  );
}

export function Image({ props, attrs }: BlockProps) {
  const src = str(props.src);
  const alt = str(props.alt);

  if (!src) {
    return (
      <div
        {...attrs}
        role="img"
        aria-label={alt || "Empty image"}
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: 140,
          background: "#eef1f5",
          color: "#7c8798",
          font: "500 12px/1.4 ui-sans-serif, system-ui, sans-serif",
        }}
      >
        No image selected
      </div>
    );
  }

  return (
    // Plain <img>, not next/image: customer images are arbitrary remote URLs,
    // and next/image requires a remotePatterns allowlist that cannot be
    // expressed for user-supplied content without opening an SSRF surface
    // (A10). Revisited in Phase 7, when uploads land on our own storage.
    // eslint-disable-next-line @next/next/no-img-element
    <img {...attrs} src={src} alt={alt} loading="lazy" decoding="async" />
  );
}
