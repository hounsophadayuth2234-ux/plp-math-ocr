import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Allow up to 60s for inference / Space wake-up

const MAX_COLD_START_RETRIES = 3;
const RETRY_DELAY_MS = 4000;

/**
 * Universal Background Removal Gateway
 * Forwards requests to either a local worker (e.g. ComfyUI / local rembg service)
 * or a cloud service (e.g. Hugging Face Space Rembg).
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return NextResponse.json(
        { error: "No image file provided in form data." },
        { status: 400 }
      );
    }

    const rawWorkerUrl = (
      process.env.BACKGROUND_REMOVAL_WORKER_URL ||
      process.env.REMBG_SPACE_URL ||
      process.env.HF_SPACE_URL ||
      ""
    )
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\/+$/, "");

    if (!rawWorkerUrl || rawWorkerUrl.includes("your_space_url")) {
      return NextResponse.json(
        {
          error:
            "No Background Removal worker configured. Please use Browser AI mode (zero cost, client-side), or set your Worker URL in Settings.",
          code: "NOT_CONFIGURED",
          suggestedAction: "SWITCH_TO_BROWSER",
        },
        { status: 422 }
      );
    }

    const isLocalWorker =
      rawWorkerUrl.includes("localhost") ||
      rawWorkerUrl.includes("127.0.0.1") ||
      rawWorkerUrl.includes("192.168.") ||
      rawWorkerUrl.includes("10.0.");

    const sourceLabel = isLocalWorker
      ? "Local worker result"
      : "Cloud API result";

    let targetUrl = rawWorkerUrl;
    if (
      !targetUrl.endsWith("/api/remove") &&
      !targetUrl.endsWith("/api/remove-bg") &&
      !targetUrl.endsWith("/remove")
    ) {
      targetUrl = `${rawWorkerUrl}/api/remove`;
    }

    const spaceToken = (
      process.env.BACKGROUND_REMOVAL_WORKER_TOKEN ||
      process.env.HF_SPACE_TOKEN ||
      process.env.HUGGINGFACE_API_KEY ||
      ""
    )
      .trim()
      .replace(/^["']|["']$/g, "");

    const headers: Record<string, string> = {};
    if (spaceToken && !spaceToken.includes("your_")) {
      headers["Authorization"] = `Bearer ${spaceToken}`;
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const contentType = imageFile.type || "application/octet-stream";

    let lastStatus = 500;
    let lastStatusText = "Worker Error";
    let lastErrorBody = "";

    // Retry loop for cold starts (503 / 504)
    for (let attempt = 1; attempt <= MAX_COLD_START_RETRIES; attempt++) {
      try {
        const forwardFormData = new FormData();
        const fileBlob = new Blob([arrayBuffer], { type: contentType });
        forwardFormData.append("image", fileBlob, imageFile.name || "image.png");

        const workerRes = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: forwardFormData,
        });

        if (workerRes.ok) {
          const outputBlob = await workerRes.blob();
          return new Response(outputBlob, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "no-store",
              "X-Processing-Source": sourceLabel,
              "X-Segmentation-Model": isLocalWorker
                ? "Rembg (Local AI Worker)"
                : "Python Rembg (Hugging Face Space)",
            },
          });
        }

        lastStatus = workerRes.status;
        lastStatusText = workerRes.statusText;
        lastErrorBody = await workerRes.text().catch(() => "");

        if (
          (lastStatus === 503 || lastStatus === 504) &&
          attempt < MAX_COLD_START_RETRIES
        ) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }

        break;
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        lastErrorBody = msg;
        if (attempt < MAX_COLD_START_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        break;
      }
    }

    return NextResponse.json(
      {
        error: `Worker returned [${lastStatus} ${lastStatusText}]: ${
          lastErrorBody || "Worker offline or warming up."
        }`,
        status: lastStatus,
      },
      { status: lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Gateway Error: ${errorMsg}` },
      { status: 500 }
    );
  }
}
