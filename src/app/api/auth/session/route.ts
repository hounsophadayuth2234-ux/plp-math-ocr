import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { generateCsrfToken, setCsrfCookie, CSRF_COOKIE_NAME } from "@/lib/auth-csrf";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }

  // Ensure CSRF token is provided
  let csrfToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  const res = NextResponse.json({
    authenticated: true,
    user,
    csrfToken: csrfToken || undefined,
  });

  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);
  }

  return res;
}
