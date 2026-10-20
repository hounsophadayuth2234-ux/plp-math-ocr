import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { ProcessingStatusLabel } from "@/lib/types";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { validateImageUpload } from "@/lib/image-upload-validator";

export interface UpscaleSuccess {
  outputUrl: string;
  model: string;
  scale: number;
  label: ProcessingStatusLabel;
  isDemoMode?: boolean;
}

export interface UpscaleError {
  error: string;
  code?: string;
  details?: string;
  suggestedAction?: string;
}

const REAL_ESRGAN_MODEL =
  "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b";

export async function POST(req: NextRequest) {
  // 1. Enforce Server-Side Session Auth (defense-in-depth)
  const authBlock = await enforceRouteAuth(req);
  if (authBlock) {
    return authBlock;
  }

  // 2. Enforce Server-Side Rate Limiting (3 req/min/IP) before reading payload or calling provider
  const rateLimitBlock = await enforceRateLimit(req, "upscale");
  if (rateLimitBlock) {
    return rateLimitBlock;
  }

  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    const scaleStr = formData.get("scale") as string | null;
    const isDemoRequested = formData.get("isDemo") === "true";

    if (!imageFile) {
      return NextResponse.json<UpscaleError>(
        { error: "No image file provided." },
        { status: 400 }
      );
    }

    const bytes = await imageFile.arrayBuffer();

    // 2. Validate image binary magic bytes, dimensions, pixel ceiling, and sanitize filename
    const validation = validateImageUpload(bytes, imageFile.name, {
      maxSizeBytes: 10 * 1024 * 1024,
      maxWidth: 4096,
      maxHeight: 4096,
      maxPixels: 16 * 1024 * 1024,
    });

    if (!validation.valid) {
      return NextResponse.json<UpscaleError>(
        {
          error: validation.error,
          code: validation.code,
          details: validation.details,
        },
        { status: validation.httpStatus }
      );
    }

    const scale = Math.min(4, Math.max(2, parseInt(scaleStr ?? "4", 10)));
    const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();
    const workerUrl = (
      process.env.UPSCALER_WORKER_URL ||
      process.env.LOCAL_UPSCALER_URL ||
      ""
    )
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\/+$/, "");

    const base64 = Buffer.from(bytes).toString("base64");
    const dataUri = `data:${validation.format};base64,${base64}`;

    // 1. Explicit Demo Preview Mode ONLY when requested by client
    if (isDemoRequested) {
      return NextResponse.json<UpscaleSuccess>(
        {
          outputUrl: dataUri,
          model: "Real-ESRGAN (Demo Simulation)",
          scale,
          label: "Demo preview",
          isDemoMode: true,
        },
        { status: 200 }
      );
    }

    // 2. Check for Local Worker
    if (workerUrl && !workerUrl.includes("your_worker_url")) {
      try {
        const workerFormData = new FormData();
        const fileBlob = new Blob([bytes], { type: validation.format });
        workerFormData.append("image", fileBlob, validation.sanitizedFilename);
        workerFormData.append("scale", scale.toString());

        const workerToken = process.env.UPSCALER_WORKER_TOKEN?.trim();
        const headers: Record<string, string> = {};
        if (workerToken) {
          headers["Authorization"] = `Bearer ${workerToken}`;
        }

        const workerRes = await fetch(
          workerUrl.endsWith("/api/upscale") ? workerUrl : `${workerUrl}/api/upscale`,
          {
            method: "POST",
            headers,
            body: workerFormData,
          }
        );

        if (!workerRes.ok) {
          const errText = await workerRes.text().catch(() => "");
          throw new Error(
            `Local worker returned ${workerRes.status}: ${errText.slice(0, 200)}`
          );
        }

        const contentType = workerRes.headers.get("content-type") || "";
        let resultUrl = "";

        if (contentType.includes("application/json")) {
          const json = await workerRes.json();
          resultUrl = json.outputUrl || json.url || json.image;
        } else {
          const workerBlob = await workerRes.blob();
          const workerBytes = await workerBlob.arrayBuffer();
          const workerBase64 = Buffer.from(workerBytes).toString("base64");
          resultUrl = `data:${workerBlob.type || "image/png"};base64,${workerBase64}`;
        }

        return NextResponse.json<UpscaleSuccess>(
          {
            outputUrl: resultUrl,
            model: "Real-ESRGAN 4x (Local AI Worker)",
            scale,
            label: "Local worker result",
          },
          { status: 200 }
        );
      } catch (workerErr: unknown) {
        const msg = workerErr instanceof Error ? workerErr.message : String(workerErr);
        return NextResponse.json<UpscaleError>(
          {
            error: `Local Upscaler Worker error: ${msg}`,
            code: "WORKER_ERROR",
          },
          { status: 502 }
        );
      }
    }

    // 3. Check for Cloud Replicate
    const hasReplicate =
      replicateToken && !replicateToken.includes("your_replicate_token");

    if (hasReplicate) {
      try {
        const replicate = new Replicate({ auth: replicateToken });

        const output = await replicate.run(REAL_ESRGAN_MODEL, {
          input: {
            image: dataUri,
            scale,
            face_enhance: false,
          },
        });

        const outputUrl = Array.isArray(output)
          ? (output[0] as unknown as string)
          : (output as unknown as string);

        if (!outputUrl || typeof outputUrl !== "string") {
          throw new Error("Invalid output received from Replicate.");
        }

        return NextResponse.json<UpscaleSuccess>(
          {
            outputUrl,
            model: "Real-ESRGAN 4x (nightmareai / Cloud GPU)",
            scale,
            label: "Cloud API result",
          },
          { status: 200 }
        );
      } catch (replicateErr: unknown) {
        const msg =
          replicateErr instanceof Error ? replicateErr.message : String(replicateErr);
        const isQuotaOrCredit =
          msg.includes("402") ||
          msg.toLowerCase().includes("credit") ||
          msg.toLowerCase().includes("billing") ||
          msg.toLowerCase().includes("payment");

        return NextResponse.json<UpscaleError>(
          {
            error: isQuotaOrCredit
              ? "Replicate Super-Resolution unavailable (Insufficient Credit). You can switch to Browser 2× Enhanced Resize for free instant processing."
              : `Replicate Super-Resolution failed: ${msg}`,
            code: isQuotaOrCredit ? "INSUFFICIENT_CREDIT" : "INFERENCE_ERROR",
            suggestedAction: isQuotaOrCredit ? "SWITCH_TO_BROWSER" : "RETRY",
          },
          { status: 502 }
        );
      }
    }

    // 4. Strict Product Rule: Neither worker nor cloud is configured, and demo not requested
    return NextResponse.json<UpscaleError>(
      {
        error:
          "No Real-ESRGAN AI provider is configured. You can use 'Browser 2× Enhanced Resize' for free instant results, configure a Local Worker / Replicate Token in Settings, or enable Demo Preview Mode.",
        code: "NOT_CONFIGURED",
        suggestedAction: "SWITCH_TO_BROWSER",
      },
      { status: 422 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[/api/upscale]", err);
    return NextResponse.json<UpscaleError>(
      { error: "Upscaling failed.", details: message },
      { status: 500 }
    );
  }
}
