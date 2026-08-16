// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Canvas } from "@/components/editor/canvas";
import { useEditor } from "@/store/editor";
import { documentFrom, headerTemplate } from "@/lib/document/templates";
import { DEFAULT_THEME } from "@/lib/document/types";

/**
 * Canvas behaviour at the DOM level.
 *
 * The canvas is the one part of the editor that cannot be reasoned about from
 * pure functions: it mounts a second React root inside an iframe, and wires
 * selection through listeners on that iframe's document. Two bugs already got
 * through by looking correct in source — cross-realm `instanceof` and an
 * unstable Zustand snapshot — so it gets real DOM coverage.
 */

let container: HTMLDivElement;
let root: Root;

const links = { pagePaths: new Map([["page-home", "/"], ["page-about", "/about"]]) };

function seedStore() {
  const page = documentFrom([
    { type: "Section", children: [{ type: "Container", children: [{ type: "Heading" }] }] },
  ]);
  const header = headerTemplate(
    "Acme Coffee",
    [
      { id: "page-home", title: "Home" },
      { id: "page-about", title: "About" },
    ],
    { kind: "page", pageId: "page-home" },
  );

  useEditor.getState().reset({
    page,
    header,
    footer: null,
    pageId: "p1",
    siteId: "s1",
    pageCount: 2,
  });
}

async function mountCanvas() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(<Canvas theme={DEFAULT_THEME} links={links} />);
  });

  const frame = container.querySelector("iframe")!;
  // jsdom fires load asynchronously; give the mount effect a turn.
  await act(async () => {
    frame.dispatchEvent(new Event("load"));
  });

  return frame;
}

beforeEach(() => {
  seedStore();
});

afterEach(() => {
  // Detached without unmounting on purpose. Tearing down a root that owns a
  // second root inside an iframe makes jsdom throw during node removal, which
  // is noise from the emulated DOM rather than anything these tests are about.
  container.remove();
});

describe("canvas composition", () => {
  it("renders the header, page and footer regions into the iframe", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    expect(doc.querySelector('[data-region="header"]'), "header region").not.toBeNull();
    expect(doc.querySelector('[data-region="page"]'), "page region").not.toBeNull();
  });

  it("renders the nav with its items", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    const nav = doc.querySelector('[data-node-type="Nav"]');
    expect(nav, "nav element").not.toBeNull();

    const items = nav!.querySelectorAll("[data-nav-item]");
    expect([...items].map((item) => item.textContent)).toEqual(["Home", "About"]);
  });

  it("emits display:flex for the nav, so its items sit in a row", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    const nav = doc.querySelector('[data-node-type="Nav"]')!;
    const navClass = [...nav.classList].find((name) => name.startsWith("n_"))!;
    const css = [...doc.querySelectorAll("style")].map((tag) => tag.textContent).join("");

    const rule = new RegExp(`\\.${navClass}\\{[^}]*\\}`).exec(css)?.[0] ?? "";
    expect(rule, "nav rule").toContain("display:flex");
  });

  it("marks the page as the active region and the header as inactive", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    expect(doc.querySelector('[data-region="page"]')!.hasAttribute("data-inactive")).toBe(false);
    expect(doc.querySelector('[data-region="header"]')!.hasAttribute("data-inactive")).toBe(true);
  });
});

describe("breakpoint switching", () => {
  /**
   * Changing the preview width resizes the iframe. It must NOT disturb the
   * root mounted inside it — the content is rendered once and the media
   * queries do the rest.
   */
  it("keeps the rendered content when the breakpoint changes", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    const before = doc.querySelectorAll("[data-node-id]").length;
    expect(before).toBeGreaterThan(0);

    for (const breakpoint of ["md", "lg", "base"] as const) {
      await act(async () => {
        useEditor.getState().setBreakpoint(breakpoint);
      });

      const after = frame.contentDocument!.querySelectorAll("[data-node-id]").length;
      expect(after, `nodes present at ${breakpoint}`).toBe(before);
    }
  });

  it("keeps the same iframe document across breakpoint changes", async () => {
    const frame = await mountCanvas();
    const documentBefore = frame.contentDocument;

    await act(async () => {
      useEditor.getState().setBreakpoint("lg");
    });

    // A new document would mean the iframe reloaded and the inner root is
    // orphaned — the content would vanish and never come back.
    expect(frame.contentDocument).toBe(documentBefore);
  });

  it("previews at the requested width instead of clamping to the column", async () => {
    const frame = await mountCanvas();

    await act(async () => {
      useEditor.getState().setBreakpoint("lg");
    });

    // The wrapper carries the requested width; the frame fills it.
    const wrapper = frame.parentElement as HTMLElement;
    expect(wrapper.style.width).toBe("1280px");

    // A max-width on either element would silently clamp Desktop back to the
    // column width, so media queries would evaluate at the wrong size and the
    // breakpoint switcher would be lying about what it is showing.
    expect(frame.style.maxWidth).toBe("");
    expect(wrapper.style.maxWidth).toBe("");
  });

  it("does not centre with flex, which would strand the left overflow", async () => {
    const frame = await mountCanvas();
    const scroller = frame.parentElement!.parentElement as HTMLElement;

    // justify-center on an overflowing flex container puts half the overflow
    // to the left, where it cannot be scrolled to — the page appears to start
    // somewhere in its middle, which reads as "the content is gone".
    expect(scroller.className).not.toContain("justify-center");
    expect(scroller.className).toContain("overflow-auto");
    expect(frame.parentElement!.className).toContain("mx-auto");
  });
});

