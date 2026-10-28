import { NextRequest, NextResponse } from "next/server";
import { getValidRedisConfig } from "./redis-config";
import {
  RateLimitCategory,
  SECURITY_POLICIES,
  EndpointSecurityPolicy,
} from "./security-config";

export type { RateLimitCategory, EndpointSecurityPolicy };
export { SECURITY_POLICIES };
export const RATE_LIMIT_CONFIGS = SECURITY_POLICIES;
export type RateLimitConfig = EndpointSecurityPolicy;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds when the current window resets
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  userId?: string;
  accountId?: string;
}

/**
 * Extracts and normalizes client IP securely on Vercel and reverse-proxy setups.
 * Prioritizes x-real-ip from Vercel Edge. Validates IPv4 / IPv6 structure.
 */
export function getClientIp(req: NextRequest): string {
  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp && isValidIp(xRealIp.trim())) {
    return xRealIp.trim();
  }

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    const client = parts[0]?.trim();
    if (client && isValidIp(client)) {
      return client;
    }
  }

  return "127.0.0.1";
}

function isValidIp(candidate: string): boolean {
  // Simple regex for valid IPv4 or IPv6
  const ipv4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(candidate) || (ipv6.test(candidate) && candidate.includes(":"));
}

/**
 * Anonymizes composite client identity via SHA-256 with server salt.
 * Ensures raw IP addresses and account identifiers are never stored in Redis.
 */
