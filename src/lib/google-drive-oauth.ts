import { google, drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import { UserStore } from "./user-store";
import {
  encryptGoogleDriveTokens,
  decryptGoogleDriveTokens,
  GoogleDriveOAuthTokens,
} from "./google-drive-vault";
import { DriveHistoryStore } from "./drive-history-store";
import { sanitizeFilename } from "./image-upload-validator";

export const DEFAULT_DRIVE_FOLDER_ID = "1dS_Ul_WnVCCbJAKsn6CAT0vy9AB8Yx8f";

/**
 * Returns the target Google Drive folder ID.
 */
export function getTargetDriveFolderId(): string {
  return process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || DEFAULT_DRIVE_FOLDER_ID;
}

/**
 * Production Redirect URI for Google Drive OAuth callback.
 */
export function getGoogleOAuthRedirectUri(): string {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
    "https://math.dytcore.com/api/auth/google-drive/callback"
  );
}

/**
 * Standard OAuth scopes for personal Google Drive storage:
 * - https://www.googleapis.com/auth/drive.file: Per-file access for files created by this application
 * - https://www.googleapis.com/auth/userinfo.email: Safely identifies the connected Google Account email
 * - https://www.googleapis.com/auth/userinfo.profile: Account name
 * - https://www.googleapis.com/auth/drive: Included if full access to pre-existing folders created outside app is enabled
 */
export function getDriveOAuthScopes(): string[] {
  const customScopes = process.env.GOOGLE_OAUTH_SCOPES?.trim();
  if (customScopes) {
    return customScopes.split(",").map((s) => s.trim());
  }

  // If GOOGLE_OAUTH_PREFER_FULL_SCOPE is enabled, request drive scope so pre-existing folder can be read
  if (process.env.GOOGLE_OAUTH_PREFER_FULL_SCOPE === "true") {
    return [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ];
  }

  // Default: Minimum scope
  return [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];
}

/**
 * Initializes and returns a Google OAuth 2.0 Web Application client.
 */
export function getGoogleOAuth2Client(redirectUriOverride?: string): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = redirectUriOverride || getGoogleOAuthRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET. Please configure Google OAuth Web Client credentials."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generates an OAuth 2.0 authorization URL for connecting personal Google Drive.
 */
export function generateDriveAuthUrl(userId: string, stateNonce: string): string {
  const oauth2Client = getGoogleOAuth2Client();
  const scopes = getDriveOAuthScopes();

  const statePayload = Buffer.from(
    JSON.stringify({ userId, nonce: stateNonce, timestamp: Date.now() })
  ).toString("base64url");

  return oauth2Client.generateAuthUrl({
    access_type: "offline", // Mandatory to obtain refresh_token
    prompt: "consent", // Force consent so Google sends refresh_token every time
    scope: scopes,
    state: statePayload,
    include_granted_scopes: true,
  });
}

/**
 * Exchanges authorization code from Google OAuth callback for access & refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUriOverride?: string
): Promise<{ tokens: GoogleDriveOAuthTokens; email?: string }> {
  const oauth2Client = getGoogleOAuth2Client(redirectUriOverride);
  const { tokens } = await oauth2Client.getToken(code);

  oauth2Client.setCredentials(tokens);

  let email: string | undefined;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    email = userInfo.data.email || undefined;
  } catch (err) {
    console.warn("[GoogleDriveOAuth] Could not fetch userinfo email:", err);
  }

  const driveTokens: GoogleDriveOAuthTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expiry_date: tokens.expiry_date,
    email,
  };

  return { tokens: driveTokens, email };
}

/**
 * Obtains an authenticated Google Drive v3 client for a specific user.
 * Automatically refreshes the access token if expired and saves the refreshed token.
 */
