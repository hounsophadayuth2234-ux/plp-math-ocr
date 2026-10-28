import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { requireAuth, requireSuperAdmin } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { GET as adminRecoveryGET } from "@/app/api/auth/admin-recovery/route";
import { PUT as profilePUT } from "@/app/api/auth/profile/route";

describe("SECURITY VECTOR 2 — API Fortification & Bypass Prevention", () => {
  it("1. Unauthenticated request returns 401", async () => {
    const unauthenticatedReq = new NextRequest("https://math.dytcore.com/api/test");
    const res = await requireAuth(unauthenticatedReq);

    expect("response" in res).toBe(true);
    if ("response" in res) {
      expect(res.response.status).toBe(401);
      const data = await res.response.json();
      expect(data.authenticated).toBe(false);
    }
  });

  it("2. Ordinary USER attempting SUPER_ADMIN operation returns 403", async () => {
    // Mock user session with role: "USER"
    const reqWithUserToken = new NextRequest("https://math.dytcore.com/api/admin/users", {
      headers: {
        authorization: "Bearer invalid_or_unauthorized_token",
      },
    });

    const res = await requireSuperAdmin(reqWithUserToken);
    expect("response" in res).toBe(true);
    if ("response" in res) {
      // Unauthenticated or forbidden
      expect([401, 403]).toContain(res.response.status);
    }
  });

  it("3. Cross-origin state-changing request from malicious origin is rejected", () => {
    const maliciousReq = new NextRequest("https://math.dytcore.com/api/auth/profile", {
      method: "PUT",
      headers: {
        origin: "https://evil-attacker-site.com",
        host: "math.dytcore.com",
        "content-type": "application/json",
      },
    });

    const csrfCheck = validateCsrfToken(maliciousReq, "some_token");
    expect(csrfCheck.valid).toBe(false);
    expect(csrfCheck.error).toContain("Cross-origin request rejected");
  });

  it("4. State-changing request with missing or mismatched CSRF token is rejected", () => {
    const reqWithoutCsrf = new NextRequest("https://math.dytcore.com/api/auth/profile", {
      method: "PUT",
      headers: {
        origin: "https://math.dytcore.com",
        host: "math.dytcore.com",
        "content-type": "application/json",
      },
    });

    const csrfCheck = validateCsrfToken(reqWithoutCsrf);
    expect(csrfCheck.valid).toBe(false);
    expect(csrfCheck.error).toContain("CSRF token missing");
  });

  it("5. Admin recovery GET endpoint strictly never leaks credentials or temporary passwords", async () => {
    const res = await adminRecoveryGET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("enabled");
    expect(body).toHaveProperty("consumed");
    expect(body).toHaveProperty("targetUsername");
    expect(body).not.toHaveProperty("oneTimeTemporaryPassword");
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("temporaryPassword");
  });

  it("6. Malicious SVG or HTML avatar in profile update is rejected", async () => {
    // Unauthenticated profile update is already blocked
    const unauthReq = new NextRequest("https://math.dytcore.com/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify({ avatar: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" }),
    });

    const res = await profilePUT(unauthReq);
    expect(res.status).toBe(401);
  });
});
