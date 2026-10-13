import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Allow up to 60s for serverless inference

/**
 * Server-Side Background Removal API Route
 * Uses Hugging Face Inference API with model "briaai/RMBG-1.4".
 * Securely reads HUGGINGFACE_API_KEY from server environment variables.
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

    const apiKey =
      process.env.HUGGINGFACE_API_KEY ||
      process.env.HF_API_TOKEN ||
      "";

    if (!apiKey || apiKey.includes("your_")) {
      return NextResponse.json(
        {
          error:
            "HUGGINGFACE_API_KEY is not configured in server environment variables. Please add your token in .env.local or Vercel Environment Variables.",
        },
        { status: 401 }
      );
    }

    const arrayBuffer = await imageFile.arrayBuffer();

    // Primary and fallback Hugging Face inference gateways
    const endpoints = [
      "https://router.huggingface.co/hf-inference/models/briaai/RMBG-1.4",
      "https://api-inference.huggingface.co/models/briaai/RMBG-1.4",
    ];

    let lastError = "";
    let responseBuffer: ArrayBuffer | null = null;

    for (const endpoint of endpoints) {
      try {
        const hfRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": imageFile.type || "application/octet-stream",
            Accept: "image/png",
            "x-wait-for-model": "true",
          },
          body: arrayBuffer,
        });

        if (hfRes.ok) {
          responseBuffer = await hfRes.arrayBuffer();
          break;
        } else {
          const errText = await hfRes.text();
          lastError = `Hugging Face (${hfRes.status}): ${errText}`;
          console.warn(`[remove-bg] ${endpoint} returned ${hfRes.status}:`, errText);
        }
      } catch (netErr: unknown) {
        lastError = netErr instanceof Error ? netErr.message : String(netErr);
        console.warn(`[remove-bg] Network error calling ${endpoint}:`, lastError);
      }
    }

    if (!responseBuffer) {
      return NextResponse.json(
        {
          error: `Failed to remove background via Hugging Face RMBG-1.4: ${lastError}`,
        },
        { status: 502 }
      );
    }

    // Return the transparent PNG cutout blob
    return new NextResponse(responseBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    console.error("[remove-bg] Server exception:", err);
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
