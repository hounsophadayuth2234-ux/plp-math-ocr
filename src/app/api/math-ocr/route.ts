import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";

export const maxDuration = 45;

// -----------------------------------------------------------
// Response and Error Interfaces
// -----------------------------------------------------------
export interface MathOcrResponse {
  transcription: string;
  latex: string;
  joditHtml: string;
  mathml: string;
  detectedType: string;
  rawDescription: string;
  confidence?: number;
  uncertainParts?: string[];
  isDemoMode?: boolean;
}

export interface MathOcrError {
  error: string;
  details?: string;
  code?: string;
}

// -----------------------------------------------------------
// Strict Image-to-Code Transcription Engine Prompt
// -----------------------------------------------------------
const SYSTEM_PROMPT = `You are a mathematical image transcription engine.

Your ONLY task is to copy the visible mathematical content from the uploaded image and convert the same content into three code formats:
1. LaTeX
2. Jodit-compatible HTML with strict inline CSS
3. Standard MathML

This is image-to-code transcription only, NOT problem solving.

STRICT RULES:
- Do NOT solve any equation or problem.
- Do NOT calculate any result or answer.
- Do NOT factor, simplify, rearrange, or transform the expression.
- Do NOT add steps, explanations, answers, roots, or conclusions.
- Do NOT change any number, variable, operator, sign, exponent, fraction, root, bracket, or equality/inequality symbol.
- Preserve the exact visual meaning and structure of the image.
- Preserve line breaks, alignment, vertical arithmetic, fractions, superscripts, subscripts, matrices, and geometric labels.
- Do NOT replace a visible symbol with another symbol.
- Do NOT guess unclear content. Mark unclear content in "uncertainParts".
- The three outputs must represent exactly the same transcription.

CRITICAL JODIT HTML FORMATTING RULES:
1. ABSOLUTE STRICT INLINE CSS ONLY:
   - NO <style> tags, NO CSS classes, NO external stylesheets.
   - EVERY single element MUST use inline style="..." attributes.
2. WRAPPER:
   - Wrap in: <div style="font-family: 'Times New Roman', serif; font-size: 24px; line-height: 1.8; color: #000;">
3. VERTICAL ARITHMETIC:
   - Never output calculated answers. If the bottom line has a blank or [___], output literal text [___].
   - Table structure: <table style="border-collapse: collapse; font-family: 'Times New Roman', serif; font-size: 28px; border: none; margin: 10px auto; text-align: right;">
   - Fixed-width columns for place values: <td style="border: none; width: 40px; padding: 4px;">...</td>
   - Answer line separator: style="border-top: 2px solid black;"
4. FRACTIONS:
   - Vertical flex: <span style="display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; margin: 0 5px;">
   - Numerator must have: style="border-bottom: 2px solid black;"
5. GEOMETRY (SVG):
   - If shapes/diagrams are present, generate clean self-contained <svg> with stroke-width="3" and legible font-size="24".

Return a valid JSON object with EXACTLY this structure:
{
  "transcription": "literal raw text of the transcription",
  "detectedType": "short descriptive type (e.g., Quadratic Equation, Vertical Addition, Fraction)",
  "rawDescription": "brief description of the transcribed mathematical content (without solving)",
  "latex": "valid, compilable LaTeX code representing the exact expression",
  "joditHtml": "Jodit HTML with strict inline CSS only",
  "mathml": "valid W3C MathML markup representing the exact expression",
  "confidence": 1.0,
  "uncertainParts": []
}`;

// Candidate models in order of speed and stability
const CANDIDATE_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
];

// Helper to execute a promise with a timeout
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), ms)
    ),
  ]);
}

