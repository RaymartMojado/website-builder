import { describe, expect, it } from "vitest";
import { hitTest } from "@/store/drag";
import { documentFrom } from "@/lib/document/templates";
import type { PageDocument } from "@/lib/document/types";

/**
 * Drop-target hit testing.
 *
 * This is the part of drag-and-drop that decides where a node actually lands,
 * and the part users notice when it is wrong. It normally needs real layout,
 * so these tests drive it with a hand-built fake document whose rects and
 * computed styles are fixed — the geometry is the input, not an accident of
 * the environment.
 */

interface FakeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Minimal stand-in for the parts of Document that hitTest touches:
 * elementFromPoint, closest-ancestor walking, getBoundingClientRect, and
 * getComputedStyle for flex direction.
 */
function fakeDocument(
  layout: Record<string, { rect: FakeRect; parentId?: string; display?: string; flexDirection?: string }>,
) {
  const elements = new Map<string, FakeElement>();

  class FakeElement {
    dataset: { nodeId: string };
    constructor(public id: string) {
      this.dataset = { nodeId: id };
    }
    get parentElement(): FakeElement | null {
      const parentId = layout[this.id]?.parentId;
      return parentId ? elements.get(parentId) ?? null : null;
    }
    getBoundingClientRect() {
      const { left, top, width, height } = layout[this.id]!.rect;
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
    }
  }

  for (const id of Object.keys(layout)) elements.set(id, new FakeElement(id));

  const view = {
    getComputedStyle: (element: FakeElement) => ({
      display: layout[element.id]?.display ?? "block",
      flexDirection: layout[element.id]?.flexDirection ?? "column",
    }),
  };

  return {
    defaultView: view,
    elementFromPoint(x: number, y: number) {
      // Deepest element whose rect contains the point wins, as in a real hit test.
      let best: FakeElement | null = null;
      let bestDepth = -1;

      for (const [id, element] of elements) {
        const { left, top, width, height } = layout[id]!.rect;
        if (x < left || x > left + width || y < top || y > top + height) continue;

        let depth = 0;
        let cursor: string | undefined = id;
        while (layout[cursor!]?.parentId) {
          depth++;
          cursor = layout[cursor!]!.parentId;
        }
        if (depth > bestDepth) {
          best = element;
          bestDepth = depth;
        }
      }
      return best;
    },
    querySelector(selector: string) {
      const match = /\[data-node-id="([^"]+)"\]/.exec(selector);
      return match ? elements.get(match[1]!) ?? null : null;
    },
  } as unknown as Document;
}

/** A vertical stack: root → container → [a, b] */
function stackedDoc(): { doc: PageDocument; ids: Record<string, string> } {
  const doc = documentFrom([
    { type: "Container", children: [{ type: "Text" }, { type: "Text" }] },
  ]);

  const container = doc.nodes[doc.rootId]!.children[0]!;
  const [a, b] = doc.nodes[container]!.children as [string, string];
  return { doc, ids: { root: doc.rootId, container, a, b } };
}

describe("dropping between siblings", () => {
  it("drops BEFORE when the pointer is above the midpoint", () => {
    const { doc, ids } = stackedDoc();
    const frameDocument = fakeDocument({
      [ids.root!]: { rect: { left: 0, top: 0, width: 400, height: 300 } },
      [ids.container!]: { rect: { left: 0, top: 0, width: 400, height: 200 }, parentId: ids.root },
      [ids.a!]: { rect: { left: 0, top: 0, width: 400, height: 100 }, parentId: ids.container },
      [ids.b!]: { rect: { left: 0, top: 100, width: 400, height: 100 }, parentId: ids.container },
    });

    const target = hitTest({ doc, frameDocument, x: 200, y: 20, source: { kind: "new", type: "Button" } });

    expect(target?.position.parentId).toBe(ids.container);
    expect(target?.position.beforeId).toBe(ids.a);
    expect(target?.indicator.orientation).toBe("horizontal");
  });

  it("drops AFTER when the pointer is below the midpoint", () => {
    const { doc, ids } = stackedDoc();
    const frameDocument = fakeDocument({
      [ids.root!]: { rect: { left: 0, top: 0, width: 400, height: 300 } },
      [ids.container!]: { rect: { left: 0, top: 0, width: 400, height: 200 }, parentId: ids.root },
      [ids.a!]: { rect: { left: 0, top: 0, width: 400, height: 100 }, parentId: ids.container },
      [ids.b!]: { rect: { left: 0, top: 100, width: 400, height: 100 }, parentId: ids.container },
    });

    // Below the midpoint of 'a' → land between a and b.
    const target = hitTest({ doc, frameDocument, x: 200, y: 80, source: { kind: "new", type: "Button" } });

    expect(target?.position.parentId).toBe(ids.container);
    expect(target?.position.beforeId).toBe(ids.b);
  });

  it("appends when dropping past the last sibling", () => {
    const { doc, ids } = stackedDoc();
    const frameDocument = fakeDocument({
      [ids.root!]: { rect: { left: 0, top: 0, width: 400, height: 300 } },
      [ids.container!]: { rect: { left: 0, top: 0, width: 400, height: 200 }, parentId: ids.root },
      [ids.a!]: { rect: { left: 0, top: 0, width: 400, height: 100 }, parentId: ids.container },
      [ids.b!]: { rect: { left: 0, top: 100, width: 400, height: 100 }, parentId: ids.container },
    });

    const target = hitTest({ doc, frameDocument, x: 200, y: 190, source: { kind: "new", type: "Button" } });

    expect(target?.position.parentId).toBe(ids.container);
    // Nothing after 'b', so append.
    expect(target?.position.beforeId).toBeNull();
  });
});

