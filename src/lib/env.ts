import { z } from "zod";

/**
 * Environment validation.
 *
 * A missing variable should say which one, at boot, rather than surfacing as
 * "Invalid URL" from deep inside a client library on someone's first request.
 * Deployments go wrong at exactly this layer, and the failure is otherwise
 * uninformative.
 *
 * Only server code may import this. NEXT_PUBLIC_ values are inlined at build
 * time and are read directly where needed.
 */

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),

  NEXT_PUBLIC_MARKETING_HOST: z.string().min(1),
  NEXT_PUBLIC_APP_HOST: z.string().min(1),
  NEXT_PUBLIC_SITES_HOST: z.string().min(1),

  // Server-only. Absent in the browser bundle by design.
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export interface EnvProblem {
  variable: string;
  message: string;
}

/** Returns everything wrong at once, rather than failing on the first. */
export function checkEnv(source: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const result = schema.safeParse(source);
  if (result.success) return warnings(result.data, source.NODE_ENV);

  return [
    ...result.error.issues.map((issue) => ({
      variable: String(issue.path[0] ?? "env"),
      message: issue.message,
    })),
  ];
}

/**
 * Configuration that is valid but will misbehave in production.
 *
 * These are reported rather than thrown: a preview deployment on default
 * hosts is legitimate, and refusing to boot over it would be worse than
 * saying so.
 *
 * The mode comes from the environment object being checked rather than from
 * the ambient process, which keeps this a pure function of its input.
 */
function warnings(env: Env, mode: string | undefined): EnvProblem[] {
  const problems: EnvProblem[] = [];
  if (mode !== "production") return problems;

  if (env.NEXT_PUBLIC_APP_HOST.includes("localhost")) {
    problems.push({
      variable: "NEXT_PUBLIC_APP_HOST",
      message: "still points at localhost in a production build",
    });
  }

  // The whole reason published sites live somewhere else: sibling subdomains
  // are same-site for cookies, so a stored XSS on customer content could
  // reach the app's session cookie.
  const appDomain = registrableDomain(env.NEXT_PUBLIC_APP_HOST);
  const sitesDomain = registrableDomain(env.NEXT_PUBLIC_SITES_HOST);

  if (appDomain && sitesDomain && appDomain === sitesDomain) {
    problems.push({
      variable: "NEXT_PUBLIC_SITES_HOST",
      message: `shares the registrable domain "${appDomain}" with the app — customer content must be served from a separate domain`,
    });
  }

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    problems.push({
      variable: "UPSTASH_REDIS_REST_URL",
      message:
        "not set — rate limiting falls back to per-instance memory, which does not hold across serverless instances",
    });
  }

  return problems;
}

/** Rough last-two-labels heuristic. Good enough for a configuration warning. */
function registrableDomain(host: string): string | null {
  const labels = host.split(":")[0]!.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  return labels.slice(-2).join(".");
}

/**
 * Throws on anything that would break the app.
 *
 * Called from instrumentation.ts, so a misconfigured deploy fails at boot
 * with a list of what to fix.
 */
export function assertEnv(): void {
  const problems = checkEnv();
  if (problems.length === 0) return;

  const fatal = problems.filter((problem) => !problem.message.includes("not set —"));
  const lines = problems.map((problem) => `  ${problem.variable}: ${problem.message}`).join("\n");

  if (fatal.length > 0) {
    throw new Error(`Environment is not usable:\n${lines}\n\nSee .env.example.`);
  }
  console.warn(`[env] configuration warnings:\n${lines}`);
}
