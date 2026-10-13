import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------
export interface GenerateSuccess {
  images: string[];
  prompt: string;
  model: string;
  aspectRatio: string;
  isDemoMode?: boolean;
}

export interface GenerateError {
  error: string;
  details?: string;
}

const FLUX_SCHNELL_MODEL = "black-forest-labs/flux-schnell";

const ASPECT_RATIO_DIMS: Record<string, { width: number; height: number }> = {
  "1:1":  { width: 1024, height: 1024 },
  "16:9": { width: 1360, height: 768  },
  "9:16": { width: 768,  height: 1360 },
  "4:3":  { width: 1024, height: 768  },
  "3:4":  { width: 768,  height: 1024 },
};

// High-quality SVG/curated demo images generated on-the-fly for immediate testing!
function createDemoSvgDataUri(prompt: string, aspectRatio: string, index: number): string {
  const dims = ASPECT_RATIO_DIMS[aspectRatio] || { width: 1024, height: 1024 };
  const colors = [
    { from: "#4f46e5", to: "#7c3aed" },
    { from: "#059669", to: "#0d9488" },
    { from: "#db2777", to: "#e11d48" },
    { from: "#d97706", to: "#ea580c" },
  ];
  const c = colors[index % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.width}" height="${dims.height}" viewBox="0 0 ${dims.width} ${dims.height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c.from}" />
      <stop offset="100%" stop-color="${c.to}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <circle cx="${dims.width / 2}" cy="${dims.height / 2}" r="${Math.min(dims.width, dims.height) * 0.35}" fill="rgba(255,255,255,0.08)" />
  <text x="${dims.width / 2}" y="${dims.height / 2 - 20}" font-family="system-ui, sans-serif" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle">NexusAI Demo Generation #${index + 1}</text>
  <text x="${dims.width / 2}" y="${dims.height / 2 + 25}" font-family="system-ui, sans-serif" font-size="18" fill="rgba(255,255,255,0.85)" text-anchor="middle">${prompt.slice(0, 50)}</text>
  <text x="${dims.width / 2}" y="${dims.height / 2 + 65}" font-family="monospace" font-size="14" fill="rgba(255,255,255,0.6)" text-anchor="middle">Aspect: ${aspectRatio} · Add REPLICATE_API_TOKEN for live Flux</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, negativePrompt, aspectRatio = "1:1", numOutputs = 1 } = body as {
      prompt: string;
      negativePrompt?: string;
      aspectRatio: string;
      numOutputs?: number;
    };

    if (!prompt || prompt.trim().length < 3) {
      return NextResponse.json<GenerateError>(
        { error: "Please provide a prompt (minimum 3 characters)." },
        { status: 400 }
      );
    }

    const apiToken = process.env.REPLICATE_API_TOKEN;
    const clampedOutputs = Math.min(4, Math.max(1, numOutputs));

    // If Replicate token not configured, return instant demo gallery images!
    if (!apiToken || apiToken.includes("your_replicate_token_here")) {
      const demoImages = Array.from({ length: clampedOutputs }).map((_, i) =>
        createDemoSvgDataUri(prompt, aspectRatio, i)
      );
      return NextResponse.json<GenerateSuccess>(
        {
          images: demoImages,
          prompt: prompt.trim(),
          model: "Flux Schnell (Demo Mode — Enter REPLICATE_API_TOKEN in Settings)",
          aspectRatio,
          isDemoMode: true,
        },
        { status: 200 }
      );
    }

    try {
      const dims = ASPECT_RATIO_DIMS[aspectRatio] ?? ASPECT_RATIO_DIMS["1:1"];
      const replicate = new Replicate({ auth: apiToken });

      const output = await replicate.run(FLUX_SCHNELL_MODEL, {
        input: {
          prompt: prompt.trim(),
          negative_prompt: negativePrompt?.trim() || undefined,
          width: dims.width,
          height: dims.height,
          num_outputs: clampedOutputs,
          num_inference_steps: 4,
          guidance_scale: 0,
          output_format: "png",
          output_quality: 95,
        },
      });

      const rawOutputs = Array.isArray(output) ? output : [output];
      const images: string[] = rawOutputs
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof (item as { url?: () => string }).url === "function") {
            return (item as { url: () => string }).url();
          }
          return String(item);
        })
        .filter(Boolean);

      return NextResponse.json<GenerateSuccess>(
        {
          images,
          prompt: prompt.trim(),
          model: "Flux Schnell (black-forest-labs)",
          aspectRatio,
        },
        { status: 200 }
      );
    } catch (genErr) {
      console.warn("[/api/generate-image] Replicate failed, returning demo images:", genErr);
      const demoImages = Array.from({ length: clampedOutputs }).map((_, i) =>
        createDemoSvgDataUri(prompt, aspectRatio, i)
      );
      return NextResponse.json<GenerateSuccess>(
        {
          images: demoImages,
          prompt: prompt.trim(),
          model: "Flux Schnell (Demo Fallback)",
          aspectRatio,
          isDemoMode: true,
        },
        { status: 200 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[/api/generate-image]", err);
    return NextResponse.json<GenerateError>(
      { error: "Image generation failed.", details: message },
      { status: 500 }
    );
  }
}
