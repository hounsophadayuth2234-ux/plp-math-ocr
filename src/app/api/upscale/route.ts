import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { ProcessingStatusLabel } from "@/lib/types";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { getSessionUser } from "@/lib/auth-session";
import { ActivityTracker } from "@/lib/activity-tracker";
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

export async function GET() {
  const runpodKey = (process.env.RUNPOD_API_KEY || "").trim();
  const runpodEndpoint = (process.env.RUNPOD_UPSCALE_ENDPOINT || "").trim();
  const hasRunPod = Boolean(runpodKey && runpodEndpoint && !runpodEndpoint.includes("your_"));
  const hasWorker = Boolean(
    (process.env.UPSCALER_WORKER_URL || process.env.LOCAL_UPSCALER_URL || process.env.HF_UPSCALE_URL || process.env.HF_UPSCALE_SPACE_URL) &&
    !process.env.UPSCALER_WORKER_URL?.includes("your_worker_url")
  );
  const hasReplicate = Boolean(
    process.env.REPLICATE_API_TOKEN?.trim() && !process.env.REPLICATE_API_TOKEN.includes("your_")
  );

  const engine = hasRunPod ? "runpod" : "local";
  const badgeLabel = hasRunPod
    ? "☁️ RunPod Cloud GPU"
    : "⚡ Local Engine (ដំណើរការលើម៉ាស៊ីនផ្ទាល់ - ឥតគិតថ្លៃ)";

  return NextResponse.json({
    configured: true,
    engine,
    badgeLabel,
    hasRunPod,
    isLocal: !hasRunPod,
    supportedScales: [1, 2, 4],
  }, {
    status: 200,
    headers: { "Cache-Control": "no-store, private" },
  });
}

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

  const sessionUser = await getSessionUser(req);

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

    const scale = Math.min(4, Math.max(1, parseInt(scaleStr ?? "2", 10)));
    const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();
    const explicitWorkerUrl = (
      process.env.UPSCALER_WORKER_URL ||
      process.env.LOCAL_UPSCALER_URL ||
      process.env.HF_UPSCALE_URL ||
      process.env.HF_UPSCALE_SPACE_URL ||
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

    const requestedEngine = (
      req.headers.get("x-engine") ||
      (formData.get("engine") as string) ||
      ""
    ).toLowerCase();
    const runpodKey = (process.env.RUNPOD_API_KEY || "").trim();
    const runpodUpscaleUrl = (process.env.RUNPOD_UPSCALE_ENDPOINT || "").trim().replace(/\/+$/, "");
    const hasRunPod = Boolean(runpodKey && runpodUpscaleUrl && !runpodUpscaleUrl.includes("your_"));
    const preferLocal =
      req.headers.get("x-prefer-local") === "true" ||
      requestedEngine === "local";

    const shouldUseRunpod = hasRunPod && !preferLocal;

    // 2. Check for RunPod Cloud GPU (Tier 1 Cloud Mode when configured)
    if (shouldUseRunpod) {
      try {
        const targetUrl = runpodUpscaleUrl.includes("/run")
          ? runpodUpscaleUrl
          : `${runpodUpscaleUrl}/runsync`;

        const runpodRes = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${runpodKey}`,
          },
          body: JSON.stringify({
            input: {
              image: dataUri,
              scale,
            },
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (runpodRes.ok) {
          const runpodData = await runpodRes.json();
          const outImg =
            runpodData.output?.image ||
            runpodData.output?.output_image_base64 ||
            runpodData.output?.outputUrl ||
            runpodData.image ||
            runpodData.outputUrl;

          if (outImg) {
            let outBuf: Buffer;
            if (typeof outImg === "string" && (outImg.startsWith("data:") || outImg.startsWith("http"))) {
              if (outImg.startsWith("data:")) {
                const b64Data = outImg.split(",")[1];
                outBuf = Buffer.from(b64Data, "base64");
              } else {
                const fetched = await fetch(outImg);
                outBuf = Buffer.from(await fetched.arrayBuffer());
              }
            } else {
              outBuf = Buffer.from(String(outImg), "base64");
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
                details: { scale, provider: "runpod_cloud" },
              }).catch(() => {});
            }

            const wantsRawImage =
              req.headers.get("accept")?.includes("image/") ||
              req.headers.get("x-raw-response") === "true";

            if (wantsRawImage) {
              return new NextResponse(new Uint8Array(outBuf), {
                status: 200,
                headers: {
                  "Content-Type": "image/png",
                  "Cache-Control": "no-store",
                  "X-Model-Used": "Real-ESRGAN (4x · Compact SRVGGNet)",
                  "X-Upscale-Factor": String(scale),
                  "X-Processing-Source": "RunPod Cloud GPU",
                },
              });
            }

            return NextResponse.json<UpscaleSuccess>(
              {
                outputUrl: `data:image/png;base64,${outBuf.toString("base64")}`,
                model: "Real-ESRGAN (4x · Compact SRVGGNet)",
                scale,
                label: "Cloud API result",
              },
              { status: 200 }
            );
          }
        }
      } catch (runpodErr) {
        console.warn("[/api/upscale] RunPod Cloud GPU failed, falling back to Local High-Precision Engine:", runpodErr);
      }
    }

    // 3. Primary Default Engine: Local Neural AI Super-Resolution (Real-ESRGAN Compact ONNX with Tiled Inference)
    // Sharp is removed from the default Module 03 AI inference path.
    try {
      const { runServerOnnxSuperResolution } = await import("@/lib/server-onnx-upscaler");
      const onnxResult = await runServerOnnxSuperResolution(Buffer.from(bytes), scale as 2 | 4);

      if (sessionUser) {
        ActivityTracker.recordActivity({
          userId: sessionUser.id,
          username: sessionUser.username,
          displayName: sessionUser.displayName,
          role: sessionUser.role,
          module: "03_hd_upscale",
          action: "upscale_image",
          title: imageFile?.name || "Image Upscale",
          details: { scale, provider: "local_onnx_realesrgan", backend: onnxResult.backend },
        }).catch(() => {});
      }

      const wantsRawImage =
        req.headers.get("accept")?.includes("image/") ||
        req.headers.get("x-raw-response") === "true";

      if (wantsRawImage) {
        return new NextResponse(new Uint8Array(onnxResult.outputBuffer), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-store",
            "X-Model-Used": onnxResult.model,
            "X-Upscale-Factor": String(scale),
            "X-Processed-Width": String(onnxResult.srcWidth),
            "X-Processed-Height": String(onnxResult.srcHeight),
            "X-Output-Width": String(onnxResult.outputWidth),
            "X-Output-Height": String(onnxResult.outputHeight),
            "X-Was-Downscaled": "false",
            "X-Processing-Source": "Local ONNX Neural Engine",
          },
        });
      }

      const resultDataUri = `data:image/png;base64,${onnxResult.outputBuffer.toString("base64")}`;
      return NextResponse.json<UpscaleSuccess>(
        {
          outputUrl: resultDataUri,
          model: onnxResult.model,
          scale,
          label: "Local worker result",
        },
        { status: 200 }
      );
    } catch (onnxErr) {
      console.warn("[/api/upscale] Local ONNX neural inference failed or unavailable, checking cloud or algorithmic fallback:", onnxErr);
    }

    // 4. Check for External AI Super-Resolution Worker
    if (explicitWorkerUrl && !explicitWorkerUrl.includes("your_worker_url")) {
      try {
        const workerFormData = new FormData();
        const fileBlob = new Blob([bytes], { type: validation.format });
        workerFormData.append("image", fileBlob, validation.sanitizedFilename);
        workerFormData.append("scale", scale.toString());

        const workerToken = process.env.UPSCALER_WORKER_TOKEN?.trim() || process.env.HF_SPACE_TOKEN?.trim();
        const headers: Record<string, string> = {};
        if (workerToken) {
          headers["Authorization"] = `Bearer ${workerToken}`;
        }

        const targetEndpoint = explicitWorkerUrl.endsWith("/api/upscale")
          ? explicitWorkerUrl
          : `${explicitWorkerUrl}/api/upscale`;

        const workerRes = await fetch(targetEndpoint, {
          method: "POST",
          headers,
          body: workerFormData,
        });

        if (workerRes.ok) {
          const contentType = workerRes.headers.get("content-type") || "";
          const acceptHeader = req.headers.get("accept") || "";
          const wantsRawImage =
            acceptHeader.includes("image/") || req.headers.get("x-raw-response") === "true";

          if (wantsRawImage && !contentType.includes("application/json")) {
            const workerBlob = await workerRes.blob();
            const workerBytes = await workerBlob.arrayBuffer();
            return new NextResponse(workerBytes, {
              status: 200,
              headers: {
                "Content-Type": "image/png",
                "Cache-Control": "no-store",
                "X-Model-Used": workerRes.headers.get("x-model-used") || "realesr-general-x4v3",
                "X-Upscale-Factor": workerRes.headers.get("x-upscale-factor") || String(scale),
                "X-Processed-Width": workerRes.headers.get("x-processed-width") || "",
                "X-Processed-Height": workerRes.headers.get("x-processed-height") || "",
                "X-Output-Width": workerRes.headers.get("x-output-width") || "",
                "X-Output-Height": workerRes.headers.get("x-output-height") || "",
                "X-Was-Downscaled": workerRes.headers.get("x-was-downscaled") || "false",
              },
            });
          }

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

          if (sessionUser) {
            ActivityTracker.recordActivity({
              userId: sessionUser.id,
              username: sessionUser.username,
              displayName: sessionUser.displayName,
              role: sessionUser.role,
              module: "03_hd_upscale",
              action: "upscale_image",
              title: imageFile?.name || "Image Upscale",
              details: { scale, provider: "worker" },
            }).catch(() => {});
          }

          return NextResponse.json<UpscaleSuccess>(
            {
              outputUrl: resultUrl,
              model: "Real-ESRGAN 4x (AI Super-Resolution Worker)",
              scale,
              label: "Local worker result",
            },
            { status: 200 }
          );
        }
      } catch (workerErr) {
        console.warn("[/api/upscale] Worker error, falling back to Local High-Precision Engine:", workerErr);
      }
    }

    // 4. Check for Cloud Replicate
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

        if (outputUrl && typeof outputUrl === "string") {
          if (sessionUser) {
            ActivityTracker.recordActivity({
              userId: sessionUser.id,
              username: sessionUser.username,
              displayName: sessionUser.displayName,
              role: sessionUser.role,
              module: "03_hd_upscale",
              action: "upscale_image",
              title: imageFile?.name || "Image Upscale",
              details: { scale, provider: "replicate" },
            }).catch(() => {});
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
        }
      } catch (replicateErr) {
        console.warn("[/api/upscale] Replicate failed, falling back to Local High-Precision Engine:", replicateErr);
      }
    }

    // 5. Emergency Algorithmic Fallback (Sharp Lanczos-3)
    // HONEST LABELING: Only reached if neural inference failed, never labeled as Real-ESRGAN
    console.warn("[/api/upscale] Neural inference unavailable, engaging honest Algorithmic Fallback.");

    const sharp = (await import("sharp")).default;
      const meta = await sharp(Buffer.from(bytes)).metadata();
      const srcW = meta.width || 512;
      const srcH = meta.height || 512;
      const targetW = srcW * scale;
      const targetH = srcH * scale;

      let pipeline = sharp(Buffer.from(bytes)).resize(targetW, targetH, {
        kernel: "lanczos3",
        fit: "fill",
      });

      pipeline = pipeline.sharpen({
        sigma: 1.5,
        m1: 1.2,
        m2: 2.0,
      });

      pipeline = pipeline.modulate({
        brightness: 1.01,
        saturation: 1.02,
      });

      const outputBuffer = await pipeline.png({ quality: 100, compressionLevel: 6 }).toBuffer();

      if (sessionUser) {
        ActivityTracker.recordActivity({
          userId: sessionUser.id,
          username: sessionUser.username,
          displayName: sessionUser.displayName,
          role: sessionUser.role,
          module: "03_hd_upscale",
          action: "upscale_image",
          title: imageFile?.name || "Image Upscale",
          details: { scale, provider: "local_sharp_algorithmic_fallback" },
        }).catch(() => {});
      }

      const wantsRawImage =
        req.headers.get("accept")?.includes("image/") ||
        req.headers.get("x-raw-response") === "true";

      if (wantsRawImage) {
        return new NextResponse(new Uint8Array(outputBuffer), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-store",
            "X-Model-Used": "HD Resize & Sharpen - Algorithmic Fallback",
            "X-Upscale-Factor": String(scale),
            "X-Processed-Width": String(srcW),
            "X-Processed-Height": String(srcH),
            "X-Output-Width": String(targetW),
            "X-Output-Height": String(targetH),
            "X-Was-Downscaled": "false",
            "X-Processing-Source": "Sharp Algorithmic Fallback",
          },
        });
      }

      const resultDataUri = `data:image/png;base64,${outputBuffer.toString("base64")}`;
      return NextResponse.json<UpscaleSuccess>(
        {
          outputUrl: resultDataUri,
          model: "HD Resize & Sharpen — Algorithmic Fallback",
          scale,
          label: "HD Resize & Sharpen",
        },
        { status: 200 }
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
