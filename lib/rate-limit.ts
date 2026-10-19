// Rate-limit abstraction for abuse-sensitive endpoints (login, registration,
// checkout creation, email verification, sensitive mutations).
//
// PRODUCTION: backed by Upstash Redis (@upstash/ratelimit) when
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set — a real
// distributed limiter that works correctly across Vercel's serverless
// function instances, unlike a per-process in-memory counter.
//
// DEVELOPMENT/TEST ONLY: falls back to an in-memory limiter when Redis
// isn't configured. In production, missing Redis config is a startup
// configuration error, not a silent degrade — see requireRateLimiter()
// below. A rate limiter that quietly stops limiting under load is worse
// than one that fails loudly before ever accepting traffic.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Limiter = { allowed: boolean; retryAfterMs?: number };

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(key: string, limit: number, windowMs: number): Limiter {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { allowed: true };
}

let redisClient: Redis | null = null;
function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redisClient) redisClient = new Redis({ url, token });
  return redisClient;
}

// Called once per (scope, limit, windowMs) combination — cheap to
// construct, but cached per scope so repeated calls in the same process
// reuse the same Ratelimit instance rather than re-instantiating per request.
const limiterCache = new Map<string, Ratelimit>();
function getUpstashLimiter(scope: string, limit: number, windowMs: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const cacheKey = `${scope}:${limit}:${windowMs}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: `jgp-ratelimit:${scope}`
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Production fails closed: if Redis isn't configured in a production
 * deployment, this throws rather than silently limiting per-process
 * (which is not meaningfully "rate limited" at all across multiple
 * serverless instances). Call this at the top of any route that MUST be
 * rate-limited in production before falling through to checkRateLimit().
 */
export function assertRateLimiterConfigured(): void {
  if (process.env.NODE_ENV === "production" && !getRedis()) {
    throw new Error(
      "Rate limiting is not configured for production: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. " +
        "Refusing to silently fall back to an in-memory limiter, which does not work correctly across serverless instances."
    );
  }
}

export async function checkRateLimit(key: string, limit: number, windowMs: number, scope = "default"): Promise<Limiter> {
  const upstash = getUpstashLimiter(scope, limit, windowMs);
  if (upstash) {
    const result = await upstash.limit(key);
    return {
      allowed: result.success,
      retryAfterMs: result.success ? undefined : Math.max(0, result.reset - Date.now())
    };
  }
  // No Redis configured — only reachable outside production, since
  // assertRateLimiterConfigured() throws first in production callers.
  return memoryRateLimit(`${scope}:${key}`, limit, windowMs);
}

export function clientKeyFrom(req: Request, scope: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return `${scope}:${ip}`;
}
