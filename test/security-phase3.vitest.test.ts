import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createSessionToken,
  enforceRouteAuth,
  SESSION_COOKIE_NAME,
} from "@/lib/auth-gate";
import {
  isBlockedHostname,
  isPrivateOrReservedIp,
  isPrivateOrReservedIpv4,
  isPrivateOrReservedIpv6,
  validateDestinationUrl,
  safeFetch,
} from "@/lib/ssrf-guard";
import nextConfig from "../next.config";

// Route handlers for direct endpoint testing
import { POST as postMathOcr } from "@/app/api/math-ocr/route";
import { GET as getRemoveBg, POST as postRemoveBg } from "@/app/api/remove-bg/route";
import { POST as postGenerateImage } from "@/app/api/generate-image/route";
import { POST as postUpscale } from "@/app/api/upscale/route";
import { POST as postImageUpscale } from "@/app/api/image-upscale/route";
import { GET as getSettings, POST as postSettings } from "@/app/api/settings/route";
import { POST as postWebScraper } from "@/app/api/web-scraper/route";

describe("Phase 3: Security Hardening", () => {
  const TEST_SECRET = "super-secret-key-at-least-32-chars-long!";
  const originalEnableRouteAuth = process.env.ENABLE_ROUTE_AUTH_TESTS;

  beforeEach(() => {
    process.env.APP_GATE_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalEnableRouteAuth !== undefined) {
      process.env.ENABLE_ROUTE_AUTH_TESTS = originalEnableRouteAuth;
    } else {
      delete process.env.ENABLE_ROUTE_AUTH_TESTS;
    }
  });

  // =========================================================================
  // 1. Defense-in-Depth Authentication Tests
  // =========================================================================
  describe("Defense-in-Depth API Route Authentication", () => {
    beforeEach(() => {
      process.env.ENABLE_ROUTE_AUTH_TESTS = "1";
    });

    afterEach(() => {
      if (originalEnableRouteAuth !== undefined) {
        process.env.ENABLE_ROUTE_AUTH_TESTS = originalEnableRouteAuth;
      } else {
        delete process.env.ENABLE_ROUTE_AUTH_TESTS;
      }
    });

    it("rejects unauthenticated direct requests with HTTP 401 UNAUTHORIZED", async () => {
      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
      });

      const res = await enforceRouteAuth(req);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(401);

      const data = await res?.json();
      expect(data.code).toBe("UNAUTHORIZED");
      expect(data.authenticated).toBe(false);
      expect(res?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("rejects direct calls with tampered session tokens with HTTP 401", async () => {
      const validToken = await createSessionToken(TEST_SECRET);
      const [payloadB64, signatureB64] = validToken.split(".");
      const tamperedToken = `${payloadB64}.${signatureB64.slice(0, -4)}XXXX`;

      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${tamperedToken}`,
        },
      });

      const res = await enforceRouteAuth(req);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(401);
      const data = await res?.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("rejects direct calls with expired session tokens with HTTP 401", async () => {
      // Create manually expired token (exp in the past)
      const now = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const payload = {
        iss: "dyt-cyber-gate",
        iat: now - 3600,
        exp: now,
        jti: "expired-test-id",
      };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(TEST_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
      const sigB64 = Buffer.from(sig).toString("base64url");
      const expiredToken = `${payloadB64}.${sigB64}`;

      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${expiredToken}`,
        },
      });

      const res = await enforceRouteAuth(req);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(401);
      const data = await res?.json();
      expect(data.error).toContain("expired");
    });

    it("allows valid authenticated requests via session cookie", async () => {
      const validToken = await createSessionToken(TEST_SECRET);
      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        },
      });

      const res = await enforceRouteAuth(req);
      expect(res).toBeNull(); // null means authorized, request allowed to proceed
    });

    it("allows valid authenticated requests via Bearer authorization header", async () => {
      const validToken = await createSessionToken(TEST_SECRET);
      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      const res = await enforceRouteAuth(req);
      expect(res).toBeNull();
    });

    it("enforces HTTP 401 across all 8 protected route handlers when unauthenticated", async () => {
      process.env.ENABLE_ROUTE_AUTH_TESTS = "1";

      // 1. /api/math-ocr
      const reqOcr = new NextRequest("http://localhost:3000/api/math-ocr", { method: "POST" });
      const resOcr = await postMathOcr(reqOcr);
      expect(resOcr.status).toBe(401);

      // 2. /api/remove-bg (GET & POST)
      const reqRembgGet = new NextRequest("http://localhost:3000/api/remove-bg", { method: "GET" });
      const resRembgGet = await getRemoveBg(reqRembgGet);
      expect(resRembgGet.status).toBe(401);

      const reqRembgPost = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST" });
      const resRembgPost = await postRemoveBg(reqRembgPost);
      expect(resRembgPost.status).toBe(401);

      // 3. /api/generate-image
      const reqGen = new NextRequest("http://localhost:3000/api/generate-image", { method: "POST" });
      const resGen = await postGenerateImage(reqGen);
      expect(resGen.status).toBe(401);

      // 4. /api/upscale
      const reqUpscale = new NextRequest("http://localhost:3000/api/upscale", { method: "POST" });
      const resUpscale = await postUpscale(reqUpscale);
      expect(resUpscale.status).toBe(401);

      // 5. /api/image-upscale
      const reqImgUpscale = new NextRequest("http://localhost:3000/api/image-upscale", { method: "POST" });
      const resImgUpscale = await postImageUpscale(reqImgUpscale);
      expect(resImgUpscale.status).toBe(401);

      // 6. /api/settings (GET & POST)
      const reqSetGet = new NextRequest("http://localhost:3000/api/settings", { method: "GET" });
      const resSetGet = await getSettings(reqSetGet);
      expect(resSetGet.status).toBe(401);

      const reqSetPost = new NextRequest("http://localhost:3000/api/settings", { method: "POST" });
      const resSetPost = await postSettings(reqSetPost);
      expect(resSetPost.status).toBe(401);

      // 7. /api/web-scraper
      const reqScraper = new NextRequest("http://localhost:3000/api/web-scraper", { method: "POST" });
      const resScraper = await postWebScraper(reqScraper);
      expect(resScraper.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. SSRF Protection Tests
  // =========================================================================
  describe("SSRF Protection Engine", () => {
    describe("Blocked Hostnames & Metadata Services", () => {
      it("blocks localhost, 127.0.0.1, 0.0.0.0, and ::1", () => {
        expect(isBlockedHostname("localhost")).toBe(true);
        expect(isBlockedHostname("LOCALHOST")).toBe(true);
        expect(isBlockedHostname("127.0.0.1")).toBe(true);
        expect(isBlockedHostname("0.0.0.0")).toBe(true);
        expect(isBlockedHostname("::1")).toBe(true);
        expect(isBlockedHostname("[::1]")).toBe(true);
      });

      it("blocks internal and local suffixes (.local, .internal, .lan)", () => {
        expect(isBlockedHostname("myhost.local")).toBe(true);
        expect(isBlockedHostname("database.internal")).toBe(true);
        expect(isBlockedHostname("router.lan")).toBe(true);
        expect(isBlockedHostname("server.corp")).toBe(true);
      });

      it("blocks cloud metadata service endpoints (AWS/GCP/Azure/Kube)", () => {
        expect(isBlockedHostname("metadata.google.internal")).toBe(true);
        expect(isBlockedHostname("sub.metadata.google.internal")).toBe(true);
        expect(isBlockedHostname("instance-data")).toBe(true);
        expect(isBlockedHostname("kubernetes.default")).toBe(true);
      });

      it("allows legitimate public domains", () => {
        expect(isBlockedHostname("example.com")).toBe(false);
        expect(isBlockedHostname("images.unsplash.com")).toBe(false);
        expect(isBlockedHostname("api.github.com")).toBe(false);
      });
    });

    describe("Private, Loopback, and Reserved IPv4 Ranges", () => {
      it("blocks 127.0.0.0/8 loopback subnet", () => {
        expect(isPrivateOrReservedIpv4("127.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIpv4("127.1.2.3")).toBe(true);
        expect(isPrivateOrReservedIpv4("127.255.255.254")).toBe(true);
      });

      it("blocks RFC 1918 private subnets (10/8, 172.16/12, 192.168/16)", () => {
        expect(isPrivateOrReservedIpv4("10.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIpv4("10.255.255.255")).toBe(true);
        expect(isPrivateOrReservedIpv4("172.16.0.1")).toBe(true);
        expect(isPrivateOrReservedIpv4("172.24.50.1")).toBe(true);
        expect(isPrivateOrReservedIpv4("172.31.255.254")).toBe(true);
        expect(isPrivateOrReservedIpv4("192.168.0.1")).toBe(true);
        expect(isPrivateOrReservedIpv4("192.168.100.200")).toBe(true);
      });

      it("blocks RFC 3927 link-local and cloud metadata 169.254.169.254", () => {
        expect(isPrivateOrReservedIpv4("169.254.169.254")).toBe(true);
        expect(isPrivateOrReservedIpv4("169.254.1.1")).toBe(true);
      });

      it("blocks RFC 6598 CGNAT 100.64.0.0/10", () => {
        expect(isPrivateOrReservedIpv4("100.64.0.1")).toBe(true);
        expect(isPrivateOrReservedIpv4("100.100.50.25")).toBe(true);
        expect(isPrivateOrReservedIpv4("100.127.255.255")).toBe(true);
      });

      it("blocks multicast (224/4) and reserved (240/4)", () => {
        expect(isPrivateOrReservedIpv4("224.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIpv4("240.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIpv4("255.255.255.255")).toBe(true);
      });

      it("allows public IPv4 addresses", () => {
        expect(isPrivateOrReservedIpv4("8.8.8.8")).toBe(false);
        expect(isPrivateOrReservedIpv4("1.1.1.1")).toBe(false);
        expect(isPrivateOrReservedIpv4("93.184.216.34")).toBe(false); // example.com
      });
    });

    describe("Private, Loopback, and Reserved IPv6 Ranges", () => {
      it("blocks IPv6 loopback (::1) and unspecified (::)", () => {
        expect(isPrivateOrReservedIpv6("::1")).toBe(true);
        expect(isPrivateOrReservedIpv6("0:0:0:0:0:0:0:1")).toBe(true);
        expect(isPrivateOrReservedIpv6("::")).toBe(true);
      });

      it("blocks IPv4-mapped IPv6 pointing to private addresses", () => {
        expect(isPrivateOrReservedIpv6("::ffff:127.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIpv6("::ffff:169.254.169.254")).toBe(true);
        expect(isPrivateOrReservedIpv6("::ffff:10.0.0.5")).toBe(true);
      });

      it("blocks Unique Local Address (fc00::/7) and Link-Local (fe80::/10)", () => {
        expect(isPrivateOrReservedIpv6("fc00::1")).toBe(true);
        expect(isPrivateOrReservedIpv6("fd12:3456:789a:1::1")).toBe(true);
        expect(isPrivateOrReservedIpv6("fe80::1")).toBe(true);
      });

      it("universal isPrivateOrReservedIp routes correctly", () => {
        expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIp("::1")).toBe(true);
        expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
      });
    });

    describe("URL Destination Validation & DNS Resolution", () => {
      it("rejects non-HTTP/HTTPS protocols (file, ftp, gopher)", async () => {
        const fileCheck = await validateDestinationUrl("file:///etc/passwd");
        expect(fileCheck.ok).toBe(false);
        expect(fileCheck.error).toContain("Invalid protocol");

        const ftpCheck = await validateDestinationUrl("ftp://evil.com/payload");
        expect(ftpCheck.ok).toBe(false);
      });

      it("rejects loopback and private destination URLs", async () => {
        const res = await validateDestinationUrl("http://127.0.0.1:8080/admin");
        expect(res.ok).toBe(false);
        expect(res.error).toContain("SSRF blocked");
      });

      it("rejects AWS metadata endpoint", async () => {
        const res = await validateDestinationUrl("http://169.254.169.254/latest/meta-data/");
        expect(res.ok).toBe(false);
        expect(res.error).toContain("SSRF blocked");
      });
    });

    describe("safeFetch Redirect & Bound Protections", () => {
      it("rejects safeFetch to localhost directly", async () => {
        await expect(safeFetch("http://127.0.0.1:3000/secret")).rejects.toThrow(/SSRF blocked/i);
      });

      it("rejects safeFetch to metadata IP directly", async () => {
        await expect(safeFetch("http://169.254.169.254/secret")).rejects.toThrow(/SSRF blocked/i);
      });
    });
  });

  // =========================================================================
  // 3. Security Headers Tests
  // =========================================================================
  describe("Security Headers Configuration", () => {
    it("configures Strict-Transport-Security, X-Frame-Options DENY, and CSP in next.config.ts", async () => {
      expect(typeof nextConfig.headers).toBe("function");
      if (typeof nextConfig.headers === "function") {
        const headerRoutes = await nextConfig.headers();
        const globalRoute = headerRoutes.find((r) => r.source === "/:path*");
        expect(globalRoute).toBeDefined();

        const headers = globalRoute?.headers || [];
        const headerMap = new Map(headers.map((h) => [h.key, h.value]));

        // 1. HSTS
        expect(headerMap.get("Strict-Transport-Security")).toBe(
          "max-age=63072000; includeSubDomains; preload"
        );

        // 2. X-Frame-Options DENY
        expect(headerMap.get("X-Frame-Options")).toBe("DENY");

        // 3. X-Content-Type-Options nosniff
        expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");

        // 4. Referrer-Policy
        expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");

        // 5. Content-Security-Policy
        const csp = headerMap.get("Content-Security-Policy");
        expect(csp).toBeDefined();
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("worker-src 'self' blob:");
        expect(csp).toContain("https://fonts.googleapis.com");
      }
    });
  });
});
