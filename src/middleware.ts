import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken as verifyLegacySession, SESSION_COOKIE_NAME, sanitizeInternalRedirect } from "@/lib/auth-gate";
import { verifySessionToken as verifyAccountSession } from "@/lib/session-token-core";

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

const ALLOWED_ORIGINS = [
  "https://ai-toolkit-hub-nu.vercel.app",
  "https://math.dytcore.com",
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // same-origin or non-browser client
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  const envAllowedOrigin = process.env.TELEGRAM_ALLOWED_ORIGIN?.trim();
  if (envAllowedOrigin && origin === envAllowedOrigin) return true;
  // Allow localhost in development
  if (process.env.NODE_ENV !== "production" && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");

  // Handle CORS Preflight and validation for API routes
  if (pathname.startsWith("/api/")) {
    const isAllowed = isOriginAllowed(origin);

    if (req.method === "OPTIONS") {
      if (!isAllowed) {
        return new NextResponse(null, { status: 403 });
      }
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin || "https://ai-toolkit-hub-nu.vercel.app",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, x-csrf-token",
          "Access-Control-Allow-Credentials": "true",
          "Vary": "Origin",
        },
      });
    }

    if (origin && !isAllowed) {
      return NextResponse.json(
        { error: "Forbidden: Origin is not permitted by CORS policy." },
        { status: 403, headers: { "Vary": "Origin" } }
      );
    }
  }

  // Helper to append CORS headers to API responses
  const applyCorsHeaders = (res: NextResponse) => {
    if (pathname.startsWith("/api/") && origin && isOriginAllowed(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.set("Access-Control-Allow-Credentials", "true");
      res.headers.set("Vary", "Origin");
    }
    return res;
  };

  // 1. Unrestricted Public Endpoints
  const isPublicAuthRoute =
    pathname === "/login" ||
    pathname === "/admin/recovery" ||
    pathname === "/api/auth/admin-recovery" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/session" ||
    pathname === "/api/auth/gate" ||
    pathname === "/api/auth/telegram/login" ||
    pathname === "/api/auth/telegram/config" ||
    pathname === "/api/health" ||
    pathname.startsWith("/health");

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ||
    req.cookies.get("__Secure-dyt_gate_session")?.value;

  let isAuthenticated = false;
  let userRole: "ADMIN" | "USER" = "USER";

  if (sessionCookie) {
    // Check structured account session using Edge Web Crypto
    const structCheck = await verifyAccountSession(sessionCookie);
    if (structCheck.valid && structCheck.payload) {
      isAuthenticated = true;
      userRole = structCheck.payload.role || "USER";
    } else {
      // Check legacy gate token
      const legacyCheck = await verifyLegacySession(sessionCookie);
      if (legacyCheck.valid) {
        isAuthenticated = true;
        userRole = "ADMIN"; // Legacy gate token holders are treated as administrative
      }
    }
  }

  // 2. Redirect authenticated users away from the login gate to dashboard (internal only)
  if (pathname === "/login" && isAuthenticated) {
    const returnUrl = sanitizeInternalRedirect(req.nextUrl.searchParams.get("from"));
    const redirectUrl = new URL(returnUrl, req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // 3. Allow public auth route
  if (isPublicAuthRoute) {
    return NextResponse.next();
  }

  // 3b. Safe canonical redirect for legacy route alias
  if (pathname === "/math-ocr") {
    const canonicalUrl = new URL("/plp-math-content", req.url);
    canonicalUrl.search = req.nextUrl.search;
    return NextResponse.redirect(canonicalUrl, 308);
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
          headers: {
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
          },
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

  // 5. Enforce ADMIN role on /admin and /api/admin/* (excluding public recovery page)
  if (
    (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) &&
    pathname !== "/admin/recovery"
  ) {
    if (userRole !== "ADMIN") {
      if (pathname.startsWith("/api/")) {
        return applyCorsHeaders(
          NextResponse.json(
            {
              error: "Forbidden: Administrator role required (ត្រូវការសិទ្ធិជាអ្នកគ្រប់គ្រងប្រព័ន្ធ ADMIN).",
              authenticated: true,
              role: userRole,
            },
            {
              status: 403,
              headers: {
                "Cache-Control": "no-store, private",
                "X-Content-Type-Options": "nosniff",
              },
            }
          )
        );
      }

      // If user accesses /admin page without admin role, redirect to dashboard with error flag
      const dashboardUrl = new URL("/", req.url);
      dashboardUrl.searchParams.set("error", "unauthorized_admin");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  const response = NextResponse.next();
  return applyCorsHeaders(response);
}


