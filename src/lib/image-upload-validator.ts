/**
 * Shared Image Upload Security Validator
 *
 * Enforces strict binary signature (magic bytes) validation, dimensions,
 * pixel count limits, and safe in-memory sanitization across all image endpoints.
 *
 * Guaranteed invariants:
 * 1. Zero disk writes — never writes to disk or public/ folder.
 * 2. Rejects SVGs, HTML, XML, scripts, executables, and polyglots.
 * 3. Enforces maximum dimensions: 4096 × 4096 px.
 * 4. Enforces maximum pixel ceiling: 16 MP (16,777,216 pixels).
 * 5. Sanitizes filenames against path traversal.
 */

export type AllowedImageFormat = "image/png" | "image/jpeg" | "image/webp";

export interface ImageValidationOptions {
  maxSizeBytes?: number; // Default: 10 MB (10,485,760 bytes)
  maxWidth?: number; // Default: 4096 px
  maxHeight?: number; // Default: 4096 px
  maxPixels?: number; // Default: 16 MP (16,777,216 pixels)
  allowlist?: AllowedImageFormat[];
}

export interface ImageValidationSuccess {
  valid: true;
  format: AllowedImageFormat;
  extension: "png" | "jpg" | "webp";
  width: number;
  height: number;
  totalPixels: number;
  byteLength: number;
  sanitizedFilename: string;
}

export interface ImageValidationFailure {
  valid: false;
  code:
    | "EMPTY_FILE"
    | "PAYLOAD_TOO_LARGE"
    | "UNSUPPORTED_MEDIA_TYPE"
    | "DANGEROUS_CONTENT_DETECTED"
    | "INVALID_IMAGE_HEADER"
    | "DIMENSIONS_TOO_LARGE"
    | "PIXEL_LIMIT_EXCEEDED";
  error: string;
  details: string;
  httpStatus: 400 | 413 | 415;
}

export type ImageValidationResult =
  | ImageValidationSuccess
  | ImageValidationFailure;

const DEFAULT_OPTIONS: Required<ImageValidationOptions> = {
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB
  maxWidth: 4096,
  maxHeight: 4096,
  maxPixels: 16 * 1024 * 1024, // 16,777,216 pixels (16 MP)
  allowlist: ["image/png", "image/jpeg", "image/webp"],
};

/**
 * Sanitizes user-supplied filenames to prevent directory traversal and OS injection.
 */
export function sanitizeFilename(
  rawFilename: string | null | undefined,
  fallbackExtension: string = "png"
): string {
  if (!rawFilename || typeof rawFilename !== "string") {
    return `upload_${Date.now()}.${fallbackExtension}`;
  }

  // Strip path components (both UNIX / and Windows \)
  let clean = rawFilename.replace(/^.*[/\\]/, "").trim();

  // Strip non-printable / control characters / null bytes
  clean = clean.replace(/[\x00-\x1f\x7f-\x9f]/g, "");

  // Replace potentially dangerous characters (only allow a-z, 0-9, ., _, -)
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Prevent hidden / dotfiles
  clean = clean.replace(/^\.+/, "");

  // Prevent empty or excessively long filenames
  if (!clean || clean.length === 0) {
    return `upload_${Date.now()}.${fallbackExtension}`;
  }

  if (clean.length > 80) {
    const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".")) : `.${fallbackExtension}`;
    clean = clean.slice(0, 70) + ext;
  }

  return clean;
}

/**
 * Detects dangerous text/script signatures (SVG, HTML, XML, script tags, executables).
 */
function containsDangerousSignatures(buffer: Uint8Array): boolean {
  if (buffer.length < 4) return true;

  // Check executable binary signatures:
  // Windows PE/DOS executable: 'MZ' (0x4D, 0x5A)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) return true;
  // Linux ELF executable: 0x7F 'E' 'L' 'F'
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return true;
  // Mach-O binary
  if (
    (buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa && (buffer[3] === 0xce || buffer[3] === 0xcf)) ||
    (buffer[0] === 0xcf && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe)
  ) {
    return true;
  }

  // Scan initial 2048 bytes for text/markup patterns (SVG / HTML / XML / scripts)
  const probeLength = Math.min(buffer.length, 2048);
  const snippet = new TextDecoder("utf-8", { fatal: false })
    .decode(buffer.subarray(0, probeLength))
    .toLowerCase();

  const dangerousPatterns = [
    "<svg",
    "<?xml",
    "<!doctype svg",
    "<!doctype html",
    "<html",
    "<script",
    "javascript:",
    "vbscript:",
    "onload=",
    "onerror=",
    "xmlns=\"http://www.w3.org/2000/svg\"",
    "xmlns='http://www.w3.org/2000/svg'",
  ];

  return dangerousPatterns.some((pattern) => snippet.includes(pattern));
}

