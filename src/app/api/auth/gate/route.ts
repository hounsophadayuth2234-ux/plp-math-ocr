import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  anonymizeIdentifier,
  checkRateLimitAndLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth-gate";

import { enforceRateLimit } from "@/lib/rate-limiter";

/**
 * Extracts a privacy-safe client identity string from request headers.
 */
function getClientSignature(req: NextRequest): string {
  const xRealIp = req.headers.get("x-real-ip");
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (xRealIp && xRealIp.trim()) || (forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1");
  const userAgent = (req.headers.get("user-agent") || "unknown").slice(0, 100);
  return `${ip}::${userAgent}`;
}

/**
 * GET /api/auth/gate - Check current session validity
 */
export async function GET(req: NextRequest) {
  const rateLimitBlock = await enforceRateLimit(req, "settings");
  if (rateLimitBlock) return rateLimitBlock;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { authenticated: false },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  const verification = await verifySessionToken(token);
  return NextResponse.json(
    { authenticated: verification.valid },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    }
  );
}

/**
 * POST /api/auth/gate - Password verification & session issuance
 */
export async function POST(req: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";

  // 1. Enforce JSON Content-Type
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Invalid Content-Type. Expected application/json." },
      { status: 415, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 2. Request body size guard (max 4 KB)
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 4096) {
    return NextResponse.json(
      { error: "Payload too large." },
      { status: 413, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 3. Compute anonymized client identifier
  const rawSignature = getClientSignature(req);
  const hashedId = await anonymizeIdentifier(rawSignature);

  // 4. Rate-limit and lockout check
  const rateLimitStatus = await checkRateLimitAndLockout(hashedId);
  if (!rateLimitStatus.allowed) {
    const retryAfter = rateLimitStatus.retryAfterSeconds || 1800;
    return NextResponse.json(
      {
        error: "Too many failed attempts. Access is temporarily suspended. Please try again later.",
        locked: true,
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "Cache-Control": "no-store, private",
        },
      }
    );
  }

  // 5. Safe payload parsing
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON payload." },
      { status: 400, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  const { password, adminRecoveryKey } = (body || {}) as {
    password?: string;
    adminRecoveryKey?: string;
  };

  // Safe administrative recovery path (unlocks locked IP with recovery token)
  const envRecoveryKey = process.env.APP_GATE_ADMIN_RECOVERY_KEY?.trim();
  if (
    adminRecoveryKey &&
    envRecoveryKey &&
    adminRecoveryKey.trim() === envRecoveryKey
  ) {
    await clearFailedAttempts(hashedId);
    return NextResponse.json(
      { success: true, message: "Administrative recovery: Rate limits reset." },
      { status: 200, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  if (!password || typeof password !== "string") {
    return NextResponse.json(
      { error: "Password is required." },
      { status: 400, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 6. Constant-time password verification
  const isMatch = await verifyPassword(password);

  if (!isMatch) {
    const failRecord = await recordFailedAttempt(hashedId);
    if (failRecord.locked) {
      const retryAfter = failRecord.retryAfterSeconds || 1800;
      return NextResponse.json(
        {
          error: "Too many failed attempts. Access is temporarily suspended. Please try again later.",
          locked: true,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "Cache-Control": "no-store, private",
          },
        }
      );
    }

    return NextResponse.json(
      { error: "Invalid credentials." },
      { status: 401, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 7. Successful verification: Clear attempts and generate HMAC session token
  await clearFailedAttempts(hashedId);
  const sessionToken = await createSessionToken();

  const response = NextResponse.json(
    {
      success: true,
      message: "Authentication successful.",
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    }
  );

  // Set secure HttpOnly session cookie
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

/**
 * DELETE /api/auth/gate - Terminate session & clear cookie
 */
export async function DELETE() {
  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json(
    { success: true, message: "Session terminated successfully." },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    }
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
