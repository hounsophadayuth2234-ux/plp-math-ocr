import { NextRequest, NextResponse } from "next/server";
import { UserStore, SafeUser, toSafeUser } from "./user-store";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SessionTokenPayload,
  createSessionToken,
  verifySessionToken as verifySessionTokenStructure,
} from "./session-token-core";

export {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionTokenStructure,
};
export type { SessionTokenPayload };

/**
 * Performs authoritative server-side session validation.
 * Verifies cryptographic signature AND checks whether the user is still active in persistent storage.
 */
export async function getSessionUser(req: NextRequest): Promise<SafeUser | null> {
  let token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    token =
      req.cookies.get("__Secure-dyt_gate_session")?.value ||
      req.cookies.get("dyt_gate_session")?.value;
  }

  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) return null;

  const verified = await verifySessionTokenStructure(token);
  if (!verified.valid || !verified.payload?.userId) {
    return null;
  }

  // Authoritative server-side check against database
  const user = await UserStore.getUserById(verified.payload.userId);
  if (!user) return null;

  // Invariant: Disabled users have their session immediately revoked
  if (user.status !== "ACTIVE") {
    return null;
  }

  return toSafeUser(user);
}

/**
 * Sets the secure session cookie on a response.
 */
export function setSessionCookie(res: NextResponse, token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  if (isProd) {
    res.cookies.set("__Secure-dyt_gate_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }
}

/**
 * Clears the session cookie on logout.
 */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  res.cookies.set("__Secure-dyt_gate_session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Helper to enforce authentication on an API route.
 * Returns 401 if unauthenticated.
 */
export async function requireAuth(req: NextRequest): Promise<{ user: SafeUser } | { response: NextResponse }> {
  const user = await getSessionUser(req);
  if (!user) {
    return {
      response: NextResponse.json(
        {
          error: "Unauthorized: Access requires active gate authentication (ត្រូវការការផ្ទៀងផ្ទាត់សម័យកាល).",
          authenticated: false,
        },
        { status: 401 }
      ),
    };
  }
  return { user };
}

/**
 * Helper to enforce ADMIN role on an API route.
 * Returns 401 if unauthenticated, 403 if role !== ADMIN.
 */
export async function requireAdmin(req: NextRequest): Promise<{ user: SafeUser } | { response: NextResponse }> {
  const authResult = await requireAuth(req);
  if ("response" in authResult) {
    return authResult;
  }

  if (authResult.user.role !== "ADMIN") {
    return {
      response: NextResponse.json(
        {
          error: "Forbidden: Administrator role required (ត្រូវការសិទ្ធិជាអ្នកគ្រប់គ្រងប្រព័ន្ធ ADMIN).",
          authenticated: true,
          role: authResult.user.role,
        },
        { status: 403 }
      ),
    };
  }

  return { user: authResult.user };
}
