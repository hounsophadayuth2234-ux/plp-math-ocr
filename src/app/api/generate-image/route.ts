import { NextRequest, NextResponse } from "next/server";
import { executeImageGeneration } from "@/lib/image-generator-adapters";
import { ProcessingStatusLabel } from "@/lib/types";

export interface GenerateSuccess {
  images: string[];
  prompt: string;
  model: string;
  aspectRatio: string;
  label: ProcessingStatusLabel;
  isDemoMode?: boolean;
}

export interface GenerateError {
  error: string;
  code?: string;
  details?: string;
  suggestedAction?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      negativePrompt,
      aspectRatio = "1:1",
      numOutputs = 1,
      allowDemo = false,
    } = body as {
      prompt: string;
      negativePrompt?: string;
      aspectRatio: string;
      numOutputs?: number;
      allowDemo?: boolean;
    };

    if (!prompt || prompt.trim().length < 3) {
      return NextResponse.json<GenerateError>(
        { error: "Please provide a prompt (minimum 3 characters)." },
        { status: 400 }
      );
    }

    try {
      const result = await executeImageGeneration({
        prompt,
        negativePrompt,
        aspectRatio,
        numOutputs,
        allowDemo,
      });

      return NextResponse.json<GenerateSuccess>(result, { status: 200 });
    } catch (adapterErr: unknown) {
      const msg = adapterErr instanceof Error ? adapterErr.message : String(adapterErr);

      if (msg.includes("NO_PROVIDER_CONFIGURED")) {
        return NextResponse.json<GenerateError>(
          {
            error:
              "No image generation provider is configured. Connect a local worker (IMAGE_WORKER_URL) or configure a Cloud API token in Settings, or enable Demo Preview Mode.",
            code: "NOT_CONFIGURED",
            suggestedAction: "ENABLE_DEMO",
          },
          { status: 422 }
        );
      }

      return NextResponse.json<GenerateError>(
        {
          error: `Generation failed: ${msg}`,
          code: "GENERATION_ERROR",
        },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[/api/generate-image]", err);
    return NextResponse.json<GenerateError>(
      { error: "Image generation failed.", details: message },
      { status: 500 }
    );
  }
}
