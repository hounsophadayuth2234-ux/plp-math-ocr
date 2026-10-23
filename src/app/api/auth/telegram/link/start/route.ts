import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { createTelegramLinkChallenge } from "@/lib/telegram-auth";

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

  // 3. Create short-lived one-time challenge bound to user ID and CSRF
  const challengeToken = await createTelegramLinkChallenge(auth.user.id, csrfCookie);

  return NextResponse.json(
    {
      success: true,
      challengeToken,
      botUsername: process.env.TELEGRAM_BOT_USERNAME || "",
      message: "បញ្ហាប្រឈម Telegram ត្រូវបានបង្កើត (Telegram link challenge created)",
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    }
  );
}
