/**
 * Centralized Server-Only Environment & Secret Validator
 *
 * Enforces strict server-side execution and validates production secrets.
 * Ensures zero secret leakage to client bundles, source maps, or public API responses.
 * Never logs or prints secret values.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "CRITICAL SECURITY VIOLATION: env.server.ts must NEVER be imported in client-side code."
  );
}

export interface ValidatedServerEnv {
  isProduction: boolean;
  isTest: boolean;
  appGateSessionSecret: string;
  appGatePasswordHash?: string;
  appGateAdminRecoveryKey?: string;
  geminiApiKey?: string;
  replicateApiToken?: string;
  openaiApiKey?: string;
  bgWorkerToken?: string;
  bgWorkerUrl?: string;
  runpodApiKey?: string;
  redisUrl?: string;
  redisToken?: string;
}

/**
 * Validates and retrieves required server secrets.
 * Fails safely and immediately if required production secrets are absent or weak.
 * Never falls back to insecure or predictable default passwords/keys in production.
 */
export function getServerSecret(key: string, requiredInProd = true): string {
  const val = process.env[key]?.trim();
  const isProd = process.env.NODE_ENV === "production";

  if (!val || val.length === 0) {
    if (isProd && requiredInProd) {
      throw new Error(
        `CRITICAL: Required production secret '${key}' is missing or empty. Server cannot safely boot.`
      );
    }
    return "";
  }

  // Reject placeholder values in production
  if (isProd && (val.includes("your_") || val.includes("placeholder") || val === "secret")) {
    throw new Error(
      `CRITICAL: Secret '${key}' contains an insecure placeholder value in production.`
    );
  }

  return val;
}

/**
 * Resolves session signing secret.
 * In production: strictly requires APP_GATE_SESSION_SECRET >= 16 chars.
 * In non-production tests: generates a safe in-memory fallback if unset, never a static known string.
 */
import crypto from "crypto";

let ephemeralDevSessionSecret: string | null = null;

export function getSessionSecret(): string {
  const secret = process.env.APP_GATE_SESSION_SECRET?.trim();
  if (secret && secret.length >= 16) {
    return secret;
  }

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    throw new Error(
      "CRITICAL: APP_GATE_SESSION_SECRET must be configured with at least 16 characters in production."
    );
  }

  // Non-production test/dev fallback: ephemeral random secret
  if (!ephemeralDevSessionSecret) {
    ephemeralDevSessionSecret = crypto.randomBytes(32).toString("hex");
  }
  return ephemeralDevSessionSecret!;
}

/**
 * Resolves managed credential vault key.
 * Strictly derives from server secrets without hardcoded strings.
 */
export function getManagedVaultSecret(): string {
  const custom = process.env.APP_MANAGED_VAULT_SECRET?.trim();
  if (custom && custom.length >= 16) return custom;
  return getSessionSecret();
}

/**
 * Returns structured safe status without leaking any secret values.
 */
export function getServerSecretAuditStatus(): Record<string, boolean> {
  return {
    hasSessionSecret: Boolean(process.env.APP_GATE_SESSION_SECRET?.trim()),
    hasPasswordHash: Boolean(process.env.APP_GATE_PASSWORD_HASH?.trim()),
    hasRecoveryKey: Boolean(process.env.APP_GATE_ADMIN_RECOVERY_KEY?.trim()),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    hasReplicateToken: Boolean(process.env.REPLICATE_API_TOKEN?.trim()),
    hasRedisUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim()),
    hasRedisToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim()),
  };
}
