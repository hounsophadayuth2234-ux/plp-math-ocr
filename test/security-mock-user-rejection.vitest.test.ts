import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

// Mock server-only for Vitest test runner
vi.mock("server-only", () => ({}));

import { UserStore, UserRecord } from "@/lib/user-store";
import { getSessionUser, createSessionToken } from "@/lib/auth-session";
import { requireSuperAdmin as requireSuperAdminApi } from "@/lib/auth-session";
import { requireSuperAdmin as requireSuperAdminGuard } from "@/lib/auth/require-super-admin";
import { MOCK_SUPERADMIN_FIXTURE, MOCK_NORMALUSER_FIXTURE } from "../tests/fixtures/mock-users";

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

describe("Security Audit & Regression: Production Mock User Elimination", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    vi.stubEnv("APP_GATE_SESSION_SECRET", TEST_SECRET);
    UserStore.__resetTestStore();
    mockCookieMap.clear();
    mockRedirect.mockClear();
    mockNotFound.mockClear();
  });

  // 1. Direct UserStore inspection
  it("1. UserStore.getUserById strictly returns null for all mock IDs", async () => {
    const mockIds = [
      MOCK_SUPERADMIN_FIXTURE.id, // "usr_t33rx0x6mvs5qy0a"
      MOCK_NORMALUSER_FIXTURE.id, // "usr_c6gqttx7mvs5qy6q"
      "usr_test_superadmin",
      "usr_test_normaluser",
      "usr_mock_admin",
    ];

    for (const id of mockIds) {
      const user = await UserStore.getUserById(id);
      expect(user).toBeNull();
    }
  });

  // 2. Production mode guard verification
  it("2. In NODE_ENV=production, mock IDs cannot resolve without authoritative store entry", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";

      const resSuper = await UserStore.getUserById("usr_t33rx0x6mvs5qy0a");
      const resNormal = await UserStore.getUserById("usr_c6gqttx7mvs5qy6q");

      expect(resSuper).toBeNull();
      expect(resNormal).toBeNull();
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }
  });

  // 3. Forged or synthetic session token rejection
  it("3. Validly signed session token containing mock user ID fails closed at UserStore", async () => {
    // Generate valid cryptographic HMAC session token with mock superadmin payload
    const mockToken = await createSessionToken({
      id: MOCK_SUPERADMIN_FIXTURE.id,
      username: MOCK_SUPERADMIN_FIXTURE.username,
      role: MOCK_SUPERADMIN_FIXTURE.role,
      displayName: MOCK_SUPERADMIN_FIXTURE.displayName,
    });

    const req = new NextRequest("http://localhost:3000/admin/dashboard", {
      headers: {
        cookie: `dyt_gate_session=${mockToken}`,
      },
    });

    // getSessionUser must verify signature AND fail closed because user is absent in store
    const sessionUser = await getSessionUser(req);
    expect(sessionUser).toBeNull();
  });

  // 4. Invariant: No query param, header, or body can activate test mock fixtures
  it("4. No request header, query parameter, or payload can inject or activate mock user state", async () => {
    const mockToken = await createSessionToken({
      id: MOCK_SUPERADMIN_FIXTURE.id,
      username: MOCK_SUPERADMIN_FIXTURE.username,
      role: MOCK_SUPERADMIN_FIXTURE.role,
      displayName: MOCK_SUPERADMIN_FIXTURE.displayName,
    });

    const maliciousUrls = [
      "http://localhost:3000/admin/dashboard?mock=true",
      "http://localhost:3000/admin/dashboard?test=1&role=SUPER_ADMIN",
      "http://localhost:3000/admin/dashboard?__mock_user=usr_t33rx0x6mvs5qy0a",
    ];

    for (const url of maliciousUrls) {
      const req = new NextRequest(url, {
        headers: {
          cookie: `dyt_gate_session=${mockToken}`,
          "x-mock-auth": "true",
          "x-test-role": "SUPER_ADMIN",
          "x-bypass-auth": "1",
        },
      });

      const user = await getSessionUser(req);
      expect(user).toBeNull();

      // Also verify API guard
      const apiCheck = await requireSuperAdminApi(req);
      expect("response" in apiCheck).toBe(true);
      if ("response" in apiCheck) {
        expect(apiCheck.response.status).toBe(401);
      }
    }
  });

  // 5. requireSuperAdmin server component guard fails closed with mock cookie
  it("5. Server-component requireSuperAdmin guard redirects to /login on mock cookie", async () => {
    const mockToken = await createSessionToken({
      id: MOCK_SUPERADMIN_FIXTURE.id,
      username: MOCK_SUPERADMIN_FIXTURE.username,
      role: MOCK_SUPERADMIN_FIXTURE.role,
      displayName: MOCK_SUPERADMIN_FIXTURE.displayName,
    });

    mockCookieMap.set("dyt_gate_session", mockToken);

    await expect(requireSuperAdminGuard()).rejects.toThrow("NEXT_REDIRECT: /login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  // 6. Normal USER is concealed with notFound (404)
  it("6. Authoritative USER role is concealed with notFound() (404), never reaches dashboard", async () => {
    // Seed real normal user in authoritative store
    const realNormalUser = await UserStore.createUser({
      username: "realstudent",
      email: "realstudent@dyt-ecosystem.local",
      displayName: "Real Student",
      passwordHash: bcrypt.hashSync("UserPass2026!Strong", 10),
      role: "USER",
      status: "ACTIVE",
    });

    const realUserToken = await createSessionToken(realNormalUser);

    mockCookieMap.set("dyt_gate_session", realUserToken);

    // Guard must call notFound() to conceal admin route existence
    await expect(requireSuperAdminGuard()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  // 7. Only authoritative SUPER_ADMIN passes
  it("7. Only authoritative SUPER_ADMIN with persistent record passes guard", async () => {
    // Seed real super admin in authoritative store
    const realSuperAdmin = await UserStore.createUser({
      username: "legitsuperadmin",
      email: "legitsuperadmin@dyt-ecosystem.local",
      displayName: "Legit Super Admin",
      passwordHash: bcrypt.hashSync("SuperPass2026!Strong", 10),
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    const legitToken = await createSessionToken(realSuperAdmin);

    mockCookieMap.set("dyt_gate_session", legitToken);

    const authorizedUser = await requireSuperAdminGuard();
    expect(authorizedUser).toBeDefined();
    expect(authorizedUser.id).toBe(realSuperAdmin.id);
    expect(authorizedUser.role).toBe("SUPER_ADMIN");
    expect(authorizedUser.username).toBe("legitsuperadmin");
  });
});
