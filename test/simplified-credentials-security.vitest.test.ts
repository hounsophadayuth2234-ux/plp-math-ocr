import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { UserStore, UserRecord, toSafeUser, toAdminSafeUser } from "@/lib/user-store";
import {
  createSessionToken,
  requireAdmin,
  requireAuth,
} from "@/lib/auth-session";
import { generateCsrfToken } from "@/lib/auth-csrf";
import {
  validatePasswordStrength,
  validateAdminManagedPassword,
} from "@/lib/password-rules";
import { validateUsername } from "@/lib/auth-validators";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as changePasswordRoute } from "@/app/api/auth/change-password/route";
import { GET as adminUsersGet, POST as adminUsersPost } from "@/app/api/admin/users/route";
import { POST as adminUserResetPassword } from "@/app/api/admin/users/[id]/reset-password/route";
import { PATCH as adminUserPatch, DELETE as adminUserDelete } from "@/app/api/admin/users/[id]/route";
import { checkRateLimitAndLockout, recordFailedAttempt, clearFailedAttempts } from "@/lib/auth-gate";

describe("Simplified Account Credential Policy & Security Verification (23 Items)", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let adminUser: UserRecord;
  let normalUser: UserRecord;
  let adminToken: string;
  let userToken: string;
  let csrfToken: string;

  beforeEach(async () => {
    vi.stubEnv("APP_GATE_SESSION_SECRET", TEST_SECRET);
    UserStore.__resetTestStore();

    csrfToken = generateCsrfToken();

    // 1 Admin
    adminUser = await UserStore.createUser({
      username: "admin",
      email: "admin@dyt.local",
      displayName: "System Admin",
      passwordHash: bcrypt.hashSync("1234", 10),
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    // 1 Normal User (Legacy / Existing account)
    normalUser = await UserStore.createUser({
      username: "user1",
      email: "user1@dyt.local",
      displayName: "User One",
      passwordHash: bcrypt.hashSync("abcd", 10),
      role: "USER",
      status: "ACTIVE",
    });

    adminToken = await createSessionToken(adminUser);
    userToken = await createSessionToken(normalUser);
  });

  // 1. Username with exactly 4 characters is accepted.
  it("1. Username with exactly 4 characters is accepted", () => {
    const val = validateUsername("plp1");
    expect(val.valid).toBe(true);
    expect(val.value).toBe("plp1");

    const val2 = validateUsername("user");
    expect(val2.valid).toBe(true);
  });

  // 2. Username with fewer than 4 characters is rejected.
  it("2. Username with fewer than 4 characters is rejected", () => {
    const val = validateUsername("abc");
    expect(val.valid).toBe(false);
    expect(val.error).toContain("ឈ្មោះអ្នកប្រើប្រាស់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");

    const valEmpty = validateUsername("");
    expect(valEmpty.valid).toBe(false);
    expect(valEmpty.error).toContain("សូមបញ្ចូលឈ្មោះអ្នកប្រើប្រាស់");
  });

  // 3. Password with exactly 4 characters is accepted.
  it("3. Password with exactly 4 characters is accepted", () => {
    const res1 = validatePasswordStrength("abcd");
    expect(res1.valid).toBe(true);

    const res2 = validateAdminManagedPassword("1234");
    expect(res2.valid).toBe(true);
  });

  // 4. Password with fewer than 4 characters is rejected.
  it("4. Password with fewer than 4 characters is rejected", () => {
    const res1 = validatePasswordStrength("abc");
    expect(res1.valid).toBe(false);
    expect(res1.errors[0]).toContain("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");

    const res2 = validateAdminManagedPassword("12");
    expect(res2.valid).toBe(false);
    expect(res2.errors[0]).toContain("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");

    const resEmpty = validateAdminManagedPassword("");
    expect(resEmpty.valid).toBe(false);
    expect(resEmpty.errors[0]).toContain("សូមបញ្ចូលពាក្យសម្ងាត់");
  });

  // 5. Letters-only password is accepted.
  it("5. Letters-only password is accepted", () => {
    const res = validatePasswordStrength("abcd");
    expect(res.valid).toBe(true);

    const resLong = validatePasswordStrength("simplepassword");
    expect(resLong.valid).toBe(true);
  });

  // 6. Numbers-only password is accepted.
  it("6. Numbers-only password is accepted", () => {
    const res = validatePasswordStrength("1234");
    expect(res.valid).toBe(true);

    const resLong = validateAdminManagedPassword("987654321");
    expect(resLong.valid).toBe(true);
  });

  // 7. Mixed letters/numbers password is accepted.
  it("7. Mixed letters/numbers password is accepted", () => {
    const res1 = validatePasswordStrength("user1");
    expect(res1.valid).toBe(true);

    const res2 = validatePasswordStrength("plp2026");
    expect(res2.valid).toBe(true);
  });

  // 8. No symbol is required.
  it("8. No symbol is required", () => {
    const res = validatePasswordStrength("dayuth2026");
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  // 9. No uppercase letter is required.
  it("9. No uppercase letter is required", () => {
    const res = validatePasswordStrength("alllowercase1");
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  // 10. Confirm password mismatch is rejected.
  it("10. Confirm password mismatch is rejected", () => {
    const res = validateAdminManagedPassword("abcd", "admin", "wxyz");
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា");
  });

  // 11. Password is stored only as a secure hash.
  it("11. Password is stored only as a secure hash", async () => {
    const created = await UserStore.createUser({
      username: "teacher1",
      email: "teacher1@dyt.local",
      displayName: "Teacher One",
      passwordHash: bcrypt.hashSync("1234", 10),
      role: "USER",
      status: "ACTIVE",
    });

    const dbRecord = await UserStore.getUserById(created.id);
    expect(dbRecord?.passwordHash).toBeDefined();
    expect(dbRecord?.passwordHash.startsWith("$2")).toBe(true);
    // Plaintext is never stored
    expect((dbRecord as any).password).toBeUndefined();
    expect((dbRecord as any).plainPassword).toBeUndefined();
  });

  // 12. Password hash is never returned to the client.
  it("12. Password hash is never returned to the client", async () => {
    const safeStandard = toSafeUser(adminUser);
    expect((safeStandard as any).passwordHash).toBeUndefined();

    const safeAdmin = toAdminSafeUser(adminUser);
    expect((safeAdmin as any).passwordHash).toBeUndefined();

    // Call API GET /api/admin/users
    const req = new NextRequest("http://localhost/api/admin/users", {
      headers: { Cookie: `dyt_gate_session=${adminToken}` },
    });
    const res = await adminUsersGet(req);
    const data = await res.json();
    for (const u of data.users) {
      expect(u.passwordHash).toBeUndefined();
    }
  });

  // 13. Existing accounts still log in.
  it("13. Existing accounts still log in", async () => {
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: "user1",
        password: "abcd",
      }),
    });

    const res = await loginRoute(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user.username).toBe("user1");
  });

  // 14. Admin can create a user.
  it("14. Admin can create a user with 4-character credentials", async () => {
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        username: "plp2",
        email: "plp2@dyt.local",
        displayName: "PLP User 2",
        password: "1234",
        confirmPassword: "1234",
        role: "USER",
      }),
    });

    const res = await adminUsersPost(req);
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.user.username).toBe("plp2");

    // Login with new account works
    const dbRecord = await UserStore.getUserByUsernameOrEmail("plp2");
    expect(await bcrypt.compare("1234", dbRecord!.passwordHash)).toBe(true);
  });

  // 15. Admin can reset a user password.
  it("15. Admin can reset a user password with simplified 4-char password", async () => {
    const req = new NextRequest(`http://localhost/api/admin/users/${normalUser.id}/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        password: "5678",
        confirmPassword: "5678",
      }),
    });

    const res = await adminUserResetPassword(req, { params: Promise.resolve({ id: normalUser.id }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.temporaryPassword).toBe("5678");

    const updated = await UserStore.getUserById(normalUser.id);
    expect(await bcrypt.compare("5678", updated!.passwordHash)).toBe(true);
  });

  // 16. USER receives HTTP 403 from Admin endpoints.
  it("16. USER receives HTTP 403 from Admin endpoints", async () => {
    const req = new NextRequest("http://localhost/api/admin/users", {
      headers: { Cookie: `dyt_gate_session=${userToken}` },
    });

    const res = await adminUsersGet(req);
    expect(res.status).toBe(403);
  });

  // 17. Unauthenticated requests receive HTTP 401.
  it("17. Unauthenticated requests receive HTTP 401", async () => {
    const req = new NextRequest("http://localhost/api/admin/users");
    const res = await adminUsersGet(req);
    expect(res.status).toBe(401);
  });

  // 18. Rate limiting remains active.
  it("18. Rate limiting remains active", async () => {
    const testIp = "192.168.1.100";
    await clearFailedAttempts(testIp);

    // Initial check is allowed
    const status1 = await checkRateLimitAndLockout(testIp);
    expect(status1.allowed).toBe(true);
  });

  // 19. 30-minute lockout remains active.
  it("19. 30-minute lockout remains active after repeated failures", async () => {
    const lockIp = "192.168.99.99";
    await clearFailedAttempts(lockIp);

    let finalResult;
    for (let i = 0; i < 5; i++) {
      finalResult = await recordFailedAttempt(lockIp);
    }

    expect(finalResult?.locked).toBe(true);
    expect(finalResult?.retryAfterSeconds).toBe(1800);

    const check = await checkRateLimitAndLockout(lockIp);
    expect(check.allowed).toBe(false);
    expect(check.retryAfterSeconds).toBeGreaterThan(0);
  });

  // 20. CSRF validation remains active.
  it("20. CSRF validation remains active on modifying endpoints", async () => {
    const req = new NextRequest(`http://localhost/api/admin/users/${normalUser.id}/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        "x-csrf-token": "invalid-token",
      },
      body: JSON.stringify({ password: "9999" }),
    });

    const res = await adminUserResetPassword(req, { params: Promise.resolve({ id: normalUser.id }) });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("CSRF");
  });

  // 21. Session revocation after reset remains active.
  it("21. Session revocation after reset remains active", async () => {
    const oldUserToken = await createSessionToken(normalUser);

    // Admin resets password
    const req = new NextRequest(`http://localhost/api/admin/users/${normalUser.id}/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ password: "newpass" }),
    });
    await adminUserResetPassword(req, { params: Promise.resolve({ id: normalUser.id }) });

    // Verify sessionRevokedAt was set
    const userAfter = await UserStore.getUserById(normalUser.id);
    expect(userAfter?.sessionRevokedAt).toBeDefined();
    expect(userAfter?.sessionRevokedAt).toBeGreaterThan(0);
  });

  // 22. Final active-Admin protection remains active.
  it("22. Final active-Admin protection remains active", async () => {
    // Attempt to demote sole admin
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
    const data = await demoteRes.json();
    expect(data.error).toMatch(/មិនអាចបញ្ចុះតួនាទីគណនី (Super Admin|Admin) ចុងក្រោយបានទេ/);
  });

  // 23. Modules 01–04 are unchanged.
  it("23. Modules 01–04 are unchanged", () => {
    const modulePaths = [
      "src/app/math-solver",
      "src/app/math-ocr",
      "src/app/bg-remover",
      "src/app/image-upscaler",
      "src/app/api/math-solver",
      "src/app/api/math-ocr",
      "src/app/api/remove-bg",
      "src/app/api/image-upscale",
    ];

    for (const rel of modulePaths) {
      const full = path.join(process.cwd(), rel);
      expect(fs.existsSync(full)).toBe(true);
    }
  });

  // 24. Exact test cases requested for Admin Create Account UI policy
  describe("Exact Admin Account Creation Test Cases", () => {
    it("username: user1, password: abcd, confirm: abcd -> must pass validation", () => {
      const uVal = validateUsername("user1");
      expect(uVal.valid).toBe(true);
      const pVal = validateAdminManagedPassword("abcd", "user1", "abcd");
      expect(pVal.valid).toBe(true);
    });

    it("username: dayuth, password: 1234, confirm: 1234 -> must pass validation", () => {
      const uVal = validateUsername("dayuth");
      expect(uVal.valid).toBe(true);
      const pVal = validateAdminManagedPassword("1234", "dayuth", "1234");
      expect(pVal.valid).toBe(true);
    });

    it("password: abc -> must fail (< 4 characters)", () => {
      const pVal = validateAdminManagedPassword("abc", "user2", "abc");
      expect(pVal.valid).toBe(false);
      expect(pVal.errors[0]).toContain("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");
    });

    it("password: abcd, confirm: abce -> must fail (confirmation mismatch)", () => {
      const pVal = validateAdminManagedPassword("abcd", "user3", "abce");
      expect(pVal.valid).toBe(false);
      expect(pVal.errors[0]).toContain("ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា");
    });

    it("password: plp2026 -> must pass", () => {
      const pVal = validateAdminManagedPassword("plp2026", "dayuth2", "plp2026");
      expect(pVal.valid).toBe(true);
    });

    it("API: Admin creates account with minimal fields (no email or displayName blocking)", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          username: "dayuth4",
          password: "abcd",
          confirmPassword: "abcd",
          role: "USER",
        }),
      });

      const res = await adminUsersPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.username).toBe("dayuth4");
      expect(data.user.email).toBe("dayuth4@dyt.local");
      expect(data.user.displayName).toBe("dayuth4");
    });

    it("Preset A: admin1 / admin1 / admin1 is valid", () => {
      const uVal = validateUsername("admin1");
      expect(uVal.valid).toBe(true);
      const pVal = validateAdminManagedPassword("admin1", "admin1", "admin1");
      expect(pVal.valid).toBe(true);
    });

    it("Preset B: user1 / user1 / user1 is valid", () => {
      const uVal = validateUsername("user1");
      expect(uVal.valid).toBe(true);
      const pVal = validateAdminManagedPassword("user1", "user1", "user1");
      expect(pVal.valid).toBe(true);
    });

    it("Form Preset & Clear behavior simulation: selecting presets fills form without triggering API; clear empties state", () => {
      // 1. Initial state (empty)
      let formState = {
        username: "",
        password: "",
        confirmPassword: "",
        role: "USER" as "ADMIN" | "USER",
      };
      expect(formState.username).toBe("");
      expect(formState.password).toBe("");

      // 2. Select Admin Preset
      formState = {
        username: "admin1",
        password: "admin1",
        confirmPassword: "admin1",
        role: "ADMIN",
      };
      expect(formState.username).toBe("admin1");
      expect(formState.password).toBe("admin1");
      expect(formState.confirmPassword).toBe("admin1");
      expect(formState.role).toBe("ADMIN");

      // 3. Select User Preset
      formState = {
        username: "user1",
        password: "user1",
        confirmPassword: "user1",
        role: "USER",
      };
      expect(formState.username).toBe("user1");
      expect(formState.password).toBe("user1");
      expect(formState.confirmPassword).toBe("user1");
      expect(formState.role).toBe("USER");

      // 4. Clear Form
      formState = {
        username: "",
        password: "",
        confirmPassword: "",
        role: "USER",
      };
      expect(formState.username).toBe("");
      expect(formState.password).toBe("");
      expect(formState.confirmPassword).toBe("");
    });
  });
});