// -----------------------------------------------------------
// Route Handler
// -----------------------------------------------------------
export async function POST(req: NextRequest) {
  const overallStartTime = Date.now();

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json<MathOcrError>(
        { error: "Invalid form data. Expected multipart/form-data." },
        { status: 400 }
      );
    }

    const rawText = formData.get("rawText") as string | null;
    const imageFile = formData.get("image") as File | null;
    const customInstructions = formData.get("customInstructions") as string | null;

    if (!rawText && !imageFile) {
      return NextResponse.json<MathOcrError>(
        { error: "Please provide either a math image or raw text to transcribe." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      return NextResponse.json<MathOcrError>(
        {
          error: "Google Gemini API key is not configured.",
          details: "Please add a valid GEMINI_API_KEY to your environment variables to enable Math OCR transcription.",
          code: "PROVIDER_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const parts: Part[] = [{ text: SYSTEM_PROMPT }];

    if (imageFile) {
      const imageBytes = await imageFile.arrayBuffer();
      const base64Image = Buffer.from(imageBytes).toString("base64");
      parts.push({
        inlineData: {
          mimeType: (imageFile.type as "image/png" | "image/jpeg" | "image/webp") || "image/png",
          data: base64Image,
        },
      });
      parts.push({
        text: rawText
          ? `Transcribe the visible mathematical content from this image. Additional user context: ${rawText}`
          : "Transcribe the visible mathematical content from this image exactly without solving.",
      });
    } else if (rawText) {
      parts.push({
        text: `Transcribe and typeset the following visible mathematical content into LaTeX, Jodit HTML, and MathML without solving: ${rawText}`,
      });
    }

    if (customInstructions && customInstructions.trim()) {
      parts.push({
        text: `\n\nUSER FORMATTING PREFERENCE (apply without solving math):\n${customInstructions.trim()}`,
      });
    }

    let responseText = "";
    let lastError: Error | null = null;

    // Try candidate models with individual timeouts (max 15s per model, max 35s overall)
    for (const modelName of CANDIDATE_MODELS) {
      const elapsed = Date.now() - overallStartTime;
      if (elapsed > 32000) {
        break; // Approaching total budget
      }

      const remainingBudget = Math.max(3000, 35000 - elapsed);
      const perModelTimeout = Math.min(14000, remainingBudget);

      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1, // Low temperature for deterministic transcription
          },
        });

        const result = await withTimeout(
          model.generateContent({ contents: [{ role: "user", parts }] }),
          perModelTimeout,
          `Model ${modelName} timed out after ${perModelTimeout}ms`
        );

        const candidateText = result.response.text()?.trim();
        if (candidateText && candidateText.startsWith("{")) {
          responseText = candidateText;
          break;
        } else if (candidateText) {
          // Clean possible markdown wrapper if responseMimeType wasn't honored
          const cleaned = candidateText
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          if (cleaned.startsWith("{")) {
            responseText = cleaned;
            break;
          }
        }
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        lastError = err instanceof Error ? err : new Error(errMessage);
        console.warn(`[math-ocr] Model ${modelName} failed (${Date.now() - overallStartTime}ms): ${errMessage}`);
      }
    }

    if (!responseText) {
      const totalElapsed = Date.now() - overallStartTime;
      if (totalElapsed >= 32000) {
        return NextResponse.json<MathOcrError>(
          {
            error: "Transcription timed out.",
            details: "Upstream AI vision model took too long to process the image. Please try again.",
            code: "UPSTREAM_TIMEOUT",
          },
          { status: 504 }
        );
      }

      return NextResponse.json<MathOcrError>(
        {
          error: "Failed to transcribe mathematical image.",
          details: lastError?.message || "No response received from any transcription model.",
          code: "TRANSCRIPTION_FAILED",
        },
        { status: 502 }
      );
    }

    try {
      const cleaned = responseText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned) as MathOcrResponse;

      if (!parsed.latex || !parsed.joditHtml) {
        throw new Error("Model response missing required latex or joditHtml fields");
      }

      if (!parsed.transcription) {
        parsed.transcription = parsed.latex;
      }

      if (!parsed.mathml) {
        parsed.mathml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mtext>${parsed.transcription || "Math Expression"}</mtext></math>`;
      }

      if (!parsed.detectedType) {
        parsed.detectedType = "Mathematical Expression";
      }

      if (!parsed.rawDescription) {
        parsed.rawDescription = parsed.transcription;
      }

      parsed.isDemoMode = false;

      return NextResponse.json<MathOcrResponse>(parsed, { status: 200 });
    } catch (parseErr) {
      console.error("[math-ocr] JSON parse error:", parseErr, "Response text:", responseText);
      return NextResponse.json<MathOcrError>(
        {
          error: "Failed to parse model transcription output.",
          details: parseErr instanceof Error ? parseErr.message : "Malformed JSON response.",
          code: "PARSE_ERROR",
        },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected server error occurred.";
    console.error("[/api/math-ocr] Unhandled error:", err);
    return NextResponse.json<MathOcrError>(
      {
        error: "Internal server error.",
        details: message,
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}
