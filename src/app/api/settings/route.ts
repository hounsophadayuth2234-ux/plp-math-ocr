import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ENV_FILE_PATH = path.join(process.cwd(), ".env.local");

// Helper to read and parse .env.local if present on disk
function readEnvFile(): Record<string, string> {
  try {
    if (!fs.existsSync(ENV_FILE_PATH)) return {};
    const content = fs.readFileSync(ENV_FILE_PATH, "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        env[key] = val;
      }
    }
    return env;
  } catch {
    return {};
  }
}

/**
 * Validates a worker URL and prevents SSRF in production.
 */
function validateWorkerHost(
  rawUrl: string,
  isVercelProduction: boolean
): { ok: boolean; error?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Only HTTP and HTTPS URLs are permitted." };
    }

    if (isVercelProduction) {
      const hostname = parsed.hostname.toLowerCase();
      if (parsed.protocol !== "https:") {
        return { ok: false, error: "On production Vercel, worker URL must be HTTPS." };
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
          error: "On production Vercel, private and loopback addresses are not permitted.",
        };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Invalid URL format." };
  }
}

// GET /api/settings - Returns current configuration status
// Reads both process.env (Vercel runtime) and .env.local (local development)
export async function GET() {
  const env = readEnvFile();
  const isProduction =
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.NODE_ENV === "production" ||
    process.env.STRICT_SSRF === "1";

  const mask = (val?: string) => {
    if (!val || val.includes("your_") || val.length < 6) return null;
    return "••••••••";
  };

  const geminiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || "";
  const replicateToken =
    process.env.REPLICATE_API_TOKEN || env.REPLICATE_API_TOKEN || "";
  const removeBgKey =
    process.env.REMOVE_BG_API_KEY || env.REMOVE_BG_API_KEY || "";
  const huggingFaceKey =
    process.env.HUGGINGFACE_API_KEY ||
    process.env.HF_API_TOKEN ||
    env.HUGGINGFACE_API_KEY ||
    env.HF_API_TOKEN ||
    "";

  const bgWorkerUrl = (
    process.env.BACKGROUND_REMOVAL_WORKER_URL ||
    process.env.REMBG_SPACE_URL ||
    process.env.HF_SPACE_URL ||
    env.BACKGROUND_REMOVAL_WORKER_URL ||
    env.REMBG_SPACE_URL ||
    env.HF_SPACE_URL ||
    ""
  ).trim();

  const upscalerWorkerUrl = (
    process.env.UPSCALER_WORKER_URL ||
    env.UPSCALER_WORKER_URL ||
    ""
  ).trim();

  const imageWorkerUrl = (
    process.env.IMAGE_WORKER_URL ||
    env.IMAGE_WORKER_URL ||
    ""
  ).trim();

  const maskUrl = (val?: string) => {
    if (!val || val.includes("your_space_url") || val.includes("your-worker-url")) return null;
    try {
      const u = new URL(val);
      const host = u.hostname;
      if (host.length > 14) {
        return `${u.protocol}//${host.slice(0, 6)}...${host.slice(-6)}`;
      }
      return `${u.protocol}//${host}`;
    } catch {
      return "Configured";
    }
  };

  const bgWorkerConfigured = Boolean(
    bgWorkerUrl &&
      !bgWorkerUrl.includes("your_space_url") &&
      !bgWorkerUrl.includes("your-worker-url")
  );

  return NextResponse.json({
    isProduction,
    geminiKeySet: Boolean(geminiKey && !geminiKey.includes("your_")),
    geminiMasked: mask(geminiKey),
    replicateTokenSet: Boolean(
      replicateToken && !replicateToken.includes("your_")
    ),
    replicateMasked: mask(replicateToken),
    removeBgKeySet: Boolean(removeBgKey && !removeBgKey.includes("your_")),
    removeBgMasked: mask(removeBgKey),
    huggingFaceKeySet: Boolean(
      huggingFaceKey && !huggingFaceKey.includes("your_")
    ),
    huggingFaceMasked: mask(huggingFaceKey),
    rembgSpaceUrlSet: bgWorkerConfigured,
    rembgSpaceUrl: maskUrl(bgWorkerUrl),
    backgroundRemovalWorkerConfigured: bgWorkerConfigured,
    backgroundRemovalWorkerStatus: bgWorkerConfigured ? "configured" : "not_configured",
    upscalerWorkerUrlSet: Boolean(
      upscalerWorkerUrl && !upscalerWorkerUrl.includes("your_worker_url")
    ),
    upscalerWorkerUrl: maskUrl(upscalerWorkerUrl),
    imageWorkerUrlSet: Boolean(
      imageWorkerUrl && !imageWorkerUrl.includes("your_worker_url")
    ),
    imageWorkerUrl: maskUrl(imageWorkerUrl),
  });
}

