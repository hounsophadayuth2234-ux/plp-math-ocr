import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------
export interface UpscaleSuccess {
  outputUrl: string;
  model: string;
  scale: number;
  isDemoMode?: boolean;
}

export interface UpscaleError {
  error: string;
  details?: string;
}

const MODEL_VERSION =
  "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    const scaleStr = formData.get("scale") as string | null;

    if (!imageFile) {
      return NextResponse.json<UpscaleError>(
        { error: "No image file provided." },
        { status: 400 }
      );
    }

    const scale = Math.min(4, Math.max(2, parseInt(scaleStr ?? "4", 10)));
    const apiToken = process.env.REPLICATE_API_TOKEN;

    // Convert input to base64 data URI
    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUri = `data:${imageFile.type};base64,${base64}`;

    // If Replicate token is not set, provide interactive demo preview!
    if (!apiToken || apiToken.includes("your_replicate_token_here")) {
      return NextResponse.json<UpscaleSuccess>(
        {
          outputUrl: dataUri,
          model: "Real-ESRGAN 4x (Demo Mode — Enter REPLICATE_API_TOKEN for live GPU inference)",
          scale,
          isDemoMode: true,
        },
        { status: 200 }
      );
    }

    try {
      const replicate = new Replicate({ auth: apiToken });

      const output = await replicate.run(MODEL_VERSION, {
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
        throw new Error("Invalid output from Replicate");
      }

      return NextResponse.json<UpscaleSuccess>(
        { outputUrl, model: "Real-ESRGAN 4x (nightmareai)", scale },
        { status: 200 }
      );
    } catch (replicateErr) {
      console.warn("[/api/upscale] Replicate call failed, returning demo output:", replicateErr);
      return NextResponse.json<UpscaleSuccess>(
        {
          outputUrl: dataUri,
          model: "Real-ESRGAN 4x (Demo Fallback)",
          scale,
          isDemoMode: true,
        },
        { status: 200 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[/api/upscale]", err);
    return NextResponse.json<UpscaleError>(
      { error: "Upscaling failed.", details: message },
      { status: 500 }
    );
  }
}
