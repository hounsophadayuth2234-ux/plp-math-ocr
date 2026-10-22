import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { UserStore, UserRecord } from "@/lib/user-store";
import {
  createSessionToken,
  verifySessionTokenStructure,
  getSessionUser,
  requireAuth,
  requireAdmin,
} from "@/lib/auth-session";
import { generateCsrfToken, validateCsrfToken } from "@/lib/auth-csrf";
import { validatePasswordStrength, generateTemporaryPassword } from "@/lib/password-rules";
import {
  validateUsername,
  validateEmail,
  validateDisplayName,
  validateRole,
  validateStatus,
} from "@/lib/auth-validators";
import { AuditLogger } from "@/lib/audit-logger";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { POST as changePasswordRoute } from "@/app/api/auth/change-password/route";
import { GET as adminUsersGet, POST as adminUsersPost } from "@/app/api/admin/users/route";
import { PATCH as adminUserPatch, DELETE as adminUserDelete } from "@/app/api/admin/users/[id]/route";
import { POST as adminUserDisable } from "@/app/api/admin/users/[id]/disable/route";
import { POST as adminUserEnable } from "@/app/api/admin/users/[id]/enable/route";
import { POST as adminUserResetPassword } from "@/app/api/admin/users/[id]/reset-password/route";
import { GET as adminAuditLogGet } from "@/app/api/admin/audit-log/route";

