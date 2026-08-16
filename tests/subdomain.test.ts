import { describe, expect, it } from "vitest";
import {
  RESERVED_SUBDOMAINS,
  publishedUrl,
  sitesHostIsRoutable,
  suggestSubdomain,
  validateSubdomain,
} from "@/lib/sites/subdomain";

describe("subdomain validation", () => {
  it("accepts ordinary names", () => {
    for (const value of ["acme", "acme-coffee", "a1b2c3", "my-site-2026"]) {
      expect(validateSubdomain(value)).toEqual({ ok: true, value });
    }
  });

  it("normalises case and surrounding whitespace", () => {
    expect(validateSubdomain("  AcmeCoffee  ")).toEqual({ ok: true, value: "acmecoffee" });
  });

  it("rejects reserved names", () => {
    for (const value of ["www", "app", "api", "admin", "stripe", "support", "login"]) {
      expect(validateSubdomain(value).ok).toBe(false);
    }
    // The list is the defence, so guard against it being emptied by accident.
    expect(RESERVED_SUBDOMAINS.size).toBeGreaterThan(50);
  });

  it("rejects malformed labels", () => {
    const bad = [
      "ab", // too short
      "-lead", // leading hyphen
      "trail-", // trailing hyphen
      "has--double", // consecutive hyphens
      "has.dot", // would create a nested label
      "has_underscore",
      "has space",
      "xn--fake", // punycode-lookalike homograph risk
      "a".repeat(64), // over the DNS label limit
      "ünïcode",
    ];
    for (const value of bad) {
      expect(validateSubdomain(value).ok, `expected ${value} to be rejected`).toBe(false);
    }
  });

  it("returns an explanation, not just a boolean", () => {
    const result = validateSubdomain("www");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/reserved/i);
  });
});

describe("subdomain suggestion", () => {
  it("derives a usable slug from a site name", () => {
    expect(suggestSubdomain("Acme Coffee")).toBe("acme-coffee");
    expect(suggestSubdomain("  Bob's Burgers!  ")).toBe("bob-s-burgers");
    // NFKD decomposition strips the accent rather than the letter.
    expect(suggestSubdomain("Café Noir")).toBe("cafe-noir");
  });

  it("never emits a leading or trailing hyphen", () => {
    for (const name of ["!!!Hello!!!", "   spaced   ", "---"]) {
      const slug = suggestSubdomain(name);
      expect(slug.startsWith("-")).toBe(false);
      expect(slug.endsWith("-")).toBe(false);
    }
  });
});

describe("published URLs when there is no sites domain", () => {
  it("treats a parked or empty sites host as unable to serve sites", () => {
    expect(sitesHostIsRoutable("sites.invalid")).toBe(false);
    expect(sitesHostIsRoutable("")).toBe(false);
    expect(sitesHostIsRoutable("sites.localhost:3000")).toBe(true);
    expect(sitesHostIsRoutable("mybuilder.site")).toBe(true);
  });

  it("falls back to a same-origin path so a site is previewable at all", () => {
    expect(publishedUrl("acme", "/", "sites.invalid")).toBe("/s/acme");
    expect(publishedUrl("acme", "/about", "sites.invalid")).toBe("/s/acme/about");
  });

  it("prefers the real subdomain as soon as one is configured", () => {
    expect(publishedUrl("acme", "/", "mybuilder.site")).toBe("https://acme.mybuilder.site");
    expect(publishedUrl("acme", "/about", "sites.localhost:3000")).toBe(
      "http://acme.sites.localhost:3000/about",
    );
  });
});
