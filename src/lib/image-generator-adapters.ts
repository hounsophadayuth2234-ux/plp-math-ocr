import { ProcessingStatusLabel } from "./types";
import Replicate from "replicate";

export interface GenerateImageParams {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
  numOutputs: number;
  allowDemo?: boolean;
}

export interface GenerateImageResult {
  images: string[];
  prompt: string;
  model: string;
  aspectRatio: string;
  label: ProcessingStatusLabel;
  isDemoMode?: boolean;
}

export interface ImageProviderCapabilities {
  provider: "local_worker" | "cloud_replicate" | "demo_only" | "none";
  label: string;
  configured: boolean;
}

const ASPECT_RATIO_DIMS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1360, height: 768 },
  "9:16": { width: 768, height: 1360 },
  "4:3": { width: 1024, height: 768 },
  "3:4": { width: 768, height: 1024 },
};

function createDemoSvgDataUri(
  prompt: string,
  aspectRatio: string,
  index: number
): string {
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
  <text x="${dims.width / 2}" y="${dims.height / 2 - 20}" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">[DEMO PREVIEW] #${index + 1}</text>
  <text x="${dims.width / 2}" y="${dims.height / 2 + 25}" font-family="system-ui, sans-serif" font-size="16" fill="rgba(255,255,255,0.85)" text-anchor="middle">${prompt.slice(0, 48)}</text>
  <text x="${dims.width / 2}" y="${dims.height / 2 + 65}" font-family="monospace" font-size="13" fill="rgba(255,255,255,0.6)" text-anchor="middle">Aspect: ${aspectRatio} · Simulated Demo Output</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Dispatches text-to-image generation to Local Worker, Cloud Replicate, or Demo Mode.
 */
export async function executeImageGeneration(
  params: GenerateImageParams
): Promise<GenerateImageResult> {
  const { prompt, negativePrompt, aspectRatio, numOutputs, allowDemo } = params;
  const clampedOutputs = Math.min(4, Math.max(1, numOutputs));

  // 1. Explicit Demo Mode
  if (allowDemo) {
    const demoImages = Array.from({ length: clampedOutputs }).map((_, i) =>
      createDemoSvgDataUri(prompt, aspectRatio, i)
    );
    return {
      images: demoImages,
      prompt: prompt.trim(),
      model: "Demo Simulator (Interactive Preview)",
      aspectRatio,
      label: "Demo preview",
      isDemoMode: true,
    };
  }

  // 2. Check Local Worker (ComfyUI / SD API)
  const workerUrl = (
    process.env.IMAGE_WORKER_URL ||
    process.env.LOCAL_IMAGE_WORKER_URL ||
    ""
  )
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/+$/, "");

  if (workerUrl && !workerUrl.includes("your_worker_url")) {
    const workerToken = process.env.IMAGE_WORKER_TOKEN?.trim();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (workerToken) {
      headers["Authorization"] = `Bearer ${workerToken}`;
    }

    const workerRes = await fetch(
      workerUrl.endsWith("/api/generate") ? workerUrl : `${workerUrl}/api/generate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: prompt.trim(),
          negativePrompt: negativePrompt?.trim() || undefined,
          aspectRatio,
          numOutputs: clampedOutputs,
        }),
      }
    );

    if (!workerRes.ok) {
      const err = await workerRes.text().catch(() => "");
      throw new Error(`Local Worker returned ${workerRes.status}: ${err.slice(0, 200)}`);
    }

    const data = await workerRes.json();
    const rawImages = Array.isArray(data.images) ? data.images : [data.image || data.url];
    return {
      images: rawImages.filter(Boolean),
      prompt: prompt.trim(),
      model: data.model || "Local Diffusion Worker (ComfyUI / SD)",
      aspectRatio,
      label: "Local worker result",
    };
  }

  // 3. Check Cloud Replicate (Flux Schnell)
  const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();
  const hasReplicate =
    replicateToken && !replicateToken.includes("your_replicate_token");

  if (hasReplicate) {
    const dims = ASPECT_RATIO_DIMS[aspectRatio] ?? ASPECT_RATIO_DIMS["1:1"];
    const replicate = new Replicate({ auth: replicateToken });

    const output = await replicate.run("black-forest-labs/flux-schnell", {
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

    return {
      images,
      prompt: prompt.trim(),
      model: "Flux Schnell (black-forest-labs / Cloud GPU)",
      aspectRatio,
      label: "Cloud API result",
    };
  }

  // 4. Strict Product Rule: No silent fake fallbacks
  throw new Error(
    "NO_PROVIDER_CONFIGURED: No image generation provider is configured. Connect a local worker (IMAGE_WORKER_URL) or set REPLICATE_API_TOKEN in Settings, or enable Demo Preview Mode."
  );
}
