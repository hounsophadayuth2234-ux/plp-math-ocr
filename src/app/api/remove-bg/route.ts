import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Allow up to 60s for cold-start serverless inference

const PRIMARY_URL = "https://api-inference.huggingface.co/models/briaai/RMBG-1.4";
const FALLBACK_URL = "https://router.huggingface.co/hf-inference/models/briaai/RMBG-1.4";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds wait on 503 cold start

/**
 * Server-Side Background Removal API Route
 * Uses Hugging Face Inference API with model "briaai/RMBG-1.4".
 * 
 * Fixes implemented:
 * 1. Auto-retry on 503 (Model loading) with 5s delay up to 3 times.
 * 2. Proper binary blob response (new Response(blob, { headers: { 'Content-Type': 'image/png' } })).
 * 3. Secure Authorization: Bearer header reading HUGGINGFACE_API_KEY.
 * 4. Detailed console logging with status & statusText for easy debugging.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      console.error("[remove-bg] Error: No image file provided in request FormData.");
      return NextResponse.json(
        { error: "No image file provided in form data." },
        { status: 400 }
      );
    }

    const apiKey = (
      process.env.HUGGINGFACE_API_KEY ||
      process.env.HF_API_TOKEN ||
      ""
    ).trim().replace(/^["']|["']$/g, "");

    if (!apiKey || apiKey.includes("your_")) {
      console.error("[remove-bg] Error: HUGGINGFACE_API_KEY is missing from environment variables.");
      return NextResponse.json(
        {
          error:
            "HUGGINGFACE_API_KEY is not configured in server environment variables. Please add your Hugging Face API key in .env.local or Vercel Environment Variables.",
        },
        { status: 401 }
      );
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const contentType = imageFile.type || "application/octet-stream";

    // Attempt inference with auto-retry on 503 cold-starts
    const targetUrls = [PRIMARY_URL, FALLBACK_URL];
    let finalErrorText = "";
    let finalStatus = 500;
    let finalStatusText = "Internal Server Error";

    for (const url of targetUrls) {
      console.log(`[remove-bg] Connecting to Hugging Face endpoint: ${url}`);

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[remove-bg] [Attempt ${attempt}/${MAX_RETRIES}] Sending ${arrayBuffer.byteLength} bytes to ${url}...`);

          const hfResponse = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": contentType,
              Accept: "image/png",
              "x-wait-for-model": "true",
            },
            body: arrayBuffer,
          });

          // Check if successful
          if (hfResponse.ok) {
            console.log(`[remove-bg] Success! Received 200 OK from Hugging Face (${url}).`);
            
            // Correct Binary Handling: Receive blob directly and return as image/png binary response
            const imageBlob = await hfResponse.blob();
            
            return new Response(imageBlob, {
              status: 200,
              headers: {
                "Content-Type": "image/png",
                "Cache-Control": "no-store",
              },
            });
          }

          // Log exact status and statusText for debugging
          finalStatus = hfResponse.status;
          finalStatusText = hfResponse.statusText;
          console.error(
            `[remove-bg] Hugging Face returned non-200 status: ${finalStatus} ${finalStatusText} (Attempt ${attempt}/${MAX_RETRIES})`
          );

          // Auto-Retry Logic (Cold Start Fix):
          // If 503 Service Unavailable (Model loading), wait 5 seconds and retry
          if (hfResponse.status === 503 && attempt < MAX_RETRIES) {
            const loadingInfo = await hfResponse.text().catch(() => "");
            console.warn(
              `[remove-bg] Model is currently loading/waking up (503). Waiting ${RETRY_DELAY_MS / 1000}s before retry ${attempt + 1}... Details: ${loadingInfo}`
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            continue; // Retry with next attempt
          }

          // If failed with another status code or exhausted retries
          finalErrorText = await hfResponse.text().catch(() => "");
          console.error(`[remove-bg] Hugging Face error body:`, finalErrorText);

          // If not 503, don't keep repeating the same error on this URL
          if (hfResponse.status !== 503) {
            break;
          }
        } catch (fetchErr: unknown) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          console.error(`[remove-bg] Network fetch exception on ${url}:`, msg);
          finalErrorText = msg;
          break; // Try fallback URL if network fetch failed
        }
      }
    }

    // If all attempts failed across endpoints
    return NextResponse.json(
      {
        error: `Failed to remove background via Hugging Face [${finalStatus} ${finalStatusText}]: ${finalErrorText || "Service Unavailable"}`,
        status: finalStatus,
        statusText: finalStatusText,
      },
      { status: finalStatus === 503 ? 503 : 502 }
    );
  } catch (err: unknown) {
    console.error("[remove-bg] Unexpected server error in /api/remove-bg:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected server error occurred during background removal.",
      },
      { status: 500 }
    );
  }
}