/**
 * Extracts dimensions from PNG binary structure.
 */
function parsePngDimensions(
  buffer: Uint8Array
): { width: number; height: number } | null {
  // PNG Magic: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a
  ) {
    return null;
  }

  // IHDR chunk starts at byte 12 ('I' 'H' 'D' 'R')
  if (
    buffer[12] !== 0x49 ||
    buffer[13] !== 0x48 ||
    buffer[14] !== 0x44 ||
    buffer[15] !== 0x52
  ) {
    return null;
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);

  if (width === 0 || height === 0) return null;
  return { width, height };
}

/**
 * Extracts dimensions from JPEG binary structure by parsing SOF markers.
 */
function parseJpegDimensions(
  buffer: Uint8Array
): { width: number; height: number } | null {
  // JPEG Magic: FF D8 FF
  if (
    buffer.length < 4 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[2] !== 0xff
  ) {
    return null;
  }

  let offset = 2;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];

    // Baseline SOF0 (0xC0), Extended SOF1 (0xC1), Progressive SOF2 (0xC2),
    // Lossless SOF3 (0xC3), Differential SOF5 (0xC5), etc.
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (offset + 9 > buffer.length) return null;
      const height = view.getUint16(offset + 5, false);
      const width = view.getUint16(offset + 7, false);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }

    // Skip marker segment
    if (marker !== 0xd8 && marker !== 0xd9 && marker !== 0x00 && marker !== 0xff) {
      if (offset + 4 > buffer.length) return null;
      const segmentLength = view.getUint16(offset + 2, false);
      if (segmentLength < 2) return null;
      offset += 2 + segmentLength;
    } else {
      offset += 2;
    }
  }

  return null;
}

/**
 * Extracts dimensions from WebP binary structure (VP8, VP8L, VP8X).
 */
function parseWebpDimensions(
  buffer: Uint8Array
): { width: number; height: number } | null {
  // WebP Magic: 'RIFF' .... 'WEBP'
  if (
    buffer.length < 16 ||
    buffer[0] !== 0x52 ||
    buffer[1] !== 0x49 ||
    buffer[2] !== 0x46 ||
    buffer[3] !== 0x46 ||
    buffer[8] !== 0x57 ||
    buffer[9] !== 0x45 ||
    buffer[10] !== 0x42 ||
    buffer[11] !== 0x50
  ) {
    return null;
  }

  // 1. VP8 Lossy
  if (
    buffer[12] === 0x56 &&
    buffer[13] === 0x50 &&
    buffer[14] === 0x38 &&
    buffer[15] === 0x20
  ) {
    if (buffer.length < 30) return null;
    // Keyframe start code: 9D 01 2A
    if (buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      const width = buffer[26] | ((buffer[27] & 0x3f) << 8);
      const height = buffer[28] | ((buffer[29] & 0x3f) << 8);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }
    return null;
  }

  // 2. VP8L Lossless
  if (
    buffer[12] === 0x56 &&
    buffer[13] === 0x50 &&
    buffer[14] === 0x38 &&
    buffer[15] === 0x4c
  ) {
    if (buffer.length < 25 || buffer[20] !== 0x2f) return null;
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    const width = 1 + (b1 | ((b2 & 0x3f) << 8));
    const height = 1 + (((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)));
    if (width === 0 || height === 0) return null;
    return { width, height };
  }

  // 3. VP8X Extended
  if (
    buffer[12] === 0x56 &&
    buffer[13] === 0x50 &&
    buffer[14] === 0x38 &&
    buffer[15] === 0x58
  ) {
    if (buffer.length < 30) return null;
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    if (width === 0 || height === 0) return null;
    return { width, height };
  }

  return null;
}

/**
 * Validates an uploaded image buffer against file size, magic bytes,
 * dimensions, total pixel count, and dangerous content.
 */
