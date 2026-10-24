import { NextRequest, NextResponse } from "next/server";
import {
  uploadBufferToGoogleDrive,
  getDefaultDriveFolderId,
  getGoogleDriveClient,
  DriveUploadResult,
} from "@/lib/google-drive";
import {
  uploadUserBufferToGoogleDrive,
  getTargetDriveFolderId,
  getUserDriveClient,
  verifyTargetFolderAccess,
} from "@/lib/google-drive-oauth";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { getSessionUser } from "@/lib/auth-session";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { sanitizeFilename } from "@/lib/image-upload-validator";
import { DriveHistoryStore } from "@/lib/drive-history-store";
import { UserStore, toSafeUser } from "@/lib/user-store";
import { ActivityTracker } from "@/lib/activity-tracker";

export const maxDuration = 60;

export interface UploadToDriveApiResponse {
  success: boolean;
  file?: DriveUploadResult;
  error?: string;
  details?: string;
}

/**
 * GET /api/upload-to-drive
 * Health-check & status endpoint to inspect Google Drive connection status and target folder.
 */
export async function GET(req: NextRequest) {
  try {
    const authBlock = await enforceRouteAuth(req);
    if (authBlock) return authBlock;

    const sessionUser = await getSessionUser(req);
    const folderId = getTargetDriveFolderId();

    let targetUser = sessionUser?.googleDriveConnected ? sessionUser : null;
    if (!targetUser) {
      const connected = await UserStore.findFirstConnectedDriveUser();
      if (connected) {
        targetUser = toSafeUser(connected);
      }
    }

    // 1. If user (or system administrator) is authenticated with personal OAuth connection
    if (targetUser?.googleDriveConnected) {
      try {
        const drive = await getUserDriveClient(targetUser.id);
        const folderCheck = await verifyTargetFolderAccess(drive, folderId);
        return NextResponse.json({
          success: true,
          mode: "oauth-user",
          connected: true,
          email: targetUser.googleDriveEmail,
          folderId,
          folderName: folderCheck.folderName,
          folderAccessible: folderCheck.accessible,
          folderError: folderCheck.error,
        });
      } catch (oauthErr: unknown) {
        return NextResponse.json({
          success: false,
          mode: "oauth-user",
          connected: false,
          error: oauthErr instanceof Error ? oauthErr.message : String(oauthErr),
        });
      }
    }

    // 2. Fallback check for service account (or unconfigured personal drive)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        const fallbackFolderId = getDefaultDriveFolderId();
        const drive = getGoogleDriveClient();
        const folderRes = await drive.files.get({
          fileId: fallbackFolderId,
          fields: "id, name, mimeType",
          supportsAllDrives: true,
        });

        return NextResponse.json({
          success: true,
          mode: "service-account",
          configured: true,
          folderId: fallbackFolderId,
          folderName: folderRes.data.name,
          mimeType: folderRes.data.mimeType,
          note: "Personal My Drive uploads require Google OAuth to use personal storage quota.",
        });
      } catch (saErr: unknown) {
        const message = saErr instanceof Error ? saErr.message : String(saErr);
        return NextResponse.json({
          success: false,
          mode: "service-account",
          configured: false,
          error: message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      mode: "oauth-user",
      connected: false,
      folderId,
      message: "សូមភ្ជាប់គណនី Google Drive របស់អ្នកនៅក្នុងទំព័រ Settings (Please connect Google Drive).",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        service: "google-drive-uploader",
        configured: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/upload-to-drive
 * Accepts image file via multipart/form-data or JSON (base64/dataURL).
 * Routes upload through personal Google OAuth using the user's storage quota.
 */
export async function POST(req: NextRequest): Promise<NextResponse<UploadToDriveApiResponse>> {
  // 1. Defense-in-depth route session verification (bypassed in test env unless explicitly enabled)
  const authBlock = await enforceRouteAuth(req);
  if (authBlock) return authBlock as NextResponse<UploadToDriveApiResponse>;

  // 2. Server-side Rate Limiting (20 req/min/IP)
  const rateLimitBlock = await enforceRateLimit(req, "drive_upload");
  if (rateLimitBlock) return rateLimitBlock as NextResponse<UploadToDriveApiResponse>;

  try {
    const sessionUser = await getSessionUser(req);
    const contentType = req.headers.get("content-type") || "";

    let buffer: Buffer | null = null;
    let filename = "";
    let mimeType = "image/png";
    let folderId: string | undefined;
    let description: string | undefined;
    let makePublic = false;
    let moduleName = "DYT Math Studio";

    // Handle Multipart Form Data
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = (formData.get("file") || formData.get("image")) as File | null;

      if (!file) {
        return NextResponse.json<UploadToDriveApiResponse>(
          {
            success: false,
            error: "No file provided. Please include a 'file' or 'image' field in the form data.",
          },
          { status: 400 }
        );
      }

      const rawCustomFilename = formData.get("filename") as string | null;
      filename = rawCustomFilename?.trim() || file.name || `image_${Date.now()}.png`;
      mimeType = file.type || "application/octet-stream";

      const rawFolderId = formData.get("folderId") as string | null;
      if (rawFolderId && rawFolderId.trim()) {
        folderId = rawFolderId.trim();
      }

      const rawDesc = formData.get("description") as string | null;
      if (rawDesc && rawDesc.trim()) {
        description = rawDesc.trim();
      }

      const rawPublic = formData.get("makePublic") as string | null;
      makePublic = rawPublic === "true" || rawPublic === "1";

      const rawModule = formData.get("module") || formData.get("moduleName");
      if (rawModule && typeof rawModule === "string" && rawModule.trim()) {
        moduleName = rawModule.trim();
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }
    // Handle JSON Payload (base64, dataURL, or raw text/document content)
    else if (contentType.includes("application/json")) {
      const body = await req.json();
      const rawImage = body.image || body.file || body.base64;
      const rawText = body.content !== undefined ? body.content : body.text;

      if (!rawImage && rawText === undefined) {
        return NextResponse.json<UploadToDriveApiResponse>(
          {
            success: false,
            error: "No file content found in JSON body. Expected 'content', 'text', 'image', 'file', or 'base64'.",
          },
          { status: 400 }
        );
      }

      filename = body.filename?.trim() || `upload_${Date.now()}`;
      folderId = body.folderId?.trim() || undefined;
      description = body.description?.trim() || undefined;
      makePublic = Boolean(body.makePublic);

      if (body.module || body.moduleName) {
        moduleName = String(body.module || body.moduleName).trim();
      }

      if (rawText !== undefined) {
        const textStr = typeof rawText === "string" ? rawText : JSON.stringify(rawText, null, 2);
        buffer = Buffer.from(textStr, "utf-8");
        if (body.mimeType) {
          mimeType = body.mimeType;
        } else if (filename.endsWith(".html") || filename.endsWith(".htm")) {
          mimeType = "text/html; charset=utf-8";
        } else if (filename.endsWith(".tex")) {
          mimeType = "application/x-tex; charset=utf-8";
        } else if (filename.endsWith(".xml")) {
          mimeType = "application/xml; charset=utf-8";
        } else if (filename.endsWith(".json")) {
          mimeType = "application/json; charset=utf-8";
        } else {
          mimeType = "text/plain; charset=utf-8";
        }
      } else if (typeof rawImage === "string") {
        // Check if it's a data URL: data:image/png;base64,...
        const dataUrlMatch = rawImage.match(/^data:([a-zA-Z0-9/.-]+)(?:;charset=[^;,]+)?(;base64)?,(.*)$/);
        if (dataUrlMatch) {
          mimeType = dataUrlMatch[1];
          const isBase64 = Boolean(dataUrlMatch[2]);
          const dataPayload = dataUrlMatch[3];
          if (isBase64) {
            buffer = Buffer.from(dataPayload, "base64");
          } else {
            buffer = Buffer.from(decodeURIComponent(dataPayload), "utf-8");
          }
        } else {
          // Plain base64
          mimeType = body.mimeType || "image/png";
          buffer = Buffer.from(rawImage, "base64");
        }
      }
    } else {
      return NextResponse.json<UploadToDriveApiResponse>(
        {
          success: false,
          error: "Unsupported Content-Type. Please use multipart/form-data or application/json.",
        },
        { status: 415 }
      );
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json<UploadToDriveApiResponse>(
        {
          success: false,
          error: "The provided image buffer is empty.",
        },
        { status: 400 }
      );
    }

    // Maximum file upload limit: 25 MB
    const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json<UploadToDriveApiResponse>(
        {
          success: false,
          error: `File size exceeds the 25MB ceiling (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
        },
        { status: 413 }
      );
    }

    // Sanitize filename against directory traversal
    filename = sanitizeFilename(filename);
    if (!filename || filename === "unknown" || !filename.includes(".")) {
      const ext = mimeType.includes("jpeg")
        ? "jpg"
        : mimeType.includes("webp")
        ? "webp"
        : mimeType.includes("html")
        ? "html"
        : mimeType.includes("tex")
        ? "tex"
        : mimeType.includes("xml")
        ? "xml"
        : mimeType.includes("json")
        ? "json"
        : mimeType.includes("plain")
        ? "txt"
        : "png";
      filename = `upload_${Date.now()}.${ext}`;
    }

    let result: DriveUploadResult;

    let driveUserId = sessionUser?.googleDriveConnected ? sessionUser.id : null;
    if (!driveUserId) {
      const connectedUser = await UserStore.findFirstConnectedDriveUser();
      if (connectedUser) {
        driveUserId = connectedUser.id;
      }
    }

    // A. Priority 1: Personal OAuth Google Drive storage (uses owner's storage quota)
    if (driveUserId) {
      const oauthResult = await uploadUserBufferToGoogleDrive(driveUserId, {
        buffer,
        filename,
        mimeType,
        folderId,
        description,
        makePublic,
        moduleName,
      });

      result = {
        fileId: oauthResult.fileId,
        name: oauthResult.name,
        mimeType: oauthResult.mimeType,
        size: oauthResult.size,
        webViewLink: oauthResult.webViewLink,
        webContentLink: oauthResult.webContentLink,
        thumbnailLink: oauthResult.thumbnailLink,
        createdTime: oauthResult.createdTime,
        folderId: oauthResult.folderId,
      };

      const recordUserId = sessionUser?.id || driveUserId || "usr_anonymous";
      await DriveHistoryStore.addRecord({
        userId: recordUserId,
        module: moduleName,
        filename: result.name,
        mimeType: result.mimeType,
        size: result.size,
        folderId: result.folderId,
        resultDriveFileId: result.fileId,
        webViewLink: result.webViewLink,
        status: "uploaded",
      });

      if (sessionUser) {
        ActivityTracker.recordActivity({
          userId: sessionUser.id,
          username: sessionUser.username,
          displayName: sessionUser.displayName,
          role: sessionUser.role,
          module: moduleName || "drive_storage",
          action: "upload_drive",
          title: result.name,
          details: { size: result.size, folderId: result.folderId, fileId: result.fileId },
        }).catch(() => {});
      }
    }
    // B. Priority 2: In test environment with service account mock/config
    else if (process.env.NODE_ENV === "test" && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      result = await uploadBufferToGoogleDrive({
        buffer,
        filename,
        mimeType,
        folderId,
        description,
        makePublic,
      });

      if (sessionUser) {
        await DriveHistoryStore.addRecord({
          userId: sessionUser.id,
          module: moduleName,
          filename: result.name,
          mimeType: result.mimeType,
          size: result.size,
          folderId: result.folderId,
          resultDriveFileId: result.fileId,
          webViewLink: result.webViewLink,
          status: "uploaded",
        });

        ActivityTracker.recordActivity({
          userId: sessionUser.id,
          username: sessionUser.username,
          displayName: sessionUser.displayName,
          role: sessionUser.role,
          module: moduleName || "drive_storage",
          action: "upload_drive",
          title: result.name,
          details: { size: result.size, folderId: result.folderId, fileId: result.fileId },
        }).catch(() => {});
      }
    }
    // C. Not connected via OAuth
    else {
      return NextResponse.json<UploadToDriveApiResponse>(
        {
          success: false,
          error:
            "Google Drive មិនទាន់ត្រូវបានភ្ជាប់ឡើយ (Google Drive not connected)。 សូមភ្ជាប់គណនី Google Drive របស់អ្នកនៅក្នុងទំព័រ Math-Upload Settings ដើម្បីរក្សាទុកឯកសារដោយប្រើប្រាស់ទំហំផ្ទុកផ្ទាល់ខ្លួន។",
        },
        { status: 400 }
      );
    }

    return NextResponse.json<UploadToDriveApiResponse>({
      success: true,
      file: {
        ...result,
        id: result.fileId,
        module: moduleName,
        status: "uploaded",
        createdAt: Date.now(),
      } as any,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[UploadToDrive] Error uploading file:", err);

    return NextResponse.json<UploadToDriveApiResponse>(
      {
        success: false,
        error: "Failed to upload image to Google Drive.",
        details: message,
      },
      { status: 500 }
    );
  }
}
