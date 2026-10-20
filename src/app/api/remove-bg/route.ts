import { NextRequest, NextResponse } from "next/server";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { sanitizeFilename } from "@/lib/image-upload-validator";
import { safeFetch, isBlockedHostname, isPrivateOrReservedIp } from "@/lib/ssrf-guard";

export const maxDuration = 60; // Allow up to 60s for inference

interface WorkerConfig {
  configured: boolean;
  url: string | null;
  token: string | null;
  timeoutMs: number;
  maxUploadBytes: number;
  configError?: string;
}

/**
 * Validates worker URL protocol and enforces approved-host SSRF protection.
 * In production: HTTPS only, blocks loopback, link-local, and private subnets.
 * In development: Allows localhost/127.0.0.1 for local FastAPI worker development.
 */
function validateWorkerUrl(
  rawUrl: string,
  isVercelProduction: boolean
): { ok: boolean; error?: string; url?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false,
        error: "Invalid worker URL protocol. Only HTTP and HTTPS are permitted.",
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Approved-host validation: In production Vercel, reject loopback & private subnets
    if (isVercelProduction) {
      if (parsed.protocol !== "https:") {
        return {
          ok: false,
          error: "On production Vercel, worker URL must use secure HTTPS protocol.",
        };
      }

      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "0.0.0.0" ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("192.168.") ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
        hostname === "169.254.169.254"
      ) {
        return {
          ok: false,
          error:
            "On production Vercel, worker target must be a public HTTPS host, not a private or loopback address.",
        };
      }
    }

    return {
      ok: true,
      url: parsed.origin + parsed.pathname.replace(/\/+$/, ""),
    };
  } catch {
    return { ok: false, error: "Invalid worker URL format." };
  }
}

/**
 * Coordinate and geometry validation for interactive segmentation prompts
 */
export function validatePoints(
  rawPoints: unknown,
  name = "points"
): { valid: boolean; points?: [number, number][]; error?: string } {
  if (rawPoints === undefined || rawPoints === null || rawPoints === "") {
    return { valid: true, points: [] };
  }
  let parsed = rawPoints;
  if (typeof rawPoints === "string") {
    try {
      parsed = JSON.parse(rawPoints);
    } catch {
      return { valid: false, error: `${name} must be a valid JSON array of [x, y] coordinates.` };
    }
  }
  if (!Array.isArray(parsed)) {
    return { valid: false, error: `${name} must be an array of [x, y] coordinates.` };
  }
  const points: [number, number][] = [];
  for (let i = 0; i < parsed.length; i++) {
    const pt = parsed[i];
    if (!Array.isArray(pt) || pt.length !== 2) {
      return { valid: false, error: `${name}[${i}] must be a 2-element [x, y] coordinate.` };
    }
    const [x, y] = pt;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { valid: false, error: `${name}[${i}] coordinates must be finite numbers.` };
    }
    if (x < 0 || y < 0) {
      return { valid: false, error: `${name}[${i}] coordinates cannot be negative.` };
    }
    points.push([x, y]);
  }
  return { valid: true, points };
}

export function getImageDimensions(
  buffer: Uint8Array
): { width: number; height: number } | null {
  if (buffer.length < 24) return null;

  // 1. PNG: magic bytes 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return { width, height };
  }

  // 2. JPEG: magic bytes FF D8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // Baseline SOF0 (0xC0), Extended SOF1 (0xC1), Progressive SOF2 (0xC2)
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = view.getUint16(offset + 5, false);
        const width = view.getUint16(offset + 7, false);
        return { width, height };
      }
      // Skip variable length marker
      if (marker !== 0xd8 && marker !== 0xd9 && marker !== 0x00 && marker !== 0xff) {
        const length = view.getUint16(offset + 2, false);
        offset += 2 + length;
      } else {
        offset += 2;
      }
    }
  }

  // 3. WebP: magic bytes 'RIFF' .... 'WEBP'
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    // VP8 lossy
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x20) {
      if (buffer.length >= 30) {
        const width = (buffer[26] | ((buffer[27] & 0x3f) << 8));
        const height = (buffer[28] | ((buffer[29] & 0x3f) << 8));
        return { width, height };
      }
    }
    // VP8L lossless
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x4c) {
      if (buffer.length >= 25 && buffer[20] === 0x2f) {
        const b1 = buffer[21];
        const b2 = buffer[22];
        const b3 = buffer[23];
        const b4 = buffer[24];
        const width = 1 + (b1 | ((b2 & 0x3f) << 8));
        const height = 1 + (((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)));
        return { width, height };
      }
    }
    // VP8X extended
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x58) {
      if (buffer.length >= 30) {
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        return { width, height };
      }
    }
  }

  return null;
}

