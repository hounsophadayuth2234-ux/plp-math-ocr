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
  let csrfToken = req.cookies.get(CSRF_COOKIE_NAME)?.value?.trim();
  let newCsrfGenerated = false;
  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    newCsrfGenerated = true;
  }

  const res = NextResponse.json(
    {
      authenticated: true,
      user,
      csrfToken,
    },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    }
  );

  if (newCsrfGenerated) {
    setCsrfCookie(res, csrfToken);
  }

  return res;
}
