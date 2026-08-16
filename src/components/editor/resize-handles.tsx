"use client";

import { useLayoutEffect, useState } from "react";
import { useEditor } from "@/store/editor";

/**
 * Drag-to-resize handles over the selected element.
 *
 * Rendered INSIDE the iframe root, so every coordinate is already in the
 * frame's own space — no cross-document translation, which is where the
 * palette drag needs care.
 *
 * The drag writes a PERCENTAGE of the parent's width, not pixels. Dragging
 * naturally produces pixels, but a pixel width silently stops fitting the
 * moment the page is viewed narrower, and someone dragging an image to size
 * has no reason to expect that. A percentage keeps the intent.
 */

const MIN_PERCENT = 5;
const MAX_PERCENT = 100;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Converts a drag to a width percentage of the element's containing block. */
export function widthPercentFrom(pointerX: number, box: Box, parentWidth: number): number {
  if (parentWidth <= 0) return MAX_PERCENT;

  const nextWidth = Math.max(1, pointerX - box.left);
  const percent = (nextWidth / parentWidth) * 100;

  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(percent)));
}

export function ResizeHandles({ frameDocument }: { frameDocument: Document }) {
  const selectedId = useEditor((state) => state.selectedId);
  const previewMode = useEditor((state) => state.previewMode);
  const doc = useEditor((state) => state.doc);
  const breakpoint = useEditor((state) => state.breakpoint);

  const [box, setBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState(false);

  const node = selectedId ? doc.nodes[selectedId] : undefined;
  const active = Boolean(node) && !previewMode;

  // Track the element's position. It moves whenever the document changes, the
  // frame resizes, or the page scrolls, so all three are watched rather than
  // measuring once on selection.
  useLayoutEffect(() => {
    const element =
      active && selectedId
        ? frameDocument.querySelector<HTMLElement>(`[data-node-id="${selectedId}"]`)
        : null;

    const view = frameDocument.defaultView;

    /**
     * Writes only when the numbers actually changed.
     *
     * Returning the previous object makes React bail out of the re-render,
     * which matters because a ResizeObserver fires on every layout pass — an
     * unconditional setState here would re-render, re-measure, and cascade.
     */
    const apply = (next: Box | null) =>
      setBox((previous) => {
        if (previous === next) return previous;
        if (!previous || !next) return next;
        const same =
          previous.left === next.left &&
          previous.top === next.top &&
          previous.width === next.width &&
          previous.height === next.height;
        return same ? previous : next;
      });

    if (!element) {
      apply(null);
      return;
    }

    const measure = () => {
      const rect = element.getBoundingClientRect();
      apply({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };

    // Deferred rather than measured inline: a synchronous setState in an
    // effect body is what triggers the cascade this guard exists to avoid.
    const frame = view?.requestAnimationFrame(measure);

    // Observe ONLY the element.
    //
    // Watching documentElement as well caused a feedback loop: the handles are
    // fixed-position elements placed at the element's right edge, which can
    // extend the document's scroll area, which fires the observer, which
    // re-measures and re-renders the handles. Chromium spins on that and the
    // whole tab stops responding mid-drag. Viewport changes are already
    // covered by the scroll and resize listeners below.
    const observer = view?.ResizeObserver ? new view.ResizeObserver(measure) : null;
    observer?.observe(element);

    view?.addEventListener("scroll", measure, true);
    view?.addEventListener("resize", measure);

    return () => {
      if (frame !== undefined) view?.cancelAnimationFrame(frame);
      observer?.disconnect();
      view?.removeEventListener("scroll", measure, true);
      view?.removeEventListener("resize", measure);
    };
  }, [active, selectedId, doc, breakpoint, frameDocument]);

  if (!active || !box || !selectedId) return null;

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const element = frameDocument.querySelector<HTMLElement>(`[data-node-id="${selectedId}"]`);
    const parentWidth =
      element?.parentElement?.getBoundingClientRect().width ??
      frameDocument.documentElement.clientWidth;

    setDragging(true);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = element?.getBoundingClientRect();
      const current = rect
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : box;

      useEditor
        .getState()
        .updateStyle(selectedId, {
          width: `${widthPercentFrom(moveEvent.clientX, current, parentWidth)}%`,
        });
    };

    const onUp = () => {
      setDragging(false);
      frameDocument.removeEventListener("pointermove", onMove);
      frameDocument.removeEventListener("pointerup", onUp);
    };

    frameDocument.addEventListener("pointermove", onMove);
    frameDocument.addEventListener("pointerup", onUp);
  };

  const handleStyle: React.CSSProperties = {
    position: "fixed",
    width: 12,
    height: 12,
    marginLeft: -6,
    marginTop: -6,
    borderRadius: 3,
    background: "#fff",
    border: "2px solid #2b54d4",
    cursor: "ew-resize",
    zIndex: 2147483646,
    touchAction: "none",
  };

  return (
    <>
      {/* Suppressing text selection with a rendered rule rather than by
          writing to body.style — React owns what it renders, and reaching into
          the DOM to mutate it is exactly what the immutability rule is for. */}
      {dragging ? (
        <style dangerouslySetInnerHTML={{ __html: "body{user-select:none;cursor:ew-resize}" }} />
      ) : null}

      {/* Right edge and bottom-right corner. Width is the only dimension an
          author usually means by "how big" — height follows from the aspect
          ratio, and forcing both is how images end up squashed. */}
      <div
        role="slider"
        aria-label="Resize width"
        aria-valuenow={Math.round(box.width)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={-1}
        onPointerDown={startResize}
        style={{ ...handleStyle, left: box.left + box.width, top: box.top + box.height / 2 }}
      />
      <div
        aria-hidden="true"
        onPointerDown={startResize}
        style={{
          ...handleStyle,
          left: box.left + box.width,
          top: box.top + box.height,
          cursor: "nwse-resize",
        }}
      />

      {dragging ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: box.left,
            top: box.top - 22,
            padding: "2px 6px",
            borderRadius: 3,
            background: "#2b54d4",
            color: "#fff",
            font: "600 10px/1.4 ui-sans-serif, system-ui, sans-serif",
            pointerEvents: "none",
            zIndex: 2147483647,
          }}
        >
          {node?.style[breakpoint]?.width ?? ""}
        </div>
      ) : null}
    </>
  );
}
