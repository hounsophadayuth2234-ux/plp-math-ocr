import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import {
  getTargetDriveFolderId,
  getUserDriveClient,
  verifyTargetFolderAccess,
} from "@/lib/google-drive-oauth";

/**
 * GET /api/auth/google-drive/status
 * Returns connection status and folder accessibility for the authenticated user.
 * Never exposes access tokens, refresh tokens, or client credentials.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: សូមចូលគណនីជាមុនសិន (Please log in first).", connected: false },
      { status: 401 }
    );
  }

  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      {
        error: "Forbidden: Super Administrator role required for Google Drive Storage (ត្រូវការសិទ្ធិជា SUPER_ADMIN).",
        connected: false,
      },
      { status: 403 }
    );
  }

  const folderId = getTargetDriveFolderId();

  if (!user.googleDriveConnected) {
    return NextResponse.json({
      success: true,
      connected: false,
      folderId,
    });
  }

  let folderAccessible = false;
  let folderName: string | undefined;
  let folderError: string | undefined;

  try {
    const drive = await getUserDriveClient(user.id);
    const folderCheck = await verifyTargetFolderAccess(drive, folderId);
    folderAccessible = folderCheck.accessible;
    folderName = folderCheck.folderName;
    folderError = folderCheck.error;
  } catch (err: unknown) {
    folderAccessible = false;
    folderError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    success: true,
    connected: true,
    email: user.googleDriveEmail,
    connectedAt: user.googleDriveConnectedAt,
    folderId,
    folderName,
    folderAccessible,
    folderError,
  });
}
