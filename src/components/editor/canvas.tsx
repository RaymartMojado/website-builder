"use client";

import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BREAKPOINTS, DEFAULT_THEME, type PageDocument, type Theme } from "@/lib/document/types";
import { BASE_CSS, compileStyles } from "@/lib/styles/compile";
import type { LinkContext } from "@/lib/links/types";
import { RenderNode } from "@/components/renderer/RenderNode";
import { useEditor } from "@/store/editor";
import { hitTest, nodeIdOf, useDrag } from "@/store/drag";
import { setCanvasFrame } from "./frame";
import { ResizeHandles } from "./resize-handles";

/**
 * The canvas is an iframe, and this is why.
 *
 * The user's CSS cannot leak into the editor chrome or vice versa; media
 * queries respond to the IFRAME's width, so responsive preview is real rather
 * than simulated at a scaled-down size; and what renders here is what
 * publishes, because both go through the same RenderNode and the same
 * compileStyles.
 *
 * Content is mounted with its own React root inside the iframe rather than a
 * portal. React delegates events at the root container, and events raised
 * inside an iframe document never bubble to the parent document — a portal
 * would render correctly and then ignore every click. A separate root puts the
 * listeners on the iframe's own document. Both roots share the module-level
 * Zustand store, so state stays single-sourced.
 */

const RESET_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
body{min-height:100vh;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
/* Native drag on an image hijacks the reorder gesture — see the dragstart
   handler. Belt and braces, because the attribute is easy to lose. */
img,a{-webkit-user-drag:none;user-drag:none}
[data-node-id]{transition:outline-color .12s}
`;

/** Editor affordances live in CSS rather than overlay elements. */
function chromeCss(selectedId: string | null, hoveredId: string | null, preview: boolean): string {
  if (preview) return "";

  const rules: string[] = [
    `[data-node-id]{cursor:default}`,
    // Layout containers keep a faint outline so an empty page is not invisible.
    `[data-node-type="Section"],[data-node-type="Container"],[data-node-type="Columns"]{outline:1px dashed rgba(43,84,212,.10);outline-offset:-1px}`,
    // A region that is not the current edit target stays fully visible and
    // fully legible — seeing the real header while laying out a page is the
    // entire point of composing it here. It reads as out-of-scope through a
    // hover tint and a small corner tab, never an overlay: an earlier version
    // covered the header with a centred label, which hid the nav completely
    // and made it look like the component was broken.
    `[data-region][data-inactive]{position:relative;cursor:pointer}`,
    `[data-region][data-inactive]:hover{background:rgba(43,84,212,.04);box-shadow:inset 0 0 0 1px rgba(43,84,212,.35)}`,
    `[data-region][data-inactive]::after{content:attr(data-region-label);position:absolute;top:0;left:0;padding:2px 6px;font:600 9.5px/1.4 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:rgba(43,84,212,.75);border-radius:0 0 3px 0;pointer-events:none;opacity:0;transition:opacity .12s;z-index:10}`,
    `[data-region][data-inactive]:hover::after{opacity:1}`,
    // Nothing inside an inactive region is individually selectable — a click
    // anywhere in it switches to editing that region instead.
    `[data-region][data-inactive] *{pointer-events:none}`,
  ];

  if (hoveredId && hoveredId !== selectedId) {
    rules.push(`[data-node-id="${hoveredId}"]{outline:1.5px solid rgba(43,84,212,.45)!important;outline-offset:-1.5px}`);
  }
  if (selectedId) {
    rules.push(`[data-node-id="${selectedId}"]{outline:2px solid #2b54d4!important;outline-offset:-2px}`);
  }

  return rules.join("");
}

/**
 * Rendered inside the iframe root. Subscribes to the store directly.
 *
 * Composes header + page + footer exactly as the published renderer does, so
 * the header you are looking at is the header visitors get — not a mock-up of
 * one. Only the active target is interactive.
 */
