import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  checkRateLimit,
  enforceRateLimit,
  __resetMemoryRateLimiter,
} from "@/lib/rate-limiter";
import { SECURITY_POLICIES } from "@/lib/security-config";

describe("SECURITY VECTOR 3 — Quota Exhaustion & Sliding-Window Rate Limiter", () => {
  beforeEach(() => {
    __resetMemoryRateLimiter();
    process.env.ENABLE_RATE_LIMIT_TESTS = "1";
  });

  function makeRequest(ip = "192.168.1.10"): NextRequest {
    return new NextRequest("https://math.dytcore.com/api/test", {
      headers: {
        "x-real-ip": ip,
      },
    });
  }

  it("1. Under-limit requests are allowed with decreasing remaining quota", async () => {
    const req = makeRequest("10.0.0.1");
    const limit = SECURITY_POLICIES.upscale.limit; // 3 requests

    const res1 = await checkRateLimit(req, "upscale");
    expect(res1.allowed).toBe(true);
    expect(res1.limit).toBe(limit);
    expect(res1.remaining).toBe(limit - 1);

    const res2 = await checkRateLimit(req, "upscale");
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(limit - 2);
  });

  it("2. Reaching the exact limit succeeds with remaining 0", async () => {
    const req = makeRequest("10.0.0.2");
    const limit = SECURITY_POLICIES.upscale.limit; // 3

    await checkRateLimit(req, "upscale");
    await checkRateLimit(req, "upscale");
    const res3 = await checkRateLimit(req, "upscale");

    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it("3. Exceeding the sliding limit blocks with 429 and Retry-After header", async () => {
    const req = makeRequest("10.0.0.3");
    const limit = SECURITY_POLICIES.upscale.limit; // 3

    for (let i = 0; i < limit; i++) {
      await enforceRateLimit(req, "upscale");
    }

    const blockedRes = await enforceRateLimit(req, "upscale");
    expect(blockedRes).not.toBeNull();
    expect(blockedRes?.status).toBe(429);

    const retryAfter = blockedRes?.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(parseInt(retryAfter!, 10)).toBeGreaterThan(0);

    const body = await blockedRes?.json();
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("4. Composite key isolates quotas per account on the same IP", async () => {
    const req = makeRequest("10.0.0.4");
    const limit = SECURITY_POLICIES.login.limit; // 5

    // Exhaust quota for account A
    for (let i = 0; i < limit; i++) {
      await checkRateLimit(req, "login", { accountId: "account_A" });
    }

    const resAccountA = await checkRateLimit(req, "login", { accountId: "account_A" });
    expect(resAccountA.allowed).toBe(false);

    // Account B on same IP must still have its own quota
    const resAccountB = await checkRateLimit(req, "login", { accountId: "account_B" });
    expect(resAccountB.allowed).toBe(true);
  });

  it("5. Strict security endpoints have failClosed flag configured", () => {
    expect(SECURITY_POLICIES.login.failClosed).toBe(true);
    expect(SECURITY_POLICIES.admin_recovery.failClosed).toBe(true);
    expect(SECURITY_POLICIES.change_password.failClosed).toBe(true);
    expect(SECURITY_POLICIES.admin_force_reset.failClosed).toBe(true);
    expect(SECURITY_POLICIES.user_management.failClosed).toBe(true);
  });
});
