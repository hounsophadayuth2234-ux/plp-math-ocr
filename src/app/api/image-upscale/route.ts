import { NextRequest, NextResponse } from "next/server";
import {
  calculateImageDiagnostics,
  UpscalePreset,
  UpscaleScale,
  ImageDiagnostics,
} from "@/lib/image-upscale-engine";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { getSessionUser } from "@/lib/auth-session";
import { ActivityTracker } from "@/lib/activity-tracker";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { validateImageUpload } from "@/lib/image-upload-validator";

export interface ImageUpscaleApiResponse {
  success: boolean;
  outputUrl?: string;
  model: string;
  scale: UpscaleScale;
  diagnostics?: Partial<ImageDiagnostics>;
  error?: string;
  fallbackToClient?: boolean;
}

export async function POST(req: NextRequest) {
  // 1. Enforce Server-Side Session Auth (defense-in-depth)
  const authBlock = await enforceRouteAuth(req);
  if (authBlock) {
    return authBlock;
  }

  // 2. Enforce Server-Side Rate Limiting (3 req/min/IP) before reading payload
  const rateLimitBlock = await enforceRateLimit(req, "upscale");
  if (rateLimitBlock) {
    return rateLimitBlock;
  }

  const sessionUser = await getSessionUser(req);

  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    const scaleStr = formData.get("scale") as string | null;
    const presetStr = formData.get("preset") as string | null;

    if (!imageFile) {
      return NextResponse.json<ImageUpscaleApiResponse>(
        {
          success: false,
          error: "No image file provided in request.",
          model: "Studio Super-Resolution Serverless Route",
          scale: 2,
        },
        { status: 400 }
      );
    }

    const requestedScale = parseInt(scaleStr || "2", 10);
    const scale: UpscaleScale =
      requestedScale === 8 ? 8 : requestedScale === 4 ? 4 : requestedScale === 1 ? 1 : 2;
    const preset: UpscalePreset =
      (presetStr as UpscalePreset) || "general";

    const bytes = await imageFile.arrayBuffer();

    // 2. Validate image binary magic bytes, dimensions, pixel ceiling, and sanitize filename
    const validation = validateImageUpload(bytes, imageFile.name, {
      maxSizeBytes: 10 * 1024 * 1024,
      maxWidth: 4096,
      maxHeight: 4096,
      maxPixels: 16 * 1024 * 1024,
    });

    if (!validation.valid) {
      return NextResponse.json<ImageUpscaleApiResponse>(
        {
          success: false,
          error: validation.error,
          model: "Studio Super-Resolution Serverless Route",
          scale: 2,
          fallbackToClient: false,
        },
        { status: validation.httpStatus }
      );
    }

    const buffer = Buffer.from(bytes);

    // Check for configured external AI providers (Local GPU Worker or Replicate)
    const workerUrl = (
      process.env.UPSCALER_WORKER_URL ||
      process.env.LOCAL_UPSCALER_URL ||
      ""
    ).trim();

    if (workerUrl && !workerUrl.includes("your_worker_url")) {
      try {
        const workerFormData = new FormData();
        const fileBlob = new Blob([bytes], { type: validation.format });
        workerFormData.append("image", fileBlob, validation.sanitizedFilename);
        workerFormData.append("scale", scale.toString());
        workerFormData.append("preset", preset);

        const workerRes = await fetch(
          workerUrl.endsWith("/api/upscale") ? workerUrl : `${workerUrl}/api/upscale`,
          {
            method: "POST",
            body: workerFormData,
          }
        );

        if (workerRes.ok) {
          const contentType = workerRes.headers.get("content-type") || "";
          let resultUrl = "";

          if (contentType.includes("application/json")) {
            const json = await workerRes.json();
            resultUrl = json.outputUrl || json.url || json.image;
          } else {
            const workerBlob = await workerRes.blob();
            const workerBytes = await workerBlob.arrayBuffer();
            const workerBase64 = Buffer.from(workerBytes).toString("base64");
            resultUrl = `data:${workerBlob.type || validation.format};base64,${workerBase64}`;
          }

          if (sessionUser) {
            ActivityTracker.recordActivity({
              userId: sessionUser.id,
              username: sessionUser.username,
              displayName: sessionUser.displayName,
              role: sessionUser.role,
              module: "03_hd_upscale",
              action: "upscale_image",
              title: imageFile?.name || "Image Upscale",
              details: { scale, engine: "remote_worker" },
            }).catch(() => {});
          }

          return NextResponse.json<ImageUpscaleApiResponse>(
            {
              success: true,
              outputUrl: resultUrl,
              model: `Real-ESRGAN (${scale}x · Remote AI Worker)`,
              scale,
              fallbackToClient: false,
            },
            { status: 200 }
          );
        }
      } catch (workerErr) {
        console.warn("[/api/image-upscale] Remote worker failed, falling back to local engine:", workerErr);
      }
    }

    // Default Hybrid Response: return metadata & instruct client Web Worker engine execution
    const base64 = buffer.toString("base64");
    const dataUri = `data:${validation.format};base64,${base64}`;

    if (sessionUser) {
      ActivityTracker.recordActivity({
        userId: sessionUser.id,
        username: sessionUser.username,
        displayName: sessionUser.displayName,
        role: sessionUser.role,
        module: "03_hd_upscale",
        action: "upscale_image",
        title: imageFile?.name || "Image Upscale",
        details: { scale, engine: "web_worker_hybrid" },
      }).catch(() => {});
    }

    return NextResponse.json<ImageUpscaleApiResponse>(
      {
        success: true,
        outputUrl: dataUri,
        model: `Studio Super-Resolution (${scale}x · Web Worker Hybrid Engine)`,
        scale,
        fallbackToClient: true,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    console.error("[/api/image-upscale] Error:", err);
    return NextResponse.json<ImageUpscaleApiResponse>(
      {
        success: false,
        error: message,
        model: "Studio Super-Resolution Serverless Route",
        scale: 2,
        fallbackToClient: true,
      },
      { status: 500 }
    );
  }
}
