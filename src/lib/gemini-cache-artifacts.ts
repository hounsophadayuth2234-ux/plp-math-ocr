import {
  uploadUserBufferToGoogleDrive,
  getTargetDriveFolderId,
} from "./google-drive-oauth";
import { uploadBufferToGoogleDrive } from "./google-drive";
import { UserStore } from "./user-store";

export interface ArtifactFileDescriptor {
  type: "original" | "latex" | "html" | "mathml" | "text" | "json" | "cutout" | "upscaled";
  buffer: Buffer;
  filename: string;
  mimeType: string;
  description?: string;
}

export interface UploadedArtifactsResult {
  driveFileIds: Record<string, string>;
  driveLinks: Record<string, string>;
  mimeTypes: Record<string, string>;
  allSucceeded: boolean;
  errors: Record<string, string>;
}

/**
 * Generates standardized, human-readable Drive filenames:
 * [module]_[username/userId]_[timestamp]_[outputType].[ext]
 */
export function formatArtifactDriveFilename(
  module: string,
  userIdentifier: string,
  outputType: string,
  extension: string,
  timestamp = Date.now()
): string {
  const cleanModule = module
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/^module_?0?/, "module0");

  const cleanUser = userIdentifier
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 24);

  const cleanType = outputType
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");

  const cleanExt = extension.replace(/^\./, "").toLowerCase();

  return `${cleanModule}_${cleanUser}_${timestamp}_${cleanType}.${cleanExt}`;
}

/**
 * Builds standard artifacts for Module 01 (Math OCR).
 */
export function buildModule01Artifacts(params: {
  username: string;
  originalImage?: { buffer: Buffer; filename: string; mimeType: string };
  latex?: string;
  html?: string;
  mathml?: string;
  transcription?: string;
  timestamp?: number;
}): ArtifactFileDescriptor[] {
  const { username, originalImage, latex, html, mathml, transcription, timestamp = Date.now() } = params;
  const artifacts: ArtifactFileDescriptor[] = [];

  if (originalImage && originalImage.buffer.length > 0) {
    const ext = originalImage.mimeType.includes("jpeg")
      ? "jpg"
      : originalImage.mimeType.includes("webp")
      ? "webp"
      : "png";
    artifacts.push({
      type: "original",
      buffer: originalImage.buffer,
      filename: formatArtifactDriveFilename("module01_math_ocr", username, "original", ext, timestamp),
      mimeType: originalImage.mimeType,
      description: "Module 01: Original Math Image",
    });
  }

  if (latex && latex.trim()) {
    artifacts.push({
      type: "latex",
      buffer: Buffer.from(latex, "utf8"),
      filename: formatArtifactDriveFilename("module01_math_ocr", username, "latex", "tex", timestamp),
      mimeType: "application/x-tex; charset=utf-8",
      description: "Module 01: LaTeX Output",
    });
  }

  if (html && html.trim()) {
    artifacts.push({
      type: "html",
      buffer: Buffer.from(html, "utf8"),
      filename: formatArtifactDriveFilename("module01_math_ocr", username, "preview", "html", timestamp),
      mimeType: "text/html; charset=utf-8",
      description: "Module 01: Self-Contained HTML Preview",
    });
  }

  if (mathml && mathml.trim()) {
    artifacts.push({
      type: "mathml",
      buffer: Buffer.from(mathml, "utf8"),
      filename: formatArtifactDriveFilename("module01_math_ocr", username, "mathml", "xml", timestamp),
      mimeType: "application/xml; charset=utf-8",
      description: "Module 01: MathML Output",
    });
  }

  if (transcription && transcription.trim()) {
    artifacts.push({
      type: "text",
      buffer: Buffer.from(transcription, "utf8"),
      filename: formatArtifactDriveFilename("module01_math_ocr", username, "ocr_text", "txt", timestamp),
      mimeType: "text/plain; charset=utf-8",
      description: "Module 01: Plain Text OCR Transcription",
    });
  }

  return artifacts;
}

/**
 * Builds standard artifacts for Module 04 (Math Solver).
 */
export function buildModule04Artifacts(params: {
  username: string;
  originalImage?: { buffer: Buffer; filename: string; mimeType: string };
  problemText?: string;
  solutionText?: string;
  solutionHtml?: string;
  timestamp?: number;
}): ArtifactFileDescriptor[] {
  const { username, originalImage, problemText, solutionText, solutionHtml, timestamp = Date.now() } = params;
  const artifacts: ArtifactFileDescriptor[] = [];

  if (originalImage && originalImage.buffer.length > 0) {
    const ext = originalImage.mimeType.includes("jpeg")
      ? "jpg"
      : originalImage.mimeType.includes("webp")
      ? "webp"
      : "png";
    artifacts.push({
      type: "original",
      buffer: originalImage.buffer,
      filename: formatArtifactDriveFilename("module04_math_solver", username, "problem_image", ext, timestamp),
      mimeType: originalImage.mimeType,
      description: "Module 04: Original Problem Image",
    });
  }

  if (solutionText && solutionText.trim()) {
    artifacts.push({
      type: "text",
      buffer: Buffer.from(solutionText, "utf8"),
      filename: formatArtifactDriveFilename("module04_math_solver", username, "solution", "txt", timestamp),
      mimeType: "text/plain; charset=utf-8",
      description: "Module 04: Plain Text Step-by-Step Solution",
    });
  }

  if (solutionHtml && solutionHtml.trim()) {
    artifacts.push({
      type: "html",
      buffer: Buffer.from(solutionHtml, "utf8"),
      filename: formatArtifactDriveFilename("module04_math_solver", username, "solution_card", "html", timestamp),
      mimeType: "text/html; charset=utf-8",
      description: "Module 04: Self-Contained HTML Solution",
    });
  }

  return artifacts;
}

