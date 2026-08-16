import { describe, expect, it } from "vitest";
import { produce } from "immer";
import {
  checkIntegrity,
  createDocument,
  duplicateNode,
  insertNode,
  makeNode,
  moveNode,
  removeNode,
  setStyle,
} from "@/lib/document/operations";
import { migrate } from "@/lib/document/migrate";
import { validateDocument } from "@/lib/document/validate";
import { homeTemplate } from "@/lib/document/templates";
import type { PageDocument } from "@/lib/document/types";

/**
 * Tree invariants. The renderer assumes all of these, and undo/redo replays
 * operations, so a single violation compounds.
 */

function edit(doc: PageDocument, mutate: (draft: PageDocument) => void): PageDocument {
  return produce(doc, mutate);
}

function seed() {
  let doc = createDocument();
  const ids: Record<string, string> = {};

  doc = edit(doc, (draft) => {
    const section = makeNode("Section");
    ids.section = section.id;
    insertNode(draft, section, { parentId: draft.rootId });

    const container = makeNode("Container");
    ids.container = container.id;
    insertNode(draft, container, { parentId: section.id });

    for (const name of ["a", "b", "c"]) {
      const text = makeNode("Text", { text: name });
      ids[name] = text.id;
      insertNode(draft, text, { parentId: container.id });
    }
  });

  return { doc, ids };
}

describe("insert", () => {
  it("attaches the node and links parent and child both ways", () => {
    const { doc, ids } = seed();
    expect(doc.nodes[ids.section!]!.parent).toBe(doc.rootId);
    expect(doc.nodes[doc.rootId]!.children).toContain(ids.section);
    expect(checkIntegrity(doc)).toEqual([]);
  });

  it("honours beforeId", () => {
    const { doc, ids } = seed();
    const next = edit(doc, (draft) => {
      insertNode(draft, makeNode("Text", { text: "first" }), {
        parentId: ids.container!,
        beforeId: ids.a,
      });
    });

    const children = next.nodes[ids.container!]!.children;
    expect(next.nodes[children[0]!]!.props.text).toBe("first");
    expect(checkIntegrity(next)).toEqual([]);
  });
});

describe("move", () => {
  it("reorders within a parent without dropping a position", () => {
    const { doc, ids } = seed();
    // Moving 'a' forward to sit before 'c'. Detaching first would land it one
    // short — this is the off-by-one that reorder implementations get wrong.
    const next = edit(doc, (draft) => {
      moveNode(draft, ids.a!, { parentId: ids.container!, beforeId: ids.c });
    });

    const order = next.nodes[ids.container!]!.children.map((id) => next.nodes[id]!.props.text);
    expect(order).toEqual(["b", "a", "c"]);
    expect(checkIntegrity(next)).toEqual([]);
  });

  it("reparents between containers", () => {
    const { doc, ids } = seed();
    const next = edit(doc, (draft) => {
      moveNode(draft, ids.a!, { parentId: ids.section! });
    });

    expect(next.nodes[ids.a!]!.parent).toBe(ids.section);
    expect(next.nodes[ids.container!]!.children).not.toContain(ids.a);
    expect(next.nodes[ids.section!]!.children).toContain(ids.a);
    expect(checkIntegrity(next)).toEqual([]);
  });

  it("refuses to move a node into its own subtree", () => {
    const { doc, ids } = seed();
    // Would detach the whole branch from the root and leave an unreachable ring.
    const next = edit(doc, (draft) => {
      const moved = moveNode(draft, ids.section!, { parentId: ids.container! });
      expect(moved).toBe(false);
    });

    expect(checkIntegrity(next)).toEqual([]);
    expect(next.nodes[ids.section!]!.parent).toBe(next.rootId);
  });

  it("refuses to move a node into itself, and refuses to move the root", () => {
    const { doc, ids } = seed();
    edit(doc, (draft) => {
      expect(moveNode(draft, ids.a!, { parentId: ids.a! })).toBe(false);
      expect(moveNode(draft, draft.rootId, { parentId: ids.container! })).toBe(false);
    });
  });
});

