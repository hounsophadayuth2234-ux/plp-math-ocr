/**
 * Redis / KV Configuration Resolver & Validator
 *
 * Provides safe, validated retrieval of Upstash Redis / Vercel KV credentials.
 * Ensures malformed JSON strings or unparsed config payloads (e.g. {"v":"v2",...})
 * are rejected before runtime network calls, preventing "Invalid URL" exceptions.
 * Never logs secrets, tokens, or URLs with credentials.
 */

export interface ValidRedisConfig {
  url: string;
  token: string;
}

/**
 * Validates whether a candidate string is a well-formed http(s) URL.
 */
export function isValidHttpUrl(candidate?: string | null): boolean {
  if (!candidate || typeof candidate !== "string") return false;
  const trimmed = candidate.trim();
  // Reject JSON or ciphertext objects
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("\"")) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates whether a candidate token string is a usable, non-JSON token.
 */
export function isValidRedisToken(candidate?: string | null): boolean {
  if (!candidate || typeof candidate !== "string") return false;
  const trimmed = candidate.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("\"")) {
    return false;
  }
  return trimmed.length > 0;
}

/**
 * Resolves the active Redis credentials with safe fallback.
 * Prioritizes KV_REST_API_URL if valid, else falls back to UPSTASH_REDIS_REST_URL.
 */
export function getValidRedisConfig(): ValidRedisConfig | null {
  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();

  let resolvedUrl: string | null = null;
  if (isValidHttpUrl(kvUrl)) {
    resolvedUrl = kvUrl!;
  } else if (isValidHttpUrl(upstashUrl)) {
    resolvedUrl = upstashUrl!;
  }

  const kvToken = process.env.KV_REST_API_TOKEN?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  let resolvedToken: string | null = null;
  if (isValidRedisToken(kvToken)) {
    resolvedToken = kvToken!;
  } else if (isValidRedisToken(upstashToken)) {
    resolvedToken = upstashToken!;
  }

  if (resolvedUrl && resolvedToken) {
    return { url: resolvedUrl, token: resolvedToken };
  }

  return null;
}
