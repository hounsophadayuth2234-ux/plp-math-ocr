import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-session";
import { validateCsrfToken, CSRF_COOKIE_NAME } from "@/lib/auth-csrf";
import { createTelegramLinkChallenge } from "@/lib/telegram-auth";

export async function POST(req: NextRequest) {
  // 1. Enforce active authentication
  const auth = await requireAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  // 2. Validate CSRF token (header or body)
  const csrfResult = validateCsrfToken(req, body?.csrfToken);
  if (!csrfResult.valid) {
    return NextResponse.json(
      { error: csrfResult.error || "CSRF token missing or invalid" },
      { status: 403, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  const csrfCookie = req.cookies.get(CSRF_COOKIE_NAME)?.value?.trim() || "";

  // 3. Create short-lived one-time challenge bound to user ID and CSRF
  const challengeToken = await createTelegramLinkChallenge(auth.user.id, csrfCookie);

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "dyt_verify_bot";
  const botId =
    process.env.TELEGRAM_BOT_ID ||
    process.env.TELEGRAM_BOT_TOKEN?.split(":")[0]?.trim() ||
    "8770636147";

  return NextResponse.json(
    {
      success: true,
      challengeToken,
      botUsername,
      botId,
      message: "បញ្ហាប្រឈម Telegram ត្រូវបានបង្កើត (Telegram link challenge created)",
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    }
  );
}

