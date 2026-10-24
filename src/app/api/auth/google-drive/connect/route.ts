import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUser } from "@/lib/auth-session";
import { generateDriveAuthUrl } from "@/lib/google-drive-oauth";

/**
 * GET /api/auth/google-drive/connect
 * Initiates Google OAuth 2.0 Web Application flow for the authenticated user.
 * Generates CSRF state nonce and redirects to Google's consent screen.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    const isJson = req.headers.get("accept")?.includes("application/json");
    if (isJson) {
      return NextResponse.json(
        { error: "Unauthorized: សូមចូលគណនីជាមុនសិនមុននឹងភ្ជាប់ Google Drive (Please log in first)." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/gate", req.url);
    loginUrl.searchParams.set("redirect", "/math-upload");
    return NextResponse.redirect(loginUrl);
  }

  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: មានតែម្ចាស់ប្រព័ន្ធ SUPER_ADMIN ប៉ុណ្ណោះដែលអាចកំណត់រចនាសម្ព័ន្ធ Google Drive បាន (Super Admin required)." },
      { status: 403 }
    );
  }

  try {
    const stateNonce = crypto.randomUUID();
    const returnTo = req.nextUrl.searchParams.get("returnTo") || "/profile?tab=drive";
    const authUrl = generateDriveAuthUrl(user.id, stateNonce, returnTo);

    const isJson =
      req.headers.get("accept")?.includes("application/json") ||
      req.nextUrl.searchParams.get("format") === "json";

    const res = isJson
      ? NextResponse.json({ success: true, authUrl })
      : NextResponse.redirect(authUrl);

    // Set secure HttpOnly CSRF state cookie
    const isProd = process.env.NODE_ENV === "production";
    res.cookies.set("dyt_gdrive_oauth_state", stateNonce, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60, // 15 minutes
    });

    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GoogleDriveOAuth] Connect initialization error:", message);
    return NextResponse.json(
      { error: "Failed to initialize Google Drive connection", details: message },
      { status: 500 }
    );
  }
}
