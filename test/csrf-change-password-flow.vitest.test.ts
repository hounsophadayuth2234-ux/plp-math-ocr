import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { UserStore, UserRecord } from "@/lib/user-store";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  getSessionUser,
} from "@/lib/auth-session";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  validateCsrfToken,
} from "@/lib/auth-csrf";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { GET as csrfRoute } from "@/app/api/auth/csrf/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { POST as changePasswordRoute } from "@/app/api/auth/change-password/route";

describe("CSRF & Mandatory Password Change Flow", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let tempUser: UserRecord;

  beforeEach(async () => {
    vi.stubEnv("APP_GATE_SESSION_SECRET", TEST_SECRET);
    UserStore.__resetTestStore();

    tempUser = await UserStore.createUser({
      username: "dayuth12",
      email: "dayuth12@dyt-ecosystem.local",
      displayName: "Dayuth Temp",
      passwordHash: bcrypt.hashSync("dayuth12", 10),
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: true,
    });
  });

  it("1. Temporary password login sets session and readable CSRF cookie", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: "dayuth12",
        password: "dayuth12",
      }),
    });

    const res = await loginRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.mustChangePassword).toBe(true);
    expect(typeof json.csrfToken).toBe("string");
    expect(json.csrfToken.length).toBeGreaterThanOrEqual(32);

    const sessionCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const csrfCookie = res.cookies.get(CSRF_COOKIE_NAME);

    expect(sessionCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie?.value).toBe(json.csrfToken);
  });

  it("2. /api/auth/csrf route returns fresh CSRF token and sets readable cookie with no-store headers", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/csrf", {
      method: "GET",
    });

    const res = await csrfRoute(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(typeof json.csrfToken).toBe("string");

    const cookie = res.cookies.get(CSRF_COOKIE_NAME);
    expect(cookie?.value).toBe(json.csrfToken);
  });

  it("3. /api/auth/session returns CSRF token and indicates mustChangePassword", async () => {
    const sessionToken = await createSessionToken(tempUser);
    const csrf = generateCsrfToken();

    const req = new NextRequest("http://localhost:3000/api/auth/session", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrf}`,
      },
    });

    const res = await sessionRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.authenticated).toBe(true);
    expect(json.user.mustChangePassword).toBe(true);
    expect(json.csrfToken).toBe(csrf);
  });

  it("4. Password change rejects request if CSRF token is missing", async () => {
    const sessionToken = await createSessionToken(tempUser);

    // Missing CSRF cookie and missing header
    const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      },
      body: JSON.stringify({
        currentPassword: "dayuth12",
        newPassword: "NewSecretPassword2026!",
        confirmPassword: "NewSecretPassword2026!",
      }),
    });

    const res = await changePasswordRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("CSRF token missing");
  });

  it("5. Password change rejects request if CSRF tokens mismatch", async () => {
    const sessionToken = await createSessionToken(tempUser);
    const cookieCsrf = generateCsrfToken();
    const attackerCsrf = generateCsrfToken();

    const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${cookieCsrf}`,
        [CSRF_HEADER_NAME]: attackerCsrf,
      },
      body: JSON.stringify({
        currentPassword: "dayuth12",
        newPassword: "NewSecretPassword2026!",
        confirmPassword: "NewSecretPassword2026!",
      }),
    });

    const res = await changePasswordRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("mismatch");
  });

  it("6. Password change succeeds with matching CSRF header and cookie, updating mustChangePassword to false", async () => {
    const sessionToken = await createSessionToken(tempUser);
    const csrf = generateCsrfToken();

    const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrf}`,
        [CSRF_HEADER_NAME]: csrf,
      },
      body: JSON.stringify({
        currentPassword: "dayuth12",
        newPassword: "NewSecretPassword2026!",
        confirmPassword: "NewSecretPassword2026!",
        csrfToken: csrf,
      }),
    });

    const res = await changePasswordRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.mustChangePassword).toBe(false);

    // Verify cookies updated on response
    const newSessionCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const newCsrfCookie = res.cookies.get(CSRF_COOKIE_NAME);
    expect(newSessionCookie).toBeDefined();
    expect(newCsrfCookie).toBeDefined();

    // Verify the new session token works immediately
    const verifyReq = new NextRequest("http://localhost:3000/api/auth/session", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${newSessionCookie?.value}`,
      },
    });
    const verifyRes = await sessionRoute(verifyReq);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.authenticated).toBe(true);
    expect(verifyJson.user.mustChangePassword).toBe(false);

    // Verify stored user in UserStore has mustChangePassword: false
    const freshUser = await UserStore.getUserById(tempUser.id);
    expect(freshUser?.mustChangePassword).toBe(false);
  });
});
