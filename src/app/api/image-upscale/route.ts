import { NextRequest, NextResponse } from "next/server";
import {
  calculateImageDiagnostics,
  UpscalePreset,
  UpscaleScale,
  ImageDiagnostics,
} from "@/lib/image-upscale-engine";

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
        const fileBlob = new Blob([bytes], { type: imageFile.type || "image/png" });
        workerFormData.append("image", fileBlob, imageFile.name || "input.png");
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
            resultUrl = `data:${workerBlob.type || "image/png"};base64,${workerBase64}`;
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
    const dataUri = `data:${imageFile.type || "image/png"};base64,${base64}`;

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
