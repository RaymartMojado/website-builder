import { beforeEach, describe, expect, it } from "vitest";
import { useEditor } from "@/store/editor";
import { checkIntegrity } from "@/lib/document/operations";
import { documentFrom } from "@/lib/document/templates";
import type { PageDocument } from "@/lib/document/types";

/**
 * Undo/redo.
 *
 * Patch-based history shipped in the first editor commit rather than later,
 * because retrofitting it means auditing every mutation written in between and
 * missing one silently corrupts documents. These tests are what keep it honest.
 */

function fresh(header: PageDocument | null = null) {
  const doc = documentFrom([
    { type: "Section", children: [{ type: "Container", children: [{ type: "Heading" }] }] },
  ]);
  useEditor.getState().reset({
    page: doc,
    header,
    footer: null,
    pageId: "page-1",
    siteId: "site-1",
    pageCount: 3,
  });
  return useEditor.getState().doc;
}

const ids = () => {
  const { doc } = useEditor.getState();
  const section = doc.nodes[doc.rootId]!.children[0]!;
  const container = doc.nodes[section]!.children[0]!;
  const heading = doc.nodes[container]!.children[0]!;
  return { section, container, heading };
};

beforeEach(() => {
  fresh();
});

describe("history", () => {
  it("starts empty and cannot undo", () => {
    expect(useEditor.getState().past).toHaveLength(0);
    useEditor.getState().undo();
    expect(useEditor.getState().past).toHaveLength(0);
  });

  it("undoes an insert and redoes it", () => {
    const before = Object.keys(useEditor.getState().doc.nodes).length;

    const id = useEditor.getState().insert("Text", { parentId: ids().container });
    expect(id).toBeTruthy();
    expect(Object.keys(useEditor.getState().doc.nodes)).toHaveLength(before + 1);

    useEditor.getState().undo();
    expect(Object.keys(useEditor.getState().doc.nodes)).toHaveLength(before);

    useEditor.getState().redo();
    expect(Object.keys(useEditor.getState().doc.nodes)).toHaveLength(before + 1);
  });

  it("undoes a delete, restoring the whole subtree", () => {
    const { container } = ids();
    const before = Object.keys(useEditor.getState().doc.nodes).length;

    useEditor.getState().remove(container);
    expect(Object.keys(useEditor.getState().doc.nodes)).toHaveLength(before - 2);

    useEditor.getState().undo();
    const restored = useEditor.getState().doc;
    expect(Object.keys(restored.nodes)).toHaveLength(before);
    expect(checkIntegrity(restored)).toEqual([]);
  });

  it("undoes a move back to the exact original position", () => {
    const { section, container } = ids();
    useEditor.getState().insert("Text", { parentId: container });
    useEditor.getState().insert("Text", { parentId: container });

    const original = [...useEditor.getState().doc.nodes[container]!.children];

    useEditor.getState().move(original[0]!, { parentId: section });
    expect(useEditor.getState().doc.nodes[container]!.children).not.toEqual(original);

    useEditor.getState().undo();
    expect(useEditor.getState().doc.nodes[container]!.children).toEqual(original);
    expect(checkIntegrity(useEditor.getState().doc)).toEqual([]);
  });

  it("a new edit clears the redo branch", () => {
    const { container } = ids();
    useEditor.getState().insert("Text", { parentId: container });
    useEditor.getState().undo();
    expect(useEditor.getState().future).toHaveLength(1);

    useEditor.getState().insert("Button", { parentId: container });
    // Redoing into an abandoned branch would resurrect work the user replaced.
    expect(useEditor.getState().future).toHaveLength(0);
  });

  it("keeps the document valid across a long undo/redo run", () => {
    const { container } = ids();

    for (let i = 0; i < 12; i++) useEditor.getState().insert("Text", { parentId: container });
    for (let i = 0; i < 12; i++) useEditor.getState().undo();
    for (let i = 0; i < 12; i++) useEditor.getState().redo();
    for (let i = 0; i < 6; i++) useEditor.getState().undo();

    expect(checkIntegrity(useEditor.getState().doc)).toEqual([]);
  });
});

describe("coalescing", () => {
  it("merges a burst of typing into one undo step", () => {
    const { heading } = ids();

    // Typing "Hello" must undo as a word, not five keystrokes.
    for (const text of ["H", "He", "Hel", "Hell", "Hello"]) {
      useEditor.getState().updateProps(heading, { text });
    }

    expect(useEditor.getState().past).toHaveLength(1);

    useEditor.getState().undo();
    // Back to the value before the burst started, not one character back.
    expect(useEditor.getState().doc.nodes[heading]!.props.text).not.toBe("Hell");
  });

  it("does not merge edits to different props", () => {
    const { heading } = ids();
    useEditor.getState().updateProps(heading, { text: "Title" });
    useEditor.getState().updateProps(heading, { level: "h1" });
    expect(useEditor.getState().past).toHaveLength(2);
  });

  it("does not merge edits to different nodes", () => {
    const { heading, container } = ids();
    useEditor.getState().updateProps(heading, { text: "A" });
    useEditor.getState().updateProps(container, { text: "B" });
    expect(useEditor.getState().past).toHaveLength(2);
  });

  it("records no history when nothing actually changed", () => {
    const { heading } = ids();
    useEditor.getState().updateProps(heading, { text: "Same" });
    const depth = useEditor.getState().past.length;

    useEditor.getState().updateProps(heading, { text: "Same" });
    expect(useEditor.getState().past).toHaveLength(depth);
  });
});