// POST /api/settings - Updates settings safely
export async function POST(req: NextRequest) {
  try {
    const isProduction =
      process.env.VERCEL === "1" ||
      Boolean(process.env.VERCEL_ENV) ||
      process.env.NODE_ENV === "production" ||
      process.env.STRICT_SSRF === "1";

    const body = await req.json();
    const {
      geminiKey,
      replicateToken,
      removeBgKey,
      huggingFaceKey,
      rembgSpaceUrl,
      upscalerWorkerUrl,
      upscalerWorkerToken,
      imageWorkerUrl,
      imageWorkerToken,
    } = body as {
      geminiKey?: string;
      replicateToken?: string;
      removeBgKey?: string;
      huggingFaceKey?: string;
      rembgSpaceUrl?: string;
      upscalerWorkerUrl?: string;
      upscalerWorkerToken?: string;
      imageWorkerUrl?: string;
      imageWorkerToken?: string;
    };

    // In production (Vercel), filesystem is ephemeral and writing .env.local does not persist across lambda invocations.
    if (isProduction) {
      return NextResponse.json(
        {
          success: false,
          isProduction: true,
          error:
            "On Vercel / Production, runtime modification of settings is disabled. Please configure environment variables in your Vercel Project Settings and trigger a redeployment.",
          message:
            "On Vercel / Production, runtime modification of settings is disabled. Please configure environment variables in your Vercel Project Settings and trigger a redeployment.",
        },
        { status: 403 }
      );
    }

    // Validate worker URLs if supplied
    if (rembgSpaceUrl && rembgSpaceUrl.trim()) {
      const v = validateWorkerHost(rembgSpaceUrl.trim(), isProduction);
      if (!v.ok) {
        return NextResponse.json(
          { error: `Module 02 Worker URL error: ${v.error}` },
          { status: 400 }
        );
      }
    }
    if (upscalerWorkerUrl && upscalerWorkerUrl.trim()) {
      const v = validateWorkerHost(upscalerWorkerUrl.trim(), isProduction);
      if (!v.ok) {
        return NextResponse.json(
          { error: `Upscaler Worker URL error: ${v.error}` },
          { status: 400 }
        );
      }
    }
    if (imageWorkerUrl && imageWorkerUrl.trim()) {
      const v = validateWorkerHost(imageWorkerUrl.trim(), isProduction);
      if (!v.ok) {
        return NextResponse.json(
          { error: `Image Worker URL error: ${v.error}` },
          { status: 400 }
        );
      }
    }

    // Local development persistence to .env.local
    let existingContent = "";
    if (fs.existsSync(ENV_FILE_PATH)) {
      existingContent = fs.readFileSync(ENV_FILE_PATH, "utf-8");
    }

    const updateOrAppend = (
      content: string,
      key: string,
      value: string
    ): string => {
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${value}`);
      } else {
        return `${content.trim()}\n${key}=${value}\n`;
      }
    };

    let updated = existingContent;
    if (geminiKey !== undefined && geminiKey.trim()) {
      updated = updateOrAppend(updated, "GEMINI_API_KEY", geminiKey.trim());
      process.env.GEMINI_API_KEY = geminiKey.trim();
    }
    if (replicateToken !== undefined && replicateToken.trim()) {
      updated = updateOrAppend(
        updated,
        "REPLICATE_API_TOKEN",
        replicateToken.trim()
      );
      process.env.REPLICATE_API_TOKEN = replicateToken.trim();
    }
    if (removeBgKey !== undefined && removeBgKey.trim()) {
      updated = updateOrAppend(
        updated,
        "REMOVE_BG_API_KEY",
        removeBgKey.trim()
      );
      process.env.REMOVE_BG_API_KEY = removeBgKey.trim();
    }
    if (huggingFaceKey !== undefined && huggingFaceKey.trim()) {
      updated = updateOrAppend(
        updated,
        "HUGGINGFACE_API_KEY",
        huggingFaceKey.trim()
      );
      process.env.HUGGINGFACE_API_KEY = huggingFaceKey.trim();
    }
    if (rembgSpaceUrl !== undefined && rembgSpaceUrl.trim()) {
      const cleanedUrl = rembgSpaceUrl.trim().replace(/\/+$/, "");
      updated = updateOrAppend(updated, "REMBG_SPACE_URL", cleanedUrl);
      updated = updateOrAppend(
        updated,
        "BACKGROUND_REMOVAL_WORKER_URL",
        cleanedUrl
      );
      process.env.REMBG_SPACE_URL = cleanedUrl;
      process.env.BACKGROUND_REMOVAL_WORKER_URL = cleanedUrl;
    }
    if (upscalerWorkerUrl !== undefined && upscalerWorkerUrl.trim()) {
      const cleanedUrl = upscalerWorkerUrl.trim().replace(/\/+$/, "");
      updated = updateOrAppend(updated, "UPSCALER_WORKER_URL", cleanedUrl);
      process.env.UPSCALER_WORKER_URL = cleanedUrl;
    }
    if (upscalerWorkerToken !== undefined && upscalerWorkerToken.trim()) {
      updated = updateOrAppend(
        updated,
        "UPSCALER_WORKER_TOKEN",
        upscalerWorkerToken.trim()
      );
      process.env.UPSCALER_WORKER_TOKEN = upscalerWorkerToken.trim();
    }
    if (imageWorkerUrl !== undefined && imageWorkerUrl.trim()) {
      const cleanedUrl = imageWorkerUrl.trim().replace(/\/+$/, "");
      updated = updateOrAppend(updated, "IMAGE_WORKER_URL", cleanedUrl);
      process.env.IMAGE_WORKER_URL = cleanedUrl;
    }
    if (imageWorkerToken !== undefined && imageWorkerToken.trim()) {
      updated = updateOrAppend(
        updated,
        "IMAGE_WORKER_TOKEN",
        imageWorkerToken.trim()
      );
      process.env.IMAGE_WORKER_TOKEN = imageWorkerToken.trim();
    }

    fs.writeFileSync(ENV_FILE_PATH, updated, "utf-8");

    return NextResponse.json({
      success: true,
      isProduction: false,
      message: "Settings updated successfully in .env.local",
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
