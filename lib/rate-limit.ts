// Rate-limit abstraction for abuse-sensitive endpoints (login, registration,
// public booking endpoint).
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
  // Upstash's own names, or the KV_* names the Vercel Marketplace
  // integration (Storage → Upstash for Redis) injects.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
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
      prefix: `bioground-ratelimit:${scope}`
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
      "Rate limiting is not configured for production: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or connect Upstash for Redis in Vercel Storage, which sets KV_REST_API_URL / KV_REST_API_TOKEN). " +
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

/**
 * Read-only check: is `key` already at its limit? Does not consume a token.
 * Used where only failures should count (staff sign-in): peek before the
 * attempt, consume with checkRateLimit() only when the attempt fails.
 */
export async function peekRateLimit(key: string, limit: number, windowMs: number, scope = "default"): Promise<Limiter> {
  const upstash = getUpstashLimiter(scope, limit, windowMs);
  if (upstash) {
    const { remaining, reset } = await upstash.getRemaining(key);
    return remaining > 0 ? { allowed: true } : { allowed: false, retryAfterMs: Math.max(0, reset - Date.now()) };
  }
  const bucket = memoryBuckets.get(`${scope}:${key}`);
  const now = Date.now();
  if (!bucket || bucket.resetAt <= now || bucket.count < limit) return { allowed: true };
  return { allowed: false, retryAfterMs: bucket.resetAt - now };
}

/** Clears the counter for `key` (e.g. after a successful sign-in). */
export async function resetRateLimit(key: string, limit: number, windowMs: number, scope = "default"): Promise<void> {
  const upstash = getUpstashLimiter(scope, limit, windowMs);
  if (upstash) {
    await upstash.resetUsedTokens(key);
    return;
  }
  memoryBuckets.delete(`${scope}:${key}`);
}

/**
 * Client IP for rate-limit keys. On Vercel, x-forwarded-for is set by the
 * platform (a client-supplied value is overwritten), first entry = client.
 */
export function clientIpFrom(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip")?.trim();
  return ip || "unknown";
}

export function clientKeyFrom(req: Request, scope: string): string {
  return `${scope}:${clientIpFrom(req)}`;
}
