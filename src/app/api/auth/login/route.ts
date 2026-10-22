import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserStore, toSafeUser } from "@/lib/user-store";
import { createSessionToken, setSessionCookie } from "@/lib/auth-session";
import { generateCsrfToken, setCsrfCookie } from "@/lib/auth-csrf";
import { AuditLogger } from "@/lib/audit-logger";
import { bootstrapFirstAdmin } from "@/lib/bootstrap-admin";
import {
  recordFailedAttempt,
  clearFailedAttempts,
  checkRateLimitAndLockout,
  anonymizeIdentifier,
  getClientIp,
} from "@/lib/auth-gate";

export async function POST(req: NextRequest) {
  const rawIp = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || undefined;
  const anonymizedIp = await anonymizeIdentifier(rawIp);

  // 1. Check Rate Limit & Lockout
  const lockoutStatus = await checkRateLimitAndLockout(anonymizedIp);
  if (!lockoutStatus.allowed) {
    await AuditLogger.logEvent({
      type: "LOGIN_FAILURE",
      actorId: "anonymous",
      rawIp,
      userAgent,
      details: { reason: "IP locked due to repeated failed login attempts" },
    });
    return NextResponse.json(
      {
        error: `ប្រព័ន្ធត្រូវបានចាក់សោបណ្តោះអាសន្ន។ សូមរង់ចាំ ${lockoutStatus.retryAfterSeconds} វិនាទី (Account locked due to multiple failed attempts. Try again later).`,
        locked: true,
        retryAfter: lockoutStatus.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(lockoutStatus.retryAfterSeconds),
        },
      }
    );
  }

  // 2. Parse payload
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "ទម្រង់ទិន្នន័យមិនត្រឹមត្រូវ (Invalid JSON payload)" },
      { status: 400 }
    );
  }

  const { usernameOrEmail, password } = body || {};

  if (!usernameOrEmail || !password || typeof password !== "string") {
    return NextResponse.json(
      { error: "សូមបញ្ចូលឈ្មោះអ្នកប្រើប្រាស់/អ៊ីមែល និងពាក្យសម្ងាត់ (Username/email and password required)" },
      { status: 400 }
    );
  }

  // Ensure first admin is seeded if database is brand new
  await bootstrapFirstAdmin();

  const identifier = String(usernameOrEmail).trim();
  const user = await UserStore.getUserByUsernameOrEmail(identifier);

  // Constant-time dummy hash verification if user not found to prevent user enumeration via timing
  const DUMMY_HASH = "$2b$12$e7k/aM6r3qFq8PjZ5wA9reL1oGv4H6t2I9j0K1l2M3n4O5p6Q7r8S";
  const targetHash = user?.passwordHash || DUMMY_HASH;
  const passwordMatch = await bcrypt.compare(password, targetHash);

  if (!user || !passwordMatch || user.status !== "ACTIVE") {
    const failResult = await recordFailedAttempt(anonymizedIp);

    await AuditLogger.logEvent({
      type: "LOGIN_FAILURE",
      actorId: user?.id || "anonymous",
      actorUsername: identifier,
      rawIp,
      userAgent,
      details: {
        reason: !user ? "User not found" : user.status !== "ACTIVE" ? "User disabled" : "Wrong password",
        attempts: failResult.attempts,
      },
    });

    if (failResult.locked) {
      return NextResponse.json(
        {
          error: "ការប៉ុនប៉ងមិនត្រឹមត្រូវច្រើនដង។ ប្រព័ន្ធត្រូវបានចាក់សោ 30 នាទី (Account locked for 30 minutes).",
          locked: true,
          retryAfter: failResult.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(failResult.retryAfterSeconds) },
        }
      );
    }

    return NextResponse.json(
      { error: "ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ (Invalid username or password)" },
      { status: 401 }
    );
  }

  // Successful login
  await clearFailedAttempts(anonymizedIp);

  // Update last login timestamp and increment active session count
  const updatedUser = await UserStore.updateUser(user.id, {
    lastLoginAt: Date.now(),
    activeSessionsCount: (user.activeSessionsCount || 0) + 1,
  });

  const safeUser = toSafeUser(updatedUser);
  const sessionToken = await createSessionToken(safeUser);
  const csrfToken = generateCsrfToken();

  await AuditLogger.logEvent({
    type: "LOGIN_SUCCESS",
    actorId: user.id,
    actorUsername: user.username,
    rawIp,
    userAgent,
    details: { role: user.role },
  });

  const response = NextResponse.json({
    success: true,
    user: safeUser,
    csrfToken,
    message: "ចូលប្រព័ន្ធដោយជោគជ័យ (Login successful)",
  });

  setSessionCookie(response, sessionToken);
  setCsrfCookie(response, csrfToken);

  return response;
}
