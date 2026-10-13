import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ENV_FILE_PATH = path.join(process.cwd(), ".env.local");

// Helper to read and parse .env.local
function readEnvFile(): Record<string, string> {
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
}

// GET /api/settings - Returns current configuration status (masked for security)
export async function GET() {
  const env = readEnvFile();
  const mask = (val?: string) => {
    if (!val || val.includes("your_") || val.length < 6) return null;
    return `${val.slice(0, 4)}...${val.slice(-4)}`;
  };

  const spaceUrl = env.REMBG_SPACE_URL || env.HF_SPACE_URL || "";

  return NextResponse.json({
    geminiKeySet: Boolean(env.GEMINI_API_KEY && !env.GEMINI_API_KEY.includes("your_")),
    geminiMasked: mask(env.GEMINI_API_KEY),
    replicateTokenSet: Boolean(env.REPLICATE_API_TOKEN && !env.REPLICATE_API_TOKEN.includes("your_")),
    replicateMasked: mask(env.REPLICATE_API_TOKEN),
    removeBgKeySet: Boolean(env.REMOVE_BG_API_KEY && !env.REMOVE_BG_API_KEY.includes("your_")),
    removeBgMasked: mask(env.REMOVE_BG_API_KEY),
    huggingFaceKeySet: Boolean((env.HUGGINGFACE_API_KEY || env.HF_API_TOKEN) && !(env.HUGGINGFACE_API_KEY || env.HF_API_TOKEN).includes("your_")),
    huggingFaceMasked: mask(env.HUGGINGFACE_API_KEY || env.HF_API_TOKEN),
    rembgSpaceUrlSet: Boolean(spaceUrl && !spaceUrl.includes("your_space_url")),
    rembgSpaceUrl: spaceUrl || null,
  });
}

// POST /api/settings - Updates .env.local with new keys
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { geminiKey, replicateToken, removeBgKey, huggingFaceKey, rembgSpaceUrl } = body as {
      geminiKey?: string;
      replicateToken?: string;
      removeBgKey?: string;
      huggingFaceKey?: string;
      rembgSpaceUrl?: string;
    };

    let existingContent = "";
    if (fs.existsSync(ENV_FILE_PATH)) {
      existingContent = fs.readFileSync(ENV_FILE_PATH, "utf-8");
    }

    const updateOrAppend = (content: string, key: string, value: string): string => {
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
      updated = updateOrAppend(updated, "REPLICATE_API_TOKEN", replicateToken.trim());
      process.env.REPLICATE_API_TOKEN = replicateToken.trim();
    }
    if (removeBgKey !== undefined && removeBgKey.trim()) {
      updated = updateOrAppend(updated, "REMOVE_BG_API_KEY", removeBgKey.trim());
      process.env.REMOVE_BG_API_KEY = removeBgKey.trim();
    }
    if (huggingFaceKey !== undefined && huggingFaceKey.trim()) {
      updated = updateOrAppend(updated, "HUGGINGFACE_API_KEY", huggingFaceKey.trim());
      process.env.HUGGINGFACE_API_KEY = huggingFaceKey.trim();
    }
    if (rembgSpaceUrl !== undefined && rembgSpaceUrl.trim()) {
      const cleanedUrl = rembgSpaceUrl.trim().replace(/\/+$/, "");
      updated = updateOrAppend(updated, "REMBG_SPACE_URL", cleanedUrl);
      process.env.REMBG_SPACE_URL = cleanedUrl;
    }

    fs.writeFileSync(ENV_FILE_PATH, updated, "utf-8");

    return NextResponse.json({ success: true, message: "Settings updated successfully in .env.local" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
