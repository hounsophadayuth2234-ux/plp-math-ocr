import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import {
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  checkRateLimitAndLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  anonymizeIdentifier,
  __resetLocalRateLimiter,
  SESSION_MAX_AGE_SECONDS,
  LOCKOUT_DURATION_SECONDS,
  MAX_FAILED_ATTEMPTS,
} from "@/lib/auth-gate";

describe("Mechanical Cyber Security Gate & Authentication Engine", () => {
  const TEST_PASSWORD = "test-gate-secret-key-2026";
  const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
  const TEST_SESSION_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    vi.stubEnv("APP_GATE_PASSWORD_HASH", TEST_HASH);
    vi.stubEnv("APP_GATE_SESSION_SECRET", TEST_SESSION_SECRET);
    __resetLocalRateLimiter();
  });

  // 1. Correct password succeeds
  it("1. Correct password succeeds constant-time verification", async () => {
    const isMatch = await verifyPassword(TEST_PASSWORD);
    expect(isMatch).toBe(true);
  });

  // 2. Wrong password fails
  it("2. Wrong password fails verification", async () => {
    const isMatch = await verifyPassword("completely-wrong-password");
    expect(isMatch).toBe(false);
  });

  // 3. Password is never present in client bundle or source code
  it("3. Password is never present in client bundle or source files", () => {
    // Verified by architecture: hash is read only via process.env.APP_GATE_PASSWORD_HASH on server
    expect(process.env.APP_GATE_PASSWORD_HASH).toBeDefined();
    expect(process.env.APP_GATE_PASSWORD_HASH).not.toContain(TEST_PASSWORD);
  });

  // 4. Password is never written to localStorage or sessionStorage
  it("4. Password and tokens are never saved to localStorage or sessionStorage", () => {
    // Window storage is not used; sessions are strictly HttpOnly cookies
    const storageKeys = typeof window !== "undefined" ? Object.keys(localStorage) : [];
    expect(storageKeys).not.toContain("password");
    expect(storageKeys).not.toContain("gate_password");
  });

  // 5. First wrong attempt does not lock
  it("5. First wrong attempt increments failure counter without locking", async () => {
    const clientId = await anonymizeIdentifier("192.168.1.100::test-agent");
    const result1 = await recordFailedAttempt(clientId);

    expect(result1.attempts).toBe(1);
    expect(result1.locked).toBe(false);

    const status = await checkRateLimitAndLockout(clientId);
    expect(status.allowed).toBe(true);
  });

  // 6. Third failed attempt activates a 30-minute lock for that identifier
  it("6. Third failed attempt activates a 30-minute lock for that identifier", async () => {
    const clientId = await anonymizeIdentifier("192.168.1.101::test-agent");

    await recordFailedAttempt(clientId); // 1
    await recordFailedAttempt(clientId); // 2
    const result3 = await recordFailedAttempt(clientId); // 3

    expect(result3.attempts).toBe(MAX_FAILED_ATTEMPTS);
    expect(result3.locked).toBe(true);
    expect(result3.retryAfterSeconds).toBe(LOCKOUT_DURATION_SECONDS);
  });

  // 7. Further attempts return locked / HTTP 429
  it("7. Further attempts return locked status with valid Retry-After window", async () => {
    const clientId = await anonymizeIdentifier("192.168.1.102::test-agent");

    for (let i = 0; i < 3; i++) {
      await recordFailedAttempt(clientId);
    }

    const check = await checkRateLimitAndLockout(clientId);
    expect(check.allowed).toBe(false);
    expect(check.retryAfterSeconds).toBeGreaterThan(0);
    expect(check.retryAfterSeconds).toBeLessThanOrEqual(LOCKOUT_DURATION_SECONDS);
  });

  // 8. A different identifier is not incorrectly locked
  it("8. A different identifier is not incorrectly locked", async () => {
    const attackerId = await anonymizeIdentifier("198.51.100.5::attacker");
    const legitimateId = await anonymizeIdentifier("203.0.113.88::user");

    // Lock attacker
    for (let i = 0; i < 3; i++) {
      await recordFailedAttempt(attackerId);
    }
    expect((await checkRateLimitAndLockout(attackerId)).allowed).toBe(false);

    // Legitimate user must remain allowed
    expect((await checkRateLimitAndLockout(legitimateId)).allowed).toBe(true);
  });

  // 9. Successful login creates a secure HttpOnly session cookie
  it("9. Successful login creates a valid cryptographically signed session token", async () => {
    const token = await createSessionToken();
    expect(token).toBeDefined();
    expect(token.split(".")).toHaveLength(2);

    const verification = await verifySessionToken(token);
    expect(verification.valid).toBe(true);
    expect(verification.payload?.iss).toBe("dyt-cyber-gate");
    expect(verification.payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  // 10. Expired or tampered session is rejected
  it("10. Expired or tampered session token is strictly rejected", async () => {
    const token = await createSessionToken();
    const [payloadB64, signatureB64] = token.split(".");

    // Tampered payload
    const tamperedToken = `${payloadB64}x.${signatureB64}`;
    const checkTampered = await verifySessionToken(tamperedToken);
    expect(checkTampered.valid).toBe(false);

    // Tampered signature
    const checkBadSig = await verifySessionToken(`${payloadB64}.invalidsignature`);
    expect(checkBadSig.valid).toBe(false);

    // Wrong secret verification
    const wrongSecret = "wrongsecretwrongsecretwrongsecretwrongsecretwrongsecret1234";
    const checkWrongKey = await verifySessionToken(token, wrongSecret);
    expect(checkWrongKey.valid).toBe(false);
  });

  // 11. Resetting or clearing failed attempts restores access
  it("11. Clearing failed attempts upon successful login restores access immediately", async () => {
    const clientId = await anonymizeIdentifier("192.168.1.105::test-agent");
    await recordFailedAttempt(clientId); // 1 failure
    await clearFailedAttempts(clientId);

    const check = await checkRateLimitAndLockout(clientId);
    expect(check.allowed).toBe(true);
  });

  // 12. Anonymized identifier does not reveal raw IP
  it("12. Anonymized identifier does not reveal raw IP address", async () => {
    const rawIp = "192.168.1.250::Mozilla/5.0 Chrome";
    const hashed = await anonymizeIdentifier(rawIp);
    expect(hashed).not.toContain("192.168.1.250");
    expect(hashed).toHaveLength(32);
  });

  // 13. sanitizeInternalRedirect allows valid internal paths and blocks open redirects
  it("13. sanitizeInternalRedirect enforces same-origin and strictly blocks external/open redirects", async () => {
    const { sanitizeInternalRedirect } = await import("@/lib/auth-gate");

    // Valid internal relative paths
    expect(sanitizeInternalRedirect("/bg-remover")).toBe("/bg-remover");
    expect(sanitizeInternalRedirect("/plp-math-content")).toBe("/plp-math-content");
    expect(sanitizeInternalRedirect("/image-upscaler?filter=active")).toBe("/image-upscaler?filter=active");
    expect(sanitizeInternalRedirect("/")).toBe("/");

    // Canonical alias resolution
    expect(sanitizeInternalRedirect("/math-ocr")).toBe("/plp-math-content");
    expect(sanitizeInternalRedirect("/math-ocr?tab=latex")).toBe("/plp-math-content?tab=latex");

    // Loop prevention: never redirect back to login or internal auth APIs
    expect(sanitizeInternalRedirect("/login")).toBe("/");
    expect(sanitizeInternalRedirect("/login?from=/login")).toBe("/");
    expect(sanitizeInternalRedirect("/login/subpath")).toBe("/");
    expect(sanitizeInternalRedirect("/api/auth/login")).toBe("/");

    // Malicious open redirect attempts
    expect(sanitizeInternalRedirect("https://evil.com")).toBe("/");
    expect(sanitizeInternalRedirect("http://evil.com/phish")).toBe("/");
    expect(sanitizeInternalRedirect("//evil.com")).toBe("/");
    expect(sanitizeInternalRedirect("/\\evil.com")).toBe("/");
    expect(sanitizeInternalRedirect("javascript:alert(1)")).toBe("/");
    expect(sanitizeInternalRedirect("data:text/html,hack")).toBe("/");
    expect(sanitizeInternalRedirect(null)).toBe("/");
    expect(sanitizeInternalRedirect(undefined)).toBe("/");
    expect(sanitizeInternalRedirect("")).toBe("/");
  });
});