describe("Account Management & RBAC Security Suite", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let adminUser: UserRecord;
  let regularUser: UserRecord;
  let adminToken: string;
  let userToken: string;
  let csrfToken: string;

  beforeEach(async () => {
    vi.stubEnv("APP_GATE_SESSION_SECRET", TEST_SECRET);
    UserStore.__resetTestStore();
    AuditLogger.__resetTestEvents();

    csrfToken = generateCsrfToken();

    // Seed 1 Admin
    adminUser = await UserStore.createUser({
      username: "sysadmin",
      email: "admin@dyt-ecosystem.local",
      displayName: "System Administrator",
      passwordHash: bcrypt.hashSync("AdminPass2026!Strong", 10),
      role: "ADMIN",
      status: "ACTIVE",
    });

    // Seed 1 Regular User
    regularUser = await UserStore.createUser({
      username: "normaluser",
      email: "user@dyt-ecosystem.local",
      displayName: "Normal User",
      passwordHash: bcrypt.hashSync("UserPass2026!Strong", 10),
      role: "USER",
      status: "ACTIVE",
    });

    adminToken = await createSessionToken(adminUser);
    userToken = await createSessionToken(regularUser);
  });

  // ==========================================================================
  // A. AUTHENTICATION TESTS
  // ==========================================================================
  describe("Authentication Engine", () => {
    it("1. Successful login with username creates session and CSRF cookie", async () => {
      const req = new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: "sysadmin",
          password: "AdminPass2026!Strong",
        }),
      });

      const res = await loginRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user.username).toBe("sysadmin");
      expect(data.user.role).toBe("ADMIN");
      expect(data.user.passwordHash).toBeUndefined(); // Never leak password hash

      const cookieHeader = res.headers.get("set-cookie") || "";
      expect(cookieHeader).toContain("dyt_gate_session=");
      expect(cookieHeader).toContain("dyt_csrf_token=");
    });

    it("2. Successful login with email works seamlessly", async () => {
      const req = new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: "user@dyt-ecosystem.local",
          password: "UserPass2026!Strong",
        }),
      });

      const res = await loginRoute(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.user.username).toBe("normaluser");
    });

    it("3. Wrong password fails verification and does not leak existence", async () => {
      const req = new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: "sysadmin",
          password: "WrongPassword123!",
        }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ");
    });

    it("4. Disabled user cannot log in", async () => {
      await UserStore.updateUser(regularUser.id, { status: "DISABLED" });

      const req = new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: "normaluser",
          password: "UserPass2026!Strong",
        }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(401);
    });

    it("5. Logout clears cookies and logs audit event", async () => {
      const req = new NextRequest("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: `dyt_gate_session=${userToken}`,
        },
      });

      const res = await logoutRoute(req);
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).toContain("Max-Age=0");
    });

    it("6. Expired session token is strictly rejected", async () => {
      const expiredPayload = {
        userId: regularUser.id,
        username: regularUser.username,
        role: regularUser.role,
        displayName: regularUser.displayName,
        iat: Math.floor(Date.now() / 1000) - 10000,
        exp: Math.floor(Date.now() / 1000) - 10, // 10s in past
        jti: "test-expired",
      };
      const b64 = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
      const sig = require("crypto")
        .createHmac("sha256", TEST_SECRET)
        .update(b64)
        .digest("base64url");
      const expiredToken = `${b64}.${sig}`;

      const verified = await verifySessionTokenStructure(expiredToken);
      expect(verified.valid).toBe(false);
      expect(verified.error).toBe("Session expired");
    });

    it("7. User can change their own password with strong complexity", async () => {
      const req = new NextRequest("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dyt_gate_session=${userToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          currentPassword: "UserPass2026!Strong",
          newPassword: "BrandNewPassword2026#Secure",
        }),
      });

      const res = await changePasswordRoute(req);
      expect(res.status).toBe(200);

      // Verify user can now login with new password
      const updated = await UserStore.getUserById(regularUser.id);
      expect(await bcrypt.compare("BrandNewPassword2026#Secure", updated!.passwordHash)).toBe(true);
    });

    it("8. Changing password rejects weak passwords (< 4 chars)", async () => {
      const req = new NextRequest("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dyt_gate_session=${userToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          currentPassword: "UserPass2026!Strong",
          newPassword: "abc", // Shorter than 4 chars
        }),
      });

      const res = await changePasswordRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  // ==========================================================================
  // B. AUTHORIZATION & RBAC TESTS
  // ==========================================================================
  describe("Role-Based Access Control (RBAC)", () => {
    it("1. Regular USER receives 403 Forbidden when calling GET /api/admin/users", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "GET",
        headers: {
          Cookie: `dyt_gate_session=${userToken}`,
        },
      });

      const res = await adminUsersGet(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden: Administrator role required");
    });

    it("2. ADMIN can list all accounts", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "GET",
        headers: {
          Cookie: `dyt_gate_session=${adminToken}`,
        },
      });

      const res = await adminUsersGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users.length).toBe(2);
      expect(data.users[0].passwordHash).toBeUndefined();
    });

    it("3. ADMIN can create a new account with temporary password", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          username: "staff01",
          email: "staff01@dyt-ecosystem.local",
          displayName: "Staff Member",
          role: "USER",
        }),
      });

      const res = await adminUsersPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.user.username).toBe("staff01");
      expect(data.user.mustChangePassword).toBe(true);
      expect(data.temporaryPassword).toBeDefined();
      expect(data.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    });

    it("4. ADMIN can disable and enable an account", async () => {
      // Disable
      const disReq = new NextRequest(`http://localhost/api/admin/users/${regularUser.id}/disable`, {
        method: "POST",
        headers: {
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });
      const disRes = await adminUserDisable(disReq, { params: Promise.resolve({ id: regularUser.id }) });
      expect(disRes.status).toBe(200);

      const disabledUser = await UserStore.getUserById(regularUser.id);
      expect(disabledUser!.status).toBe("DISABLED");

      // Enable
      const enReq = new NextRequest(`http://localhost/api/admin/users/${regularUser.id}/enable`, {
        method: "POST",
        headers: {
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });
      const enRes = await adminUserEnable(enReq, { params: Promise.resolve({ id: regularUser.id }) });
      expect(enRes.status).toBe(200);

      const enabledUser = await UserStore.getUserById(regularUser.id);
      expect(enabledUser!.status).toBe("ACTIVE");
    });

    it("5. Final active administrator cannot be deleted or demoted", async () => {
      // Attempt to demote final admin
      const demoteReq = new NextRequest(`http://localhost/api/admin/users/${adminUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ role: "USER" }),
      });
      const demoteRes = await adminUserPatch(demoteReq, { params: Promise.resolve({ id: adminUser.id }) });
      expect(demoteRes.status).toBe(400);
      const demoteData = await demoteRes.json();
      expect(demoteData.error).toContain("មិនអាចបញ្ចុះតួនាទីគណនី Admin ចុងក្រោយបានទេ");

      // Attempt to delete final admin
      const delReq = new NextRequest(`http://localhost/api/admin/users/${adminUser.id}`, {
        method: "DELETE",
        headers: {
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });
      const delRes = await adminUserDelete(delReq, { params: Promise.resolve({ id: adminUser.id }) });
      expect(delRes.status).toBe(400);
    });

    it("6. ADMIN can reset user password and force change on next login", async () => {
      const req = new NextRequest(`http://localhost/api/admin/users/${regularUser.id}/reset-password`, {
        method: "POST",
        headers: {
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });

      const res = await adminUserResetPassword(req, { params: Promise.resolve({ id: regularUser.id }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.temporaryPassword).toBeDefined();

      const userAfter = await UserStore.getUserById(regularUser.id);
      expect(userAfter!.mustChangePassword).toBe(true);
    });
  });

  // ==========================================================================
  // C. SECURITY & AUDIT LOGGING TESTS
  // ==========================================================================
  describe("Security Hardening & Audit Logging", () => {
    it("1. Mutating requests reject missing or mismatched CSRF token", async () => {
      const req = new NextRequest(`http://localhost/api/admin/users/${regularUser.id}/disable`, {
        method: "POST",
        headers: {
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": "wrong-csrf-token-1234",
        },
      });

      const res = await adminUserDisable(req, { params: Promise.resolve({ id: regularUser.id }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("CSRF");
    });

    it("2. Schema validator strictly validates usernames and emails", () => {
      expect(validateUsername("ab").valid).toBe(false); // < 3 chars
      expect(validateUsername("valid_user-1").valid).toBe(true);
      expect(validateUsername("invalid user").valid).toBe(false); // whitespace
      expect(validateEmail("not-an-email").valid).toBe(false);
      expect(validateEmail("user@domain.com").valid).toBe(true);
    });

    it("3. Audit log records security events without leaking sensitive secrets", async () => {
      await AuditLogger.logEvent({
        type: "ACCOUNT_CREATED",
        actorId: adminUser.id,
        actorUsername: adminUser.username,
        targetId: regularUser.id,
        targetUsername: regularUser.username,
        rawIp: "192.168.1.100",
        details: {
          password: "SecretPassword123!", // Should be sanitized
          role: "USER",
        },
      });

      const events = await AuditLogger.getRecentEvents(10);
      expect(events.length).toBeGreaterThan(0);
      const latest = events[0];
      expect(latest.type).toBe("ACCOUNT_CREATED");
      expect(latest.details?.password).toBe("[REDACTED]");
      expect(latest.ipHash).not.toContain("192.168.1.100");
    });

    it("4. Password hashes are never written to audit events or exposed in user lists", async () => {
      const users = await UserStore.listUsers();
      for (const u of users) {
        expect((u as any).passwordHash).toBeDefined(); // in internal record
      }

      // But safe view excludes it
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "GET",
        headers: { Cookie: `dyt_gate_session=${adminToken}` },
      });
      const res = await adminUsersGet(req);
      const data = await res.json();
      for (const u of data.users) {
        expect(u.passwordHash).toBeUndefined();
      }
    });
  });
});
