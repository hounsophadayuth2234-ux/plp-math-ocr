import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { UserStore } from "@/lib/user-store";
import { encryptGoogleDriveTokens } from "@/lib/google-drive-vault";
import {
  exchangeCodeForTokens,
  getUserDriveClient,
  verifyTargetFolderAccess,
  getTargetDriveFolderId,
} from "@/lib/google-drive-oauth";

/**
 * GET /api/auth/google-drive/callback
 * Handles Google OAuth 2.0 Web Application callback.
 * Validates CSRF state, exchanges authorization code for tokens, encrypts tokens,
 * saves them securely to the user record, and verifies folder accessibility.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // 1. Decode state if present to determine return route
  let decodedState: { userId: string; nonce: string; timestamp: number; returnTo?: string } | null = null;
  if (state) {
    try {
      const raw = Buffer.from(state, "base64url").toString("utf-8");
      decodedState = JSON.parse(raw);
    } catch {}
  }

  const returnTarget = decodedState?.returnTo || "/profile?tab=drive";
  const baseUrl = new URL(returnTarget, req.url);

  // 2. Check if user cancelled or Google returned an error
  if (error) {
    baseUrl.searchParams.set("drive_error", `Google OAuth rejected: ${error}`);
    return NextResponse.redirect(baseUrl);
  }

  if (!code || !state || !decodedState) {
    baseUrl.searchParams.set("drive_error", "Missing or invalid OAuth authorization code or state");
    return NextResponse.redirect(baseUrl);
  }

  // 3. Validate CSRF state against HTTP cookie
  const stateCookie = req.cookies.get("dyt_gdrive_oauth_state")?.value;

  if (!stateCookie || decodedState.nonce !== stateCookie) {
    baseUrl.searchParams.set("drive_error", "State CSRF mismatch. Please try connecting again.");
    return NextResponse.redirect(baseUrl);
  }

  // Expiry check (15 minutes)
  if (!decodedState.timestamp || Date.now() - decodedState.timestamp > 15 * 60 * 1000) {
    baseUrl.searchParams.set("drive_error", "OAuth session expired. Please retry connecting.");
    return NextResponse.redirect(baseUrl);
  }

  // 3. Ensure user is actively logged in and matches the OAuth state's userId
  const sessionUser = await getSessionUser(req);
  if (!sessionUser || sessionUser.id !== decodedState.userId) {
    baseUrl.searchParams.set("drive_error", "Active user session does not match OAuth initiator.");
    return NextResponse.redirect(baseUrl);
  }

  try {
    // 4. Server-side token exchange
    const { tokens, email } = await exchangeCodeForTokens(code);

    // 5. Encrypt tokens at rest using AES-256-GCM
    const encrypted = encryptGoogleDriveTokens(tokens);

    // 6. Save encrypted tokens to user record
    await UserStore.updateGoogleDriveTokens(sessionUser.id, {
      googleDriveTokenEncrypted: encrypted,
      googleDriveEmail: email,
      googleDriveScope: tokens.scope || undefined,
    });

    // 7. Verify target folder accessibility in owner's personal Drive
    const targetFolderId = getTargetDriveFolderId();
    let folderWarning: string | null = null;

    try {
      const drive = await getUserDriveClient(sessionUser.id);
      const folderCheck = await verifyTargetFolderAccess(drive, targetFolderId);
      if (!folderCheck.accessible) {
        folderWarning = folderCheck.error || "មិនអាចចូលប្រើប្រាស់ Folder DYT_Math_Images បានទេ។";
      }
    } catch (folderErr: unknown) {
      folderWarning =
        folderErr instanceof Error ? folderErr.message : "Error verifying folder access";
    }

    if (folderWarning) {
      baseUrl.searchParams.set("drive_warning", "folder_inaccessible");
      baseUrl.searchParams.set("folder_error", folderWarning);
    } else {
      baseUrl.searchParams.set("drive_status", "connected");
    }

    const res = NextResponse.redirect(baseUrl);

    // Clear the one-time CSRF state cookie
    res.cookies.set("dyt_gdrive_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GoogleDriveOAuth] Callback token exchange failed:", message);
    baseUrl.searchParams.set("drive_error", `Token exchange failed: ${message}`);
    return NextResponse.redirect(baseUrl);
  }
}