describe("remove", () => {
  it("removes the subtree and leaves no orphans", () => {
    const { doc, ids } = seed();
    const before = Object.keys(doc.nodes).length;

    const next = edit(doc, (draft) => {
      removeNode(draft, ids.container!);
    });

    // container + three texts
    expect(Object.keys(next.nodes).length).toBe(before - 4);
    expect(next.nodes[ids.a!]).toBeUndefined();
    expect(checkIntegrity(next)).toEqual([]);
  });

  it("will not remove the root", () => {
    const { doc } = seed();
    edit(doc, (draft) => {
      expect(removeNode(draft, draft.rootId)).toBe(false);
    });
  });
});

describe("duplicate", () => {
  it("deep-copies with fresh ids, placed after the original", () => {
    const { doc, ids } = seed();
    let copyId: string | null = null;

    const next = edit(doc, (draft) => {
      copyId = duplicateNode(draft, ids.container!);
    });

    expect(copyId).toBeTruthy();
    expect(copyId).not.toBe(ids.container);

    const copy = next.nodes[copyId!]!;
    expect(copy.children).toHaveLength(3);
    // Fresh ids throughout, or the two subtrees would share style rules.
    expect(copy.children).not.toContain(ids.a);
    expect(checkIntegrity(next)).toEqual([]);

    const siblings = next.nodes[ids.section!]!.children;
    expect(siblings.indexOf(copyId!)).toBe(siblings.indexOf(ids.container!) + 1);
  });
});

describe("setStyle", () => {
  it("writes to the requested breakpoint only", () => {
    const { doc, ids } = seed();
    const next = edit(doc, (draft) => {
      setStyle(draft, ids.a!, "md", { fontSize: "24px" });
    });

    expect(next.nodes[ids.a!]!.style.md).toEqual({ fontSize: "24px" });
    expect(next.nodes[ids.a!]!.style.base.fontSize).toBeUndefined();
  });

  it("deletes a property rather than storing an empty value", () => {
    const { doc, ids } = seed();
    const next = edit(doc, (draft) => {
      setStyle(draft, ids.a!, "base", { color: "#fff" });
      setStyle(draft, ids.a!, "base", { color: undefined });
    });

    expect("color" in next.nodes[ids.a!]!.style.base).toBe(false);
  });

  it("drops an emptied breakpoint object but always keeps base", () => {
    const { doc, ids } = seed();
    const next = edit(doc, (draft) => {
      setStyle(draft, ids.a!, "md", { fontSize: "24px" });
      setStyle(draft, ids.a!, "md", { fontSize: undefined });
    });

    expect(next.nodes[ids.a!]!.style.md).toBeUndefined();
    expect(next.nodes[ids.a!]!.style.base).toBeDefined();
  });
});

describe("integrity checks catch corruption", () => {
  it("detects a missing child", () => {
    const { doc, ids } = seed();
    const broken = edit(doc, (draft) => {
      delete draft.nodes[ids.a!];
    });
    expect(checkIntegrity(broken).some((p) => p.kind === "missing-child")).toBe(true);
  });

  it("detects parent/children disagreement", () => {
    const { doc, ids } = seed();
    const broken = edit(doc, (draft) => {
      draft.nodes[ids.a!]!.parent = draft.rootId;
    });
    expect(checkIntegrity(broken).some((p) => p.kind === "parent-mismatch")).toBe(true);
  });

  it("detects an unreachable ring", () => {
    const { doc, ids } = seed();
    const broken = edit(doc, (draft) => {
      const container = draft.nodes[ids.container!]!;
      container.children = container.children.filter((id) => id !== ids.a);
      // 'a' now points at a parent that does not list it, and nothing reaches it.
      draft.nodes[ids.a!]!.children = [ids.a!];
    });

    const problems = checkIntegrity(broken);
    expect(problems.some((p) => p.kind === "unreachable" || p.kind === "parent-mismatch")).toBe(true);
  });
});