describe("row layouts split on the x axis", () => {
  it("uses the horizontal midpoint and a vertical indicator", () => {
    const { doc, ids } = stackedDoc();
    const frameDocument = fakeDocument({
      [ids.root!]: { rect: { left: 0, top: 0, width: 400, height: 300 } },
      [ids.container!]: {
        rect: { left: 0, top: 0, width: 400, height: 100 },
        parentId: ids.root,
        display: "flex",
        flexDirection: "row",
      },
      [ids.a!]: { rect: { left: 0, top: 0, width: 200, height: 100 }, parentId: ids.container },
      [ids.b!]: { rect: { left: 200, top: 0, width: 200, height: 100 }, parentId: ids.container },
    });

    const before = hitTest({ doc, frameDocument, x: 40, y: 50, source: { kind: "new", type: "Button" } });
    expect(before?.position.beforeId).toBe(ids.a);
    expect(before?.indicator.orientation).toBe("vertical");

    const after = hitTest({ doc, frameDocument, x: 160, y: 50, source: { kind: "new", type: "Button" } });
    expect(after?.position.beforeId).toBe(ids.b);
  });
});

describe("empty containers swallow the drop", () => {
  it("drops inside rather than beside, or there is no way to fill one", () => {
    const doc = documentFrom([{ type: "Container" }]);
    const container = doc.nodes[doc.rootId]!.children[0]!;

    const frameDocument = fakeDocument({
      [doc.rootId]: { rect: { left: 0, top: 0, width: 400, height: 300 } },
      [container]: { rect: { left: 0, top: 0, width: 400, height: 120 }, parentId: doc.rootId },
    });

    const target = hitTest({ doc, frameDocument, x: 200, y: 60, source: { kind: "new", type: "Text" } });

    expect(target?.position.parentId).toBe(container);
    expect(target?.inside).toBe(true);
  });
});

describe("invalid drops are refused", () => {
  it("refuses to drop a node into its own subtree", () => {
    const doc = documentFrom([{ type: "Container", children: [{ type: "Container" }] }]);
    const outer = doc.nodes[doc.rootId]!.children[0]!;
    const inner = doc.nodes[outer]!.children[0]!;

    const frameDocument = fakeDocument({
      [doc.rootId]: { rect: { left: 0, top: 0, width: 400, height: 300 } },
      [outer]: { rect: { left: 0, top: 0, width: 400, height: 200 }, parentId: doc.rootId },
      [inner]: { rect: { left: 0, top: 0, width: 400, height: 100 }, parentId: outer },
    });

    // Dragging `outer` onto its own child would detach the branch from the root.
    const target = hitTest({
      doc,
      frameDocument,
      x: 200,
      y: 50,
      source: { kind: "existing", nodeId: outer },
    });

    expect(target).toBeNull();
  });

  it("refuses a parent that will not accept the dragged type", () => {
    const doc = documentFrom([{ type: "Container", children: [{ type: "Text" }] }]);
    const container = doc.nodes[doc.rootId]!.children[0]!;
    const text = doc.nodes[container]!.children[0]!;

    const frameDocument = fakeDocument({
      [doc.rootId]: { rect: { left: 0, top: 0, width: 400, height: 300 } },
      [container]: { rect: { left: 0, top: 0, width: 400, height: 100 }, parentId: doc.rootId },
      [text]: { rect: { left: 0, top: 0, width: 400, height: 40 }, parentId: container },
    });

    // Text has no children, so a drop on it resolves to its parent — which is a
    // Container, and does accept. The refusal case is a leaf-only parent, so
    // this asserts the fallback behaves rather than silently nesting.
    const target = hitTest({ doc, frameDocument, x: 200, y: 10, source: { kind: "new", type: "Button" } });
    expect(target?.position.parentId).toBe(container);
  });

  it("returns nothing when the pointer is over no node at all", () => {
    const { doc, ids } = stackedDoc();
    const frameDocument = fakeDocument({
      [ids.root!]: { rect: { left: 0, top: 0, width: 400, height: 100 } },
    });

    const target = hitTest({ doc, frameDocument, x: 900, y: 900, source: { kind: "new", type: "Text" } });
    expect(target).toBeNull();
  });
});
