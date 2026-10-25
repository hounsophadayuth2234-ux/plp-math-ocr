import crypto from "crypto";
import { getValidRedisConfig } from "./redis-config";
import {
  encryptManagedPassword,
  decryptManagedPassword,
} from "./managed-credential-vault";

export interface TelegramAuthPayload {
  id: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string | number;
  hash: string;
}

export interface TelegramValidationResult {
  valid: boolean;
  telegramId?: string;
  telegramUsername?: string;
  authDate?: number;
  error?: string;
}

/**
 * Computes deterministic HMAC-SHA256 lookup hash of a Telegram numeric ID.
 * Allows O(1) indexed lookup in Redis without storing the Telegram ID in plaintext.
 */
export function computeTelegramIdLookupHash(telegramId: string | number): string {
  const secretKey =
    process.env.SESSION_SECRET ||
    process.env.ENCRYPTION_KEY ||
    "dyt-plp-telegram-lookup-salt";
  return crypto
    .createHmac("sha256", secretKey)
    .update(String(telegramId).trim())
    .digest("hex");
}

/**
 * Encrypts Telegram numeric ID with AES-256-GCM for storage at rest.
 */
export function encryptTelegramId(telegramId: string | number): string {
  return encryptManagedPassword(String(telegramId).trim());
}

/**
 * Decrypts Telegram numeric ID from at-rest storage.
 */
export function decryptTelegramId(encrypted?: string | null): string | null {
  return decryptManagedPassword(encrypted);
}

/**
 * Validates a Telegram Login Widget authentication payload according to official Telegram specs:
 * 1. Remove hash
 * 2. Alphabetically sort data keys
 * 3. Construct data_check_string: "key1=val1\nkey2=val2"
 * 4. Compute secret_key = SHA256(bot_token)
 * 5. Compute HMAC_SHA256(data_check_string, secret_key)
 * 6. Compare with provided hash using crypto.timingSafeEqual
 * 7. Validate auth_date freshness (maximum 5 minutes / 300 seconds)
 */
export function verifyTelegramLoginSignature(
  data: Record<string, any>,
  botToken?: string,
  maxAgeSeconds: number = 300
): TelegramValidationResult {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.trim() === "") {
    return { valid: false, error: "Telegram Bot Token is not configured on server" };
  }

  const { hash, ...fields } = data || {};
  if (!hash || typeof hash !== "string") {
    return { valid: false, error: "Missing Telegram signature hash" };
  }

  if (!fields.id || !fields.auth_date) {
    return { valid: false, error: "Missing required Telegram authentication fields" };
  }

  // 1. Validate auth_date freshness
  const authTimestamp = Number(fields.auth_date);
  if (isNaN(authTimestamp) || authTimestamp <= 0) {
    return { valid: false, error: "Invalid auth_date" };
  }

  const currentSeconds = Math.floor(Date.now() / 1000);
  if (currentSeconds - authTimestamp > maxAgeSeconds) {
    return { valid: false, error: "Telegram login response has expired" };
  }
  if (authTimestamp - currentSeconds > 60) {
    return { valid: false, error: "Telegram auth_date is in the future" };
  }

  // 2. Build data_check_string
  const sortedKeys = Object.keys(fields).sort();
  const dataCheckString = sortedKeys
    .filter((k) => fields[k] !== undefined && fields[k] !== null)
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");

  // 3. Derive secret key: SHA256(bot_token)
  const secretKey = crypto.createHash("sha256").update(token).digest();

  // 4. Calculate HMAC-SHA256
  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // 5. Constant-time comparison
  const hashBuffer = Buffer.from(hash.toLowerCase(), "hex");
  const calculatedBuffer = Buffer.from(calculatedHash.toLowerCase(), "hex");

  if (
    hashBuffer.length !== calculatedBuffer.length ||
    !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)
  ) {
    return { valid: false, error: "Invalid Telegram cryptographic signature" };
  }

  return {
    valid: true,
    telegramId: String(fields.id).trim(),
    telegramUsername: fields.username ? String(fields.username).trim() : undefined,
    authDate: authTimestamp,
  };
}

// ============================================================================
// Replay Protection & Challenge Token Storage
// ============================================================================

const localUsedHashes = new Map<string, number>(); // hash -> expiresAt
const localActiveChallenges = new Map<
  string,
  { userId: string; csrfHash: string; expiresAt: number }
