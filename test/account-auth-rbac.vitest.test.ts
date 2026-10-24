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
  requireSuperAdmin,
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
import { ActivityTracker } from "@/lib/activity-tracker";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { POST as changePasswordRoute } from "@/app/api/auth/change-password/route";
import { GET as profileGet, PUT as profilePut } from "@/app/api/auth/profile/route";
import { GET as adminUsersGet, POST as adminUsersPost } from "@/app/api/admin/users/route";
import { PATCH as adminUserPatch, DELETE as adminUserDelete } from "@/app/api/admin/users/[id]/route";
import { POST as adminUserDisable } from "@/app/api/admin/users/[id]/disable/route";
import { POST as adminUserEnable } from "@/app/api/admin/users/[id]/enable/route";
import { POST as adminUserResetPassword } from "@/app/api/admin/users/[id]/reset-password/route";
import { GET as adminAuditLogGet } from "@/app/api/admin/audit-log/route";
import { GET as activityTrackingGet } from "@/app/api/admin/activity-tracking/route";

describe("3-Tier RBAC & Account Management Security Suite", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let superAdminUser: UserRecord;
  let adminUser: UserRecord;
  let regularUser: UserRecord;
  let superAdminToken: string;
  let adminToken: string;
  let userToken: string;
  let csrfToken: string;

  beforeEach(async () => {
    vi.stubEnv("APP_GATE_SESSION_SECRET", TEST_SECRET);
    UserStore.__resetTestStore();
    AuditLogger.__resetTestEvents();
    ActivityTracker.__resetTestActivities();

    csrfToken = generateCsrfToken();

    // 1. Seed Super Admin
    superAdminUser = await UserStore.createUser({
      username: "superboss",
      email: "superadmin@dyt-ecosystem.local",
      displayName: "System Owner Super Admin",
      passwordHash: bcrypt.hashSync("SuperPass2026!Strong", 10),
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    // 2. Seed Admin (Manager)
    adminUser = await UserStore.createUser({
      username: "manager01",
      email: "manager@dyt-ecosystem.local",
      displayName: "Workspace Manager",
      passwordHash: bcrypt.hashSync("AdminPass2026!Strong", 10),
      role: "ADMIN",
      status: "ACTIVE",
    });

    // 3. Seed Regular User
    regularUser = await UserStore.createUser({
      username: "normaluser",
      email: "user@dyt-ecosystem.local",
      displayName: "Normal User",
      passwordHash: bcrypt.hashSync("UserPass2026!Strong", 10),
      role: "USER",
      status: "ACTIVE",
    });

    superAdminToken = await createSessionToken(superAdminUser);
    adminToken = await createSessionToken(adminUser);
    userToken = await createSessionToken(regularUser);
  });

  // ==========================================================================
  // A. AUTHENTICATION & PROFILE TESTS
  // ==========================================================================
  describe("Authentication Engine & Personal Profile", () => {
    it("1. Successful login creates session with correct 3-tier role", async () => {
      const req = new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: "superboss",
          password: "SuperPass2026!Strong",
        }),
      });

      const res = await loginRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user.username).toBe("superboss");
      expect(data.user.role).toBe("SUPER_ADMIN");
      expect(data.user.passwordHash).toBeUndefined();

      const cookieHeader = res.headers.get("set-cookie") || "";
      expect(cookieHeader).toContain("dyt_gate_session=");
      expect(cookieHeader).toContain("dyt_csrf_token=");
    });

    it("2. Any authenticated user (including SUPER_ADMIN) can edit their own profile", async () => {
      const req = new NextRequest("http://localhost/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dyt_gate_session=${superAdminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          displayName: "Super Owner Renamed",
          username: "superboss_updated",
          email: "superboss_new@dyt-ecosystem.local",
          csrfToken,
        }),
      });

      const res = await profilePut(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.displayName).toBe("Super Owner Renamed");
      expect(data.user.username).toBe("superboss_updated");
      expect(data.user.email).toBe("superboss_new@dyt-ecosystem.local");

      const inStore = await UserStore.getUserById(superAdminUser.id);
      expect(inStore?.username).toBe("superboss_updated");
    });
  });

  // ==========================================================================
  // B. 3-TIER RBAC AUTHORIZATION TESTS
  // ==========================================================================
  describe("3-Tier Role-Based Access Control (RBAC)", () => {
    it("1. Regular USER receives 403 Forbidden when accessing User Management", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "GET",
        headers: { Cookie: `dyt_gate_session=${userToken}` },
      });

      const res = await adminUsersGet(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Super Administrator role required");
    });

    it("2. ADMIN is strictly forbidden from User Management (Demoted from user mutations)", async () => {
      // ADMIN cannot list users
      const listReq = new NextRequest("http://localhost/api/admin/users", {
        method: "GET",
        headers: { Cookie: `dyt_gate_session=${adminToken}` },
      });
      const listRes = await adminUsersGet(listReq);
      expect(listRes.status).toBe(403);

      // ADMIN cannot create users
      const createReq = new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          username: "unauthorized_new",
          email: "unauth@dyt-ecosystem.local",
          displayName: "Should Fail",
          role: "USER",
        }),
      });
      const createRes = await adminUsersPost(createReq);
      expect(createRes.status).toBe(403);

      // ADMIN cannot delete users
      const delReq = new NextRequest(`http://localhost/api/admin/users/${regularUser.id}`, {
        method: "DELETE",
        headers: {
          Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });
      const delRes = await adminUserDelete(delReq, { params: Promise.resolve({ id: regularUser.id }) });
      expect(delRes.status).toBe(403);
    });

    it("3. SUPER_ADMIN has full User Management authority", async () => {
      // List users
      const listReq = new NextRequest("http://localhost/api/admin/users", {
        method: "GET",
        headers: { Cookie: `dyt_gate_session=${superAdminToken}` },
      });
      const listRes = await adminUsersGet(listReq);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.users.length).toBe(3);

      // Create new user
      const createReq = new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dyt_gate_session=${superAdminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          username: "staff01",
          email: "staff01@dyt-ecosystem.local",
          displayName: "Staff Member",
          role: "USER",
        }),
      });
      const createRes = await adminUsersPost(createReq);
      expect(createRes.status).toBe(201);
      const createData = await createRes.json();
      expect(createData.user.username).toBe("staff01");
      expect(createData.temporaryPassword).toBeDefined();

      // Disable user
      const disReq = new NextRequest(`http://localhost/api/admin/users/${regularUser.id}/disable`, {
        method: "POST",
        headers: {
          Cookie: `dyt_gate_session=${superAdminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });
      const disRes = await adminUserDisable(disReq, { params: Promise.resolve({ id: regularUser.id }) });
      expect(disRes.status).toBe(200);

      // Reset password
      const resetReq = new NextRequest(`http://localhost/api/admin/users/${regularUser.id}/reset-password`, {
        method: "POST",
        headers: {
          Cookie: `dyt_gate_session=${superAdminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });
      const resetRes = await adminUserResetPassword(resetReq, { params: Promise.resolve({ id: regularUser.id }) });
      expect(resetRes.status).toBe(200);
      const resetData = await resetRes.json();
      expect(resetData.temporaryPassword).toBeDefined();
    });

    it("4. Final active SUPER_ADMIN cannot be deleted or demoted", async () => {
      // Attempt to demote final SUPER_ADMIN
      const demoteReq = new NextRequest(`http://localhost/api/admin/users/${superAdminUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dyt_gate_session=${superAdminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ role: "USER" }),
      });
      const demoteRes = await adminUserPatch(demoteReq, { params: Promise.resolve({ id: superAdminUser.id }) });
      expect(demoteRes.status).toBe(400);
      const demoteData = await demoteRes.json();
      expect(demoteData.error).toContain("មិនអាចបញ្ចុះតួនាទីគណនី Super Admin ចុងក្រោយបានទេ");

      // Attempt to delete final SUPER_ADMIN
      const delReq = new NextRequest(`http://localhost/api/admin/users/${superAdminUser.id}`, {
        method: "DELETE",
        headers: {
          Cookie: `dyt_gate_session=${superAdminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": csrfToken,
        },
      });
      const delRes = await adminUserDelete(delReq, { params: Promise.resolve({ id: superAdminUser.id }) });
      expect(delRes.status).toBe(400);
    });
  });

  // ==========================================================================
  // C. SILENT ACTIVITY TRACKING & DASHBOARD TESTS
  // ==========================================================================
  describe("Silent Activity Tracking System", () => {
    it("1. Automatically logs user activity in background without user input", async () => {
      await ActivityTracker.recordActivity({
        userId: regularUser.id,
        username: regularUser.username,
        displayName: regularUser.displayName,
        role: "USER",
        module: "01_math_ocr",
        action: "ocr_transcribe",
        title: "Sample Grade 10 Exercise.png",
      });

      await ActivityTracker.recordActivity({
        userId: regularUser.id,
        username: regularUser.username,
        displayName: regularUser.displayName,
        role: "USER",
        module: "04_math_solver",
        action: "solve_problem",
        title: "Solve quadratic equation 2x^2 + 5x - 3 = 0",
      });

      const overview = await ActivityTracker.getActivityOverview();
      expect(overview.totalActivities).toBe(2);
      expect(overview.totalActiveUsers).toBe(1);
      expect(overview.userSummaries[0].username).toBe("normaluser");
      expect(overview.userSummaries[0].totalActions).toBe(2);
      expect(overview.userSummaries[0].moduleBreakdown["01_math_ocr"]).toBe(1);
      expect(overview.userSummaries[0].moduleBreakdown["04_math_solver"]).toBe(1);
    });

    it("2. ADMIN can access Activity Tracking Dashboard", async () => {
      const req = new NextRequest("http://localhost/api/admin/activity-tracking", {
        method: "GET",
        headers: { Cookie: `dyt_gate_session=${adminToken}` },
      });

      const res = await activityTrackingGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.userSummaries).toBeDefined();
    });

    it("3. SUPER_ADMIN can access Activity Tracking Dashboard", async () => {
      const req = new NextRequest("http://localhost/api/admin/activity-tracking", {
        method: "GET",
        headers: { Cookie: `dyt_gate_session=${superAdminToken}` },
      });

      const res = await activityTrackingGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("4. Regular USER cannot access Activity Tracking Dashboard (403)", async () => {
      const req = new NextRequest("http://localhost/api/admin/activity-tracking", {
        method: "GET",
        headers: { Cookie: `dyt_gate_session=${userToken}` },
      });

      const res = await activityTrackingGet(req);
      expect(res.status).toBe(403);
    });

    it("5. Drill-Down endpoint returns specific user activity details", async () => {
      await ActivityTracker.recordActivity({
        userId: regularUser.id,
        username: regularUser.username,
        displayName: regularUser.displayName,
        role: "USER",
        module: "02_canvas_cutout",
        action: "remove_background",
        title: "diagram-geometry.png",
      });

      const req = new NextRequest(`http://localhost/api/admin/activity-tracking?userId=${regularUser.id}`, {
        method: "GET",
        headers: { Cookie: `dyt_gate_session=${adminToken}` },
      });

      const res = await activityTrackingGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.activities.length).toBe(1);
      expect(data.activities[0].module).toBe("02_canvas_cutout");
      expect(data.activities[0].title).toBe("diagram-geometry.png");
    });
  });

  // ==========================================================================
  // D. SECURITY & VALIDATION INVARIANTS
  // ==========================================================================
  describe("Security Hardening & Validation", () => {
    it("1. validateRole strictly allows SUPER_ADMIN, ADMIN, and USER", () => {
      expect(validateRole("SUPER_ADMIN").valid).toBe(true);
      expect(validateRole("ADMIN").valid).toBe(true);
      expect(validateRole("USER").valid).toBe(true);
      expect(validateRole("HACKER").valid).toBe(false);
    });

    it("2. Mutating requests reject invalid CSRF tokens", async () => {
      const req = new NextRequest(`http://localhost/api/admin/users/${regularUser.id}/disable`, {
        method: "POST",
        headers: {
          Cookie: `dyt_gate_session=${superAdminToken}; dyt_csrf_token=${csrfToken}`,
          "x-csrf-token": "wrong-csrf-token-1234",
        },
      });

      const res = await adminUserDisable(req, { params: Promise.resolve({ id: regularUser.id }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("CSRF");
    });
  });
});
