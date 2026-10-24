export interface DriveUploadOptions {
  file?: File | Blob;
  dataUrl?: string;
  filename: string;
  mimeType?: string;
  description?: string;
  makePublic?: boolean;
}

export interface DriveUploadFileRecord {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink: string;
  webContentLink?: string;
  thumbnailLink?: string;
  isPublic: boolean;
  folderId?: string;
}

export interface DriveUploadResponse {
  success: boolean;
  file?: DriveUploadFileRecord;
  error?: string;
  details?: string;
}

/**
 * Client-side helper to upload an image to Google Drive via /api/upload-to-drive.
 * Handles both File/Blob (multipart) and base64/dataURL (json).
 * Does not block caller on failure; throws clean descriptive Error if unsuccessful.
 */
export async function uploadImageToDrive(options: DriveUploadOptions): Promise<DriveUploadFileRecord> {
  const { file, dataUrl, filename, mimeType, description, makePublic = false } = options;

  let response: Response;

  if (file) {
    const formData = new FormData();
    formData.append("file", file, filename);
    formData.append("filename", filename);
    formData.append("makePublic", makePublic ? "true" : "false");
    if (description) {
      formData.append("description", description);
    }

    response = await fetch("/api/upload-to-drive", {
      method: "POST",
      body: formData,
    });
  } else if (dataUrl) {
    response = await fetch("/api/upload-to-drive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: dataUrl,
        filename,
        mimeType: mimeType || "image/png",
        description,
        makePublic,
      }),
    });
  } else {
    throw new Error("No image file or dataUrl provided for Google Drive upload");
  }

  const contentType = response.headers.get("content-type") || "";
  let data: DriveUploadResponse;

  if (contentType.includes("application/json")) {
    try {
      data = (await response.json()) as DriveUploadResponse;
    } catch {
      throw new Error(`Invalid JSON response from /api/upload-to-drive (HTTP ${response.status})`);
    }
  } else {
    const text = await response.text().catch(() => "");
    throw new Error(`Upload to Drive failed with status ${response.status}: ${text.slice(0, 100)}`);
  }

  const rawFile = (data.file || {}) as Record<string, any>;
  const resolvedId = rawFile.id || rawFile.fileId;

  if (!response.ok || !data.success || !rawFile || !resolvedId) {
    const msg = data.error || data.details || `Drive upload failed with HTTP ${response.status}`;
    throw new Error(msg);
  }

  return {
    id: resolvedId,
    name: rawFile.name || rawFile.filename || filename,
    mimeType: rawFile.mimeType || mimeType || "image/png",
    size: Number(rawFile.size) || 0,
    webViewLink: rawFile.webViewLink || `https://drive.google.com/file/d/${resolvedId}/view`,
    webContentLink: rawFile.webContentLink,
    thumbnailLink: rawFile.thumbnailLink,
    isPublic: Boolean(rawFile.isPublic),
    folderId: rawFile.folderId,
  };
}