function CanvasContent({
  theme,
  links,
  frameDocument,
}: {
  theme: Theme;
  links: LinkContext;
  frameDocument: Document;
}) {
  const documents = useEditor((state) => state.documents);
  const editTarget = useEditor((state) => state.target);
  const selectedId = useEditor((state) => state.selectedId);
  const hoveredId = useEditor((state) => state.hoveredId);
  const previewMode = useEditor((state) => state.previewMode);
  const dropTarget = useDrag((state) => state.target);

  const { page, header, footer } = documents;
  if (!page?.nodes[page.rootId]) return null;

  const present = [page, header, footer].filter((doc): doc is PageDocument => doc !== null);
  const css = compileStyles(present, { includeTheme: true, theme });
  const ctx = { links, mode: previewMode ? ("published" as const) : ("editor" as const) };

  const region = (kind: "header" | "page" | "footer", doc: PageDocument | null, label: string) => {
    if (!doc?.nodes[doc.rootId]) return null;
    const inactive = !previewMode && editTarget !== kind;

    return (
      <div
        data-region={kind}
        data-region-label={inactive ? `Click to edit ${label}` : undefined}
        data-inactive={inactive ? "" : undefined}
      >
        <RenderNode doc={doc} nodeId={doc.rootId} ctx={ctx} />
      </div>
    );
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RESET_CSS + BASE_CSS + css }} />
      <style dangerouslySetInnerHTML={{ __html: chromeCss(selectedId, hoveredId, previewMode) }} />

      {region("header", header, "Header")}
      {region("page", page, "Page")}
      {region("footer", footer, "Footer")}

      {/* Handles live in the frame so their coordinates need no translation. */}
      {previewMode ? null : <ResizeHandles frameDocument={frameDocument} />}

      {dropTarget ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: dropTarget.indicator.x,
            top: dropTarget.indicator.y,
            width: dropTarget.indicator.width,
            height: dropTarget.indicator.height,
            background: dropTarget.inside ? "rgba(43,84,212,.12)" : "#2b54d4",
            border: dropTarget.inside ? "2px solid #2b54d4" : "none",
            borderRadius: dropTarget.inside ? 4 : 2,
            pointerEvents: "none",
            zIndex: 2147483647,
          }}
        />
      ) : null}
    </>
  );
}

