import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

export const maxDuration = 60; // Allow up to 60s for serverless GPU inference on Replicate

// Primary: BiRefNet (High-Resolution Dichotomous Image Segmentation - SOTA hair/edge accuracy)
const BIREFNET_MODEL =
  "men1scus/birefnet:f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7";

// Fallback: Tracer B7 Remove-BG (High-speed robust fallback)
const FALLBACK_MODEL =
  "lucataco/remove-bg:95fcc2a26d3899cd6c2691c9004657fe41447a34d6284777d7f7f9353fa7f99b";

/**
 * Replicate Background Removal API Route
 * Integrates high-accuracy BiRefNet segmentation model via Replicate API.
 * Converts uploaded image to data URI, calls Replicate, fetches the resulting transparent
 * PNG asset, and streams back binary PNG bytes to the client.
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

    const apiToken = (
      process.env.REPLICATE_API_TOKEN ||
      process.env.REPLICATE_API_KEY ||
      ""
    ).trim().replace(/^["']|["']$/g, "");

    if (!apiToken || apiToken.includes("your_replicate_token_here")) {
      console.error("[/api/remove-bg] Error: REPLICATE_API_TOKEN is missing or placeholder.");
      return NextResponse.json(
        {
          error:
            "REPLICATE_API_TOKEN is not configured in server environment variables. Please add your Replicate API token in the Settings modal (top-right cog) or in .env.local / Vercel Environment Variables.",
        },
        { status: 401 }
      );
    }

    // Convert input image file to base64 Data URI
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = imageFile.type || "image/png";
    const dataUri = `data:${mimeType};base64,${base64}`;

    const replicate = new Replicate({ auth: apiToken });

    let output: unknown;
    let usedModel = "BiRefNet (men1scus/birefnet)";

    console.log(`[/api/remove-bg] Invoking Replicate BiRefNet for image (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)...`);

    try {
      // Primary attempt: BiRefNet
      output = await replicate.run(BIREFNET_MODEL, {
        input: {
          image: dataUri,
        },
      });
      console.log("[/api/remove-bg] BiRefNet inference completed successfully.");
    } catch (primaryErr: unknown) {
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.warn(`[/api/remove-bg] Primary BiRefNet error: ${primaryMsg}`);

      // If rate limited (429 / burst limit), return immediately rather than immediately re-hammering Replicate
      if (
        primaryMsg.includes("429") ||
        primaryMsg.toLowerCase().includes("rate limit") ||
        primaryMsg.toLowerCase().includes("burst")
      ) {
        return NextResponse.json(
          {
            error:
              "Replicate rate limit exceeded (burst limit: 1 req/sec). Please wait a few seconds and try again.",
          },
          { status: 429 }
        );
      }

      console.warn("[/api/remove-bg] Trying fallback model (lucataco/remove-bg)...");
      // Fallback attempt: Tracer B7 Remove-BG
      usedModel = "Tracer B7 (lucataco/remove-bg)";
      output = await replicate.run(FALLBACK_MODEL, {
        input: {
          image: dataUri,
        },
      });
      console.log("[/api/remove-bg] Fallback model inference completed successfully.");
    }

    // Process output from Replicate (can be FileOutput, array of FileOutput, or string URL)
    let imageBlob: Blob | null = null;

    if (output && typeof (output as { blob?: () => Promise<Blob> }).blob === "function") {
      // Replicate modern SDK FileOutput
      imageBlob = await (output as { blob: () => Promise<Blob> }).blob();
    } else {
      let outputUrl = "";

      if (Array.isArray(output) && output.length > 0) {
        const first = output[0];
        if (first && typeof first.blob === "function") {
          imageBlob = await first.blob();
        } else {
          outputUrl = String(first);
        }
      } else if (output) {
        outputUrl = String(output);
      }

      if (!imageBlob && outputUrl && outputUrl.startsWith("http")) {
        console.log(`[/api/remove-bg] Fetching transparent image from Replicate delivery URL: ${outputUrl}`);
        const assetRes = await fetch(outputUrl);
        if (!assetRes.ok) {
          throw new Error(
            `Failed to download processed image from Replicate CDN (${assetRes.status} ${assetRes.statusText})`
          );
        }
        imageBlob = await assetRes.blob();
      }
    }

    if (!imageBlob) {
      console.error("[/api/remove-bg] Failed to resolve output image from Replicate response:", output);
      return NextResponse.json(
        { error: "Replicate returned empty or unrecognizable output payload." },
        { status: 502 }
      );
    }

    console.log(`[/api/remove-bg] Successfully received transparent cutout (${imageBlob.size} bytes) via ${usedModel}.`);

    // Return the transparent PNG cutout directly as a binary response
    return new Response(imageBlob, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Segmentation-Model": usedModel,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[/api/remove-bg] Replicate execution exception:", err);
    return NextResponse.json(
      {
        error: `Replicate Segmentation Error: ${errorMsg}`,
      },
      { status: 500 }
    );
  }
}
