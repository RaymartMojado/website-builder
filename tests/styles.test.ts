import { describe, expect, it } from "vitest";
import {
  ALLOWED_PROPERTIES,
  compileDeclarations,
  compileStyles,
  compileTheme,
  isSafeValue,
} from "@/lib/styles/compile";
import { DEFAULT_THEME, type PageDocument } from "@/lib/document/types";

/**
 * OWASP A03. The compiler is the one place authored data becomes CSS text, so
 * these are the tests that matter most in the whole renderer.
 */

const decl = (style: Record<string, string | number>) => compileDeclarations(style).join(";");

describe("CSS injection is dropped, not escaped", () => {
  const breakouts = [
    "red; } body { display:none } .x {",
    "red}body{display:none",
    "red; background: url(javascript:alert(1))",
    "url(javascript:alert(1))",
    "expression(alert(1))",
    "red/*comment*/",
    "red;color:blue",
    "</style><script>alert(1)</script>",
    "\\72 ed",
    "@import url(//evil.example)",
    "url('data:text/html,<script>alert(1)</script>')",
  ];

  for (const payload of breakouts) {
    it(`drops ${JSON.stringify(payload.slice(0, 34))}`, () => {
      const output = decl({ color: payload });
      expect(output).toBe("");
    });
  }

  it("never emits a brace, semicolon or angle bracket from a value", () => {
    for (const payload of breakouts) {
      for (const property of ["color", "padding", "fontSize", "backgroundColor", "width"]) {
        const output = decl({ [property]: payload });
        expect(output).not.toMatch(/[{}<>]/);
        // A single trailing declaration separator is fine; a value must not add its own.
        expect(output.split(";").length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("cannot close the style element", () => {
    const doc = documentWith({ color: "</style><script>alert(1)</script>" });
    expect(compileStyles(doc)).not.toMatch(/<\/?style/i);
  });
});

describe("unknown properties and values are dropped", () => {
  it("drops properties outside the allowlist", () => {
    expect(decl({ behavior: "url(x.htc)" })).toBe("");
    expect(decl({ "-moz-binding": "url(x)" })).toBe("");
    expect(decl({ position: "fixed" })).toBe(""); // not allowlisted (yet)
  });

  it("drops well-named properties carrying bad values", () => {
    expect(decl({ display: "flex; color:red" })).toBe("");
    expect(decl({ fontWeight: "700; x:y" })).toBe("");
    expect(decl({ opacity: "2" })).toBe(""); // outside 0..1
    expect(decl({ fontFamily: "'; } evil {" })).toBe("");
  });

  it("keeps a valid neighbour when one property is rejected", () => {
    // Rejecting the document wholesale would lose work; rejecting the single
    // bad declaration keeps the rest of the node intact.
    const output = compileDeclarations({ color: "#ff0000", display: "nonsense" });
    expect(output).toEqual(["color:#ff0000"]);
  });
});

describe("valid values survive", () => {
  it("accepts lengths, colours and keywords", () => {
    expect(decl({ fontSize: "18px" })).toBe("font-size:18px");
    expect(decl({ color: "#2b54d4" })).toBe("color:#2b54d4");
    expect(decl({ color: "rgba(0,0,0,0.5)" })).toBe("color:rgba(0,0,0,0.5)");
    expect(decl({ color: "var(--color-primary)" })).toBe("color:var(--color-primary)");
    expect(decl({ display: "flex" })).toBe("display:flex");
    expect(decl({ padding: "8px 16px" })).toBe("padding:8px 16px");
    expect(decl({ lineHeight: "1.5" })).toBe("line-height:1.5");
  });

  it("only allows our own custom-property namespace", () => {
    expect(decl({ color: "var(--color-primary)" })).not.toBe("");
    expect(decl({ color: "var(--x); } evil {" })).toBe("");
  });

  it("camelCases into kebab-case", () => {
    expect(decl({ backgroundColor: "#fff" })).toBe("background-color:#fff");
    expect(decl({ paddingTop: "4px" })).toBe("padding-top:4px");
  });
});

describe("isSafeValue", () => {
  it("vetoes structural characters before matchers run", () => {
    expect(isSafeValue("red")).toBe(true);
    expect(isSafeValue("red}")).toBe(false);
    expect(isSafeValue("a;b")).toBe(false);
    expect(isSafeValue("/*x*/")).toBe(false);
    expect(isSafeValue("url(x)")).toBe(false);
  });
});

describe("theme compilation", () => {
  it("emits every token the default theme declares", () => {
    const css = compileTheme(DEFAULT_THEME);

    // This caught a real bug: DEFAULT_THEME once named a font stack the
    // compiler did not allow, so --font-body silently never existed and every
    // heading fell back to the browser default.
    for (const name of Object.keys(DEFAULT_THEME.colors)) {
      expect(css, `--color-${name}`).toContain(`--color-${name}:`);
    }
    expect(css).toContain("--font-body:");
    expect(css).toContain("--font-heading:");
    for (const name of Object.keys(DEFAULT_THEME.radii)) {
      expect(css).toContain(`--radius-${name}:`);
    }
  });

  it("drops tokens with unsafe names or values", () => {
    const css = compileTheme({
      colors: { "evil}x": "#fff", ok: "#000", bad: "red; }" },
      fonts: { body: "Arial", heading: "'; }" },
      radii: {},
    });
    expect(css).toContain("--color-ok:#000");
    expect(css).not.toContain("evil");
    expect(css).not.toMatch(/[{}]:/);
    expect(css).not.toContain("--font-body");
  });
});

describe("responsive output", () => {
  it("orders base rules before breakpoint media blocks", () => {
    const doc = documentWith({ fontSize: "16px" }, { fontSize: "24px" });
    const css = compileStyles(doc);

    const baseAt = css.indexOf("font-size:16px");
    const mdAt = css.indexOf("@media(min-width:768px)");

    expect(baseAt).toBeGreaterThanOrEqual(0);
    expect(mdAt).toBeGreaterThan(baseAt);
    expect(css).toContain("@media(min-width:768px){");
  });

  it("skips nodes whose ids could escape a selector", () => {
    const doc: PageDocument = {
      version: 1,
      rootId: "root",
      nodes: {
        root: { id: "root", type: "Root", props: {}, style: { base: {} }, children: [], parent: null },
        // A hostile id would otherwise become part of the selector.
        "evil{}": {
          id: "evil{}",
          type: "Text",
          props: {},
          style: { base: { color: "red" } },
          children: [],
          parent: "root",
        },
      },
    };

    const css = compileStyles(doc);
    expect(css).not.toContain("evil");
    expect(css).not.toMatch(/[{]{2}/);
  });
});

it("the allowlist is non-trivial and frozen", () => {
  expect(ALLOWED_PROPERTIES.length).toBeGreaterThan(30);
  expect(Object.isFrozen(ALLOWED_PROPERTIES)).toBe(true);
});

// ---------------------------------------------------------------------------

function documentWith(
  base: Record<string, string>,
  md?: Record<string, string>,
): PageDocument {
  return {
    version: 1,
    rootId: "root",
    nodes: {
      root: {
        id: "root",
        type: "Root",
        props: {},
        style: { base, ...(md ? { md } : {}) },
        children: [],
        parent: null,
      },
    },
  };
}