export async function getUserDriveClient(userId: string): Promise<drive_v3.Drive> {
  const user = await UserStore.getUserById(userId);
  if (!user || !user.googleDriveConnected || !user.googleDriveTokenEncrypted) {
    throw new Error(
      "Google Drive មិនទាន់ត្រូវបានភ្ជាប់ឡើយ (Google Drive not connected)。 សូមភ្ជាប់គណនី Google Drive របស់អ្នកនៅក្នុងទំព័រ Settings។"
    );
  }

  const tokens = decryptGoogleDriveTokens(user.googleDriveTokenEncrypted);
  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    throw new Error(
      "Token សម្ងាត់ Google Drive មិនត្រឹមត្រូវ ឬត្រូវបានខូចខាត (Invalid or corrupted Drive tokens)。 សូមភ្ជាប់ Google Drive ឡើងវិញ។"
    );
  }

  const oauth2Client = getGoogleOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token || undefined,
    refresh_token: tokens.refresh_token || undefined,
    scope: tokens.scope || undefined,
    token_type: tokens.token_type || undefined,
    expiry_date: tokens.expiry_date || undefined,
  });

  // Listen to token refresh events so refreshed access tokens are automatically saved
  oauth2Client.on("tokens", async (refreshedTokens) => {
    const updatedTokens: GoogleDriveOAuthTokens = {
      ...tokens,
      ...refreshedTokens,
      // Retain existing refresh_token if not provided in refresh response
      refresh_token: refreshedTokens.refresh_token || tokens.refresh_token,
    };
    const encrypted = encryptGoogleDriveTokens(updatedTokens);
    await UserStore.updateGoogleDriveTokens(userId, {
      googleDriveTokenEncrypted: encrypted,
      googleDriveEmail: user.googleDriveEmail,
      googleDriveScope: updatedTokens.scope || user.googleDriveScope,
    });
  });

  // Check if token is expired or within 3 minutes of expiry
  const now = Date.now();
  if (tokens.expiry_date && tokens.expiry_date - now < 3 * 60 * 1000) {
    if (tokens.refresh_token) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        const updatedTokens: GoogleDriveOAuthTokens = {
          ...tokens,
          ...credentials,
          refresh_token: credentials.refresh_token || tokens.refresh_token,
        };
        const encrypted = encryptGoogleDriveTokens(updatedTokens);
        await UserStore.updateGoogleDriveTokens(userId, {
          googleDriveTokenEncrypted: encrypted,
          googleDriveEmail: user.googleDriveEmail,
          googleDriveScope: updatedTokens.scope || user.googleDriveScope,
        });
      } catch (refreshErr) {
        console.warn("[GoogleDriveOAuth] Token refresh failed:", refreshErr);
      }
    }
  }

  return google.drive({ version: "v3", auth: oauth2Client });
}

/**
 * Verifies that the connected Google Drive user has access to target folder DYT_Math_Images.
 */
