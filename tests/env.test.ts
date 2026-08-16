import { describe, expect, it } from "vitest";
import { checkEnv } from "@/lib/env";

/**
 * Configuration failures are the most common way a deploy goes wrong, and the
 * least informative when they surface as "Invalid URL" from inside a client
 * library on someone's first request.
 */

const valid = {
  DATABASE_URL: "postgresql://user:pass@db.example.com:5432/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_MARKETING_HOST: "yourbuilder.com",
  NEXT_PUBLIC_APP_HOST: "app.yourbuilder.com",
  NEXT_PUBLIC_SITES_HOST: "yourbuilder.site",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  UPSTASH_REDIS_REST_URL: "https://redis.example.com",
  UPSTASH_REDIS_REST_TOKEN: "token",
} as unknown as NodeJS.ProcessEnv;

const names = (env: NodeJS.ProcessEnv) => checkEnv(env).map((problem) => problem.variable);

describe("environment validation", () => {
  it("accepts a complete configuration", () => {
    expect(checkEnv(valid)).toEqual([]);
  });

  it("names every missing variable, not just the first", () => {
    const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ...rest } = valid;
    void DATABASE_URL;
    void NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const reported = names(rest as NodeJS.ProcessEnv);
    expect(reported).toContain("DATABASE_URL");
    expect(reported).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("rejects a Supabase URL that is not a URL", () => {
    expect(names({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "abc.supabase.co" })).toContain(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("treats the service-role key as optional, since the browser never has it", () => {
    const { SUPABASE_SERVICE_ROLE_KEY, ...rest } = valid;
    void SUPABASE_SERVICE_ROLE_KEY;
    expect(checkEnv(rest as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe("production-only warnings", () => {
  // The mode is part of the environment being checked, so production is just
  // another field rather than global state the test has to mutate.
  const production = (extra: Partial<NodeJS.ProcessEnv> = {}) =>
    checkEnv({ ...valid, NODE_ENV: "production", ...extra } as NodeJS.ProcessEnv);

  it("flags app and sites sharing a registrable domain", () => {
    // The entire reason published sites live elsewhere: sibling subdomains are
    // same-site for cookies, so customer content could reach the session.
    const problems = production({ NEXT_PUBLIC_SITES_HOST: "sites.yourbuilder.com" });

    const clash = problems.find((problem) => problem.variable === "NEXT_PUBLIC_SITES_HOST");
    expect(clash?.message).toMatch(/separate domain/);
  });

  it("accepts genuinely separate domains", () => {
    const problems = production();
    expect(problems.map((problem) => problem.variable)).not.toContain("NEXT_PUBLIC_SITES_HOST");
  });

  it("flags localhost left in a production build", () => {
    const problems = production({ NEXT_PUBLIC_APP_HOST: "app.localhost:3000" });
    expect(problems.map((problem) => problem.variable)).toContain("NEXT_PUBLIC_APP_HOST");
  });

  it("warns when rate limiting has no shared store", () => {
    const { UPSTASH_REDIS_REST_URL, ...rest } = valid;
    void UPSTASH_REDIS_REST_URL;

    // Per-instance counters mean the sign-in limits do not really exist across
    // serverless instances.
    const problems = checkEnv({ ...rest, NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(problems.map((problem) => problem.variable)).toContain("UPSTASH_REDIS_REST_URL");
  });

  it("stays quiet about all of this in development", () => {
    expect(checkEnv({ ...valid, NEXT_PUBLIC_SITES_HOST: "sites.yourbuilder.com" })).toEqual([]);
  });
});
