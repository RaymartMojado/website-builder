import { RateLimitError } from "@/lib/errors";

/**
 * Rate limiting — OWASP A07.
 *
 * Two backends behind one interface. In-memory is the default and is correct
 * for a single dev process; it is NOT correct across serverless instances,
 * where each instance keeps its own counters. Set UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN in any environment that runs more than one process.
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Backend {
  hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

// --- in-memory ------------------------------------------------------------

const buckets = new Map<string, { count: number; resetAt: number }>();

const memoryBackend: Backend = {
  async hit(key, limit, windowSeconds) {
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { success: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }

    existing.count += 1;
    const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);

    if (existing.count > limit) {
      return { success: false, remaining: 0, retryAfterSeconds };
    }
    return { success: true, remaining: limit - existing.count, retryAfterSeconds };
  },

  async reset(key) {
    buckets.delete(key);
  },
};

// Unbounded growth would be a memory leak on a long-lived dev server.
if (typeof setInterval === "function") {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, 60_000);
  // Don't hold the process open for the sweeper.
  (sweep as unknown as { unref?: () => void }).unref?.();
}

// --- upstash --------------------------------------------------------------

function upstashBackend(url: string, token: string): Backend {
  return {
    async hit(key, limit, windowSeconds) {
      // A fixed window implemented with INCR + EXPIRE. Pipelined so it costs
      // one round trip.
      const response = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, String(windowSeconds), "NX"],
          ["TTL", key],
        ]),
        cache: "no-store",
      });

      if (!response.ok) {
        // Fail open: a rate limiter outage must not take down sign-in. The
        // in-memory backend still provides a floor of protection.
        console.error("[rate-limit] upstash request failed", response.status);
        return memoryBackend.hit(key, limit, windowSeconds);
      }

      const results = (await response.json()) as Array<{ result: number }>;
      const count = results[0]?.result ?? 1;
      const ttl = results[2]?.result ?? windowSeconds;
      const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;

      if (count > limit) return { success: false, remaining: 0, retryAfterSeconds };
      return { success: true, remaining: limit - count, retryAfterSeconds };
    },

    async reset(key) {
      await fetch(`${url}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => {
        /* clearing a counter is best-effort; it expires on its own */
      });
      await memoryBackend.reset(key);
    },
  };
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const backend: Backend = url && token ? upstashBackend(url, token) : memoryBackend;

export const usingDistributedBackend = Boolean(url && token);

// --- policies -------------------------------------------------------------

/**
 * Named policies rather than magic numbers at call sites, so the limits are
 * reviewable in one place.
 */
export const POLICIES = {
  /**
   * FAILED sign-in attempts, per IP and separately per account.
   *
   * Only failures count — `clearRateLimit` wipes the counters on a successful
   * sign-in. Charging successes too meant a legitimate person signing in from
   * a few tabs could lock themselves out, and it bought nothing: an attacker
   * who guesses correctly has already succeeded.
   *
   * Ten rather than five because five is inside the range of ordinary
   * mistyping, and a 15-minute lockout for that is a support ticket.
   */
  auth: { limit: 10, windowSeconds: 15 * 60 },
  /** Account creation. */
  signup: { limit: 3, windowSeconds: 60 * 60 },
  /** Site create/rename/delete and similar dashboard mutations. */
  mutation: { limit: 30, windowSeconds: 60 },
  /** Editor autosave — high frequency by design, but not unbounded. */
  autosave: { limit: 120, windowSeconds: 60 },
} as const;

export type PolicyName = keyof typeof POLICIES;

export async function checkRateLimit(
  policy: PolicyName,
  identifier: string,
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = POLICIES[policy];
  return backend.hit(`rl:${policy}:${identifier}`, limit, windowSeconds);
}

/**
 * Clears a counter, called after a successful sign-in.
 *
 * The auth policy exists to slow down guessing, and a correct password is not
 * a guess. Leaving the counter to decay meant someone who signed in a few
 * times legitimately — several devices, a couple of tabs — could find
 * themselves locked out for fifteen minutes having done nothing wrong.
 */
export async function clearRateLimit(policy: PolicyName, identifier: string): Promise<void> {
  await backend.reset(`rl:${policy}:${identifier}`);
}

/** Throws RateLimitError instead of returning a result. */
export async function enforceRateLimit(policy: PolicyName, identifier: string): Promise<void> {
  const result = await checkRateLimit(policy, identifier);
  if (!result.success) {
    throw new RateLimitError("Too many requests — try again shortly", result.retryAfterSeconds);
  }
}

/** Test seam. */
export function __resetRateLimitStore() {
  buckets.clear();
}
