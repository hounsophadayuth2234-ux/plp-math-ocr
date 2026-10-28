import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

// Mock server-only for Node/Vitest test runner
vi.mock("server-only", () => ({}));

import { UserStore, UserRecord } from "@/lib/user-store";
import { AuditLogger } from "@/lib/audit-logger";
import { createSessionToken } from "@/lib/auth-session";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  getDashboardStats,
  getRecentLogins,
  getRateLimitEvents,
  maskIdentifier,
  maskIpHash,
} from "@/lib/admin/queries";

// Mock next/navigation
const mockRedirect = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT: ${url}`);
  (err as any).digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw err;
});

const mockNotFound = vi.fn(() => {
  const err = new Error("NEXT_NOT_FOUND");
  (err as any).digest = "NEXT_NOT_FOUND";
  throw err;
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => mockNotFound(),
}));

// Mock next/headers
let mockCookieMap = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const val = mockCookieMap.get(name);
      return val ? { name, value: val } : undefined;
    },
    getAll: () => Array.from(mockCookieMap.entries()).map(([name, value]) => ({ name, value })),
  })),
}));

describe("Super Admin Dashboard — Auth Guard & Data Loaders Suite", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let superAdminUser: UserRecord;
  let adminUser: UserRecord;
  let regularUser: UserRecord;
  let disabledSuperAdmin: UserRecord;
  let superAdminToken: string;
  let adminToken: string;
  let regularUserToken: string;
  let disabledToken: string;

  beforeEach(async () => {
    vi.stubEnv("APP_GATE_SESSION_SECRET", TEST_SECRET);
    UserStore.__resetTestStore();
    AuditLogger.__resetTestEvents();
    mockCookieMap.clear();
    mockRedirect.mockClear();
    mockNotFound.mockClear();

    // 1. Seed Super Admin
    superAdminUser = await UserStore.createUser({
      username: "superboss",
      email: "superboss@dyt-ecosystem.local",
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

    // 4. Seed Disabled Super Admin
    disabledSuperAdmin = await UserStore.createUser({
      username: "badsuper",
      email: "badsuper@dyt-ecosystem.local",
      displayName: "Disabled Super Admin",
      passwordHash: bcrypt.hashSync("BadSuperPass2026!", 10),
      role: "SUPER_ADMIN",
      status: "DISABLED",
    });

    superAdminToken = await createSessionToken(superAdminUser);
    adminToken = await createSessionToken(adminUser);
    regularUserToken = await createSessionToken(regularUser);
    disabledToken = await createSessionToken(disabledSuperAdmin);
  });

  // ==========================================================================
  // 1. requireSuperAdmin() Guard Unit Tests
  // ==========================================================================
  describe("requireSuperAdmin() Guard Validation", () => {
    it("1. Unauthenticated visit redirects to /login", async () => {
      mockCookieMap.clear();

      await expect(requireSuperAdmin()).rejects.toThrow("NEXT_REDIRECT: /login");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
      expect(mockNotFound).not.toHaveBeenCalled();
    });

    it("2. Regular USER visit returns notFound() (404 concealment)", async () => {
      mockCookieMap.set("dyt_gate_session", regularUserToken);

      await expect(requireSuperAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mockNotFound).toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("3. Delegated ADMIN (manager) visit returns notFound() (404 concealment)", async () => {
      mockCookieMap.set("dyt_gate_session", adminToken);

      await expect(requireSuperAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mockNotFound).toHaveBeenCalled();
    });

    it("4. Authenticated SUPER_ADMIN visit returns verified SafeUser", async () => {
      mockCookieMap.set("dyt_gate_session", superAdminToken);

      const verified = await requireSuperAdmin();
      expect(verified).toBeDefined();
      expect(verified.id).toBe(superAdminUser.id);
      expect(verified.username).toBe("superboss");
      expect(verified.role).toBe("SUPER_ADMIN");
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNotFound).not.toHaveBeenCalled();
    });

    it("5. Tampered or malformed session token redirects to /login", async () => {
      mockCookieMap.set("dyt_gate_session", "malformed.invalid.token");

      await expect(requireSuperAdmin()).rejects.toThrow("NEXT_REDIRECT: /login");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("6. Disabled account with valid token is denied with notFound()", async () => {
      mockCookieMap.set("dyt_gate_session", disabledToken);

      await expect(requireSuperAdmin()).rejects.toThrow("NEXT_REDIRECT: /login");
    });

    it("7. Fails closed with notFound() if internal helper throws unhandled error", async () => {
      // Mock UserStore.getUserById to throw an unexpected error
      const spy = vi.spyOn(UserStore, "getUserById").mockRejectedValueOnce(new Error("Database connection pool dropped"));
      mockCookieMap.set("dyt_gate_session", superAdminToken);

      await expect(requireSuperAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mockNotFound).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // ==========================================================================
  // 2. Data Loaders & Masking Unit Tests
  // ==========================================================================
  describe("Dashboard Data Loaders & Sanitization", () => {
    it("1. getDashboardStats rejects when unauthenticated without verified context", async () => {
      mockCookieMap.clear();

      await expect(getDashboardStats()).rejects.toThrow("NEXT_REDIRECT: /login");
    });

    it("2. getDashboardStats returns accurate user counts when verified", async () => {
      mockCookieMap.set("dyt_gate_session", superAdminToken);

      const stats = await getDashboardStats();
      expect(stats.isAvailable).toBe(true);
      expect(stats.totalUsers).toBe(4);
      expect(stats.activeSuperAdmins).toBe(1); // superboss is active, badsuper is disabled
      expect(stats.activeAdmins).toBe(1); // manager01
    });

    it("3. getRecentLogins rejects when unauthorized", async () => {
      mockCookieMap.set("dyt_gate_session", regularUserToken);

      await expect(getRecentLogins()).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("4. getRecentLogins returns correctly shaped and masked login events", async () => {
      mockCookieMap.set("dyt_gate_session", superAdminToken);

      // Seed audit events
      await AuditLogger.logEvent({
        type: "LOGIN_SUCCESS",
        actorId: superAdminUser.id,
        actorUsername: superAdminUser.username,
        rawIp: "192.168.1.50",
        userAgent: "Mozilla/5.0 Chrome/120.0.0",
        details: { role: "SUPER_ADMIN" },
      });

      await AuditLogger.logEvent({
        type: "LOGIN_FAILURE",
        actorId: "usr_unknown",
        actorUsername: "intruder@domain.com",
        rawIp: "10.0.0.99",
        userAgent: "Curl/8.0.0",
        details: { reason: "Bad credentials" },
      });

      const logins = await getRecentLogins();
      expect(logins.length).toBe(2);

      // Inspect first item
      const failureItem = logins.find((l) => l.eventType === "LOGIN_FAILURE");
      expect(failureItem).toBeDefined();
      expect(failureItem?.outcome).toBe("FAILURE");
      expect(failureItem?.maskedIdentifier).toBe("in***r@domain.com");
      expect(failureItem?.reason).toBe("Bad credentials");

      const successItem = logins.find((l) => l.eventType === "LOGIN_SUCCESS");
      expect(successItem).toBeDefined();
      expect(successItem?.outcome).toBe("SUCCESS");
      expect(successItem?.maskedIdentifier).toBe("su***ss");

      // Verify that NO full IP address appears in any field
      for (const item of logins) {
        expect(item.maskedIp).not.toBe("192.168.1.50");
        expect(item.maskedIp).not.toBe("10.0.0.99");
        expect(item.maskedIp).toMatch(/\.\.\.$|\.\*$/);
        // Verify no sensitive keys exist
        expect((item as any).password).toBeUndefined();
        expect((item as any).passwordHash).toBeUndefined();
        expect((item as any).token).toBeUndefined();
        expect((item as any).rawIp).toBeUndefined();
      }
    });

    it("5. getRateLimitEvents returns explicit placeholder metadata", async () => {
      mockCookieMap.set("dyt_gate_session", superAdminToken);

      const rateLimitInfo = await getRateLimitEvents();
      expect(rateLimitInfo.isPlaceholder).toBe(true);
      expect(rateLimitInfo.notice).toContain("Placeholder: data source not yet connected");
      expect(rateLimitInfo.schemaFields).toContain("maskedIp");
      expect(rateLimitInfo.backendRequirement).toContain("Redis");
    });

    it("6. Masking utilities produce expected output", () => {
      expect(maskIdentifier("superadmin")).toBe("su***in");
      expect(maskIdentifier("user1")).toBe("us***r1");
      expect(maskIdentifier("admin@dytcore.com")).toBe("ad***n@dytcore.com");
      expect(maskIdentifier(null)).toBe("anonymous");

      expect(maskIpHash("192.168.1.100")).toBe("192.168.1.*");
      expect(maskIpHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe("e3b0c442...");
      expect(maskIpHash(null)).toBe("0.0.0.*");
    });
  });
});
