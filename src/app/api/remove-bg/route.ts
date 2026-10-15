import { NextRequest, NextResponse } from "next/server";

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
  const allowedMimes = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
  ];
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

  // 5. Build worker target URL
  let targetUrl = config.url;
  if (
    !targetUrl.endsWith("/api/remove") &&
    !targetUrl.endsWith("/api/remove-bg") &&
    !targetUrl.endsWith("/remove")
  ) {
    targetUrl = `${config.url}/remove`;
  }

  // 6. Forward image to worker with AbortController timeout & server-only token
  const forwardFormData = new FormData();
  const arrayBuffer = await imageFile.arrayBuffer();
  const imageBlob = new Blob([arrayBuffer], { type: imageFile.type });
  const fileName = (imageFile as File).name || "image.png";
  forwardFormData.append("image", imageBlob, fileName);

  const headers: Record<string, string> = {};
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
  const requestId = crypto.randomUUID();

  let workerRes: Response;
  try {
    workerRes = await fetch(targetUrl, {
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

  // 10. Deliver transparent cutout image with required headers
  // Forward X-Segmentation-Model from the actual upstream worker response
  const upstreamModel =
    workerRes.headers.get("X-Segmentation-Model") ||
    "Remote Worker (rembg)";

  return new Response(outputBuffer, {
    status: 200,
    headers: {
      "Content-Type": isWebp ? "image/webp" : "image/png",
      "Cache-Control": "no-store, private",
      "X-Processing-Source": "Remote Worker",
      "X-Segmentation-Model": upstreamModel,
      "X-Request-ID": requestId,
    },
  });
}
