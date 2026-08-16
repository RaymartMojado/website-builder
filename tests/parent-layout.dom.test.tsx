// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ParentLayout } from "@/components/editor/parent-layout";
import { useEditor } from "@/store/editor";
import { documentFrom } from "@/lib/document/templates";
import type { DocNode } from "@/lib/document/types";

/**
 * The arrangement control.
 *
 * It exists because width does not control flow direction: three images set to
 * 33% inside a column container stay stacked, and nothing on the image itself
 * will ever change that. The control has to reach the parent.
 */

let container: HTMLDivElement;
let root: Root;

/** Container with three images, laid out however `direction` says. */
function seed(direction: "row" | "column") {
  const page = documentFrom([
    {
      type: "Container",
      style: { base: { display: "flex", flexDirection: direction } },
      children: [{ type: "Image" }, { type: "Image" }, { type: "Image" }],
    },
  ]);

  useEditor.getState().reset({
    page,
    header: null,
    footer: null,
    pageId: "p1",
    siteId: "s1",
    pageCount: 1,
  });

  // reset() deliberately leaves the breakpoint alone — pin it so these tests
  // do not depend on whichever one the editor opens at.
  useEditor.getState().setBreakpoint("base");

  const doc = useEditor.getState().doc;
  const containerId = doc.nodes[doc.rootId]!.children[0]!;
  const imageId = doc.nodes[containerId]!.children[0]!;
  return { containerId, imageId };
}

async function render(node: DocNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ParentLayout node={node} />));
  return container;
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const nodeById = (id: string) => useEditor.getState().doc.nodes[id]!;

describe("arrangement control", () => {
  it("appears when a child's siblings are laid out by a flex parent", async () => {
    const { imageId } = seed("column");
    const view = await render(nodeById(imageId));

    expect(view.textContent).toContain("Side by side");
    expect(view.textContent).toContain("Stacked");
  });

  it("reflects the parent's current direction", async () => {
    const { imageId } = seed("column");
    const view = await render(nodeById(imageId));

    const stacked = [...view.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Stacked"),
    )!;
    expect(stacked.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches the PARENT to a row, not the selected child", async () => {
    const { containerId, imageId } = seed("column");
    const view = await render(nodeById(imageId));

    const sideBySide = [...view.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Side by side"),
    )!;

    await act(async () => {
      sideBySide.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // The parent moved to a row...
    expect(nodeById(containerId).style.base.flexDirection).toBe("row");
    // ...and the image itself was left alone.
    expect(nodeById(imageId).style.base.flexDirection).toBeUndefined();
  });

  it("writes to the breakpoint being edited", async () => {
    const { containerId, imageId } = seed("column");
    useEditor.getState().setBreakpoint("md");

    const view = await render(nodeById(imageId));
    const sideBySide = [...view.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Side by side"),
    )!;

    await act(async () => {
      sideBySide.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Stacked on mobile, side by side from tablet up — the responsive default
    // people actually want.
    expect(nodeById(containerId).style.md?.flexDirection).toBe("row");
    expect(nodeById(containerId).style.base.flexDirection).toBe("column");

    useEditor.getState().setBreakpoint("base");
  });

  it("stays hidden when there is nothing to arrange", async () => {
    const page = documentFrom([{ type: "Container", children: [{ type: "Image" }] }]);
    useEditor.getState().reset({
      page,
      header: null,
      footer: null,
      pageId: "p1",
      siteId: "s1",
      pageCount: 1,
    });

    const doc = useEditor.getState().doc;
    const only = doc.nodes[doc.nodes[doc.rootId]!.children[0]!]!.children[0]!;

    // A single child has no arrangement, so the control would be noise.
    const view = await render(nodeById(only));
    expect(view.textContent).toBe("");
  });

  it("stays hidden for the root, which has no parent", async () => {
    seed("column");
    const doc = useEditor.getState().doc;
    const view = await render(doc.nodes[doc.rootId]!);
    expect(view.textContent).toBe("");
  });

  it("shows each option as a picture of the resulting layout", async () => {
    const { imageId } = seed("column");
    const view = await render(nodeById(imageId));

    // A word only means something once you know the alternative. Each option
    // draws its arrangement, so no vocabulary is required to choose.
    const buttons = [...view.querySelectorAll("button")].filter((b) =>
      /Stacked|Side by side/.test(b.textContent ?? ""),
    );
    expect(buttons).toHaveLength(2);

    for (const button of buttons) {
      const svg = button.querySelector("svg");
      expect(svg, `${button.textContent} needs a preview`).not.toBeNull();
      // Three blocks, matching the three items being arranged.
      expect(svg!.querySelectorAll("rect")).toHaveLength(3);
    }

    const [stacked, row] = buttons;
    const rectsOf = (b: Element) => [...b.querySelectorAll("rect")];

    // Stacked blocks are wide and short; row blocks are narrow and tall. If
    // the two previews looked alike the control would be decoration.
    const stackedFirst = rectsOf(stacked!)[0]!;
    const rowFirst = rectsOf(row!)[0]!;

    expect(Number(stackedFirst.getAttribute("width"))).toBeGreaterThan(
      Number(stackedFirst.getAttribute("height")),
    );
    expect(Number(rowFirst.getAttribute("height"))).toBeGreaterThan(
      Number(rowFirst.getAttribute("width")),
    );
  });
});
