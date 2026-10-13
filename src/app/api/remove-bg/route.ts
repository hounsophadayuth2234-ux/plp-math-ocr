import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Allow up to 60s for serverless inference / HF Space wake-up

const MAX_COLD_START_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5s wait on 503 cold starts

/**
 * Custom Hugging Face Space Python Rembg API Gateway
 * Forwards user images to the self-hosted free Hugging Face Space microservice running open-source rembg.
 * Features:
 * 1. 100% Free, zero third-party subscription or burst limits.
 * 2. Auto-retry on HF Space cold starts (503 Service Unavailable).
 * 3. Pure binary streaming response with no JSON or Base64 corruption.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      console.error("[/api/remove-bg] Error: No image file provided in request FormData.");
      return NextResponse.json(
        { error: "No image file provided in form data." },
        { status: 400 }
      );
    }

    const rawSpaceUrl = (
      process.env.REMBG_SPACE_URL ||
      process.env.HF_SPACE_URL ||
      ""
    ).trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");

    if (!rawSpaceUrl || rawSpaceUrl.includes("your_space_url_here")) {
      console.error("[/api/remove-bg] Error: REMBG_SPACE_URL is not configured.");
      return NextResponse.json(
        {
          error:
            "REMBG_SPACE_URL is not configured. Please set your free Hugging Face Space URL in Settings (top-right cog) or in .env.local (e.g. https://your-username-plp-rembg.hf.space). Check the hf-space-rembg/ directory for the 1-click Python code files.",
        },
        { status: 401 }
      );
    }

    // Construct target URL for the pure FastAPI microservice
    let targetUrl = rawSpaceUrl;
    if (!targetUrl.endsWith("/api/remove") && !targetUrl.endsWith("/api/remove-bg")) {
      targetUrl = `${rawSpaceUrl}/api/remove`;
    }

    const spaceToken = (
      process.env.HF_SPACE_TOKEN ||
      process.env.HUGGINGFACE_API_KEY ||
      ""
    ).trim().replace(/^["']|["']$/g, "");

    const headers: Record<string, string> = {};
    if (spaceToken && !spaceToken.includes("your_")) {
      headers["Authorization"] = `Bearer ${spaceToken}`;
    }

    // Convert file to buffer for forwarding
    const arrayBuffer = await imageFile.arrayBuffer();
    const contentType = imageFile.type || "application/octet-stream";

    console.log(
      `[/api/remove-bg] Forwarding ${(arrayBuffer.byteLength / 1024).toFixed(1)} KB to Python Space: ${targetUrl}`
    );

    let lastStatus = 500;
    let lastStatusText = "Unknown Error";
    let lastErrorBody = "";

    // Retry loop to handle Hugging Face Space cold starts (503 / 504)
    for (let attempt = 1; attempt <= MAX_COLD_START_RETRIES; attempt++) {
      try {
        const forwardFormData = new FormData();
        const fileBlob = new Blob([arrayBuffer], { type: contentType });
        forwardFormData.append("image", fileBlob, imageFile.name || "image.png");

        const hfRes = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: forwardFormData,
        });

        if (hfRes.ok) {
          console.log(`[/api/remove-bg] Success from Python Rembg Space! Streaming binary PNG back.`);
          const outputBlob = await hfRes.blob();

          return new Response(outputBlob, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "no-store",
              "X-Segmentation-Model": "Python Rembg (U2Net / Free Space)",
            },
          });
        }

        lastStatus = hfRes.status;
        lastStatusText = hfRes.statusText;
        lastErrorBody = await hfRes.text().catch(() => "");

        console.warn(
          `[/api/remove-bg] Python Space returned status ${lastStatus} ${lastStatusText} (Attempt ${attempt}/${MAX_COLD_START_RETRIES}). Body:`,
          lastErrorBody
        );

        // If Space is waking up (503 Service Unavailable / 504 Gateway Timeout), wait and retry
        if ((lastStatus === 503 || lastStatus === 504) && attempt < MAX_COLD_START_RETRIES) {
          console.log(
            `[/api/remove-bg] Hugging Face Space is warming up. Pausing ${RETRY_DELAY_MS / 1000}s before retry...`
          );
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }

        // For other status codes (e.g. 404, 401), stop immediately
        break;
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.error(`[/api/remove-bg] Network connection error to ${targetUrl}:`, msg);
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
        error: `Python Rembg Space returned [${lastStatus} ${lastStatusText}]: ${lastErrorBody || "Space unreachable or warming up. Please verify your Space is Running in Hugging Face."}`,
        status: lastStatus,
      },
      { status: lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[/api/remove-bg] Unexpected gateway error:", err);
    return NextResponse.json(
      {
        error: `Gateway Error: ${errorMsg}`,
      },
      { status: 500 }
    );
  }
}