/**
 * Builds standard artifacts for Module 05 (Lesson Studio).
 */
export function buildModule05Artifacts(params: {
  username: string;
  originalImage?: { buffer: Buffer; filename: string; mimeType: string };
  lessonHtml?: string;
  lessonText?: string;
  quizHtml?: string;
  visualSvg?: string;
  timestamp?: number;
}): ArtifactFileDescriptor[] {
  const { username, originalImage, lessonHtml, lessonText, quizHtml, visualSvg, timestamp = Date.now() } = params;
  const artifacts: ArtifactFileDescriptor[] = [];

  if (originalImage && originalImage.buffer.length > 0) {
    const ext = originalImage.mimeType.includes("jpeg")
      ? "jpg"
      : originalImage.mimeType.includes("webp")
      ? "webp"
      : "png";
    artifacts.push({
      type: "original",
      buffer: originalImage.buffer,
      filename: formatArtifactDriveFilename("module05_lesson_studio", username, "reference_image", ext, timestamp),
      mimeType: originalImage.mimeType,
      description: "Module 05: Reference Image",
    });
  }

  if (lessonHtml && lessonHtml.trim()) {
    artifacts.push({
      type: "html",
      buffer: Buffer.from(lessonHtml, "utf8"),
      filename: formatArtifactDriveFilename("module05_lesson_studio", username, "lesson_plan", "html", timestamp),
      mimeType: "text/html; charset=utf-8",
      description: "Module 05: Lesson Plan HTML",
    });
  }

  if (lessonText && lessonText.trim()) {
    artifacts.push({
      type: "text",
      buffer: Buffer.from(lessonText, "utf8"),
      filename: formatArtifactDriveFilename("module05_lesson_studio", username, "lesson_summary", "txt", timestamp),
      mimeType: "text/plain; charset=utf-8",
      description: "Module 05: Lesson Summary Plain Text",
    });
  }

  if (quizHtml && quizHtml.trim()) {
    artifacts.push({
      type: "html",
      buffer: Buffer.from(quizHtml, "utf8"),
      filename: formatArtifactDriveFilename("module05_lesson_studio", username, "quiz_worksheet", "html", timestamp),
      mimeType: "text/html; charset=utf-8",
      description: "Module 05: Quiz Worksheet HTML",
    });
  }

  if (visualSvg && visualSvg.trim()) {
    artifacts.push({
      type: "html",
      buffer: Buffer.from(visualSvg, "utf8"),
      filename: formatArtifactDriveFilename("module05_lesson_studio", username, "visual_diagram", "html", timestamp),
      mimeType: "text/html; charset=utf-8",
      description: "Module 05: Educational Visual Diagram SVG/HTML",
    });
  }

  return artifacts;
}

/**
 * Uploads a list of artifacts into the owner's Google Drive folder DYT_Math_Images.
 * Never throws fatal exceptions to ensure AI output remains usable.
 * Returns truthful file IDs and error statuses for each item.
 */
export async function uploadArtifactsToGoogleDrive(
  userId: string,
  artifacts: ArtifactFileDescriptor[],
  folderId = getTargetDriveFolderId()
): Promise<UploadedArtifactsResult> {
  const driveFileIds: Record<string, string> = {};
  const driveLinks: Record<string, string> = {};
  const mimeTypes: Record<string, string> = {};
  const errors: Record<string, string> = {};
  let allSucceeded = true;

  if (artifacts.length === 0) {
    return { driveFileIds, driveLinks, mimeTypes, allSucceeded: true, errors };
  }

  // Determine connected Drive account (priority 1: session user, priority 2: admin account)
  const user = await UserStore.getUserById(userId);
  let driveUserId = user?.googleDriveConnected ? userId : null;
  if (!driveUserId) {
    const connected = await UserStore.findFirstConnectedDriveUser();
    if (connected) {
      driveUserId = connected.id;
    }
  }

  for (const art of artifacts) {
    mimeTypes[art.type] = art.mimeType;

    try {
      if (driveUserId) {
        // Upload using Personal OAuth Owner Account quota
        const res = await uploadUserBufferToGoogleDrive(driveUserId, {
          buffer: art.buffer,
          filename: art.filename,
          mimeType: art.mimeType,
          folderId,
          description: art.description,
          makePublic: false,
        });

        driveFileIds[art.type] = res.fileId;
        if (res.webViewLink) {
          driveLinks[art.type] = res.webViewLink;
        }
      } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.NODE_ENV === "test") {
        // Fallback to service account in mock/test environments
        const res = await uploadBufferToGoogleDrive({
          buffer: art.buffer,
          filename: art.filename,
          mimeType: art.mimeType,
          folderId,
          description: art.description,
          makePublic: false,
        });

        driveFileIds[art.type] = res.fileId;
        if (res.webViewLink) {
          driveLinks[art.type] = res.webViewLink;
        }
      } else {
        allSucceeded = false;
        errors[art.type] = "Google Drive not connected";
      }
    } catch (err: unknown) {
      allSucceeded = false;
      const msg = err instanceof Error ? err.message : String(err);
      errors[art.type] = msg;
      console.warn(`[DriveArtifacts] Failed to upload ${art.filename}:`, msg);
    }
  }

  return {
    driveFileIds,
    driveLinks,
    mimeTypes,
    allSucceeded,
    errors,
  };
}