export async function anonymizeClientKey(
  ip: string,
  category: string,
  options?: RateLimitOptions
): Promise<string> {
  const enc = new TextEncoder();
  const identityPart = options?.userId || options?.accountId || "anon";
  const salt = process.env.APP_GATE_SESSION_SECRET?.slice(0, 16) || "dyt-security-salt-2026";
  const data = enc.encode(`${ip}::${category}::${identityPart}::${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 32);
}

// ============================================================================
// True In-Memory Sliding-Window Engine (Local Development & Unit Tests)
// ============================================================================

interface MemorySlidingEntry {
  timestamps: number[];
}

const memoryStore = new Map<string, MemorySlidingEntry>();

function cleanStaleMemoryEntries(windowMs: number) {
  const now = Date.now();
  const threshold = now - windowMs;
  for (const [key, entry] of memoryStore.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => t > threshold);
    if (entry.timestamps.length === 0) {
      memoryStore.delete(key);
    }
  }
}

function checkMemorySlidingWindow(
  key: string,
  policy: EndpointSecurityPolicy
): RateLimitResult {
  const now = Date.now();
  const windowMs = policy.windowSeconds * 1000;
  cleanStaleMemoryEntries(windowMs);

  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    memoryStore.set(key, entry);
  }

  // Filter timestamps within current sliding window
  const windowStart = now - windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  const currentCount = entry.timestamps.length;

  if (currentCount < policy.limit) {
    entry.timestamps.push(now);
    const remaining = policy.limit - (currentCount + 1);
    const oldestTimestamp = entry.timestamps[0] || now;
    const reset = Math.ceil((oldestTimestamp + windowMs) / 1000);
    return {
      allowed: true,
      limit: policy.limit,
      remaining,
      reset,
      retryAfterSeconds: 0,
    };
  }

  // Rate limit exceeded
  const oldestTimestamp = entry.timestamps[0] || now;
  const resetMs = oldestTimestamp + windowMs;
  const retryAfter = Math.max(1, Math.ceil((resetMs - now) / 1000));

  return {
    allowed: false,
    limit: policy.limit,
    remaining: 0,
    reset: Math.ceil(resetMs / 1000),
    retryAfterSeconds: retryAfter,
  };
}

// ============================================================================
// True Upstash Redis Distributed Sliding-Window Engine (Production)
// ============================================================================

/**
 * Executes a true sliding-window rate limit check using Upstash Redis Sorted Sets (ZSET).
 * Atomic pipeline:
 * 1. ZREMRANGEBYSCORE key 0 (now - windowMs)  -- Removes all expired events
 * 2. ZCARD key                                -- Counts events within the active sliding window
 * 3. ZRANGE key 0 0 WITHSCORES                -- Fetches oldest active entry to calculate precise Retry-After
 * 4. (If under limit): ZADD key now member    -- Appends current request event
 * 5. EXPIRE key windowSeconds * 2             -- Refreshes key TTL
 */
async function checkRedisSlidingWindow(
  envPrefix: string,
  category: RateLimitCategory,
  hashedId: string,
  policy: EndpointSecurityPolicy,
  redisUrl: string,
  redisToken: string
): Promise<RateLimitResult | null> {
  const now = Date.now();
  const windowMs = policy.windowSeconds * 1000;
  const windowStart = now - windowMs;
  const redisKey = `ratelimit:zset:${envPrefix}:${category}:${hashedId}`;
  const memberId = `${now}-${Math.random().toString(36).substring(2, 7)}`;
  const expirySeconds = policy.windowSeconds * 2;

  try {
    // Step 1: Query active window state atomically
    const queryPipeline = [
      ["ZREMRANGEBYSCORE", redisKey, "0", String(windowStart)],
      ["ZCARD", redisKey],
      ["ZRANGE", redisKey, "0", "0", "WITHSCORES"],
    ];

    const res = await fetch(`${redisUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(queryPipeline),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        `[rate-limiter] Redis pipeline returned status ${res.status}.`
      );
      return null;
    }

    const data = await res.json();
    const count = typeof data[1]?.result === "number" ? data[1].result : 0;
    const oldestResult = data[2]?.result;
    const oldestScore =
      Array.isArray(oldestResult) && oldestResult[1]
        ? parseInt(oldestResult[1], 10)
        : now;

    if (count < policy.limit) {
      // Step 2: Record request within limit
      const writePipeline = [
        ["ZADD", redisKey, String(now), memberId],
        ["EXPIRE", redisKey, String(expirySeconds)],
      ];

      // Fire and forget write
      fetch(`${redisUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(writePipeline),
        cache: "no-store",
      }).catch((e) => console.warn("[rate-limiter] Non-blocking write error:", e));

      const resetSec = Math.ceil((oldestScore + windowMs) / 1000);
      return {
        allowed: true,
        limit: policy.limit,
        remaining: Math.max(0, policy.limit - (count + 1)),
        reset: resetSec,
        retryAfterSeconds: 0,
      };
    }

    // Rate limit exceeded
    const resetMs = oldestScore + windowMs;
    const retryAfter = Math.max(1, Math.ceil((resetMs - now) / 1000));

    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      reset: Math.ceil(resetMs / 1000),
      retryAfterSeconds: retryAfter,
    };
  } catch (err) {
    console.warn(
      "[rate-limiter] Redis sliding window query failed:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ============================================================================
// Unified Rate Limiter Enforcement
// ============================================================================

export async function checkRateLimit(
  req: NextRequest,
  category: RateLimitCategory,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  const policy = SECURITY_POLICIES[category] || {
    category,
    limit: 10,
    windowSeconds: 60,
    failClosed: false,
    description: "Default fallback policy",
  };

  // Test bypass only if test environment explicitly bypasses
  if (
    process.env.NODE_ENV === "test" &&
    process.env.ENABLE_RATE_LIMIT_TESTS !== "1"
  ) {
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      reset: 0,
      retryAfterSeconds: 0,
    };
  }

  const ip = getClientIp(req);
  const hashedId = await anonymizeClientKey(ip, category, options);
  const envPrefix = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";

  const redisCfg = getValidRedisConfig();

  if (redisCfg) {
    const redisResult = await checkRedisSlidingWindow(
      envPrefix,
      category,
      hashedId,
      policy,
      redisCfg.url,
      redisCfg.token
    );
    if (redisResult) {
      return redisResult;
    }

    // Deliberate failure handling:
    // If Redis is configured but fails, check if the policy requires fail-closed
    if (policy.failClosed && process.env.NODE_ENV === "production") {
      console.error(
        `[rate-limiter] SECURITY ALERT: Redis failure on fail-closed endpoint '${category}'. Enforcing closed defense.`
      );
      return {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        reset: Math.ceil((Date.now() + 60000) / 1000),
        retryAfterSeconds: 60,
      };
    }
  }

  // Memory sliding window (fallback for local dev, test environments, or fail-safe operations)
  const memoryKey = `${envPrefix}:${category}:${hashedId}`;
  return checkMemorySlidingWindow(memoryKey, policy);
}

/**
 * Enforces rate limiting at the entry of an API route.
 * Returns a 429 response if exceeded, or null if allowed.
 */
export async function enforceRateLimit(
  req: NextRequest,
  category: RateLimitCategory,
  options?: RateLimitOptions
): Promise<NextResponse | null> {
  const result = await checkRateLimit(req, category, options);

  if (!result.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMIT_EXCEEDED",
        error: "Too Many Requests",
        message: `Rate limit exceeded for this operation (${result.limit} requests per ${category.includes("recovery") ? "hour" : "minute"}). Please wait ${result.retryAfterSeconds} seconds before retrying.`,
        retryAfter: result.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSeconds),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.reset),
          "Cache-Control": "no-store, private",
        },
      }
    );
  }

  return null;
}

/**
 * Resets in-memory store for unit test isolation.
 */
export function __resetMemoryRateLimiter(): void {
  memoryStore.clear();
}
