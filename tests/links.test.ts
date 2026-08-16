import { describe, expect, it } from "vitest";
import { linkSchema, parseLink, resolveLink, type LinkContext } from "@/lib/links/types";

const ctx: LinkContext = {
  pagePaths: new Map([
    ["page-home", "/"],
    ["page-about", "/about"],
  ]),
  assetUrls: new Map([["asset-1", "https://cdn.example/file.pdf"]]),
};

describe("hostile URLs cannot be persisted", () => {
  const hostile = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example/path",
  ];

  for (const url of hostile) {
    it(`rejects ${JSON.stringify(url.slice(0, 30))}`, () => {
      const result = linkSchema.safeParse({ kind: "external", url });
      expect(result.success).toBe(false);
    });
  }

  it("falls back to no-link rather than throwing", () => {
    expect(parseLink({ kind: "external", url: "javascript:alert(1)" })).toEqual({ kind: "none" });
    expect(parseLink(null)).toEqual({ kind: "none" });
    expect(parseLink({ kind: "nonsense" })).toEqual({ kind: "none" });
  });

  it("accepts http, https and rooted paths", () => {
    for (const url of ["https://example.com", "http://example.com/x?y=1", "/about"]) {
      expect(linkSchema.safeParse({ kind: "external", url }).success, url).toBe(true);
    }
  });
});

describe("resolution", () => {
  it("resolves a page link through its id", () => {
    expect(resolveLink({ kind: "page", pageId: "page-about" }, ctx)).toEqual({
      href: "/about",
      broken: false,
    });
  });

  it("follows a renamed path without touching the link", () => {
    // The entire point of storing ids: the link is unchanged, the path moved.
    const renamed: LinkContext = { pagePaths: new Map([["page-about", "/our-story"]]) };
    expect(resolveLink({ kind: "page", pageId: "page-about" }, renamed).href).toBe("/our-story");
  });

  it("marks a deleted page as broken and emits no href", () => {
    const resolved = resolveLink({ kind: "page", pageId: "page-gone" }, ctx);
    expect(resolved.broken).toBe(true);
    expect(resolved.href).toBeUndefined();
  });

  it("appends a hash", () => {
    expect(resolveLink({ kind: "page", pageId: "page-home", hash: "pricing" }, ctx).href).toBe(
      "/#pricing",
    );
  });

  it("adds noopener when opening a new tab", () => {
    const resolved = resolveLink(
      { kind: "external", url: "https://example.com", newTab: true },
      ctx,
    );
    // Without noopener the opened page can navigate ours via window.opener.
    expect(resolved.target).toBe("_blank");
    expect(resolved.rel).toBe("noopener noreferrer");
  });

  it("omits target and rel for same-tab links", () => {
    const resolved = resolveLink({ kind: "external", url: "https://example.com" }, ctx);
    expect(resolved.target).toBeUndefined();
    expect(resolved.rel).toBeUndefined();
  });

  it("handles email, phone and asset kinds", () => {
    expect(resolveLink({ kind: "email", address: "a@b.com" }, ctx).href).toBe("mailto:a@b.com");
    expect(resolveLink({ kind: "phone", number: "+1 (555) 010-9999" }, ctx).href).toBe(
      "tel:+15550109999",
    );
    expect(resolveLink({ kind: "asset", assetId: "asset-1" }, ctx).href).toBe(
      "https://cdn.example/file.pdf",
    );
  });

  it("returns nothing for the none kind", () => {
    expect(resolveLink({ kind: "none" }, ctx)).toEqual({ href: undefined, broken: false });
    expect(resolveLink(undefined, ctx).href).toBeUndefined();
  });
});

describe("basePath for same-origin previews", () => {
  const previewCtx: LinkContext = {
    pagePaths: new Map([
      ["home", "/"],
      ["about", "/about"],
    ]),
    basePath: "/s/acme",
  };

  it("prefixes internal page links so they stay inside the preview", () => {
    expect(resolveLink({ kind: "page", pageId: "about" }, previewCtx).href).toBe("/s/acme/about");
    expect(resolveLink({ kind: "page", pageId: "home" }, previewCtx).href).toBe("/s/acme/");
  });

  it("keeps the hash after the prefix", () => {
    expect(resolveLink({ kind: "page", pageId: "about", hash: "team" }, previewCtx).href).toBe(
      "/s/acme/about#team",
    );
  });

  it("never rewrites links that leave the site", () => {
    expect(resolveLink({ kind: "external", url: "https://example.com" }, previewCtx).href).toBe(
      "https://example.com",
    );
    expect(resolveLink({ kind: "email", address: "a@b.com" }, previewCtx).href).toBe("mailto:a@b.com");
  });
});
