import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore, toSafeUser } from "@/lib/user-store";
import { AuditLogger } from "@/lib/audit-logger";
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

  const rawUser = await UserStore.getUserById(auth.user.id);
  if (!rawUser) {
    return NextResponse.json(
      { error: "រកមិនឃើញគណនីអ្នកប្រើប្រាស់ (User not found)" },
      { status: 404, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 3. Safety check: ensure user has valid password before unlinking
  if (!rawUser.passwordHash) {
    return NextResponse.json(
      {
        error: "មិនអាចផ្តាច់ Telegram បានទេ ព្រោះគណនីមិនទាន់មានពាក្យសម្ងាត់ (Cannot unlink: Account must have a password configured).",
      },
      { status: 400, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // 4. Unlink Telegram fields
  const updatedUser = await UserStore.updateUser(auth.user.id, {
    telegramLinked: false,
    telegramIdEncrypted: undefined,
    telegramIdLookupHash: undefined,
    telegramUsername: undefined,
    telegramLinkedAt: undefined,
  });

  const rawIp = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || undefined;

  await AuditLogger.logEvent({
    type: "TELEGRAM_UNLINKED",
    actorId: auth.user.id,
    actorUsername: auth.user.username,
    targetId: auth.user.id,
    targetUsername: auth.user.username,
    rawIp,
    userAgent,
    details: { action: "Unlinked Telegram identity from account" },
  });

  return NextResponse.json(
    {
      success: true,
      user: toSafeUser(updatedUser),
      message: "បានផ្តាច់ Telegram ដោយជោគជ័យ (Telegram unlinked successfully)",
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    }
  );
}