export function Canvas({
  theme = DEFAULT_THEME,
  links,
}: {
  theme?: Theme;
  /**
   * Real page paths, so nav links render their true hrefs in the canvas. The
   * click handler swallows navigation, so an accurate href is informative
   * rather than a way to lose your place.
   */
  links: LinkContext;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<Root | null>(null);
  /** The exact element the root was created on, so it is never rooted twice. */
  const rootContainerRef = useRef<HTMLElement | null>(null);
  /** A teardown waiting on a timer, cancellable if the effect re-runs first. */
  const teardownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);

  const breakpoint = useEditor((state) => state.breakpoint);
  const previewMode = useEditor((state) => state.previewMode);
  const width = BREAKPOINTS.find((entry) => entry.key === breakpoint)?.width ?? 1280;

  /**
   * Mount the inner React root once, and survive a StrictMode remount.
   *
   * The two constraints here pull against each other:
   *
   *   - The unmount must be DEFERRED, because effect cleanup runs inside
   *     React's commit phase and unmounting a root from there warns about a
   *     race condition.
   *   - StrictMode runs cleanup and then immediately re-runs the effect in the
   *     same tick, so the deferred unmount has not happened yet — and calling
   *     createRoot again on the same <body> is an error.
   *
   * The resolution is to make the teardown cancellable: if the effect re-runs
   * before the timer fires, cancel it and reuse the existing root.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const mount = () => {
      const body = frame.contentDocument?.body;
      if (!body) return;

      // A remount arrived before the deferred teardown ran — keep the root.
      if (teardownRef.current) {
        clearTimeout(teardownRef.current);
        teardownRef.current = null;
      }

      if (rootRef.current) {
        // Same container: re-render rather than re-root.
        if (rootContainerRef.current === body) {
          rootRef.current.render(
            <CanvasContent theme={theme} links={links} frameDocument={frame.contentDocument!} />,
          );
          setReady(true);
        }
        return;
      }

      // Render into the about:blank document as-is rather than document.write.
      // Writing replaces <body>, so the element React recorded as its container
      // gets swapped out from under it.
      const root = createRoot(body);
      rootRef.current = root;
      rootContainerRef.current = body;
      root.render(<CanvasContent theme={theme} links={links} frameDocument={frame.contentDocument!} />);
      setReady(true);
    };

    // about:blank may already be loaded, in which case onLoad never fires.
    if (frame.contentDocument?.readyState === "complete") mount();
    frame.addEventListener("load", mount);

    setCanvasFrame(frame);

    return () => {
      frame.removeEventListener("load", mount);
      setCanvasFrame(null);

      const pending = rootRef.current;
      if (!pending) return;

      teardownRef.current = setTimeout(() => {
        teardownRef.current = null;
        rootRef.current = null;
        rootContainerRef.current = null;
        try {
          pending.unmount();
        } catch {
          /* frame already torn down */
        }
      }, 0);
    };
    // theme and links are captured at mount; CanvasContent reads live state
    // from the store, so it does not need them to change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selection, hover and pointer-driven drag, wired to the iframe's document.
  useEffect(() => {
    if (!ready) return;
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameDocument) return;

    // nodeIdOf duck-types rather than using `instanceof HTMLElement`: these
    // elements belong to the iframe's realm, where the parent window's
    // HTMLElement constructor does not match. See store/drag.ts.
    const nodeIdAt = (event: Event): string | null => {
      const path = event.composedPath?.() ?? [];
      for (const entry of path) {
        const id = nodeIdOf(entry);
        if (id) return id;
      }
      return null;
    };

    /** Which composed region an event happened in, if any. */
    const regionAt = (event: Event): string | null => {
      const path = event.composedPath?.() ?? [];
      for (const entry of path) {
        const region = (entry as { dataset?: DOMStringMap })?.dataset?.region;
        if (typeof region === "string" && region) return region;
      }
      return null;
    };

    const onClick = (event: MouseEvent) => {
      const state = useEditor.getState();
      if (state.previewMode) return;

      // Anchors would navigate the canvas away from the document being edited.
      event.preventDefault();
      event.stopPropagation();

      // Clicking a region you are not editing switches to it, rather than
      // doing nothing. Requiring a trip to the toolbar to act on the thing
      // you just clicked is exactly the kind of dead end that reads as a bug.
      const region = regionAt(event);
      if (region && region !== state.target) {
        state.setTarget(region as "page" | "header" | "footer");
        return;
      }

      state.select(nodeIdAt(event));
    };

    const onOver = (event: MouseEvent) => {
      if (useEditor.getState().previewMode) return;
      useEditor.getState().hover(nodeIdAt(event));
    };

    const onLeave = () => useEditor.getState().hover(null);

    const onPointerDown = (event: PointerEvent) => {
      if (useEditor.getState().previewMode || event.button !== 0) return;

      const nodeId = nodeIdAt(event);
      const { doc } = useEditor.getState();
      if (!nodeId || nodeId === doc.rootId) return;

      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;

      const onMove = (moveEvent: PointerEvent) => {
        const travelled = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        // A few pixels of slop, so a click is never mistaken for a drag.
        if (!dragging && travelled < 4) return;

        if (!dragging) {
          dragging = true;
          useEditor.getState().select(nodeId);
          const frameRect = frameRef.current!.getBoundingClientRect();
          useDrag.getState().begin(
            { kind: "existing", nodeId },
            { x: moveEvent.clientX + frameRect.left, y: moveEvent.clientY + frameRect.top },
          );
        }

        const source = useDrag.getState().source;
        if (!source) return;

        const frameRect = frameRef.current!.getBoundingClientRect();
        const target = hitTest({
          doc: useEditor.getState().doc,
          frameDocument,
          x: moveEvent.clientX,
          y: moveEvent.clientY,
          source,
        });
        useDrag.getState().update(target, {
          x: moveEvent.clientX + frameRect.left,
          y: moveEvent.clientY + frameRect.top,
        });
      };

      const onUp = () => {
        frameDocument.removeEventListener("pointermove", onMove);
        frameDocument.removeEventListener("pointerup", onUp);

        const { source, target } = useDrag.getState();
        if (dragging && source?.kind === "existing" && target) {
          useEditor.getState().move(source.nodeId, target.position);
        }
        useDrag.getState().end();
      };

      frameDocument.addEventListener("pointermove", onMove);
      frameDocument.addEventListener("pointerup", onUp);
    };

    /**
     * Block the browser's own drag-and-drop inside the canvas.
     *
     * Images and links are natively draggable, so dragging one to reorder it
     * starts a native drag instead. Chromium then enters a nested event loop
     * and stops delivering pointermove, which freezes the custom drag after a
     * single move and reads as the editor hanging.
     */
    const onDragStart = (event: Event) => event.preventDefault();

    frameDocument.addEventListener("click", onClick, true);
    frameDocument.addEventListener("mouseover", onOver);
    frameDocument.addEventListener("mouseleave", onLeave);
    frameDocument.addEventListener("pointerdown", onPointerDown);
    frameDocument.addEventListener("dragstart", onDragStart);

    return () => {
      frameDocument.removeEventListener("click", onClick, true);
      frameDocument.removeEventListener("mouseover", onOver);
      frameDocument.removeEventListener("mouseleave", onLeave);
      frameDocument.removeEventListener("pointerdown", onPointerDown);
      frameDocument.removeEventListener("dragstart", onDragStart);
    };
  }, [ready]);

  return (
    /*
     * Block layout with `mx-auto`, NOT a centred flex container.
     *
     * Two things were wrong with flex + justify-center + max-width:100%:
     *
     *   - max-width:100% clamped the frame to whatever the column happened to
     *     be, so picking Desktop did not actually preview at 1280px and the
     *     media queries evaluated at the wrong width. The switcher lied.
     *   - When a flex item is wider than a centred container, it overflows on
     *     BOTH sides, and the left overflow cannot be scrolled to. The view
     *     lands past the start of the page, which looks like the content
     *     vanished.
     *
     * A block-level wrapper with auto margins centres while it fits and falls
     * back to a normal left-aligned overflow that scrolls properly when it
     * does not.
     */
    <div className="flex-1 overflow-auto bg-neutral-200/70 p-6">
      <div
        className="mx-auto h-full transition-[width] duration-200"
        style={{ width }}
      >
        <iframe
          ref={frameRef}
          title="Page canvas"
          className="block h-full w-full border-0 bg-white shadow-lg"
          style={{ minHeight: 600 }}
          // Same-origin so the parent can reach contentDocument; scripts stay
          // off because nothing inside the canvas needs to execute.
          sandbox="allow-same-origin"
          data-preview={previewMode ? "" : undefined}
        />
      </div>
    </div>
  );
}
