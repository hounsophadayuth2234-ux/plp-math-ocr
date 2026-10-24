import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { disconnectUserDrive } from "@/lib/google-drive-oauth";

/**
 * POST /api/auth/google-drive/disconnect
 * Disconnects the user's personal Google Drive account.
 * Revokes Google OAuth token and deletes the encrypted stored token from user store.
 * NOTE: Files in the user's Google Drive are never deleted.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: សូមចូលគណនីជាមុនសិន (Please log in first)." },
      { status: 401 }
    );
  }

  try {
    await disconnectUserDrive(user.id);
    return NextResponse.json({
      success: true,
      message: "បានផ្តាច់ Google Drive ដោយជោគជ័យ (Google Drive disconnected successfully).",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GoogleDriveOAuth] Disconnect failed:", message);
    return NextResponse.json(
      { error: "Failed to disconnect Google Drive", details: message },
      { status: 500 }
    );
  }
}
