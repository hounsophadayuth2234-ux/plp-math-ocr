import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  getClientIp,
  anonymizeClientKey,
  enforceRateLimit,
  checkRateLimit,
  RATE_LIMIT_CONFIGS,
  __resetMemoryRateLimiter,
} from "@/lib/rate-limiter";

describe("Phase 1: Distributed Rate Limiter Engine", () => {
  beforeEach(() => {
    process.env.ENABLE_RATE_LIMIT_TESTS = "1";
    __resetMemoryRateLimiter();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    delete process.env.ENABLE_RATE_LIMIT_TESTS;
  });

  describe("Safe IP Extraction", () => {
    it("prioritizes x-real-ip header over x-forwarded-for", () => {
      const req = new NextRequest("http://localhost/api/math-ocr", {
        headers: {
          "x-real-ip": "203.0.113.195",
          "x-forwarded-for": "198.51.100.1, 10.0.0.1",
        },
      });
      expect(getClientIp(req)).toBe("203.0.113.195");
    });

    it("extracts first IP from x-forwarded-for if x-real-ip is missing", () => {
      const req = new NextRequest("http://localhost/api/math-ocr", {
        headers: {
          "x-forwarded-for": "198.51.100.55, 10.0.0.1",
        },
      });
      expect(getClientIp(req)).toBe("198.51.100.55");
    });

    it("falls back to 127.0.0.1 if no forwarding headers are present", () => {
      const req = new NextRequest("http://localhost/api/math-ocr");
      expect(getClientIp(req)).toBe("127.0.0.1");
    });
  });

  describe("Client Identifier Anonymization", () => {
    it("computes deterministic 32-char hex pseudonym without leaking raw IP", async () => {
      const hash1 = await anonymizeClientKey("203.0.113.5", "math_ocr");
      const hash2 = await anonymizeClientKey("203.0.113.5", "math_ocr");
      const hashDifferent = await anonymizeClientKey("203.0.113.6", "math_ocr");

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(32);
      expect(hash1).not.toContain("203.0.113.5");
      expect(hash1).not.toBe(hashDifferent);
    });

    it("differentiates categories for the same IP to prevent quota sharing across different features", async () => {
      const hashOcr = await anonymizeClientKey("203.0.113.5", "math_ocr");
      const hashRembg = await anonymizeClientKey("203.0.113.5", "remove_bg");
      expect(hashOcr).not.toBe(hashRembg);
    });
  });

  describe("Enforce Rate Limits across Categories", () => {
    it("allows requests up to configured category limit and blocks afterwards with 429", async () => {
      const limit = RATE_LIMIT_CONFIGS.upscale.limit; // 3 requests
      expect(limit).toBe(3);

      const makeReq = () =>
        new NextRequest("http://localhost/api/upscale", {
          headers: { "x-real-ip": "192.0.2.10" },
        });

      // First 3 requests must pass
      for (let i = 1; i <= limit; i++) {
        const block = await enforceRateLimit(makeReq(), "upscale");
        expect(block).toBeNull();
      }

      // 4th request must be blocked with HTTP 429
      const blockedRes = await enforceRateLimit(makeReq(), "upscale");
      expect(blockedRes).not.toBeNull();
      expect(blockedRes?.status).toBe(429);

      // Verify response payload and headers
      const body = await blockedRes?.json();
      expect(body.ok).toBe(false);
      expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(body.retryAfter).toBeGreaterThanOrEqual(1);

      expect(blockedRes?.headers.get("Retry-After")).toBeTruthy();
      expect(blockedRes?.headers.get("X-RateLimit-Limit")).toBe("3");
      expect(blockedRes?.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(blockedRes?.headers.get("X-RateLimit-Reset")).toBeTruthy();
    });

    it("verifies math_ocr limit is 10 requests / minute", async () => {
      const makeReq = () =>
        new NextRequest("http://localhost/api/math-ocr", {
          headers: { "x-real-ip": "192.0.2.20" },
        });

      for (let i = 0; i < 10; i++) {
        const block = await enforceRateLimit(makeReq(), "math_ocr");
        expect(block).toBeNull();
      }

      const blockedRes = await enforceRateLimit(makeReq(), "math_ocr");
      expect(blockedRes?.status).toBe(429);
      expect(blockedRes?.headers.get("X-RateLimit-Limit")).toBe("10");
    });

    it("verifies remove_bg limit is 5 requests / minute", async () => {
      const makeReq = () =>
        new NextRequest("http://localhost/api/remove-bg", {
          headers: { "x-real-ip": "192.0.2.30" },
        });

      for (let i = 0; i < 5; i++) {
        const block = await enforceRateLimit(makeReq(), "remove_bg");
        expect(block).toBeNull();
      }

      const blockedRes = await enforceRateLimit(makeReq(), "remove_bg");
      expect(blockedRes?.status).toBe(429);
      expect(blockedRes?.headers.get("X-RateLimit-Limit")).toBe("5");
    });
  });

  describe("Environment Isolation", () => {
    it("ensures preview and production environments use isolated memory/rate buckets", async () => {
      const ip = "192.0.2.99";
      const makeReq = () =>
        new NextRequest("http://localhost/api/generate-image", {
          headers: { "x-real-ip": ip },
        });

      // 1. Simulate production requests until exhausted
      process.env.VERCEL_ENV = "production";
      for (let i = 0; i < 3; i++) {
        const block = await enforceRateLimit(makeReq(), "generate_image");
        expect(block).toBeNull();
      }
      const prodBlocked = await enforceRateLimit(makeReq(), "generate_image");
      expect(prodBlocked?.status).toBe(429);

      // 2. Switch environment to preview — same IP must have fresh quota
      process.env.VERCEL_ENV = "preview";
      const previewAllowed = await enforceRateLimit(makeReq(), "generate_image");
      expect(previewAllowed).toBeNull();

      delete process.env.VERCEL_ENV;
    });
  });
});
