import { NextRequest, NextResponse } from "next/server";
import { generateCsrfToken, setCsrfCookie, CSRF_COOKIE_NAME } from "@/lib/auth-csrf";

/**
 * Public CSRF endpoint.
 * Returns the existing CSRF token or issues a fresh one, setting the readable cookie.
 * Cache-Control is strictly private & no-cache to prevent edge/browser caching.
 */
export async function GET(req: NextRequest) {
  let token = req.cookies.get(CSRF_COOKIE_NAME)?.value?.trim();
  let generated = false;
  if (!token) {
    token = generateCsrfToken();
    generated = true;
  }

  const res = NextResponse.json(
    {
      success: true,
      csrfToken: token,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );

  setCsrfCookie(res, token);

  return res;
}

