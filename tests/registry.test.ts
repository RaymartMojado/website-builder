import { describe, expect, it } from "vitest";
import { registry, paletteGroups, canAcceptChild, getDef } from "@/components/registry";
import { findInvalidDeclarations } from "@/lib/styles/compile";
import { validateDocument } from "@/lib/document/validate";
import {
  documentFrom,
  blankPage,
  homeTemplate,
  aboutTemplate,
  headerTemplate,
  footerTemplate,
} from "@/lib/document/templates";
import { BREAKPOINTS } from "@/lib/document/types";

/**
 * The registry is the hub: the editor, the validator and the renderer all read
 * from it. A default that the compiler silently drops is invisible in review
 * and shows up as "why isn't this styled?" much later.
 *
 * This suite caught exactly that twice — a font stack the compiler did not
 * allow, and `borderRadius: var(--radius-md)` failing the length matcher.
 */

describe("component defaults survive their own compiler", () => {
  for (const [type, definition] of Object.entries(registry)) {
    it(`${type} emits every default style it declares`, () => {
      for (const { key } of BREAKPOINTS) {
        const style = definition.defaultStyle[key];
        if (!style) continue;

        const problems = findInvalidDeclarations(style);
        expect(
          problems,
          `${type}.${key} would silently drop: ${problems.map((p) => `${p.property} (${p.reason})`).join(", ")}`,
        ).toEqual([]);
      }
    });

    it(`${type} default props satisfy its own schema`, () => {
      const parsed = definition.schema.safeParse(definition.defaultProps);
      expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
    });
  }
});

describe("header proportions", () => {
  /**
   * A nav bar should read as chrome. These are the numbers that keep it from
   * eating the top of the canvas, and the wrap rules that keep the links
   * beside the logo instead of stacked underneath it.
   */
  const header = registry.Header!.defaultStyle.base;
  const nav = registry.Nav!.defaultStyle.base;
  const logo = registry.Logo!.defaultStyle.base;

  it("stays a band rather than a section", () => {
    const padding = Number(String(header.paddingTop).replace("px", ""));
    expect(padding).toBeLessThanOrEqual(12);
    expect(Number(String(logo.height).replace("px", ""))).toBeLessThanOrEqual(28);
  });

  it("keeps the logo and the links on one row", () => {
    // wrap put the logo on one line and the links on the next, which stops
    // looking like navigation entirely.
    expect(header.flexWrap).toBe("nowrap");
    expect(nav.flexWrap).toBe("nowrap");
  });

  it("separates the logo from the links", () => {
    expect(header.display).toBe("flex");
    expect(header.justifyContent).toBe("space-between");
  });
});

describe("registry shape", () => {
  it("keys match the definition type", () => {
    for (const [key, definition] of Object.entries(registry)) {
      expect(definition.type).toBe(key);
    }
  });

  it("exposes a palette that excludes internal components", () => {
    const items = paletteGroups.flatMap((group) => group.items);
    expect(items.length).toBeGreaterThan(5);
    expect(items.some((item) => item.internal)).toBe(false);
    // Root is created by the system, never dragged in.
    expect(items.some((item) => item.type === "Root")).toBe(false);
  });

  it("only containers accept children", () => {
    expect(canAcceptChild("Container", "Text")).toBe(true);
    expect(canAcceptChild("Section", "Container")).toBe(true);
    // A leaf must refuse children, or the tree can nest text inside text.
    expect(canAcceptChild("Text", "Text")).toBe(false);
    expect(canAcceptChild("Image", "Text")).toBe(false);
    expect(canAcceptChild("Spacer", "Text")).toBe(false);
  });

  it("every component has an icon the palette can resolve", () => {
    for (const definition of Object.values(registry)) {
      expect(definition.icon, definition.type).toMatch(/^[A-Z]/);
    }
  });
});

describe("templates are valid documents", () => {
  // Every template, not just page bodies. The header template once shipped a
  // `borderWidth: "0 0 1px 0"` shorthand the compiler rejected, which only
  // surfaced when a real save came back 422.
  const cases: [string, () => ReturnType<typeof blankPage>][] = [
    ["blank page", () => blankPage()],
    ["home template", () => homeTemplate("Acme Coffee", { kind: "none" })],
    ["about template", () => aboutTemplate({ kind: "none" })],
    [
      "header template",
      () =>
        headerTemplate(
          "Acme Coffee",
          [
            { id: "page-home", title: "Home" },
            { id: "page-about", title: "About" },
          ],
          { kind: "page", pageId: "page-home" },
        ),
    ],
    ["header template with no pages", () => headerTemplate("Acme", [], { kind: "none" })],
    ["footer template", () => footerTemplate("Acme Coffee")],
  ];

  for (const [name, build] of cases) {
    it(`${name} passes server-side validation`, () => {
      const result = validateDocument(build());
      expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
    });
  }

  it("a document built from every palette component validates", () => {
    // Anything a user can drag in must produce a saveable document.
    const children = paletteGroups
      .flatMap((group) => group.items)
      .filter((item) => !item.acceptsChildren)
      .map((item) => ({ type: item.type }));

    const doc = documentFrom([{ type: "Section", children: [{ type: "Container", children }] }]);
    const result = validateDocument(doc);
    expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
  });

  it("unknown component types are ignored rather than crashing the builder", () => {
    const doc = documentFrom([{ type: "NotARealComponent" }]);
    expect(getDef("NotARealComponent")).toBeUndefined();
    expect(validateDocument(doc).ok).toBe(true);
  });
});
