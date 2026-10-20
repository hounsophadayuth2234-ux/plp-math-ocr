import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-gate";

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * 1. _next/static (static files)
     * 2. _next/image (image optimization files)
     * 3. favicon.ico, sitemap.xml, robots.txt
     * 4. Static images/vectors in public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Unrestricted Public Endpoints
  const isPublicAuthRoute =
    pathname === "/login" ||
    pathname === "/api/auth/gate" ||
    pathname === "/api/health" ||
    pathname.startsWith("/health");

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  let isAuthenticated = false;

  if (sessionCookie) {
    const check = await verifySessionToken(sessionCookie);
    isAuthenticated = check.valid;
  }

  // 2. Redirect authenticated users away from the login gate to dashboard
  if (pathname === "/login" && isAuthenticated) {
    const returnUrl = req.nextUrl.searchParams.get("from") || "/";
    const redirectUrl = new URL(returnUrl, req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // 3. Allow public auth route
  if (isPublicAuthRoute) {
    return NextResponse.next();
  }

  // 4. Protect all workspace pages and API routes
  if (!isAuthenticated) {
    // API routes return clean 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Unauthorized: Access requires active gate authentication.",
          authenticated: false,
        },
        {
          status: 401,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }

    // Page routes redirect to /login with original path preserved in query
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
