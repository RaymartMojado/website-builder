import { beforeEach, describe, expect, it } from "vitest";
import {
  POLICIES,
  __resetRateLimitStore,
  checkRateLimit,
  enforceRateLimit,
} from "@/lib/security/rate-limit";
import { RateLimitError } from "@/lib/errors";

beforeEach(() => {
  __resetRateLimitStore();
});

describe("rate limiter", () => {
  it("allows up to the policy limit and blocks after", async () => {
    const { limit } = POLICIES.auth;

    for (let attempt = 1; attempt <= limit; attempt++) {
      const result = await checkRateLimit("auth", "ip:203.0.113.1");
      expect(result.success, `attempt ${attempt} should be allowed`).toBe(true);
    }

    const blocked = await checkRateLimit("auth", "ip:203.0.113.1");
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps identifiers independent", async () => {
    for (let i = 0; i < POLICIES.auth.limit; i++) {
      await checkRateLimit("auth", "ip:203.0.113.1");
    }

    // A different IP must be unaffected by the first one's exhaustion.
    await expect(checkRateLimit("auth", "ip:203.0.113.9")).resolves.toMatchObject({
      success: true,
    });
  });

  it("keeps policies independent", async () => {
    for (let i = 0; i < POLICIES.auth.limit; i++) {
      await checkRateLimit("auth", "shared-id");
    }

    // Exhausting sign-in attempts must not lock the user out of saving work.
    await expect(checkRateLimit("autosave", "shared-id")).resolves.toMatchObject({
      success: true,
    });
  });

  it("enforceRateLimit throws RateLimitError with a retry hint", async () => {
    for (let i = 0; i < POLICIES.signup.limit; i++) {
      await enforceRateLimit("signup", "ip:198.51.100.7");
    }

    await expect(enforceRateLimit("signup", "ip:198.51.100.7")).rejects.toBeInstanceOf(
      RateLimitError,
    );

    let thrown: unknown;
    try {
      await enforceRateLimit("signup", "ip:198.51.100.7");
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBeInstanceOf(RateLimitError);
    const error = thrown as RateLimitError;
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
  });
});
