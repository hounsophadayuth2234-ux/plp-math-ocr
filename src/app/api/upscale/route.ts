import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { ProcessingStatusLabel } from "@/lib/types";

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

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUri = `data:${imageFile.type || "image/png"};base64,${base64}`;

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
        const fileBlob = new Blob([bytes], { type: imageFile.type || "image/png" });
        workerFormData.append("image", fileBlob, imageFile.name || "input.png");
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
        return NextResponse.json<UpscaleError>(
          {
            error: `Replicate Super-Resolution failed: ${msg}`,
            code: "INFERENCE_ERROR",
            suggestedAction: "RETRY",
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
