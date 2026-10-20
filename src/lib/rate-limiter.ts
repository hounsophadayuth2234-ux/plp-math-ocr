import { NextRequest, NextResponse } from "next/server";

export type RateLimitCategory =
  | "math_ocr"
  | "remove_bg"
  | "upscale"
  | "generate_image"
  | "web_scraper"
  | "settings"
  | "auth_gate";

export interface RateLimitConfig {
  limit: number; // Maximum allowed requests
  windowSeconds: number; // Window size in seconds
}

export const RATE_LIMIT_CONFIGS: Record<RateLimitCategory, RateLimitConfig> = {
  math_ocr: { limit: 10, windowSeconds: 60 },
  remove_bg: { limit: 5, windowSeconds: 60 },
  upscale: { limit: 3, windowSeconds: 60 },
  generate_image: { limit: 3, windowSeconds: 60 },
  web_scraper: { limit: 20, windowSeconds: 60 },
  settings: { limit: 60, windowSeconds: 60 },
  auth_gate: { limit: 5, windowSeconds: 60 },
};

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  retryAfterSeconds: number;
}

/**
 * Extracts client IP securely on Vercel and reverse-proxy setups.
 * Prioritizes x-real-ip provided by Vercel Edge infrastructure.
 */
export function getClientIp(req: NextRequest): string {
  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp && xRealIp.trim()) {
    return xRealIp.trim();
  }

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    const client = parts[0]?.trim();
    if (client) return client;
  }

  return "127.0.0.1";
}

/**
 * Anonymizes client identity via SHA-256 so raw IP addresses are never
 * persisted in Redis keys, in-memory state, or error telemetry.
 */
export async function anonymizeClientKey(
  ip: string,
  category: string
): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${ip}::${category}::dyt-salt-2026`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 32);
}

// ============================================================================
// In-Memory Fallback Engine (for Local Development & Vitest)
// ============================================================================

interface MemoryEntry {
  count: number;
  resetAtMs: number;
}

const memoryStore = new Map<string, MemoryEntry>();

function cleanStaleMemoryEntries() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (now >= entry.resetAtMs) {
      memoryStore.delete(key);
    }
  }
}

/**
 * Checks in-memory sliding window for testing and local dev.
 */
function checkMemoryRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanStaleMemoryEntries();
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const entry = memoryStore.get(key);

  if (!entry || now >= entry.resetAtMs) {
    const resetAtMs = now + windowMs;
    memoryStore.set(key, { count: 1, resetAtMs });
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit - 1,
      reset: Math.ceil(resetAtMs / 1000),
      retryAfterSeconds: 0,
    };
  }

  entry.count += 1;
  const remaining = Math.max(0, config.limit - entry.count);
  const resetSec = Math.ceil(entry.resetAtMs / 1000);
  const retryAfter = Math.max(1, Math.ceil((entry.resetAtMs - now) / 1000));

  return {
    allowed: entry.count <= config.limit,
    limit: config.limit,
    remaining,
    reset: resetSec,
    retryAfterSeconds: entry.count <= config.limit ? 0 : retryAfter,
  };
}

// ============================================================================
// Upstash Redis Distributed Engine (Production & Multi-Instance Serverless)
// ============================================================================

/**
 * Checks rate limit against Upstash Redis REST API.
 * Uses atomic fixed-window counter with environment-separated namespace.
 */
async function checkRedisRateLimit(
  envPrefix: string,
  category: RateLimitCategory,
  hashedId: string,
  config: RateLimitConfig,
  redisUrl: string,
  redisToken: string
): Promise<RateLimitResult | null> {
  const now = Date.now();
  const windowSec = config.windowSeconds;
  const currentWindowIndex = Math.floor(now / (windowSec * 1000));
  const redisKey = `ratelimit:${envPrefix}:${category}:${hashedId}:${currentWindowIndex}`;
  const windowExpirySec = windowSec * 2; // Expire after 2 windows to allow cleanup

  try {
    // Pipeline INCR and EXPIRE to ensure atomicity
    const pipelinePayload = [
      ["INCR", redisKey],
      ["EXPIRE", redisKey, String(windowExpirySec)],
    ];

    const res = await fetch(`${redisUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipelinePayload),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        `[rate-limiter] Redis pipeline returned status ${res.status}. Falling back to memory store.`
      );
      return null;
    }

    const data = await res.json();
    const count = typeof data[0]?.result === "number" ? data[0].result : 1;

    const windowEndMs = (currentWindowIndex + 1) * windowSec * 1000;
    const resetSec = Math.ceil(windowEndMs / 1000);
    const retryAfter = Math.max(1, Math.ceil((windowEndMs - now) / 1000));
    const remaining = Math.max(0, config.limit - count);

    return {
      allowed: count <= config.limit,
      limit: config.limit,
      remaining,
      reset: resetSec,
      retryAfterSeconds: count <= config.limit ? 0 : retryAfter,
    };
  } catch (err) {
    console.warn(
      "[rate-limiter] Redis connection failed, falling back to memory store:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ============================================================================
// Unified Rate Limiter Check & Enforcement
// ============================================================================

/**
 * Core rate limit checker. Automatically chooses Upstash Redis if configured,
 * or falls back to in-memory store for local testing.
 */
export async function checkRateLimit(
  req: NextRequest,
  category: RateLimitCategory
): Promise<RateLimitResult> {
  const config = RATE_LIMIT_CONFIGS[category];

  // In test environments, bypass rate limiting unless explicitly testing the rate limiter
  if (
    process.env.NODE_ENV === "test" &&
    process.env.ENABLE_RATE_LIMIT_TESTS !== "1"
  ) {
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit,
      reset: 0,
      retryAfterSeconds: 0,
    };
  }

  const ip = getClientIp(req);
  const hashedId = await anonymizeClientKey(ip, category);

  // Environment isolation: Prevents Preview deployments from contaminating Production quotas
  const envPrefix =
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development";

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && redisToken) {
    const redisResult = await checkRedisRateLimit(
      envPrefix,
      category,
      hashedId,
      config,
      redisUrl,
      redisToken
    );
    if (redisResult) {
      return redisResult;
    }
  }

  // Memory fallback (local development / testing / redis outage)
  const memoryKey = `${envPrefix}:${category}:${hashedId}`;
  return checkMemoryRateLimit(memoryKey, config);
}

/**
 * Helper to enforce rate limiting at the top of an API route handler.
 * Returns a 429 JSON response if rate limit is exceeded, or null if allowed.
 */
export async function enforceRateLimit(
  req: NextRequest,
  category: RateLimitCategory
): Promise<NextResponse | null> {
  const result = await checkRateLimit(req, category);

  if (!result.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMIT_EXCEEDED",
        error: "Too Many Requests",
        message: `Rate limit exceeded for this operation (${result.limit} requests per minute). Please wait ${result.retryAfterSeconds} seconds before retrying.`,
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
 * Appends standard rate limit headers to a successful NextResponse.
 */
export function attachRateLimitHeaders(
  res: NextResponse,
  result: RateLimitResult
): NextResponse {
  res.headers.set("X-RateLimit-Limit", String(result.limit));
  res.headers.set("X-RateLimit-Remaining", String(result.remaining));
  res.headers.set("X-RateLimit-Reset", String(result.reset));
  return res;
}

/**
 * Resets memory store for test isolation.
 */
export function __resetMemoryRateLimiter(): void {
  memoryStore.clear();
}