export async function verifyTargetFolderAccess(
  drive: drive_v3.Drive,
  folderId: string = getTargetDriveFolderId()
): Promise<{ accessible: boolean; folderName?: string; error?: string }> {
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType, capabilities",
      supportsAllDrives: true,
    });

    return {
      accessible: true,
      folderName: res.data.name || "DYT_Math_Images",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[GoogleDriveOAuth] Folder check failed for ID ${folderId}:`, msg);

    // If 404 under drive.file scope, provide a truthful, actionable Khmer explanation
    let userFriendlyKhmer = `មិនអាចចូលប្រើប្រាស់ Folder DYT_Math_Images (${folderId}) បានទេ។`;
    if (msg.includes("File not found") || msg.includes("404")) {
      userFriendlyKhmer = `មិនអាចរកឃើញ Folder DYT_Math_Images (${folderId}) នៅក្នុងគណនី Google Drive របស់អ្នកឡើយ។ ប្រសិនបើ Folder នេះត្រូវបានបង្កើតមុន សូមប្រាកដថាអ្នកបានចែករំលែកសិទ្ធិ ឬប្រើប្រាស់ scope Drive ពេញលេញ។`;
    }

    return {
      accessible: false,
      error: userFriendlyKhmer,
    };
  }
}

export interface UserDriveUploadOptions {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  moduleName?: string;
  description?: string;
  makePublic?: boolean;
  folderId?: string;
}

export interface UserDriveUploadResult {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  createdTime: string;
  folderId: string;
  isPublic: boolean;
}

/**
 * Uploads an image buffer directly into the owner's personal Google Drive folder using personal quota.
 */
export async function uploadUserBufferToGoogleDrive(
  userId: string,
  options: UserDriveUploadOptions
): Promise<UserDriveUploadResult> {
  const {
    buffer,
    filename: rawFilename,
    mimeType,
    moduleName = "DYT Math Studio",
    description,
    makePublic = false,
    folderId = getTargetDriveFolderId(),
  } = options;

  if (!buffer || buffer.length === 0) {
    throw new Error("Cannot upload an empty file buffer.");
  }

  const filename = sanitizeFilename(rawFilename);
  const drive = await getUserDriveClient(userId);

  // Verify target folder access
  const folderCheck = await verifyTargetFolderAccess(drive, folderId);
  if (!folderCheck.accessible) {
    throw new Error(
      folderCheck.error ||
        `មិនអាចចូលប្រើប្រាស់ Folder DYT_Math_Images (${folderId}) បានទេ។ សូមពិនិត្យសិទ្ធិកែប្រែ Folder ក្នុងគណនី Google របស់អ្នក។`
    );
  }

  const stream = Readable.from(buffer);

  const fileMetadata: drive_v3.Schema$File = {
    name: filename,
    parents: [folderId],
    description: description || `Uploaded via ${moduleName} at ${new Date().toISOString()}`,
  };

  const media = {
    mimeType,
    body: stream,
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink, createdTime, parents",
    supportsAllDrives: true,
  });

  const data = response.data;
  if (!data.id) {
    throw new Error("Google Drive upload completed but returned no file ID.");
  }

  // Private by default. Only set public reader role if explicitly requested.
  if (makePublic) {
    try {
      await drive.permissions.create({
        fileId: data.id,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
        supportsAllDrives: true,
      });
    } catch (permErr) {
      console.warn("[GoogleDriveOAuth] Could not set public permission on file:", permErr);
    }
  }

  const result: UserDriveUploadResult = {
    fileId: data.id,
    name: data.name || filename,
    mimeType: data.mimeType || mimeType,
    size: data.size ? parseInt(data.size, 10) : buffer.length,
    webViewLink: data.webViewLink || undefined,
    webContentLink: data.webContentLink || undefined,
    thumbnailLink: data.thumbnailLink || undefined,
    createdTime: data.createdTime || new Date().toISOString(),
    folderId,
    isPublic: makePublic,
  };

  // Record safe upload history metadata
  await DriveHistoryStore.addRecord({
    userId,
    module: moduleName,
    originalDriveFileId: data.id,
    filename: result.name,
    mimeType: result.mimeType,
    size: result.size,
    status: "uploaded",
    folderId,
    webViewLink: result.webViewLink,
  });

  return result;
}

/**
 * Disconnects the user's Google Drive OAuth integration.
 * Revokes token with Google and clears encrypted tokens from the user record.
 * Does NOT delete the user's Google Drive files.
 */
export async function disconnectUserDrive(userId: string): Promise<boolean> {
  const user = await UserStore.getUserById(userId);
  if (!user || !user.googleDriveTokenEncrypted) {
    return true;
  }

  const tokens = decryptGoogleDriveTokens(user.googleDriveTokenEncrypted);
  if (tokens?.access_token || tokens?.refresh_token) {
    try {
      const oauth2Client = getGoogleOAuth2Client();
      const tokenToRevoke = tokens.refresh_token || tokens.access_token;
      if (tokenToRevoke) {
        await oauth2Client.revokeToken(tokenToRevoke);
      }
    } catch (err) {
      console.warn("[GoogleDriveOAuth] Token revocation call to Google failed (continuing local removal):", err);
    }
  }

  await UserStore.clearGoogleDriveTokens(userId);
  return true;
}
