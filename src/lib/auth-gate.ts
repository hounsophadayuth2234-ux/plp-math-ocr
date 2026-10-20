import bcrypt from "bcryptjs";

// Session lifespan: 10 hours
export const SESSION_MAX_AGE_SECONDS = 10 * 60 * 60; // 36,000s

// Lockout duration: 30 minutes
export const LOCKOUT_DURATION_SECONDS = 30 * 60; // 1,800s
export const MAX_FAILED_ATTEMPTS = 3;

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-dyt_gate_session"
    : "dyt_gate_session";

export interface SessionPayload {
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Anonymizes client identifier by computing SHA-256 hash.
 * Ensures raw IP addresses are never stored in cache, state, or logs.
 */
export async function anonymizeIdentifier(rawIdentifier: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(rawIdentifier));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 32); // 32-character pseudonym
}

/**
 * Derives a CryptoKey for HMAC-SHA256 from the session secret.
 * Compatible with Edge and Node.js runtimes.
 */
async function getSigningKey(secretOverride?: string): Promise<CryptoKey> {
  const secret = secretOverride || process.env.APP_GATE_SESSION_SECRET || "";
  if (!secret || secret.length < 16) {
    throw new Error("APP_GATE_SESSION_SECRET must be configured with at least 16 characters.");
  }
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 */
export async function createSessionToken(secretOverride?: string): Promise<string> {
  const key = await getSigningKey(secretOverride);
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    iss: "dyt-cyber-gate",
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    jti: Math.random().toString(36).substring(2) + Date.now().toString(36),
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr, "utf-8").toString("base64url");

  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(payloadB64)
  );

  const signatureB64 = Buffer.from(signatureBuffer).toString("base64url");
  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies a session token signature and expiration in constant time.
 */
export async function verifySessionToken(
  token: string,
  secretOverride?: string
): Promise<{ valid: boolean; payload?: SessionPayload; error?: string }> {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Missing token" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid token structure" };
  }

  const [payloadB64, signatureB64] = parts;

  try {
    const key = await getSigningKey(secretOverride);
    const enc = new TextEncoder();
    const signatureBytes = Buffer.from(signatureB64, "base64url");

    const isSignatureValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      enc.encode(payloadB64)
    );

    if (!isSignatureValid) {
      return { valid: false, error: "Invalid cryptographic signature" };
    }

    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload: SessionPayload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: "Session expired" };
    }

    if (payload.iss !== "dyt-cyber-gate") {
      return { valid: false, error: "Untrusted issuer" };
    }

    return { valid: true, payload };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Verification error";
    return { valid: false, error: msg };
  }
}

/**
 * Constant-time password verification against environment bcrypt hash.
 */
export async function verifyPassword(submittedPassword: string): Promise<boolean> {
  const hash = process.env.APP_GATE_PASSWORD_HASH?.trim();
  if (!hash || !hash.startsWith("$2")) {
    console.error("[auth-gate] Critical: APP_GATE_PASSWORD_HASH is missing or not a valid bcrypt hash.");
    return false;
  }
  return bcrypt.compare(submittedPassword, hash);
}

// =========================================================================
// Distributed & In-Memory Rate Limiting & Lockout Engine
// =========================================================================

interface LocalAttemptState {
  count: number;
  lockedUntil: number;
  lastAttempt: number;
}

const localAttemptsMap = new Map<string, LocalAttemptState>();

/**
 * Periodically purge stale entries from local in-memory fallback.
 */
function cleanupLocalMap() {
  const now = Date.now();
  for (const [key, state] of localAttemptsMap.entries()) {
    if (state.lockedUntil > 0 && now >= state.lockedUntil) {
      localAttemptsMap.delete(key);
    } else if (state.lockedUntil === 0 && now - state.lastAttempt > 3600_000) {
      localAttemptsMap.delete(key);
    }
  }
}

/**
 * Checks whether an anonymized client key is currently locked out.
 */
export async function checkRateLimitAndLockout(
  hashedId: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && redisToken) {
    try {
      const lockRes = await fetch(`${redisUrl}/get/gate:lock:${hashedId}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        cache: "no-store",
      });
      if (lockRes.ok) {
        const lockData = await lockRes.json();
        if (lockData.result) {
          const ttlRes = await fetch(`${redisUrl}/ttl/gate:lock:${hashedId}`, {
            headers: { Authorization: `Bearer ${redisToken}` },
            cache: "no-store",
          });
          const ttlData = await ttlRes.json();
          const retryAfter = Math.max(1, typeof ttlData.result === "number" ? ttlData.result : LOCKOUT_DURATION_SECONDS);
          return { allowed: false, retryAfterSeconds: retryAfter };
        }
      }
    } catch (redisErr) {
      console.warn("[auth-gate] Redis connection warning, falling back to local tracker:", redisErr);
    }
  }

  // Local fallback
  cleanupLocalMap();
  const state = localAttemptsMap.get(hashedId);
  if (!state) return { allowed: true };

  const now = Date.now();
  if (state.lockedUntil > now) {
    const retryAfter = Math.ceil((state.lockedUntil - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  return { allowed: true };
}

/**
 * Records a failed attempt and triggers 30-minute lockout on the 3rd failure.
 */
export async function recordFailedAttempt(
  hashedId: string
): Promise<{ locked: boolean; retryAfterSeconds?: number; attempts: number }> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && redisToken) {
    try {
      // Increment attempt counter with 1 hour expiration
      const incrRes = await fetch(`${redisUrl}/incr/gate:attempts:${hashedId}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        cache: "no-store",
      });
      const incrData = await incrRes.json();
      const attempts = typeof incrData.result === "number" ? incrData.result : 1;

      if (attempts === 1) {
        // Set attempt expiry window
        await fetch(`${redisUrl}/expire/gate:attempts:${hashedId}/3600`, {
          headers: { Authorization: `Bearer ${redisToken}` },
          cache: "no-store",
        });
      }

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        // Activate 30-minute lock
        await fetch(`${redisUrl}/setex/gate:lock:${hashedId}/${LOCKOUT_DURATION_SECONDS}/1`, {
          headers: { Authorization: `Bearer ${redisToken}` },
          cache: "no-store",
        });
        return { locked: true, retryAfterSeconds: LOCKOUT_DURATION_SECONDS, attempts };
      }

      return { locked: false, attempts };
    } catch (redisErr) {
      console.warn("[auth-gate] Redis failed to record attempt, using local tracker:", redisErr);
    }
  }

  // Local fallback
  cleanupLocalMap();
  const now = Date.now();
  const state = localAttemptsMap.get(hashedId) || { count: 0, lockedUntil: 0, lastAttempt: now };
  state.count += 1;
  state.lastAttempt = now;

  if (state.count >= MAX_FAILED_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_DURATION_SECONDS * 1000;
    localAttemptsMap.set(hashedId, state);
    return { locked: true, retryAfterSeconds: LOCKOUT_DURATION_SECONDS, attempts: state.count };
  }

  localAttemptsMap.set(hashedId, state);
  return { locked: false, attempts: state.count };
}

/**
 * Resets failed attempts upon successful password verification.
 */
export async function clearFailedAttempts(hashedId: string): Promise<void> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && redisToken) {
    try {
      await fetch(`${redisUrl}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["DEL", `gate:attempts:${hashedId}`],
          ["DEL", `gate:lock:${hashedId}`],
        ]),
        cache: "no-store",
      });
    } catch {}
  }

  localAttemptsMap.delete(hashedId);
}

/**
 * Resets local in-memory map (used for test isolation).
 */
export function __resetLocalRateLimiter(): void {
  localAttemptsMap.clear();
}