export function validateImageUpload(
  bytes: ArrayBuffer | Uint8Array,
  filename?: string | null,
  options?: ImageValidationOptions
): ImageValidationResult {
  const opts: Required<ImageValidationOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  // 1. Guard against empty files
  if (buffer.length === 0) {
    return {
      valid: false,
      code: "EMPTY_FILE",
      error: "Uploaded file is empty (0 bytes).",
      details: "Cannot process zero-byte image uploads.",
      httpStatus: 400,
    };
  }

  // 2. Guard against payload exceeding maximum allowed byte length
  if (buffer.length > opts.maxSizeBytes) {
    const maxMb = (opts.maxSizeBytes / (1024 * 1024)).toFixed(1);
    const actualMb = (buffer.length / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      code: "PAYLOAD_TOO_LARGE",
      error: `File size exceeds the limit of ${maxMb} MB.`,
      details: `Uploaded size (${actualMb} MB) exceeds maximum allowed payload size (${maxMb} MB).`,
      httpStatus: 413,
    };
  }

  // 3. Reject dangerous text/markup/polyglots/scripts/SVGs
  if (containsDangerousSignatures(buffer)) {
    return {
      valid: false,
      code: "DANGEROUS_CONTENT_DETECTED",
      error: "Unsupported file format. SVG, HTML, and script files are strictly prohibited.",
      details: "Binary payload contains script or markup signatures that cannot be safely processed.",
      httpStatus: 415,
    };
  }

  // 4. Validate exact binary magic bytes and extract dimensions
  let format: AllowedImageFormat | null = null;
  let extension: "png" | "jpg" | "webp" = "png";
  let dimensions: { width: number; height: number } | null = null;

  // Try PNG
  const pngDims = parsePngDimensions(buffer);
  if (pngDims) {
    format = "image/png";
    extension = "png";
    dimensions = pngDims;
  }

  // Try JPEG
  if (!format) {
    const jpegDims = parseJpegDimensions(buffer);
    if (jpegDims) {
      format = "image/jpeg";
      extension = "jpg";
      dimensions = jpegDims;
    }
  }

  // Try WebP
  if (!format) {
    const webpDims = parseWebpDimensions(buffer);
    if (webpDims) {
      format = "image/webp";
      extension = "webp";
      dimensions = webpDims;
    }
  }

  // If magic bytes were unrecognized or corrupted
  if (!format || !dimensions) {
    return {
      valid: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      error: "Invalid image format. Expected valid PNG, JPEG, or WebP binary file.",
      details: "File binary header does not match approved PNG, JPEG, or WebP signatures.",
      httpStatus: 415,
    };
  }

  // Check against endpoint allowlist
  if (!opts.allowlist.includes(format)) {
    return {
      valid: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      error: `Format ${format} is not permitted for this endpoint. Allowed formats: ${opts.allowlist.join(", ")}.`,
      details: `Detected ${format}, but endpoint only permits ${opts.allowlist.join(", ")}.`,
      httpStatus: 415,
    };
  }

  const { width, height } = dimensions;
  const totalPixels = width * height;

  // 5. Enforce maximum dimension bounds (width and height <= 4096 px)
  if (width > opts.maxWidth || height > opts.maxHeight) {
    return {
      valid: false,
      code: "DIMENSIONS_TOO_LARGE",
      error: `Image dimensions (${width} × ${height} px) exceed maximum permitted (${opts.maxWidth} × ${opts.maxHeight} px).`,
      details: `Max dimension allowed is ${opts.maxWidth} px. Please downscale image before uploading.`,
      httpStatus: 400,
    };
  }

  // 6. Enforce maximum total pixel count ceiling (<= 16 MP)
  if (totalPixels > opts.maxPixels) {
    const maxMp = (opts.maxPixels / 1_000_000).toFixed(1);
    const actualMp = (totalPixels / 1_000_000).toFixed(2);
    return {
      valid: false,
      code: "PIXEL_LIMIT_EXCEEDED",
      error: `Total pixel count (${actualMp} MP) exceeds safe limit of ${maxMp} MP.`,
      details: `Decompression ceiling of ${maxMp} MP exceeded to protect serverless memory.`,
      httpStatus: 400,
    };
  }

  // 7. Sanitize filename safely
  const sanitizedFilename = sanitizeFilename(filename, extension);

  return {
    valid: true,
    format,
    extension,
    width,
    height,
    totalPixels,
    byteLength: buffer.length,
    sanitizedFilename,
  };
}
