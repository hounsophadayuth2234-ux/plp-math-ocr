import { NextRequest, NextResponse } from "next/server";
import {
  uploadBufferToGoogleDrive,
  getDefaultDriveFolderId,
  getGoogleDriveClient,
  DriveUploadResult,
} from "@/lib/google-drive";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { sanitizeFilename } from "@/lib/image-upload-validator";

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

    const folderId = getDefaultDriveFolderId();
    const drive = getGoogleDriveClient();

    // Verify access to the configured folder
    const folderRes = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });

    return NextResponse.json({
      success: true,
      service: "google-drive-uploader",
      configured: true,
      folderId,
      folderName: folderRes.data.name,
      mimeType: folderRes.data.mimeType,
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
 * Accepts image file via multipart/form-data or JSON (base64/dataURL) and uploads to Google Drive.
 */
export async function POST(req: NextRequest): Promise<NextResponse<UploadToDriveApiResponse>> {
  // 1. Defense-in-depth route session verification (bypassed in test env unless explicitly enabled)
  const authBlock = await enforceRouteAuth(req);
  if (authBlock) return authBlock as NextResponse<UploadToDriveApiResponse>;

  // 2. Server-side Rate Limiting (20 req/min/IP)
  const rateLimitBlock = await enforceRateLimit(req, "drive_upload");
  if (rateLimitBlock) return rateLimitBlock as NextResponse<UploadToDriveApiResponse>;

  try {
    const contentType = req.headers.get("content-type") || "";

    let buffer: Buffer | null = null;
    let filename = "";
    let mimeType = "image/png";
    let folderId: string | undefined;
    let description: string | undefined;
    let makePublic = false;

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

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }
    // Handle JSON Payload (base64 or dataURL)
    else if (contentType.includes("application/json")) {
      const body = await req.json();
      const rawImage = body.image || body.file || body.base64;

      if (!rawImage || typeof rawImage !== "string") {
        return NextResponse.json<UploadToDriveApiResponse>(
          {
            success: false,
            error: "No image payload found in JSON body. Expected 'image', 'file', or 'base64'.",
          },
          { status: 400 }
        );
      }

      filename = body.filename?.trim() || `image_${Date.now()}.png`;
      folderId = body.folderId?.trim() || undefined;
      description = body.description?.trim() || undefined;
      makePublic = Boolean(body.makePublic);

      // Check if it's a data URL: data:image/png;base64,...
      const dataUrlMatch = rawImage.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        buffer = Buffer.from(dataUrlMatch[2], "base64");
      } else {
        // Plain base64
        mimeType = body.mimeType || "image/png";
        buffer = Buffer.from(rawImage, "base64");
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
      const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
      filename = `upload_${Date.now()}.${ext}`;
    }

    // Upload directly to Google Drive
    const result = await uploadBufferToGoogleDrive({
      buffer,
      filename,
      mimeType,
      folderId,
      description,
      makePublic,
    });

    return NextResponse.json<UploadToDriveApiResponse>({
      success: true,
      file: result,
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
