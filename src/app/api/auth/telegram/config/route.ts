import { NextResponse } from "next/server";

export async function GET() {
  const isEnabled = process.env.TELEGRAM_LOGIN_ENABLED === "true";
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";

  return NextResponse.json(
    {
      enabled: isEnabled,
      botUsername: isEnabled ? botUsername : "",
    },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    }
  );
}
