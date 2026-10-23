import { NextResponse } from "next/server";

export async function GET() {
  const isEnabled = process.env.TELEGRAM_LOGIN_ENABLED === "true";
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "dyt_verify_bot";
  const botId =
    process.env.TELEGRAM_BOT_ID ||
    process.env.TELEGRAM_BOT_TOKEN?.split(":")[0]?.trim() ||
    "8770636147";

  return NextResponse.json(
    {
      enabled: isEnabled,
      botUsername: isEnabled ? botUsername : "",
      botId: isEnabled ? botId : "",
    },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    }
  );
}