export function validateBoxes(
  rawBoxes: unknown,
  name = "boxes"
): { valid: boolean; boxes?: [number, number, number, number][]; error?: string } {
  if (rawBoxes === undefined || rawBoxes === null || rawBoxes === "") {
    return { valid: true, boxes: [] };
  }
  let parsed = rawBoxes;
  if (typeof rawBoxes === "string") {
    try {
      parsed = JSON.parse(rawBoxes);
    } catch {
      return { valid: false, error: `${name} must be a valid JSON array of [x1, y1, x2, y2].` };
    }
  }
  if (!Array.isArray(parsed)) {
    return { valid: false, error: `${name} must be an array of [x1, y1, x2, y2] bounding boxes.` };
  }
  const boxes: [number, number, number, number][] = [];
  for (let i = 0; i < parsed.length; i++) {
    const b = parsed[i];
    if (!Array.isArray(b) || b.length !== 4) {
      return { valid: false, error: `${name}[${i}] must be a 4-element [x1, y1, x2, y2] array.` };
    }
    const [x1, y1, x2, y2] = b;
    if ([x1, y1, x2, y2].some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return { valid: false, error: `${name}[${i}] coordinates must be non-negative finite numbers.` };
    }
    if (x2 < x1 || y2 < y1) {
      return { valid: false, error: `${name}[${i}] has invalid bounds: [x2, y2] must be >= [x1, y1].` };
    }
    boxes.push([x1, y1, x2, y2]);
  }
  return { valid: true, boxes };
}

export function validateImageUrl(
  rawUrl: string,
  isVercelProduction: boolean
): { ok: boolean; error?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Invalid image URL protocol. Only HTTP and HTTPS are permitted." };
    }
    if (isVercelProduction && parsed.protocol !== "https:") {
      return { ok: false, error: "On production Vercel, image URLs must use secure HTTPS protocol." };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (isBlockedHostname(hostname) || isPrivateOrReservedIp(hostname)) {
      return {
        ok: false,
        error: "SSRF blocked: URL targets private, loopback, or cloud metadata address.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Malformed image URL." };
  }
}

/**
 * Reads server-only environment variables and validates worker configuration.
 * Never exposes the worker URL or token to client code.
 */
