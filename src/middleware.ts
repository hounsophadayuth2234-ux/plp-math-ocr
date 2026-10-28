import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken as verifyLegacySession, SESSION_COOKIE_NAME, sanitizeInternalRedirect } from "@/lib/auth-gate";
import { verifySessionToken as verifyAccountSession } from "@/lib/session-token-core";

export const config = {
  matcher: [
    /*
     * Match all request paths except:
    /*
     * Match all request paths except:
     * 1. _next/static (static files)
     * 2. _next/image (image optimization files)
     * 3. favicon.ico, sitemap.xml, robots.txt
     * 4. Static images and icons in public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|bin)$).*)",
  ],
};

const ALLOWED_ORIGINS = [
  "https://ai-toolkit-hub-nu.vercel.app",
  "https://math.dytcore.com",
];

function isOriginAllowed(origin: string | null, request?: NextRequest): boolean {
  if (!origin) return true; // same-origin or non-browser client
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  // Allow same-origin requests when origin matches request nextUrl origin
  if (request && origin === request.nextUrl.origin) {
    return true;
  }

  // Dynamically allow all Vercel preview origins (*.vercel.app)
  if (/^https:\/\/[a-zA-Z0-9_.-]+\.vercel\.app$/.test(origin)) {
    return true;
  }

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
    const isAllowed = isOriginAllowed(origin, req);

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
    if (pathname.startsWith("/api/") && origin && isOriginAllowed(origin, req)) {
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
    pathname === "/api/auth/csrf" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/session" ||
    pathname === "/api/auth/gate" ||
    pathname === "/api/auth/telegram/login" ||
    pathname === "/api/auth/telegram/config" ||
    pathname === "/api/health" ||
    pathname.startsWith("/health");

  let sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ||
    req.cookies.get("__Secure-dyt_gate_session")?.value;

  if (!sessionCookie && pathname.startsWith("/api/")) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      sessionCookie = authHeader.slice(7).trim();
    }
  }

  let isAuthenticated = false;
  let userRole: "SUPER_ADMIN" | "ADMIN" | "USER" = "USER";
  let mustChangePassword = false;

  if (sessionCookie) {
    // Check structured account session using Edge Web Crypto
    const structCheck = await verifyAccountSession(sessionCookie);
    if (structCheck.valid && structCheck.payload) {
      isAuthenticated = true;
      userRole = structCheck.payload.role || "USER";
      mustChangePassword = structCheck.payload.mustChangePassword === true;
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
  // If user must change temporary password, allow them to remain on /login to complete the change!
  if (pathname === "/login" && isAuthenticated) {
    if (!mustChangePassword) {
      const returnUrl = sanitizeInternalRedirect(req.nextUrl.searchParams.get("from"));
      const redirectUrl = new URL(returnUrl, req.url);
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  // 2b. Restrict users with mustChangePassword from entering protected workspace until updated
  if (isAuthenticated && mustChangePassword) {
    if (
      pathname === "/login" ||
      pathname === "/api/auth/change-password" ||
      pathname === "/api/auth/csrf" ||
      pathname === "/api/auth/logout" ||
      pathname === "/api/auth/session"
    ) {
      return applyCorsHeaders(NextResponse.next());
    }
    if (pathname.startsWith("/api/")) {
      return applyCorsHeaders(
        NextResponse.json(
          {
            error: "Password change required before accessing system resources (ត្រូវផ្លាស់ប្តូរពាក្យសម្ងាត់ជាមុនសិន).",
            mustChangePassword: true,
          },
          { status: 403 }
        )
      );
    }
    const changeUrl = new URL("/login", req.url);
    changeUrl.searchParams.set("mustChange", "1");
    return NextResponse.redirect(changeUrl);
  }

  // 3. Allow public auth route
  if (isPublicAuthRoute) {
    return applyCorsHeaders(NextResponse.next());
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
      return applyCorsHeaders(
        NextResponse.json(
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
        )
      );
    }

    // Page routes redirect to /login with original path preserved in query
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 5. Enforce 3-Tier RBAC on /admin and /api/admin/* (excluding public recovery page and /admin/dashboard where server-side 404 concealment is enforced)
  if (
    (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) &&
    pathname !== "/admin/recovery" &&
    !pathname.startsWith("/admin/dashboard")
  ) {
    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      if (pathname.startsWith("/api/")) {
        return applyCorsHeaders(
          NextResponse.json(
            {
              error: "Forbidden: Administrator or Super Administrator role required (ត្រូវការសិទ្ធិជា ADMIN ឬ SUPER_ADMIN).",
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

    // Demoted ADMIN role is strictly forbidden from User Management, Audit Logs, and MFA overrides
    if (
      userRole === "ADMIN" &&
      (pathname.startsWith("/api/admin/users") ||
        pathname.startsWith("/api/admin/audit-log") ||
        pathname.startsWith("/api/admin/mfa"))
    ) {
      return applyCorsHeaders(
        NextResponse.json(
          {
            error: "Forbidden: Super Administrator role required for user management and audit logs (ត្រូវការសិទ្ធិជា SUPER_ADMIN).",
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
    // Canonical redirect from /admin to Unified Profile Hub
    if (pathname === "/admin") {
      const targetTab = userRole === "SUPER_ADMIN" ? "users" : "activity";
      const profileUrl = new URL("/profile", req.url);
      const tabParam = req.nextUrl.searchParams.get("tab") || targetTab;
      profileUrl.searchParams.set("tab", tabParam);
      return NextResponse.redirect(profileUrl);
    }
  }

  // 6. Enforce SUPER_ADMIN role on Google Drive Management API routes
  if (pathname.startsWith("/api/auth/google-drive")) {
    if (userRole !== "SUPER_ADMIN") {
      return applyCorsHeaders(
        NextResponse.json(
          {
            error: "Forbidden: Super Administrator role required for Google Drive Storage configuration (ត្រូវការសិទ្ធិជា SUPER_ADMIN).",
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
  }

  const response = NextResponse.next();
  return applyCorsHeaders(response);
}