describe("selection", () => {
  it("selects the parent after deleting, so the inspector keeps its place", () => {
    const { container, heading } = ids();
    useEditor.getState().select(heading);
    useEditor.getState().remove(heading);
    expect(useEditor.getState().selectedId).toBe(container);
  });

  it("selects the duplicate, not the original", () => {
    const { heading } = ids();
    useEditor.getState().duplicate(heading);
    expect(useEditor.getState().selectedId).not.toBe(heading);
    expect(useEditor.getState().selectedId).toBeTruthy();
  });

  it("walks up one level with selectParent", () => {
    const { container, heading } = ids();
    useEditor.getState().select(heading);
    useEditor.getState().selectParent();
    expect(useEditor.getState().selectedId).toBe(container);
  });
});

describe("style writes", () => {
  it("writes to the active breakpoint only", () => {
    const { heading } = ids();

    useEditor.getState().setBreakpoint("md");
    useEditor.getState().updateStyle(heading, { fontSize: "40px" });

    const node = useEditor.getState().doc.nodes[heading]!;
    expect(node.style.md?.fontSize).toBe("40px");
    expect(node.style.base.fontSize).not.toBe("40px");
  });

  it("marks the document dirty so autosave fires", () => {
    const { heading } = ids();
    expect(useEditor.getState().saveState).toBe("idle");
    useEditor.getState().updateProps(heading, { text: "changed" });
    expect(useEditor.getState().saveState).toBe("dirty");
  });
});

describe("shared regions", () => {
  const headerDoc = () =>
    documentFrom([
      { type: "Header", children: [{ type: "Logo" }, { type: "Nav" }] },
    ]);

  it("starts on the page, with the header available alongside it", () => {
    fresh(headerDoc());
    expect(useEditor.getState().target).toBe("page");
    expect(useEditor.getState().documents.header).not.toBeNull();
  });

  it("switching target swaps the active document", () => {
    fresh(headerDoc());
    const pageDoc = useEditor.getState().doc;

    useEditor.getState().setTarget("header");
    expect(useEditor.getState().target).toBe("header");
    expect(useEditor.getState().doc).not.toBe(pageDoc);
    expect(useEditor.getState().doc).toBe(useEditor.getState().documents.header);
  });

  it("will not switch to a region the site does not have", () => {
    fresh(null);
    useEditor.getState().setTarget("header");
    // No header document, so the target must not move — otherwise the canvas
    // would try to edit null.
    expect(useEditor.getState().target).toBe("page");
  });

  it("keeps history per target, so undo cannot cross regions", () => {
    fresh(headerDoc());

    const container = (() => {
      const { doc } = useEditor.getState();
      const section = doc.nodes[doc.rootId]!.children[0]!;
      return doc.nodes[section]!.children[0]!;
    })();

    useEditor.getState().insert("Text", { parentId: container });
    const pageNodeCount = Object.keys(useEditor.getState().doc.nodes).length;

    useEditor.getState().setTarget("header");
    // Fresh history in the header — undo here must do nothing at all.
    expect(useEditor.getState().past).toHaveLength(0);
    useEditor.getState().undo();

    useEditor.getState().setTarget("page");
    // The page edit survived an undo pressed while the header was active.
    expect(Object.keys(useEditor.getState().doc.nodes)).toHaveLength(pageNodeCount);
    expect(useEditor.getState().past).toHaveLength(1);
  });

  it("restores each target's own history when switching back", () => {
    fresh(headerDoc());

    const headerRoot = useEditor.getState().documents.header!.rootId;
    useEditor.getState().setTarget("header");
    useEditor.getState().insert("Logo", { parentId: headerRoot });
    expect(useEditor.getState().past).toHaveLength(1);

    useEditor.getState().setTarget("page");
    expect(useEditor.getState().past).toHaveLength(0);

    useEditor.getState().setTarget("header");
    expect(useEditor.getState().past).toHaveLength(1);
  });

  it("tracks which targets are dirty so autosave sends only those", () => {
    fresh(headerDoc());
    expect(useEditor.getState().dirtyTargets.size).toBe(0);

    const headerRoot = useEditor.getState().documents.header!.rootId;
    useEditor.getState().setTarget("header");
    useEditor.getState().insert("Logo", { parentId: headerRoot });

    expect([...useEditor.getState().dirtyTargets]).toEqual(["header"]);

    useEditor.getState().markSaved(["header"]);
    expect(useEditor.getState().dirtyTargets.size).toBe(0);
  });

  it("keeps a target dirty when a save covered only the other one", () => {
    fresh(headerDoc());

    const { doc } = useEditor.getState();
    const section = doc.nodes[doc.rootId]!.children[0]!;
    useEditor.getState().insert("Text", { parentId: section });

    const headerRoot = useEditor.getState().documents.header!.rootId;
    useEditor.getState().setTarget("header");
    useEditor.getState().insert("Logo", { parentId: headerRoot });

    expect(useEditor.getState().dirtyTargets.size).toBe(2);

    // A save that only covered the page must not clear the header.
    useEditor.getState().markSaved(["page"]);
    expect([...useEditor.getState().dirtyTargets]).toEqual(["header"]);
    expect(useEditor.getState().saveState).toBe("dirty");
  });
});

describe("reset", () => {
  it("clears history so undo cannot reach into the previous page", () => {
    const { container } = ids();
    useEditor.getState().insert("Text", { parentId: container });
    expect(useEditor.getState().past.length).toBeGreaterThan(0);

    fresh();
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().future).toHaveLength(0);
    expect(useEditor.getState().selectedId).toBeNull();
  });
});
