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
 * Validates the CSRF token on state-changing requests (POST, PATCH, DELETE, PUT).
 * Compares the token sent in header (or body) with the token in the cookie.
 */
export function validateCsrfToken(req: NextRequest, bodyCsrfToken?: string): { valid: boolean; error?: string } {
  // Safe idempotent methods do not require CSRF
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { valid: true };
  }

  // During automated unit testing where headers might be mocked
  if (process.env.NODE_ENV === "test" && req.headers.get("x-skip-csrf-test") === "1") {
    return { valid: true };
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
