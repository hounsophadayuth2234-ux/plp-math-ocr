import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./csrf-constants";

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };

/**
 * Generates a random 32-byte hex CSRF token.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Sets the CSRF cookie on a NextResponse.
 * SameSite: Lax, Secure in production, readable by client JavaScript to set x-csrf-token header.
 */
export function setCsrfCookie(res: NextResponse, token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by client JS to attach to state-changing requests
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 86400 * 7, // 7 days
  });
}

/**
 * Validates Origin for state-changing requests.
 */
export function isAllowedStateChangingOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const cleanHost = host.split(":")[0].toLowerCase();

    if (originUrl.hostname.toLowerCase() === cleanHost) return true;
    if (originUrl.hostname === "math.dytcore.com" || originUrl.hostname.endsWith(".vercel.app")) {
      return true;
    }
    if (process.env.NODE_ENV !== "production" && (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Validates the CSRF token on state-changing requests (POST, PATCH, DELETE, PUT).
 * Compares the token sent in header (or body) with the token in the cookie.
 */
export function validateCsrfToken(req: NextRequest, bodyCsrfToken?: string): { valid: boolean; error?: string } {
  // Safe idempotent methods do not require CSRF
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { valid: true };
  }

  // Enforce origin verification on browser state-changing requests
  if (!isAllowedStateChangingOrigin(req)) {
    return {
      valid: false,
      error: "Cross-origin request rejected (ការស្នើសុំឆ្លងកាត់ប្រភពមិនត្រូវបានអនុញ្ញាត).",
    };
  }

  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value?.trim();
  const headerToken = req.headers.get(CSRF_HEADER_NAME)?.trim() || bodyCsrfToken?.trim();

  if (!cookieToken || !headerToken) {
    return {
      valid: false,
      error: "CSRF token missing. Please refresh and try again (សុពលភាព CSRF បាត់បង់)",
    };
  }

  // Constant-time comparison
  try {
    const bufCookie = Buffer.from(cookieToken, "utf-8");
    const bufHeader = Buffer.from(headerToken, "utf-8");
    if (bufCookie.length !== bufHeader.length || !crypto.timingSafeEqual(bufCookie, bufHeader)) {
      return {
        valid: false,
        error: "CSRF token mismatch. Potential cross-site request forgery detected.",
      };
    }
  } catch {
    return { valid: false, error: "Invalid CSRF token format." };
  }

  return { valid: true };
}