function getWorkerConfig(): WorkerConfig {
  const isVercelProduction =
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.STRICT_SSRF === "1";

  const rawUrl = (
    process.env.BACKGROUND_REMOVAL_WORKER_URL ||
    process.env.REMBG_SPACE_URL ||
    process.env.HF_SPACE_URL ||
    ""
  )
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/+$/, "");

  const rawToken = (
    process.env.BACKGROUND_REMOVAL_WORKER_TOKEN ||
    process.env.HF_SPACE_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    ""
  )
    .trim()
    .replace(/^["']|["']$/g, "");

  const timeoutMs =
    parseInt(process.env.BACKGROUND_REMOVAL_TIMEOUT_MS || "", 10) || 60000; // Default 60s — matches Vercel maxDuration
  const maxUploadBytes =
    parseInt(process.env.BACKGROUND_REMOVAL_MAX_UPLOAD_BYTES || "", 10) ||
    12 * 1024 * 1024; // Default 12 MB

  if (
    !rawUrl ||
    rawUrl.includes("your_space_url") ||
    rawUrl.includes("your-worker-url") ||
    rawUrl.includes("your-rembg.hf.space")
  ) {
    return {
      configured: false,
      url: null,
      token: null,
      timeoutMs,
      maxUploadBytes,
    };
  }

  const validation = validateWorkerUrl(rawUrl, isVercelProduction);
  if (!validation.ok || !validation.url) {
    return {
      configured: false,
      url: null,
      token: null,
      timeoutMs,
      maxUploadBytes,
      configError: validation.error,
    };
  }

  const token = rawToken && !rawToken.includes("your_") ? rawToken : null;
  return {
    configured: true,
    url: validation.url,
    token,
    timeoutMs,
    maxUploadBytes,
  };
}

/**
 * GET /api/remove-bg
 * Returns worker configuration state and operating constraints.
 * Supports ?checkHealth=true to probe upstream /health endpoint.
 */
export async function GET(req?: NextRequest) {
  if (req) {
    const authBlock = await enforceRouteAuth(req);
    if (authBlock) return authBlock;

    const rateLimitBlock = await enforceRateLimit(req, "settings");
    if (rateLimitBlock) return rateLimitBlock;
  }

  const config = getWorkerConfig();
  const searchParams = req?.nextUrl?.searchParams;
  const checkHealth = searchParams?.get("checkHealth") === "true";

  if (config.configError) {
    return NextResponse.json(
      {
        configured: false,
        status: "invalid_configuration",
        error: config.configError,
        maxUploadBytes: config.maxUploadBytes,
        timeoutMs: config.timeoutMs,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  if (!config.configured || !config.url) {
    return NextResponse.json(
      {
        configured: false,
        status: "not_configured",
        maxUploadBytes: config.maxUploadBytes,
        timeoutMs: config.timeoutMs,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  if (!checkHealth) {
    return NextResponse.json(
      {
        configured: true,
        status: "configured",
        directUrl: !config.token
          ? config.url.endsWith("/remove") || config.url.endsWith("/matting")
            ? config.url
            : `${config.url}/remove`
          : null,
        alphaMattingSupported: true,
        maxUploadBytes: config.maxUploadBytes,
        timeoutMs: config.timeoutMs,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  // Probe health endpoint with bounded timeout (3.5s)
  const workerBase = config.url.replace(
    /\/(remove|api\/remove|api\/remove-bg)$/,
    ""
  );
  const healthUrl = `${workerBase}/health`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const headers: Record<string, string> = {};
    if (config.token) {
      headers["Authorization"] = `Bearer ${config.token}`;
    }

    const healthRes = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (healthRes.ok) {
      const data = await healthRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          configured: true,
          status: "ready",
          model: data.model || "rembg / u2net",
          directUrl: !config.token
            ? config.url.endsWith("/remove") || config.url.endsWith("/matting")
              ? config.url
              : `${config.url}/remove`
            : null,
          alphaMattingSupported: Boolean(data.alpha_matting_supported ?? true),
          maxUploadBytes: config.maxUploadBytes,
          timeoutMs: config.timeoutMs,
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    } else {
      return NextResponse.json(
        {
          configured: true,
          status: "unavailable",
          error: `Worker health check returned HTTP ${healthRes.status}`,
          maxUploadBytes: config.maxUploadBytes,
          timeoutMs: config.timeoutMs,
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }
  } catch {
    const isTimeout = controller.signal.aborted;
    return NextResponse.json(
      {
        configured: true,
        status: "unavailable",
        error: isTimeout
          ? "Worker health check timed out (3.5s)"
          : "Worker offline or unreachable",
        maxUploadBytes: config.maxUploadBytes,
        timeoutMs: config.timeoutMs,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * POST /api/remove-bg
 * Production-ready server-side gateway to Remote Background Removal Worker.
 */
export async function POST(req: NextRequest) {
  // 1. Enforce Server-Side Session Auth (defense-in-depth)
  const authBlock = await enforceRouteAuth(req);
  if (authBlock) {
    return authBlock;
  }

  // 2. Enforce Server-Side Rate Limiting (5 req/min/IP) before reading payload or dispatching worker
  const rateLimitBlock = await enforceRateLimit(req, "remove_bg");
  if (rateLimitBlock) {
    return rateLimitBlock;
  }

  const config = getWorkerConfig();

  // 1. Check configuration validity
  if (config.configError) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_CONFIGURATION",
        error: config.configError,
      },
      {
        status: 422,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  if (!config.configured || !config.url) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONFIGURED",
        error: "Remote Worker is not configured.",
      },
      {
        status: 422,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  const isVercelProduction =
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.STRICT_SSRF === "1";

  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  const allowedMimes = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
  ];

  const startTime = performance.now();
  let imageBuffer: ArrayBuffer;
  let imageMime = "image/png";
  let fileName = "image.png";
  let selectionMode = "preserve_all_foreground";
  let quality = "balanced";
  let background: string | undefined = undefined;
  let isJsonResponseExpected = false;
  let positivePoints: [number, number][] = [];
  let negativePoints: [number, number][] = [];
  let boxes: [number, number, number, number][] = [];
  let keepBoxes: [number, number, number, number][] = [];
  let eraseBoxes: [number, number, number, number][] = [];
  let polygon: [number, number][] = [];
  let inputDims: { width: number; height: number } | null = null;

  if (contentType.includes("application/json")) {
    let jsonBody: Record<string, unknown>;
    try {
      jsonBody = await req.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_JSON",
          error: "Malformed JSON payload.",
        },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    // Coordinate validation
    const posVal = validatePoints(jsonBody.positivePoints, "positivePoints");
    if (!posVal.valid) {
      return NextResponse.json(
        { ok: false, code: "INVALID_COORDINATES", error: posVal.error },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }
    positivePoints = posVal.points || [];

    const negVal = validatePoints(jsonBody.negativePoints, "negativePoints");
    if (!negVal.valid) {
      return NextResponse.json(
        { ok: false, code: "INVALID_COORDINATES", error: negVal.error },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }
    negativePoints = negVal.points || [];

    const boxVal = validateBoxes(jsonBody.boxes, "boxes");
    if (!boxVal.valid) {
      return NextResponse.json(
        { ok: false, code: "INVALID_COORDINATES", error: boxVal.error },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }
    boxes = boxVal.boxes || [];

    const kbVal = validateBoxes(jsonBody.keepBoxes, "keepBoxes");
    if (!kbVal.valid) {
      return NextResponse.json(
        { ok: false, code: "INVALID_COORDINATES", error: kbVal.error },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }
    keepBoxes = kbVal.boxes || [];

    const ebVal = validateBoxes(jsonBody.eraseBoxes, "eraseBoxes");
    if (!ebVal.valid) {
      return NextResponse.json(
        { ok: false, code: "INVALID_COORDINATES", error: ebVal.error },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }
    eraseBoxes = ebVal.boxes || [];

    const polyVal = validatePoints(jsonBody.polygon, "polygon");
    if (!polyVal.valid) {
      return NextResponse.json(
        { ok: false, code: "INVALID_COORDINATES", error: polyVal.error },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }
    polygon = polyVal.points || [];

    if (typeof jsonBody.mode === "string" && jsonBody.mode.trim()) {
      selectionMode = jsonBody.mode.trim();
    }
    if (typeof jsonBody.quality === "string" && jsonBody.quality.trim()) {
      quality = jsonBody.quality.trim();
    }
    if (typeof jsonBody.background === "string" && jsonBody.background.trim()) {
      background = jsonBody.background.trim();
    }

    // Check for maskPngBase64 oversized payload
    if (typeof jsonBody.maskPngBase64 === "string" && jsonBody.maskPngBase64.length > config.maxUploadBytes * 1.5) {
      return NextResponse.json(
        {
          ok: false,
          code: "IMAGE_TOO_LARGE",
          error: "Mask payload exceeds maximum upload bytes limit.",
        },
        { status: 413, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    if (typeof jsonBody.imageBase64 === "string" && jsonBody.imageBase64.trim()) {
      isJsonResponseExpected = true;
      const rawBase64 = jsonBody.imageBase64.trim();
      let base64Data = rawBase64;
      let declaredMime = "";
      const match = rawBase64.match(/^data:([^;]+);base64,([\s\S]*)$/);
      if (match) {
        declaredMime = match[1].toLowerCase();
        base64Data = match[2];
      }
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length === 0) {
        return NextResponse.json(
          { ok: false, code: "IMAGE_REQUIRED", error: "imageBase64 is empty (0 bytes)." },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      if (buf.length > config.maxUploadBytes) {
        return NextResponse.json(
          {
            ok: false,
            code: "IMAGE_TOO_LARGE",
            error: `Image size (${buf.length} bytes) exceeds maximum limit (${config.maxUploadBytes} bytes).`,
          },
          { status: 413, headers: { "Cache-Control": "no-store, private" } }
        );
      }

      let detectedMime = declaredMime;
      if (!detectedMime || !allowedMimes.includes(detectedMime)) {
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
          detectedMime = "image/png";
        } else if (buf[0] === 0xff && buf[1] === 0xd8) {
          detectedMime = "image/jpeg";
        } else if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
          detectedMime = "image/webp";
        }
      }
      if (!allowedMimes.includes(detectedMime)) {
        return NextResponse.json(
          {
            ok: false,
            code: "UNSUPPORTED_MEDIA_TYPE",
            error: `Unsupported media type '${detectedMime || "unknown"}'. Only PNG, JPEG, and WebP are allowed.`,
          },
          { status: 415, headers: { "Cache-Control": "no-store, private" } }
        );
      }

      imageMime = detectedMime;
      imageBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      inputDims = getImageDimensions(new Uint8Array(imageBuffer));
      if (inputDims && (inputDims.width > 4096 || inputDims.height > 4096 || inputDims.width * inputDims.height > 16777216)) {
        return NextResponse.json(
          {
            ok: false,
            code: "DECOMPRESSION_BOMB",
            error: "Image dimensions exceed maximum safe limit of 16MP or 4096x4096.",
          },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      fileName = sanitizeFilename("upload." + (detectedMime === "image/webp" ? "webp" : detectedMime === "image/jpeg" ? "jpg" : "png"));
    } else {
      // Image URL validation
      const rawImageUrl = typeof jsonBody.imageUrl === "string" ? jsonBody.imageUrl.trim() : "";
      if (!rawImageUrl) {
        return NextResponse.json(
          {
            ok: false,
            code: "IMAGE_REQUIRED",
            error: "imageUrl or imageBase64 is required for JSON background removal requests.",
          },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }

      const urlCheck = validateImageUrl(rawImageUrl, isVercelProduction);
      if (!urlCheck.ok) {
        const isSsrf = (urlCheck.error || "").toLowerCase().includes("ssrf") || (urlCheck.error || "").toLowerCase().includes("private");
        return NextResponse.json(
          {
            ok: false,
            code: isSsrf ? "SSRF_BLOCKED" : "INVALID_IMAGE_URL",
            error: urlCheck.error,
          },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }

      // Fetch image from approved URL using SSRF-safe fetch with DNS validation and manual redirect tracking
      try {
        const fetchResult = await safeFetch(rawImageUrl, {
          timeoutMs: 15000,
          maxSizeBytes: config.maxUploadBytes,
          allowedContentTypes: allowedMimes,
          requireHttps: isVercelProduction,
          headers: { "User-Agent": "PLP-BackgroundRemover/2.0" },
        });

        imageMime = fetchResult.contentType;
        imageBuffer = fetchResult.buffer;
        fileName = sanitizeFilename(fetchResult.finalUrl.split("/").pop()?.split("?")[0] || "image.png");
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        const isSsrf = msg.toLowerCase().includes("ssrf") || msg.toLowerCase().includes("private") || msg.toLowerCase().includes("loopback") || msg.toLowerCase().includes("metadata");
        const isUnsupportedMedia = msg.toLowerCase().includes("unsupported content-type");
        const isPayloadTooLarge = msg.toLowerCase().includes("payload too large");

        if (isUnsupportedMedia) {
          return NextResponse.json(
            {
              ok: false,
              code: "UNSUPPORTED_MEDIA_TYPE",
              error: msg,
            },
            { status: 415, headers: { "Cache-Control": "no-store, private" } }
          );
        }

        return NextResponse.json(
          {
            ok: false,
            code: isSsrf ? "SSRF_BLOCKED" : isPayloadTooLarge ? "PAYLOAD_TOO_LARGE" : "IMAGE_FETCH_FAILED",
            error: msg,
          },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }

      if (!imageBuffer || imageBuffer.byteLength === 0) {
        return NextResponse.json(
          {
            ok: false,
            code: "IMAGE_REQUIRED",
            error: "Image fetched from imageUrl is empty (0 bytes).",
          },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }

      if (imageBuffer.byteLength > config.maxUploadBytes) {
        return NextResponse.json(
          {
            ok: false,
            code: "IMAGE_TOO_LARGE",
            error: `Image size (${imageBuffer.byteLength} bytes) exceeds maximum limit (${config.maxUploadBytes} bytes).`,
          },
          { status: 413, headers: { "Cache-Control": "no-store, private" } }
        );
      }

      inputDims = getImageDimensions(new Uint8Array(imageBuffer));
      if (inputDims && (inputDims.width > 4096 || inputDims.height > 4096 || inputDims.width * inputDims.height > 16777216)) {
        return NextResponse.json(
          {
            ok: false,
            code: "DECOMPRESSION_BOMB",
            error: "Image dimensions exceed maximum safe limit of 16MP or 4096x4096.",
          },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }
    }
  } else {
    // 2. Parse and validate multipart form data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          code: "IMAGE_REQUIRED",
          error: "Malformed form data. Expected multipart/form-data with 'image'.",
        },
        {
          status: 400,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }

    const imageFile = formData.get("image");
    if (!imageFile || !(imageFile instanceof Blob)) {
      return NextResponse.json(
        {
          ok: false,
          code: "IMAGE_REQUIRED",
          error: "Image file is required in 'image' field.",
        },
        {
          status: 400,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }

    if (imageFile.size === 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "IMAGE_REQUIRED",
          error: "Image file is empty (0 bytes).",
        },
        {
          status: 400,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }

    // 3. Validate MIME type (Allow only PNG, JPEG, WebP)
    const mimeType = imageFile.type ? imageFile.type.toLowerCase() : "";
    if (!allowedMimes.includes(mimeType)) {
      return NextResponse.json(
        {
          ok: false,
          code: "UNSUPPORTED_MEDIA_TYPE",
          error: `Unsupported media type '${mimeType || "unknown"}'. Only PNG, JPEG, and WebP are allowed.`,
        },
        {
          status: 415,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }

    // 4. Validate file size
    if (imageFile.size > config.maxUploadBytes) {
      return NextResponse.json(
        {
          ok: false,
          code: "IMAGE_TOO_LARGE",
          error: `Image size (${imageFile.size} bytes) exceeds maximum allowed limit (${config.maxUploadBytes} bytes).`,
        },
        {
          status: 413,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }

    // Coordinate validation for optional interactive segmentation parameters in form data
    const rawPos = formData.get("positivePoints");
    if (rawPos) {
      const posVal = validatePoints(rawPos, "positivePoints");
      if (!posVal.valid) {
        return NextResponse.json(
          { ok: false, code: "INVALID_COORDINATES", error: posVal.error },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      positivePoints = posVal.points || [];
    }

    const rawNeg = formData.get("negativePoints");
    if (rawNeg) {
      const negVal = validatePoints(rawNeg, "negativePoints");
      if (!negVal.valid) {
        return NextResponse.json(
          { ok: false, code: "INVALID_COORDINATES", error: negVal.error },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      negativePoints = negVal.points || [];
    }

    const rawBoxes = formData.get("boxes");
    if (rawBoxes) {
      const boxVal = validateBoxes(rawBoxes, "boxes");
      if (!boxVal.valid) {
        return NextResponse.json(
          { ok: false, code: "INVALID_COORDINATES", error: boxVal.error },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      boxes = boxVal.boxes || [];
    }

    const rawKeepBoxes = formData.get("keepBoxes");
    if (rawKeepBoxes) {
      const kbVal = validateBoxes(rawKeepBoxes, "keepBoxes");
      if (!kbVal.valid) {
        return NextResponse.json(
          { ok: false, code: "INVALID_COORDINATES", error: kbVal.error },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      keepBoxes = kbVal.boxes || [];
    }

    const rawEraseBoxes = formData.get("eraseBoxes");
    if (rawEraseBoxes) {
      const ebVal = validateBoxes(rawEraseBoxes, "eraseBoxes");
      if (!ebVal.valid) {
        return NextResponse.json(
          { ok: false, code: "INVALID_COORDINATES", error: ebVal.error },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      eraseBoxes = ebVal.boxes || [];
    }

    const rawPoly = formData.get("polygon");
    if (rawPoly) {
      const polyVal = validatePoints(rawPoly, "polygon");
      if (!polyVal.valid) {
        return NextResponse.json(
          { ok: false, code: "INVALID_COORDINATES", error: polyVal.error },
          { status: 400, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      polygon = polyVal.points || [];
    }

    const rawMode = formData.get("mode");
    if (typeof rawMode === "string" && rawMode.trim()) {
      selectionMode = rawMode.trim();
    }

    const rawQuality = formData.get("quality");
    if (typeof rawQuality === "string" && rawQuality.trim()) {
      quality = rawQuality.trim();
    }

    const rawBg = formData.get("background");
    if (typeof rawBg === "string" && rawBg.trim()) {
      background = rawBg.trim();
    }

    imageMime = mimeType;
    imageBuffer = await imageFile.arrayBuffer();
    fileName = sanitizeFilename((imageFile as File).name || "image.png");

    inputDims = getImageDimensions(new Uint8Array(imageBuffer));
    if (inputDims && (inputDims.width > 4096 || inputDims.height > 4096 || inputDims.width * inputDims.height > 16777216)) {
      return NextResponse.json(
        {
          ok: false,
          code: "DECOMPRESSION_BOMB",
          error: "Image dimensions exceed maximum safe limit of 16MP or 4096x4096.",
        },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }
  }

  // 5. Build worker target URL including refinement parameters
  let targetUrl = config.url;
  if (
    !targetUrl.endsWith("/api/remove") &&
    !targetUrl.endsWith("/api/remove-bg") &&
    !targetUrl.endsWith("/remove") &&
    !targetUrl.endsWith("/matting")
  ) {
    targetUrl = `${config.url}/remove`;
  }
  const search = req.nextUrl.search;
  const targetWithQuery = search ? `${targetUrl}${search}` : targetUrl;

  // 6. Forward image and segmentation parameters to worker with AbortController timeout & server-only token
  const forwardFormData = new FormData();
  const imageBlob = new Blob([imageBuffer], { type: imageMime });
  forwardFormData.append("image", imageBlob, fileName);
  forwardFormData.append("mode", selectionMode);
  forwardFormData.append("quality", quality);
  if (background) {
    forwardFormData.append("background", background);
  }
  if (positivePoints.length > 0) {
    forwardFormData.append("positivePoints", JSON.stringify(positivePoints));
  }
  if (negativePoints.length > 0) {
    forwardFormData.append("negativePoints", JSON.stringify(negativePoints));
  }
  if (boxes.length > 0) {
    forwardFormData.append("boxes", JSON.stringify(boxes));
  }
  if (keepBoxes.length > 0) {
    forwardFormData.append("keepBoxes", JSON.stringify(keepBoxes));
  }
  if (eraseBoxes.length > 0) {
    forwardFormData.append("eraseBoxes", JSON.stringify(eraseBoxes));
  }
  if (polygon.length > 0) {
    forwardFormData.append("polygon", JSON.stringify(polygon));
  }

  const headers: Record<string, string> = {};
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
  const requestId = crypto.randomUUID();

  let workerRes: Response;
  try {
    workerRes = await fetch(targetWithQuery, {
      method: "POST",
      headers,
      body: forwardFormData,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    if (controller.signal.aborted) {
      return NextResponse.json(
        {
          ok: false,
          code: "WORKER_TIMEOUT",
          error: `Remote Worker timed out after ${config.timeoutMs}ms.`,
        },
        {
          status: 504,
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        code: "WORKER_UNREACHABLE",
        error: "Remote Worker is unreachable or offline.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // 7. Verify worker response status
  if (!workerRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "WORKER_FAILED",
        error: `Remote Worker returned error [HTTP ${workerRes.status}].`,
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  // 8. Validate worker Content-Type (Only image/png or image/webp)
  const workerContentType = (
    workerRes.headers.get("content-type") || ""
  ).toLowerCase();
  const isPng = workerContentType.includes("image/png");
  const isWebp = workerContentType.includes("image/webp");

  if (!isPng && !isWebp) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_WORKER_RESPONSE",
        error: `Remote Worker returned invalid content-type: '${workerContentType || "none"}'. Expected image/png or image/webp.`,
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  const upstreamModel =
    workerRes.headers.get("X-Segmentation-Model") ||
    "Remote Worker (rembg)";

  // 9. Validate worker response body
  const outputBuffer = await workerRes.arrayBuffer();
  if (!outputBuffer || outputBuffer.byteLength === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "EMPTY_WORKER_RESPONSE",
        error: "Remote Worker returned empty response (0 bytes).",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  if (outputBuffer.byteLength > config.maxUploadBytes * 2) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_WORKER_RESPONSE",
        error: "Remote Worker returned oversized image output.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store, private" },
      }
    );
  }

  // 10. Deliver transparent cutout image with required headers (JSON or binary)
  if (isJsonResponseExpected) {
    const base64Str = Buffer.from(outputBuffer).toString("base64");
    const mime = isWebp ? "image/webp" : "image/png";
    const dims = getImageDimensions(new Uint8Array(outputBuffer)) || inputDims || { width: 0, height: 0 };
    return NextResponse.json(
      {
        ok: true,
        width: dims.width,
        height: dims.height,
        alphaPngBase64: `data:${mime};base64,${base64Str}`,
        maskPngBase64: `data:${mime};base64,${base64Str}`,
        quality,
        timingsMs: {
          total: Math.round(performance.now() - startTime),
          inference: Math.round(performance.now() - startTime),
        },
        warnings: [],
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, private",
          "X-Processing-Source": "Remote Worker",
          "X-Segmentation-Model": upstreamModel,
          "X-Selection-Mode": selectionMode,
          "X-Request-ID": requestId,
        },
      }
    );
  }

  return new Response(outputBuffer, {
    status: 200,
    headers: {
      "Content-Type": isWebp ? "image/webp" : "image/png",
      "Cache-Control": "no-store, private",
      "X-Processing-Source": "Remote Worker",
      "X-Segmentation-Model": upstreamModel,
      "X-Selection-Mode": selectionMode,
      "X-Refinement-Mode": workerRes.headers.get("X-Refinement-Mode") || "standard",
      "X-Matting-Quality": workerRes.headers.get("X-Matting-Quality") || "",
      "X-Request-ID": requestId,
    },
  });
}
