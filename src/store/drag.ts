"use client";

import { create } from "zustand";
import type { NodeId, PageDocument } from "@/lib/document/types";
import { isDescendant } from "@/lib/document/types";
import { canAcceptChild, getDef } from "@/components/registry";
import type { InsertPosition } from "@/lib/document/operations";

/**
 * Drag state and hit-testing.
 *
 * Built on raw pointer events rather than dnd-kit, deliberately.
 *
 * The canvas is an iframe, and a drag starts in the parent document (the
 * palette) but has to be hit-tested against elements inside the iframe.
 * Library drag systems assume one document: their collision detection reads
 * bounding rects in a single coordinate space, so every drop target would need
 * an offset shim, and the DragOverlay would render in the wrong document.
 *
 * Since the hit-testing has to be custom anyway, the library adds a coordinate
 * translation layer without removing any work. Pointer events give exact
 * control over both cases and one code path for palette→canvas and
 * canvas→canvas.
 *
 * The accessibility dnd-kit would have provided is supplied separately, by the
 * layer tree's keyboard move commands (WCAG 2.5.7).
 */

export type DragSource =
  | { kind: "new"; type: string }
  | { kind: "existing"; nodeId: NodeId };

export interface DropTarget {
  position: InsertPosition;
  /** Where to paint the indicator. Coordinates are iframe-local. */
  indicator: { x: number; y: number; width: number; height: number; orientation: "horizontal" | "vertical" };
  /** True when dropping inside an empty container rather than between siblings. */
  inside: boolean;
}

interface DragState {
  source: DragSource | null;
  target: DropTarget | null;
  /** Pointer position in parent-document coordinates, for the drag ghost. */
  pointer: { x: number; y: number } | null;

  begin: (source: DragSource, pointer: { x: number; y: number }) => void;
  update: (target: DropTarget | null, pointer: { x: number; y: number }) => void;
  end: () => void;
}

export const useDrag = create<DragState>((set) => ({
  source: null,
  target: null,
  pointer: null,

  begin: (source, pointer) => set({ source, target: null, pointer }),
  update: (target, pointer) => set({ target, pointer }),
  end: () => set({ source: null, target: null, pointer: null }),
}));

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

/**
 * Reads a node id off an element without `instanceof HTMLElement`.
 *
 * The canvas is an iframe, so its elements come from a different realm with
 * its own HTMLElement constructor — `element instanceof HTMLElement` evaluated
 * in the parent window is FALSE for every element inside the frame. That would
 * make hit-testing find nothing at all, silently, in the browser only.
 *
 * Duck-typing on `dataset` is realm-agnostic and is the correct check here.
 */
export function nodeIdOf(value: unknown): string | null {
  const candidate = value as { dataset?: DOMStringMap } | null;
  const id = candidate?.dataset?.nodeId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

type NodeElement = Element & { dataset: DOMStringMap };

function nearestNodeElement(element: Element | null): NodeElement | null {
  let current: Element | null = element;
  while (current) {
    if (nodeIdOf(current)) return current as NodeElement;
    current = current.parentElement;
  }
  return null;
}

/**
 * Whether a container is laid out along the x axis, which decides both the
 * indicator's orientation and which coordinate splits "before" from "after".
 */
function isHorizontal(element: HTMLElement, view: Window): boolean {
  const style = view.getComputedStyle(element);
  if (style.display === "flex" || style.display === "inline-flex") {
    return style.flexDirection.startsWith("row");
  }
  return false;
}

export interface HitTestInput {
  doc: PageDocument;
  frameDocument: Document;
  /** Point in iframe-local coordinates. */
  x: number;
  y: number;
  source: DragSource;
}

export function hitTest({ doc, frameDocument, x, y, source }: HitTestInput): DropTarget | null {
  const view = frameDocument.defaultView;
  if (!view) return null;

  const element = nearestNodeElement(frameDocument.elementFromPoint(x, y));
  if (!element) return null;

  const nodeId = element.dataset.nodeId!;
  const node = doc.nodes[nodeId];
  if (!node) return null;

  const draggedId = source.kind === "existing" ? source.nodeId : null;
  const draggedType = source.kind === "new" ? source.type : doc.nodes[draggedId!]?.type;
  if (!draggedType) return null;

  // Dropping a node inside itself would detach the branch from the root.
  if (draggedId && (draggedId === nodeId || isDescendant(doc, draggedId, nodeId))) return null;

  const def = getDef(node.type);
  const rect = element.getBoundingClientRect();

  // An empty container that accepts this type swallows the drop whole —
  // otherwise there is no way to get the first child into it.
  if (def?.acceptsChildren && node.children.length === 0 && canAcceptChild(node.type, draggedType)) {
    return {
      position: { parentId: nodeId },
      indicator: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        orientation: "horizontal",
      },
      inside: true,
    };
  }

  // Otherwise drop as a sibling of the hovered node.
  const parentId = node.parent;
  if (!parentId) {
    // The root itself: append inside when it will take the type.
    if (def?.acceptsChildren && canAcceptChild(node.type, draggedType)) {
      return {
        position: { parentId: nodeId },
        indicator: { x: rect.left, y: rect.bottom - 2, width: rect.width, height: 3, orientation: "horizontal" },
        inside: false,
      };
    }
    return null;
  }

  const parent = doc.nodes[parentId];
  if (!parent || !canAcceptChild(parent.type, draggedType)) return null;

  const parentElement = frameDocument.querySelector<HTMLElement>(`[data-node-id="${parentId}"]`);
  const horizontal = parentElement ? isHorizontal(parentElement, view) : false;

  const after = horizontal ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2;
  const siblings = parent.children;
  const index = siblings.indexOf(nodeId);
  const beforeId = after ? (siblings[index + 1] ?? null) : nodeId;

  return {
    position: { parentId, beforeId },
    indicator: horizontal
      ? {
          x: after ? rect.right - 1 : rect.left - 1,
          y: rect.top,
          width: 3,
          height: rect.height,
          orientation: "vertical",
        }
      : {
          x: rect.left,
          y: after ? rect.bottom - 1 : rect.top - 1,
          width: rect.width,
          height: 3,
          orientation: "horizontal",
        },
    inside: false,
  };
}
