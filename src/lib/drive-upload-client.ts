export interface DriveUploadOptions {
  file?: File | Blob;
  dataUrl?: string;
  content?: string;
  text?: string;
  filename: string;
  mimeType?: string;
  description?: string;
  makePublic?: boolean;
  moduleName?: string;
  folderId?: string;
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
  module?: string;
  createdAt?: number;
  status?: "uploaded" | "failed" | "pending";
}

export interface DriveUploadResponse {
  success: boolean;
  file?: DriveUploadFileRecord;
  error?: string;
  details?: string;
}

/**
 * Generates standardized, readable Google Drive filenames adhering to:
 * module name + username/userId + timestamp + output type + extension
 */
export function formatDriveFilename(params: {
  modulePrefix: string;
  userIdOrName?: string;
  outputType: string;
  extension: string;
  timestamp?: number;
}): string {
  const ts = params.timestamp || Date.now();
  const user = (params.userIdOrName || "user").replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = params.extension.replace(/^\.+/, "");
  return `${params.modulePrefix}_${user}_${ts}_${params.outputType}.${ext}`;
}

/**
 * Client-side helper to upload a file (image, text, document) to Google Drive via /api/upload-to-drive.
 * Handles File/Blob (multipart), text/content (json), and base64/dataURL (json).
 * Does not block caller on failure; throws clean descriptive Error if unsuccessful.
 */
export async function uploadImageToDrive(options: DriveUploadOptions): Promise<DriveUploadFileRecord> {
  const { file, dataUrl, content, text, filename, mimeType, description, makePublic = false } = options;

  let response: Response;

  if (file) {
    const formData = new FormData();
    formData.append("file", file, filename);
    formData.append("filename", filename);
    formData.append("makePublic", makePublic ? "true" : "false");
    if (description) {
      formData.append("description", description);
    }
    if (options.moduleName) {
      formData.append("module", options.moduleName);
    }
    if (options.folderId) {
      formData.append("folderId", options.folderId);
    }

    response = await fetch("/api/upload-to-drive", {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    });
  } else if (content !== undefined || text !== undefined) {
    const textPayload = content !== undefined ? content : text;
    response = await fetch("/api/upload-to-drive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        content: textPayload,
        filename,
        mimeType: mimeType || (filename.endsWith(".html") ? "text/html" : filename.endsWith(".tex") ? "application/x-tex" : filename.endsWith(".xml") ? "application/xml" : "text/plain"),
        description,
        makePublic,
        module: options.moduleName,
        folderId: options.folderId,
      }),
    });
  } else if (dataUrl) {
    response = await fetch("/api/upload-to-drive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        image: dataUrl,
        filename,
        mimeType: mimeType || "image/png",
        description,
        makePublic,
        module: options.moduleName,
        folderId: options.folderId,
      }),
    });
  } else {
    throw new Error("No file, text content, or dataUrl provided for Google Drive upload");
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
    const resText = await response.text().catch(() => "");
    throw new Error(`Upload to Drive failed with status ${response.status}: ${resText.slice(0, 100)}`);
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
    mimeType: rawFile.mimeType || mimeType || "application/octet-stream",
    size: Number(rawFile.size) || (typeof content === "string" ? content.length : typeof text === "string" ? text.length : 0),
    webViewLink: rawFile.webViewLink || `https://drive.google.com/file/d/${resolvedId}/view`,
    webContentLink: rawFile.webContentLink,
    thumbnailLink: rawFile.thumbnailLink,
    isPublic: Boolean(rawFile.isPublic),
    folderId: rawFile.folderId,
    module: rawFile.module || options.moduleName,
    createdAt: rawFile.createdAt || Date.now(),
    status: "uploaded",
  };
}