describe("StrictMode remount", () => {
  /**
   * React StrictMode runs every effect twice in development: mount, clean up,
   * mount again — all in the same tick.
   *
   * That is hostile to this component. The teardown has to be deferred (React
   * forbids unmounting a root from inside commit), so on the second mount the
   * old root is still attached to the iframe's <body>, and calling createRoot
   * on it again is an error. The teardown must therefore be cancellable.
   */
  it("mounts under StrictMode without re-rooting the same container", async () => {
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(" "));

    try {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root.render(
          <StrictMode>
            <Canvas theme={DEFAULT_THEME} links={links} />
          </StrictMode>,
        );
      });

      const frame = container.querySelector("iframe")!;
      await act(async () => {
        frame.dispatchEvent(new Event("load"));
      });

      const complaint = errors.find((entry) =>
        String(entry).includes("already been passed to createRoot"),
      );
      expect(complaint, `console.error: ${errors.join(" | ")}`).toBeUndefined();

      // And it still actually rendered.
      expect(frame.contentDocument!.querySelector('[data-node-type="Nav"]')).not.toBeNull();
    } finally {
      console.error = originalError;
    }
  });
});

describe("selection", () => {
  it("selects the node that was clicked, not its ancestor", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    const heading = doc.querySelector('[data-node-type="Heading"]') as HTMLElement;
    expect(heading).not.toBeNull();

    await act(async () => {
      heading.dispatchEvent(new doc.defaultView!.MouseEvent("click", { bubbles: true }));
    });

    expect(useEditor.getState().selectedId).toBe(heading.dataset.nodeId);
  });

  it("selects the Nav when a nav link is clicked, not the Header", async () => {
    useEditor.getState().setTarget("header");
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    const nav = doc.querySelector('[data-node-type="Nav"]') as HTMLElement;
    const link = nav.querySelector("[data-nav-item]") as HTMLElement;

    await act(async () => {
      link.dispatchEvent(new doc.defaultView!.MouseEvent("click", { bubbles: true }));
    });

    // Nav items are props, not nodes, so the click must resolve up to the Nav
    // itself — landing on the Header would mean every edit hit the wrong node.
    expect(useEditor.getState().selectedId).toBe(nav.dataset.nodeId);
  });

  it("selecting the Logo does not select the Header", async () => {
    useEditor.getState().setTarget("header");
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    const logo = doc.querySelector('[data-node-type="Logo"]') as HTMLElement;
    const header = doc.querySelector('[data-node-type="Header"]') as HTMLElement;

    await act(async () => {
      logo.dispatchEvent(new doc.defaultView!.MouseEvent("click", { bubbles: true }));
    });

    expect(useEditor.getState().selectedId).toBe(logo.dataset.nodeId);
    expect(useEditor.getState().selectedId).not.toBe(header.dataset.nodeId);
  });

  it("re-renders the canvas when a prop changes", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    const heading = doc.querySelector('[data-node-type="Heading"]') as HTMLElement;
    const id = heading.dataset.nodeId!;

    await act(async () => {
      useEditor.getState().updateProps(id, { text: "Changed in the store" });
    });

    expect(doc.querySelector('[data-node-type="Heading"]')!.textContent).toBe(
      "Changed in the store",
    );
  });

  it("clicking the header while editing the page switches to the header", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;
    expect(useEditor.getState().target).toBe("page");

    const nav = doc.querySelector('[data-node-type="Nav"]') as HTMLElement;

    await act(async () => {
      nav.dispatchEvent(new doc.defaultView!.MouseEvent("click", { bubbles: true }));
    });

    // Clicking a region you are not editing must act on it, not do nothing.
    // Silence here is what made the header look broken.
    expect(useEditor.getState().target).toBe("header");
  });

  it("does not select a node inside a region it just switched to", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;
    const nav = doc.querySelector('[data-node-type="Nav"]') as HTMLElement;

    await act(async () => {
      nav.dispatchEvent(new doc.defaultView!.MouseEvent("click", { bubbles: true }));
    });

    // The first click is a mode change; selecting on the same click would jump
    // the inspector somewhere the user has not looked at yet.
    expect(useEditor.getState().selectedId).toBeNull();
  });

  it("does not show a covering overlay on an inactive region", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;
    const css = [...doc.querySelectorAll("style")].map((tag) => tag.textContent).join("");

    // An overlay pinned to `inset:0` hid the header entirely, so the nav could
    // not be seen at all while laying out a page.
    const overlay = /\[data-region\]\[data-inactive\]::after\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(overlay).not.toContain("inset:0");
    expect(overlay).not.toContain("justify-content:center");
  });

  it("switching target makes the header interactive and the page inert", async () => {
    const frame = await mountCanvas();
    const doc = frame.contentDocument!;

    await act(async () => {
      useEditor.getState().setTarget("header");
    });

    expect(doc.querySelector('[data-region="header"]')!.hasAttribute("data-inactive")).toBe(false);
    expect(doc.querySelector('[data-region="page"]')!.hasAttribute("data-inactive")).toBe(true);
  });
});
