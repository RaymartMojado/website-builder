import { describe, expect, it } from "vitest";
import { routeHost } from "@/proxy";

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