describe("migration", () => {
  it("passes a current document through unchanged", () => {
    const { doc } = seed();
    expect(migrate(doc)).toBe(doc);
  });

  it("returns an empty document for junk rather than throwing", () => {
    for (const junk of [null, undefined, 42, "x", {}, { version: 99 }]) {
      const result = migrate(junk);
      expect(result.version).toBe(1);
      expect(result.nodes[result.rootId]).toBeDefined();
    }
  });
});

describe("server-side validation", () => {
  it("accepts a template document", () => {
    const doc = homeTemplate("Acme", { kind: "none" });
    const result = validateDocument(doc);
    expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
  });

  it("rejects unknown component types", () => {
    const { doc, ids } = seed();
    const bad = edit(doc, (draft) => {
      draft.nodes[ids.a!]!.type = "EvilComponent";
    });

    const result = validateDocument(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/Unknown component type/);
  });

  it("rejects style properties outside the allowlist", () => {
    const { doc, ids } = seed();
    const bad = edit(doc, (draft) => {
      draft.nodes[ids.a!]!.style.base = { behavior: "url(x.htc)" };
    });

    expect(validateDocument(bad).ok).toBe(false);
  });

  it("rejects an injected VALUE on an allowlisted property", () => {
    // Regression. The validator once checked only property names, so this was
    // accepted and stored. The compiler dropped it at render, so it was never
    // exploitable — but the stored document then disagreed with what rendered,
    // and the validator was weaker than it claimed to be.
    const payloads = [
      "red; } body { display:none } .x {",
      "url(javascript:alert(1))",
      "expression(alert(1))",
      "</style><script>alert(1)</script>",
    ];

    for (const payload of payloads) {
      const { doc, ids } = seed();
      const bad = edit(doc, (draft) => {
        draft.nodes[ids.a!]!.style.base = { color: payload };
      });
      expect(validateDocument(bad).ok, payload).toBe(false);
    }
  });

  it("rejects an injected value at a non-base breakpoint too", () => {
    const { doc, ids } = seed();
    const bad = edit(doc, (draft) => {
      draft.nodes[ids.a!]!.style.md = { fontSize: "16px; } evil {" };
    });
    expect(validateDocument(bad).ok).toBe(false);
  });

  it("rejects children on a component that cannot hold them", () => {
    const { doc, ids } = seed();
    const bad = edit(doc, (draft) => {
      const extra = makeNode("Text", { text: "nested" });
      draft.nodes[extra.id] = { ...extra, parent: ids.a! };
      draft.nodes[ids.a!]!.children.push(extra.id);
    });

    expect(validateDocument(bad).ok).toBe(false);
  });

  it("rejects a node id that could escape a CSS selector", () => {
    const bad: PageDocument = {
      version: 1,
      rootId: "root",
      nodes: {
        root: { id: "root", type: "Root", props: {}, style: { base: {} }, children: ["e{}"], parent: null },
        "e{}": { id: "e{}", type: "Text", props: {}, style: { base: {} }, children: [], parent: "root" },
      },
    };
    expect(validateDocument(bad).ok).toBe(false);
  });

  it("rejects a document whose map key disagrees with the node id", () => {
    const bad: PageDocument = {
      version: 1,
      rootId: "root",
      nodes: {
        root: { id: "root", type: "Root", props: {}, style: { base: {} }, children: [], parent: null },
        wrongkey: { id: "other", type: "Text", props: {}, style: { base: {} }, children: [], parent: "root" },
      },
    };
    expect(validateDocument(bad).ok).toBe(false);
  });

  it("rejects a wrong version rather than guessing", () => {
    const { doc } = seed();
    expect(validateDocument({ ...doc, version: 2 }).ok).toBe(false);
  });
});
