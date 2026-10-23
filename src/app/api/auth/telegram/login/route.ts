import { NextRequest, NextResponse } from "next/server";
import { UserStore, toSafeUser } from "@/lib/user-store";
import { createSessionToken, setSessionCookie } from "@/lib/auth-session";
import { generateCsrfToken, setCsrfCookie } from "@/lib/auth-csrf";
import { AuditLogger } from "@/lib/audit-logger";
import {
  verifyTelegramLoginSignature,
  computeTelegramIdLookupHash,
  claimTelegramAuthHash,
} from "@/lib/telegram-auth";
import {
  recordFailedAttempt,
  clearFailedAttempts,
  checkRateLimitAndLockout,
  anonymizeIdentifier,
  getClientIp,
} from "@/lib/auth-gate";

const UNLINKED_GENERIC_ERROR =
  "Telegram នេះមិនទាន់បានភ្ជាប់ជាមួយគណនីក្នុងប្រព័ន្ធទេ។ សូមចូលដោយ Username/Password ឬទាក់ទង Admin។";

export async function POST(req: NextRequest) {
  // 1. Feature flag guard
  const isEnabled = process.env.TELEGRAM_LOGIN_ENABLED === "true";
  if (!isEnabled) {
    return NextResponse.json(
      { error: "មុខងារចូលតាម Telegram មិនទាន់បើកដំណើរការទេ (Telegram login is not enabled)." },
      {
        status: 403,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  const rawIp = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || undefined;
  const anonymizedIp = await anonymizeIdentifier(rawIp);

  // 2. Rate limit & lockout check
  const lockoutStatus = await checkRateLimitAndLockout(anonymizedIp);
  if (!lockoutStatus.allowed) {
    await AuditLogger.logEvent({
      type: "TELEGRAM_LOGIN_REJECTED",
      actorId: "anonymous",
      rawIp,
      userAgent,
      details: { reason: "IP locked due to repeated failed login attempts" },
    });
    return NextResponse.json(
      {
        error: `ប្រព័ន្ធត្រូវបានចាក់សោបណ្តោះអាសន្ន។ សូមរង់ចាំ ${lockoutStatus.retryAfterSeconds} វិនាទី (Account locked due to multiple failed attempts).`,
        locked: true,
        retryAfter: lockoutStatus.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(lockoutStatus.retryAfterSeconds),
          "Cache-Control": "no-store, private",
        },
      }
    );
  }

  // 3. Body parse and request size safeguard
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "ទម្រង់ទិន្នន័យមិនត្រឹមត្រូវ (Invalid JSON payload)" },
      { status: 400, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 4. Validate Telegram cryptographic signature
  const verification = verifyTelegramLoginSignature(body);
  if (!verification.valid || !verification.telegramId) {
    await recordFailedAttempt(anonymizedIp);
    await AuditLogger.logEvent({
      type: "TELEGRAM_LOGIN_REJECTED",
      actorId: "anonymous",
      rawIp,
      userAgent,
      details: { reason: verification.error || "Cryptographic signature mismatch" },
    });
    return NextResponse.json(
      { error: "ហត្ថលេខាផ្ទៀងផ្ទាត់ Telegram មិនត្រឹមត្រូវ (Invalid Telegram signature)" },
      { status: 401, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 5. Replay Protection: ensure hash has not been claimed/replayed
  const isFresh = await claimTelegramAuthHash(body.hash);
  if (!isFresh) {
    await recordFailedAttempt(anonymizedIp);
    await AuditLogger.logEvent({
      type: "SECURITY_ALERT",
      actorId: "anonymous",
      rawIp,
      userAgent,
      details: { reason: "Replayed Telegram authentication hash detected" },
    });
    return NextResponse.json(
      { error: "ទិន្នន័យចូល Telegram ត្រូវបានប្រើប្រាស់រួចហើយ (Replayed Telegram login payload rejected)" },
      { status: 401, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 6. Look up existing linked user using deterministic HMAC lookup hash
  const lookupHash = computeTelegramIdLookupHash(verification.telegramId);
  const user = await UserStore.getUserByTelegramLookupHash(lookupHash);

  // Invariant: Reject unlinked or unknown Telegram accounts
  // Invariant: Do NOT automatically create accounts
  // Invariant: Generic error prevents account enumeration
  if (!user || !user.telegramLinked || user.status !== "ACTIVE") {
    const failResult = await recordFailedAttempt(anonymizedIp);

    await AuditLogger.logEvent({
      type: "TELEGRAM_LOGIN_REJECTED",
      actorId: user?.id || "unlinked_telegram_identity",
      actorUsername: user?.username || undefined,
      rawIp,
      userAgent,
      details: {
        reason: !user
          ? "Unregistered Telegram identity"
          : !user.telegramLinked
          ? "Telegram identity not linked to account"
          : "Account disabled",
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
          headers: {
            "Retry-After": String(failResult.retryAfterSeconds),
            "Cache-Control": "no-store, private",
          },
        }
      );
    }

    return NextResponse.json(
      { error: UNLINKED_GENERIC_ERROR },
      { status: 401, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 7. Successful authentication for existing linked user
  await clearFailedAttempts(anonymizedIp);

  const updatedUser = await UserStore.updateUser(user.id, {
    lastLoginAt: Date.now(),
    telegramLastLoginAt: Date.now(),
    telegramUsername: verification.telegramUsername || user.telegramUsername,
    activeSessionsCount: (user.activeSessionsCount || 0) + 1,
  });

  const safeUser = toSafeUser(updatedUser);
  const sessionToken = await createSessionToken(safeUser);
  const csrfToken = generateCsrfToken();

  await AuditLogger.logEvent({
    type: "TELEGRAM_LOGIN_SUCCESS",
    actorId: user.id,
    actorUsername: user.username,
    rawIp,
    userAgent,
    details: { role: user.role },
  });

  const response = NextResponse.json(
    {
      success: true,
      user: safeUser,
      csrfToken,
      message: "ចូលប្រព័ន្ធដោយជោគជ័យតាម Telegram (Telegram login successful)",
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    }
  );

  setSessionCookie(response, sessionToken);
  setCsrfCookie(response, csrfToken);

  return response;
}
