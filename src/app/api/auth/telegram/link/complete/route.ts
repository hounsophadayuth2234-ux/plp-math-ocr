import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore, toSafeUser } from "@/lib/user-store";
import { AuditLogger } from "@/lib/audit-logger";
import {
  verifyTelegramLoginSignature,
  computeTelegramIdLookupHash,
  encryptTelegramId,
  claimTelegramAuthHash,
  consumeTelegramLinkChallenge,
} from "@/lib/telegram-auth";
import { getClientIp } from "@/lib/auth-gate";

export async function POST(req: NextRequest) {
  // 1. Enforce active authentication
  const auth = await requireAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  // 2. Validate CSRF token
  const csrfResult = validateCsrfToken(req);
  if (!csrfResult.valid) {
    return NextResponse.json(
      { error: csrfResult.error || "CSRF token missing or invalid" },
      { status: 403, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  const csrfCookie = req.cookies.get("dyt_csrf_token")?.value || "";

  // 3. Parse JSON body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "ទម្រង់ទិន្នន័យមិនត្រឹមត្រូវ (Invalid JSON payload)" },
      { status: 400, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  const { challengeToken, telegramData } = body || {};
  if (!challengeToken || !telegramData) {
    return NextResponse.json(
      { error: "សូមផ្ដល់ challengeToken និងទិន្នន័យ Telegram (challengeToken and telegramData required)" },
      { status: 400, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 4. Validate and atomically consume link challenge
  const challengeCheck = await consumeTelegramLinkChallenge(
    challengeToken,
    auth.user.id,
    csrfCookie
  );
  if (!challengeCheck.valid) {
    return NextResponse.json(
      { error: challengeCheck.error || "បញ្ហាប្រឈមមិនត្រឹមត្រូវ ឬផុតកំណត់ (Invalid or expired challenge)" },
      { status: 400, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 5. Verify cryptographic signature of Telegram payload
  const verification = verifyTelegramLoginSignature(telegramData);
  if (!verification.valid || !verification.telegramId) {
    return NextResponse.json(
      { error: "ហត្ថលេខាផ្ទៀងផ្ទាត់ Telegram មិនត្រឹមត្រូវ (Invalid Telegram signature)" },
      { status: 401, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 6. Replay protection on signature hash
  const isFresh = await claimTelegramAuthHash(telegramData.hash);
  if (!isFresh) {
    return NextResponse.json(
      { error: "ទិន្នន័យផ្ទៀងផ្ទាត់ Telegram ត្រូវបានប្រើប្រាស់រួចហើយ (Replayed Telegram signature payload)" },
      { status: 401, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 7. Check for duplicate Telegram identity link across all accounts
  // Invariant: One Telegram identity may belong to only one local account.
  const lookupHash = computeTelegramIdLookupHash(verification.telegramId);
  const existingHolder = await UserStore.getUserByTelegramLookupHash(lookupHash);
  if (existingHolder && existingHolder.id !== auth.user.id) {
    return NextResponse.json(
      {
        error: "Telegram នេះត្រូវបានភ្ជាប់ជាមួយគណនីផ្សេងរួចហើយ (This Telegram identity is already linked to another account).",
      },
      { status: 409, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 8. Encrypt Telegram ID at rest and update user
  const encryptedTelegramId = encryptTelegramId(verification.telegramId);
  const updatedUser = await UserStore.updateUser(auth.user.id, {
    telegramLinked: true,
    telegramIdEncrypted: encryptedTelegramId,
    telegramIdLookupHash: lookupHash,
    telegramUsername: verification.telegramUsername,
    telegramLinkedAt: Date.now(),
  });

  const rawIp = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || undefined;

  await AuditLogger.logEvent({
    type: "TELEGRAM_LINKED",
    actorId: auth.user.id,
    actorUsername: auth.user.username,
    targetId: auth.user.id,
    targetUsername: auth.user.username,
    rawIp,
    userAgent,
    details: { action: "Linked Telegram identity to existing account" },
  });

  return NextResponse.json(
    {
      success: true,
      user: toSafeUser(updatedUser),
      message: "បានភ្ជាប់ Telegram ដោយជោគជ័យ (Telegram linked successfully)",
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    }
  );
}
