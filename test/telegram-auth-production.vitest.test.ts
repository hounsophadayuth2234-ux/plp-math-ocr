import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { UserStore } from "@/lib/user-store";
import {
  verifyTelegramLoginSignature,
  computeTelegramIdLookupHash,
  encryptTelegramId,
  decryptTelegramId,
  claimTelegramAuthHash,
  createTelegramLinkChallenge,
  consumeTelegramLinkChallenge,
  __resetTelegramAuthTestStore,
} from "@/lib/telegram-auth";
import { AuditLogger } from "@/lib/audit-logger";
import { GET as telegramConfigHandler } from "@/app/api/auth/telegram/config/route";
import { POST as telegramLoginHandler } from "@/app/api/auth/telegram/login/route";
import { POST as telegramLinkStartHandler } from "@/app/api/auth/telegram/link/start/route";
import { POST as telegramLinkCompleteHandler } from "@/app/api/auth/telegram/link/complete/route";
import { POST as telegramUnlinkHandler } from "@/app/api/auth/telegram/unlink/route";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/auth-csrf";
import bcrypt from "bcryptjs";

// Helper to construct a valid Telegram payload for tests
function createSignedTelegramPayload(
  fields: {
    id: string | number;
    first_name?: string;
    username?: string;
    auth_date?: number;
  },
  botToken: string
) {
  const authDate = fields.auth_date ?? Math.floor(Date.now() / 1000);
  const data: Record<string, any> = {
    auth_date: authDate,
    id: fields.id,
  };
  if (fields.first_name) data.first_name = fields.first_name;
  if (fields.username) data.username = fields.username;

  // Build data check string
  const sortedKeys = Object.keys(data).sort();
  const dataCheckString = sortedKeys.map((k) => `${k}=${data[k]}`).join("\n");
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return {
    ...data,
    hash,
  };
}