>(); // challengeNonce -> data

function getRedisConfig(): { url: string; token: string } | null {
  return getValidRedisConfig();
}

async function redisCommand<T = any>(command: any[]): Promise<T | null> {
  const cfg = getRedisConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result as T;
  } catch {
    return null;
  }
}

/**
 * Checks and marks an authentication payload hash as used.
 * Prevents replay attacks within the 5-minute validity window.
 * Returns true if new (not replayed), false if duplicate/already used.
 */
export async function claimTelegramAuthHash(hash: string, ttlSeconds: number = 300): Promise<boolean> {
  if (!hash) return false;
  const cleanHash = hash.trim().toLowerCase();
  const redis = getRedisConfig();

  if (redis) {
    // Redis SET key 1 EX ttl NX (only set if not exists)
    const result = await redisCommand<string>([
      "SET",
      `dyt:telegram:used:${cleanHash}`,
      "1",
      "EX",
      String(ttlSeconds),
      "NX",
    ]);
    return result === "OK";
  }

  // Local fallback
  const now = Date.now();
  // Cleanup stale
  for (const [h, exp] of localUsedHashes.entries()) {
    if (now > exp) localUsedHashes.delete(h);
  }

  if (localUsedHashes.has(cleanHash)) {
    return false; // Replay detected
  }

  localUsedHashes.set(cleanHash, now + ttlSeconds * 1000);
  return true;
}

/**
 * Creates a short-lived one-time challenge for linking a Telegram identity.
 * Bound to userId, csrfToken, and expires in 300 seconds.
 */
export async function createTelegramLinkChallenge(
  userId: string,
  csrfToken: string
): Promise<string> {
  const nonce = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 300 * 1000;
  const csrfHash = crypto.createHash("sha256").update(csrfToken.trim()).digest("hex");

  const redis = getRedisConfig();
  if (redis) {
    const payload = JSON.stringify({ userId, csrfHash, expiresAt });
    await redisCommand(["SET", `dyt:telegram:challenge:${nonce}`, payload, "EX", "300"]);
  }

  localActiveChallenges.set(nonce, { userId, csrfHash, expiresAt });
  return nonce;
}

/**
 * Validates and consumes a Telegram link challenge in a single atomic step.
 * Enforces one-time usage, active user ID binding, CSRF binding, and non-expiration.
 */
export async function consumeTelegramLinkChallenge(
  challengeNonce: string,
  userId: string,
  csrfToken: string
): Promise<{ valid: boolean; error?: string }> {
  if (!challengeNonce || typeof challengeNonce !== "string") {
    return { valid: false, error: "Missing link challenge token" };
  }

  const cleanNonce = challengeNonce.trim();
  const csrfHash = crypto.createHash("sha256").update(csrfToken.trim()).digest("hex");
  const now = Date.now();

  const redis = getRedisConfig();
  let challengeData: { userId: string; csrfHash: string; expiresAt: number } | null = null;

  if (redis) {
    const raw = await redisCommand<string>(["GET", `dyt:telegram:challenge:${cleanNonce}`]);
    if (raw) {
      try {
        challengeData = typeof raw === "string" ? JSON.parse(raw) : raw;
        // Atomic consume: delete challenge
        await redisCommand(["DEL", `dyt:telegram:challenge:${cleanNonce}`]);
      } catch {
        return { valid: false, error: "Corrupt challenge payload" };
      }
    }
  } else {
    // Local memory consume
    challengeData = localActiveChallenges.get(cleanNonce) || null;
    localActiveChallenges.delete(cleanNonce);
  }

  if (!challengeData) {
    return { valid: false, error: "Invalid, expired, or already used link challenge" };
  }

  if (now > challengeData.expiresAt) {
    return { valid: false, error: "Link challenge has expired" };
  }

  if (challengeData.userId !== userId) {
    return { valid: false, error: "Challenge user mismatch" };
  }

  if (challengeData.csrfHash !== csrfHash) {
    return { valid: false, error: "Challenge CSRF mismatch" };
  }

  return { valid: true };
}

/**
 * Resets in-memory Telegram auth tracking (for testing purposes).
 */
export function __resetTelegramAuthTestStore(): void {
  localUsedHashes.clear();
  localActiveChallenges.clear();
}
