import { google, drive_v3 } from "googleapis";
import { Readable } from "node:stream";

export interface GoogleDriveCredentials {
  type: string;
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
}

export interface DriveUploadOptions {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folderId?: string;
  description?: string;
  makePublic?: boolean;
}

export interface DriveUploadResult {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
  folderId: string;
}

/**
 * Parses and returns the Google service account credentials from GOOGLE_SERVICE_ACCOUNT_JSON.
 * Gracefully handles JSON string, base64-encoded string, and literal newline escapes.
 */
export function getGoogleDriveCredentials(): GoogleDriveCredentials {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable. Please configure it in .env.local."
    );
  }

  let credentials: GoogleDriveCredentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      credentials = JSON.parse(decoded);
    } catch {
      throw new Error(
        "Invalid GOOGLE_SERVICE_ACCOUNT_JSON: unable to parse JSON credentials."
      );
    }
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      "Malformed Google Service Account credentials: client_email and private_key are required."
    );
  }

  // Ensure escaped \n characters in the private key PEM string are converted to real newlines
  if (typeof credentials.private_key === "string") {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  return credentials;
}

/**
 * Returns the configured default Google Drive target folder ID.
 */
export function getDefaultDriveFolderId(): string {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId || !folderId.trim()) {
    throw new Error(
      "Missing GOOGLE_DRIVE_FOLDER_ID environment variable. Please configure it in .env.local."
    );
  }
  return folderId.trim();
}

/**
 * Initializes and returns an authenticated Google Drive v3 client.
 */
export function getGoogleDriveClient(): drive_v3.Drive {
  const credentials = getGoogleDriveCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  return google.drive({ version: "v3", auth });
}

/**
 * Uploads an in-memory buffer directly to Google Drive folder without touching disk.
 */
export async function uploadBufferToGoogleDrive(
  options: DriveUploadOptions
): Promise<DriveUploadResult> {
  const {
    buffer,
    filename,
    mimeType,
    folderId = getDefaultDriveFolderId(),
    description,
    makePublic = false,
  } = options;

  if (!buffer || buffer.length === 0) {
    throw new Error("Cannot upload an empty file buffer.");
  }

  const drive = getGoogleDriveClient();
  const stream = Readable.from(buffer);

  const fileMetadata: drive_v3.Schema$File = {
    name: filename,
    parents: [folderId],
    description: description || `Uploaded via PLP Math Content System at ${new Date().toISOString()}`,
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

  // Optionally grant read access to anyone with the link
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
      console.warn("Could not set public permission on Google Drive file:", permErr);
    }
  }

  return {
    fileId: data.id,
    name: data.name || filename,
    mimeType: data.mimeType || mimeType,
    size: data.size ? parseInt(data.size, 10) : buffer.length,
    webViewLink: data.webViewLink || undefined,
    webContentLink: data.webContentLink || undefined,
    thumbnailLink: data.thumbnailLink || undefined,
    createdTime: data.createdTime || new Date().toISOString(),
    folderId,
  };
}