describe("Telegram Login & Production Security Hardening Suite", () => {
  const TEST_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789";
  const TEST_SESSION_SECRET = "test-session-secret-at-least-32-chars-long";

  beforeEach(async () => {
    process.env.APP_GATE_SESSION_SECRET = TEST_SESSION_SECRET;
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
    process.env.TELEGRAM_BOT_USERNAME = "DytPlpMathBot";
    process.env.TELEGRAM_LOGIN_ENABLED = "true";
    process.env.TELEGRAM_ALLOWED_ORIGIN = "https://ai-toolkit-hub-nu.vercel.app";

    UserStore.__resetTestStore();
    AuditLogger.__resetTestEvents();
    __resetTelegramAuthTestStore();
  });

  // =========================================================================
  // Part 4.A — Existing Login Compatibility
  // =========================================================================
  describe("A. Existing Login Compatibility", () => {
    it("existing valid username/password continues working without modification", async () => {
      const passwordPlain = "SuperSecret123!";
      const passwordHash = await bcrypt.hash(passwordPlain, 10);

      const user = await UserStore.createUser({
        username: "teacher_sopha",
        email: "sopha@example.edu.kh",
        displayName: "Sopha Teacher",
        passwordHash,
        role: "USER",
      });

      expect(user.id).toBeDefined();
      expect(user.role).toBe("USER");
      expect(user.mfaEnabled).toBeFalsy(); // MFA not forced

      // Check password matching
      const isMatch = await bcrypt.compare(passwordPlain, user.passwordHash);
      expect(isMatch).toBe(true);

      // Existing roles remain intact
      const fetched = await UserStore.getUserById(user.id);
      expect(fetched?.role).toBe("USER");
    });

    it("verifies MFA is not enabled or forced automatically on accounts", async () => {
      const user = await UserStore.createUser({
        username: "standard_user",
        email: "std@example.com",
        displayName: "Standard User",
        passwordHash: "hash123",
        role: "USER",
      });

      expect(user.mfaEnabled).toBeFalsy();
    });
  });

  // =========================================================================
  // Part 4.B — Telegram Signature Verification
  // =========================================================================
  describe("B. Telegram Signature Verification", () => {
    it("accepts a valid cryptographic Telegram signature", () => {
      const payload = createSignedTelegramPayload(
        { id: 987654321, first_name: "Dara", username: "dara_kh" },
        TEST_BOT_TOKEN
      );

      const res = verifyTelegramLoginSignature(payload, TEST_BOT_TOKEN);
      expect(res.valid).toBe(true);
      expect(res.telegramId).toBe("987654321");
      expect(res.telegramUsername).toBe("dara_kh");
    });

    it("rejects an invalid signature hash", () => {
      const payload = createSignedTelegramPayload(
        { id: 987654321, username: "dara_kh" },
        TEST_BOT_TOKEN
      );
      payload.hash = "0000000000000000000000000000000000000000000000000000000000000000";

      const res = verifyTelegramLoginSignature(payload, TEST_BOT_TOKEN);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Invalid Telegram cryptographic signature");
    });

    it("rejects a tampered username with original hash", () => {
      const payload: any = createSignedTelegramPayload(
        { id: 987654321, username: "legit_user" },
        TEST_BOT_TOKEN
      );
      // Tamper username
      payload.username = "hacker_user";

      const res = verifyTelegramLoginSignature(payload, TEST_BOT_TOKEN);
      expect(res.valid).toBe(false);
    });

    it("rejects a tampered user ID with original hash", () => {
      const payload: any = createSignedTelegramPayload(
        { id: 111111, username: "user_one" },
        TEST_BOT_TOKEN
      );
      // Tamper user ID
      payload.id = 999999;

      const res = verifyTelegramLoginSignature(payload, TEST_BOT_TOKEN);
      expect(res.valid).toBe(false);
    });

    it("rejects expired auth_date (older than 300 seconds)", () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 350;
      const payload = createSignedTelegramPayload(
        { id: 987654321, auth_date: expiredTimestamp },
        TEST_BOT_TOKEN
      );

      const res = verifyTelegramLoginSignature(payload, TEST_BOT_TOKEN);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("expired");
    });

    it("rejects missing required fields (id or auth_date)", () => {
      const res = verifyTelegramLoginSignature({ hash: "abcd" }, TEST_BOT_TOKEN);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Missing required");
    });

    it("rejects replayed authentication payloads via replay protection", async () => {
      const payload = createSignedTelegramPayload(
        { id: 555555, username: "replay_tester" },
        TEST_BOT_TOKEN
      );

      const firstClaim = await claimTelegramAuthHash(payload.hash);
      expect(firstClaim).toBe(true);

      const secondClaim = await claimTelegramAuthHash(payload.hash);
      expect(secondClaim).toBe(false); // Replay rejected
    });
  });

  // =========================================================================
  // Part 4.C — Existing-User Restriction (No Auto-Registration)
  // =========================================================================
  describe("C. Existing-User Restriction & Auto-Creation Ban", () => {
    it("allows a previously linked Telegram user to log in and establishes session", async () => {
      const tgNumericId = "777888999";
      const lookupHash = computeTelegramIdLookupHash(tgNumericId);
      const encId = encryptTelegramId(tgNumericId);

      // Create local user and link Telegram
      const user = await UserStore.createUser({
        username: "linked_user",
        email: "linked@example.com",
        displayName: "Linked User",
        passwordHash: "bcrypt_dummy",
        role: "USER",
      });

      await UserStore.updateUser(user.id, {
        telegramLinked: true,
        telegramIdEncrypted: encId,
        telegramIdLookupHash: lookupHash,
        telegramUsername: "linked_tg",
        telegramLinkedAt: Date.now(),
      });

      const payload = createSignedTelegramPayload(
        { id: tgNumericId, username: "linked_tg" },
        TEST_BOT_TOKEN
      );

      const req = new NextRequest("https://ai-toolkit-hub-nu.vercel.app/api/auth/telegram/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await telegramLoginHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.username).toBe("linked_user");
      expect(data.user.role).toBe("USER");

      // Verify cookies
      const setCookies = res.cookies.getAll();
      expect(setCookies.some((c) => c.name === SESSION_COOKIE_NAME)).toBe(true);
      expect(setCookies.some((c) => c.name === CSRF_COOKIE_NAME)).toBe(true);
    });

    it("rejects unlinked Telegram user with exact generic Khmer message and does NOT create account", async () => {
      const initialUsersCount = (await UserStore.listUsers()).length;
      const unlinkedPayload = createSignedTelegramPayload(
        { id: 999888777, username: "stranger" },
        TEST_BOT_TOKEN
      );

      const req = new NextRequest("https://ai-toolkit-hub-nu.vercel.app/api/auth/telegram/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unlinkedPayload),
      });

      const res = await telegramLoginHandler(req);
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.error).toBe(
        "Telegram នេះមិនទាន់បានភ្ជាប់ជាមួយគណនីក្នុងប្រព័ន្ធទេ។ សូមចូលដោយ Username/Password ឬទាក់ទង Admin។"
      );

      // Verify NO account was created
      const finalUsersCount = (await UserStore.listUsers()).length;
      expect(finalUsersCount).toBe(initialUsersCount);
    });

    it("rejects duplicate Telegram linking if identity already belongs to another user", async () => {
      const sharedTgId = "1122334455";
      const lookupHash = computeTelegramIdLookupHash(sharedTgId);

      // User 1 already linked
      const user1 = await UserStore.createUser({
        username: "user_first",
        email: "first@example.com",
        displayName: "First",
        passwordHash: "hash1",
        role: "USER",
      });
      await UserStore.updateUser(user1.id, {
        telegramLinked: true,
        telegramIdLookupHash: lookupHash,
      });

      // User 2 attempts to link the same Telegram account
      const user2 = await UserStore.createUser({
        username: "user_second",
        email: "second@example.com",
        displayName: "Second",
        passwordHash: "hash2",
        role: "USER",
      });

      const sessionToken = await createSessionToken({
        id: user2.id,
        username: user2.username,
        role: user2.role,
        displayName: user2.displayName,
      });

      const csrfToken = "valid-csrf-token-1234567890123456";
      const challengeToken = await createTelegramLinkChallenge(user2.id, csrfToken);
      const tgPayload = createSignedTelegramPayload({ id: sharedTgId }, TEST_BOT_TOKEN);

      const req = new NextRequest("https://ai-toolkit-hub-nu.vercel.app/api/auth/telegram/link/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        body: JSON.stringify({
          challengeToken,
          telegramData: tgPayload,
        }),
      });

      const res = await telegramLinkCompleteHandler(req);
      expect(res.status).toBe(409); // Conflict: already linked
      const data = await res.json();
      expect(data.error).toContain("Telegram នេះត្រូវបានភ្ជាប់ជាមួយគណនីផ្សេងរួចហើយ");
    });
  });

  // =========================================================================
  // Part 4.D — Link / Unlink Security & Challenges
  // =========================================================================
  describe("D. Link / Unlink Security", () => {
    it("rejects unauthenticated link requests", async () => {
      const req = new NextRequest("https://ai-toolkit-hub-nu.vercel.app/api/auth/telegram/link/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-enforce-auth": "1",
        },
      });

      const res = await telegramLinkStartHandler(req);
      expect(res.status).toBe(401);
    });

    it("rejects linking when CSRF token is missing", async () => {
      const user = await UserStore.createUser({
        username: "csrf_tester",
        email: "csrf@test.com",
        displayName: "CSRF Tester",
        passwordHash: "hash",
        role: "USER",
      });

      const sessionToken = await createSessionToken({
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      });

      const req = new NextRequest("https://ai-toolkit-hub-nu.vercel.app/api/auth/telegram/link/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
          // No CSRF header or cookie
        },
      });

      const res = await telegramLinkStartHandler(req);
      expect(res.status).toBe(403);
    });

    it("rejects link challenge if consumed more than once (one-time challenge)", async () => {
      const userId = "usr_12345";
      const csrf = "csrf-secret-12345";
      const challenge = await createTelegramLinkChallenge(userId, csrf);

      const firstConsume = await consumeTelegramLinkChallenge(challenge, userId, csrf);
      expect(firstConsume.valid).toBe(true);

      const secondConsume = await consumeTelegramLinkChallenge(challenge, userId, csrf);
      expect(secondConsume.valid).toBe(false);
      expect(secondConsume.error).toContain("already used");
    });

    it("verifies unlinking clears Telegram identity and writes sanitized audit log without raw ID", async () => {
      const user = await UserStore.createUser({
        username: "unlink_user",
        email: "unlink@test.com",
        displayName: "Unlink User",
        passwordHash: "hash",
        role: "USER",
      });

      await UserStore.updateUser(user.id, {
        telegramLinked: true,
        telegramIdEncrypted: encryptTelegramId("123456"),
        telegramIdLookupHash: computeTelegramIdLookupHash("123456"),
      });

      const sessionToken = await createSessionToken({
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      });

      const csrfToken = "csrf-unlink-token-123456789";

      const req = new NextRequest("https://ai-toolkit-hub-nu.vercel.app/api/auth/telegram/unlink", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        },
      });

      const res = await telegramUnlinkHandler(req);
      expect(res.status).toBe(200);

      const updated = await UserStore.getUserById(user.id);
      expect(updated?.telegramLinked).toBe(false);
      expect(updated?.telegramIdEncrypted).toBeUndefined();
      expect(updated?.telegramIdLookupHash).toBeUndefined();

      // Check audit events
      const events = await AuditLogger.getRecentEvents(10);
      const unlinkEvent = events.find((e) => e.type === "TELEGRAM_UNLINKED");
      expect(unlinkEvent).toBeDefined();

      // Invariant: Zero secret or raw Telegram ID leakage in audit log
      const eventJson = JSON.stringify(unlinkEvent);
      expect(eventJson).not.toContain("123456");
      expect(eventJson).not.toContain(TEST_BOT_TOKEN);
    });
  });

  // =========================================================================
  // Part 4.E — API Security & Cookie Headers
  // =========================================================================
  describe("E. API Security & Headers", () => {
    it("ensures session cookies are HttpOnly and SameSite: lax", async () => {
      const tgNumericId = "333444555";
      const lookupHash = computeTelegramIdLookupHash(tgNumericId);

      const user = await UserStore.createUser({
        username: "cookie_tester",
        email: "cookie@test.com",
        displayName: "Cookie Tester",
        passwordHash: "hash",
        role: "USER",
      });

      await UserStore.updateUser(user.id, {
        telegramLinked: true,
        telegramIdLookupHash: lookupHash,
      });

      const payload = createSignedTelegramPayload({ id: tgNumericId }, TEST_BOT_TOKEN);

      const req = new NextRequest("https://ai-toolkit-hub-nu.vercel.app/api/auth/telegram/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await telegramLoginHandler(req);
      expect(res.status).toBe(200);

      const cookie = res.cookies.get(SESSION_COOKIE_NAME);
      expect(cookie).toBeDefined();
      expect(cookie?.httpOnly).toBe(true);
      expect(String(cookie?.sameSite).toLowerCase()).toBe("lax");

      // Verify no-store and private cache headers
      const cacheControl = res.headers.get("cache-control");
      expect(cacheControl).toContain("no-store");
      expect(cacheControl).toContain("private");
    });

    it("GET /api/auth/telegram/config returns botUsername and numeric botId", async () => {
      const res = await telegramConfigHandler();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.enabled).toBe(true);
      expect(data.botUsername).toBe("DytPlpMathBot");
      expect(data.botId).toBe("123456789");
    });

    it("POST /api/auth/telegram/link/start returns botId alongside botUsername and challengeToken", async () => {
      const user = await UserStore.createUser({
        username: "dayuth12_tester",
        email: "dayuth12@test.com",
        displayName: "Dayuth Tester",
        passwordHash: "hash",
        role: "ADMIN",
      });

      const sessionToken = await createSessionToken({
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      });

      const csrfToken = "valid-csrf-token-1234567890123456";

      const req = new NextRequest("https://math.dytcore.com/api/auth/telegram/link/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        body: JSON.stringify({ csrfToken }),
      });

      const res = await telegramLinkStartHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.botUsername).toBe("DytPlpMathBot");
      expect(data.botId).toBe("123456789");
      expect(data.challengeToken).toBeDefined();

      // Complete link flow with valid signed payload
      const tgPayload = createSignedTelegramPayload({ id: "987654321", username: "dayuth12_tg" }, TEST_BOT_TOKEN);

      const completeReq = new NextRequest("https://math.dytcore.com/api/auth/telegram/link/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        body: JSON.stringify({
          challengeToken: data.challengeToken,
          telegramData: tgPayload,
          csrfToken,
        }),
      });

      const completeRes = await telegramLinkCompleteHandler(completeReq);
      expect(completeRes.status).toBe(200);
      const completeData = await completeRes.json();
      expect(completeData.success).toBe(true);
      expect(completeData.user.telegramLinked).toBe(true);
      expect(completeData.user.telegramUsername).toBe("dayuth12_tg");

      // Verify user store in persistent store
      const freshUser = await UserStore.getUserById(user.id);
      expect(freshUser?.telegramLinked).toBe(true);
      expect(freshUser?.telegramUsername).toBe("dayuth12_tg");

      // Verify audit event created
      const events = await AuditLogger.getRecentEvents(10);
      const linkEvent = events.find((e) => e.type === "TELEGRAM_LINKED");
      expect(linkEvent).toBeDefined();
      expect(linkEvent?.actorUsername).toBe("dayuth12_tester");
    });
  });
});

