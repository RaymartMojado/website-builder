import { describe, expect, it } from "vitest";
import { routeHost, routePreviewPath } from "@/proxy";

/**
 * Host routing is a security boundary, not just ergonomics: it decides which
 * CSP a response gets and whether a request can reach the app surface at all.
 */
describe("host routing", () => {
  it("routes the app host to the app surface", () => {
    expect(routeHost("app.localhost:3000")).toEqual({ surface: "app" });
    expect(routeHost("APP.LOCALHOST:3000")).toEqual({ surface: "app" });
  });

  it("routes the marketing host to marketing", () => {
    expect(routeHost("localhost:3000")).toEqual({ surface: "marketing" });
  });

  it("extracts the slug from a published host", () => {
    expect(routeHost("acme.sites.localhost:3000")).toEqual({
      surface: "published",
      slug: "acme",
    });
  });

  it("rejects nested labels under the sites domain", () => {
    // evil.acme.sites.localhost must not resolve to a site — otherwise a
    // customer could mint hostnames underneath another customer's name.
    expect(routeHost("evil.acme.sites.localhost:3000").surface).toBe("marketing");
  });

  it("does not treat the bare sites host as a site", () => {
    expect(routeHost("sites.localhost:3000").surface).toBe("marketing");
  });

  it("falls back to marketing for unknown and missing hosts", () => {
    expect(routeHost("something-else.example.com").surface).toBe("marketing");
    expect(routeHost(null).surface).toBe("marketing");
    expect(routeHost("").surface).toBe("marketing");
  });

  it("never routes an unknown host to the app surface", () => {
    const hosts = [
      "attacker.com",
      "app.localhost.attacker.com",
      "notapp.localhost",
      "sites.localhost",
      "..",
    ];
    for (const host of hosts) {
      expect(routeHost(host).surface, `${host} must not reach the app`).not.toBe("app");
    }
  });
});

/**
 * With no domain of your own there is nowhere to host {slug}.example.com, so
 * previews fall back to a path on the app origin. That trade gives up the
 * cookie isolation the separate domain exists to provide, so it must switch
 * itself off the moment a real sites host is configured.
 */
describe("same-origin preview paths", () => {
  it("stays off while a real sites host can serve sites", () => {
    expect(routePreviewPath("/s/acme", "sites.localhost:3000")).toBeNull();
    expect(routePreviewPath("/s/acme", "mybuilder.site")).toBeNull();
  });

  it("maps /s/{slug} onto the published surface when there is no sites domain", () => {
    expect(routePreviewPath("/s/acme", "sites.invalid")).toEqual({ slug: "acme", path: "/" });
    expect(routePreviewPath("/s/acme/about", "sites.invalid")).toEqual({
      slug: "acme",
      path: "/about",
    });
    expect(routePreviewPath("/s/acme/blog/hello", "sites.invalid")).toEqual({
      slug: "acme",
      path: "/blog/hello",
    });
  });

  it("leaves ordinary app paths alone", () => {
    for (const path of ["/", "/s", "/s/", "/dashboard", "/signin", "/site/acme"]) {
      expect(routePreviewPath(path, "sites.invalid")).toBeNull();
    }
  });
});
