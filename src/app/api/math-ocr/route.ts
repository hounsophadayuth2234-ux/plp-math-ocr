import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import {
  validateLatexWithKatex,
  sanitizeJoditHtml,
  validateMathML,
} from "@/lib/math-ocr-utils";
import {
  normalizeKhmerText,
  validateMathematicalSyntax,
} from "@/lib/khmer-grapheme-normalizer";

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
  ok?: boolean;
  error: string;
  details?: string;
  code?: string;
  retryable?: boolean;
  requestId?: string;
  message?: string;
}

// -----------------------------------------------------------
// Magic bytes validator for PNG, JPEG, WEBP
// -----------------------------------------------------------
function validateImageMagicBytes(buffer: ArrayBuffer): {
  valid: boolean;
  format?: "image/png" | "image/jpeg" | "image/webp";
} {
  if (buffer.byteLength < 12) return { valid: false };
  const bytes = new Uint8Array(buffer.slice(0, 16));

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { valid: true, format: "image/png" };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, format: "image/jpeg" };
  }

  // WEBP: RIFF .... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { valid: true, format: "image/webp" };
  }

  return { valid: false };
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

CRITICAL LATEX FORMATTING RULES:
1. STRICT KATEX (0.19.0) COMPATIBILITY:
   - Placeholders, blanks, or answer boxes such as [___] or [____] MUST escape literal underscores: write [\\_\\_\\_] or [\\_], NEVER raw unescaped [_..._] in math mode (raw underscores in LaTeX denote subscripts and break rendering).
2. VERTICAL ARITHMETIC IN LATEX:
   - Use standard array column alignments: \\begin{array}{r} or \\begin{array}{rr} with \\hline.
   - NEVER use @{\\quad} or @{...} in array column specifiers because KaTeX rejects @ column alignments with "Unknown column alignment: @".
3. FRACTIONS:
   - Use standard \\frac{numerator}{denominator}.
4. MULTILINE EQUATIONS:
   - Use \\begin{aligned} ... \\end{aligned} or \\begin{array}{l} ... \\end{array}.

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

CRITICAL MATHML FORMATTING RULES:
1. Wrap in standard <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">...</math>.
2. Use standard elements: <mrow>, <mfrac>, <msup>, <msub>, <mtable>, <mtr>, <mtd>, <mn>, <mi>, <mo>, <mtext>.

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

// Configurable candidate models in order of priority (overridable via server environment variable)
export function getCandidateModels(): string[] {
  const envPriority = process.env.GEMINI_MODEL_PRIORITY;
  if (envPriority && envPriority.trim()) {
    const list = envPriority
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    if (list.length > 0) return list;
  }
  return [
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-flash-lite-latest",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
  ];
}

// Transient/provider-availability error classifier (429, 500, 502, 503, 504, network failure, timeout)
export function isTransientProviderError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b(429|500|502|503|504)\b/i.test(msg)) return true;
  if (
    /high demand|temporarily unavailable|service unavailable|overloaded|resource exhausted|rate limit|too many requests|quota|is not available/i.test(
      msg
    )
  ) {
    return true;
  }
  if (/timeout|timed out|fetch failed|network|econnreset|econnrefused|socket hang up|abort/i.test(msg)) {
    return true;
  }
  return false;
}

// Exponential backoff with random jitter
function getBackoffMs(retryCount: number): number {
  const base = Math.min(1000, 200 * Math.pow(2, retryCount));
  const jitter = Math.random() * 200;
  return Math.round(base + jitter);
}

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
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json<MathOcrError>(
        {
          ok: false,
          error: "ទិន្នន័យមិនត្រឹមត្រូវ (Invalid Form Data)៖ សូមបញ្ចូលទិន្នន័យជា multipart/form-data។",
          details: "Invalid form data. Expected multipart/form-data.",
          code: "INVALID_FORM_DATA",
          retryable: false,
          requestId,
          message: "Invalid form data. Expected multipart/form-data.",
        },
        { status: 400 }
      );
    }

    const rawText = formData.get("rawText") as string | null;
    const imageFile = formData.get("image") as File | null;
    const customInstructions = formData.get("customInstructions") as string | null;

    const trimmedText = rawText ? rawText.trim() : "";

    if (!imageFile && !trimmedText) {
      return NextResponse.json<MathOcrError>(
        {
          ok: false,
          error: "ទិន្នន័យមិនត្រឹមត្រូវ (Invalid Input)៖ សូមបញ្ចូលរូបភាពគណិតវិទ្យា ឬអត្ថបទសមីការគណិតវិទ្យា។",
          details: "Please provide either a valid math image or non-empty raw text to transcribe.",
          code: "INVALID_INPUT",
          retryable: false,
          requestId,
          message: "Please provide either a valid math image or non-empty raw text to transcribe.",
        },
        { status: 400 }
      );
    }

    // Server-side payload size guard: Vercel serverless limit is 4.5 MB
    if (imageFile && imageFile.size > 4.5 * 1024 * 1024) {
      return NextResponse.json<MathOcrError>(
        {
          ok: false,
          error: "ទំហំរូបភាពធំពេក (Payload Too Large)៖ រូបភាពលើសពីដែនកំណត់ 4.5 MB របស់ម៉ាស៊ីនមេ។",
          details: `Uploaded image size (${(imageFile.size / (1024 * 1024)).toFixed(2)} MB) exceeds 4.5 MB function limit. Please use client-side preprocessing or a smaller image.`,
          code: "PAYLOAD_TOO_LARGE",
          retryable: false,
          requestId,
          message: "Image payload exceeds 4.5 MB limit.",
        },
        { status: 413 }
      );
    }

    let verifiedMimeType: "image/png" | "image/jpeg" | "image/webp" = "image/png";

    if (imageFile) {
      const imageBytes = await imageFile.arrayBuffer();
      if (imageBytes.byteLength === 0) {
        return NextResponse.json<MathOcrError>(
          {
            ok: false,
            error: "ឯកសាររូបភាពទទេ (Empty File)៖ ឯកសារ 0 bytes មិនអាចដំណើរការបានទេ។",
            details: "Uploaded image file is empty (0 bytes).",
            code: "EMPTY_FILE",
            retryable: false,
            requestId,
            message: "Uploaded image file is empty (0 bytes).",
          },
          { status: 400 }
        );
      }

      const magicCheck = validateImageMagicBytes(imageBytes);
      if (!magicCheck.valid || !magicCheck.format) {
        return NextResponse.json<MathOcrError>(
          {
            ok: false,
            error: "ប្រភេទឯកសារមិនត្រឹមត្រូវ (Unsupported Media Type)៖ សូមបញ្ចូលរូបភាព PNG, JPG, ឬ WEBP ពិតប្រាកដ។",
            details: "Uploaded file does not have valid PNG, JPEG, or WEBP binary header signatures.",
            code: "UNSUPPORTED_MEDIA_TYPE",
            retryable: false,
            requestId,
            message: "Unsupported media type. Expected PNG, JPEG, or WEBP.",
          },
          { status: 415 }
        );
      }
      verifiedMimeType = magicCheck.format;
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      return NextResponse.json<MathOcrError>(
        {
          ok: false,
          error: "មិនទាន់កំណត់ Gemini API Key (API Key Missing)៖ សូមកំណត់ GEMINI_API_KEY ក្នុង Settings ឬ Environment Variables។",
          details: "Please add a valid GEMINI_API_KEY to your environment variables to enable Math OCR transcription.",
          code: "PROVIDER_NOT_CONFIGURED",
          retryable: false,
          requestId,
          message: "Gemini provider is not configured.",
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
          mimeType: verifiedMimeType,
          data: base64Image,
        },
      });
      parts.push({
        text: trimmedText
          ? `Transcribe the visible mathematical content from this image. Additional user context: ${trimmedText}`
          : "Transcribe the visible mathematical content from this image exactly without solving.",
      });
    } else if (trimmedText) {
      // Raw text-only requests do not perform any image encoding or vision processing
      parts.push({
        text: `Transcribe and typeset the following visible mathematical content into LaTeX, Jodit HTML, and MathML without solving: ${trimmedText}`,
      });
    }

    if (customInstructions && customInstructions.trim()) {
      parts.push({
        text: `\n\nUSER FORMATTING PREFERENCE (apply without solving math):\n${customInstructions.trim()}`,
      });
    }

    let responseText = "";
    let selectedModel = "";
    let totalAttempts = 0;
    const attemptedModels: string[] = [];
    const candidateModels = getCandidateModels();
    const OVERALL_BUDGET_MS = 38000;
    const PER_MODEL_TIMEOUT_MS = 10000;

    for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
      const modelName = candidateModels[mIdx];
      const elapsedOverall = Date.now() - overallStartTime;
      if (elapsedOverall >= OVERALL_BUDGET_MS) {
        break; // Overall request budget exhausted
      }

      attemptedModels.push(modelName);

      // Bounded retry behavior: Maximum 1 retry per model (up to 2 attempts total)
      let modelSuccess = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        totalAttempts++;
        const currentElapsed = Date.now() - overallStartTime;
        const remainingBudget = OVERALL_BUDGET_MS - currentElapsed;
        if (remainingBudget <= 2500) {
          break; // Not enough time for an inference attempt
        }

        const currentTimeout = Math.min(PER_MODEL_TIMEOUT_MS, remainingBudget);

        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          });

          const result = await withTimeout(
            model.generateContent({ contents: [{ role: "user", parts }] }),
            currentTimeout,
            `Model ${modelName} timed out after ${currentTimeout}ms`
          );

          const candidateText = result.response.text()?.trim();
          if (candidateText && candidateText.startsWith("{")) {
            responseText = candidateText;
            selectedModel = modelName;
            modelSuccess = true;
            break;
          } else if (candidateText) {
            const cleaned = candidateText
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```$/i, "")
              .trim();
            if (cleaned.startsWith("{")) {
              responseText = cleaned;
              selectedModel = modelName;
              modelSuccess = true;
              break;
            }
          }
        } catch (err: unknown) {
          const isTransient = isTransientProviderError(err);
          // Redact secrets in server log
          const safeErrorMsg = (err instanceof Error ? err.message : String(err)).replace(
            /key=[A-Za-z0-9_.-]+/gi,
            "key=[REDACTED]"
          );

          console.warn(
            JSON.stringify({
              requestId,
              event: "model_attempt_failed",
              model: modelName,
              attempt,
              isTransient,
              error: safeErrorMsg.slice(0, 200),
              elapsedMs: Date.now() - overallStartTime,
            })
          );

          // If error is fatal (non-transient authentication or invalid input), abort all retries
          if (!isTransient) {
            break;
          }

          // If transient and first attempt, apply backoff with jitter before the single retry
          if (attempt === 0) {
            const backoff = getBackoffMs(attempt);
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
      }

      if (modelSuccess && responseText) {
        break; // Successfully obtained response
      }
    }

    if (!responseText) {
      const totalElapsed = Date.now() - overallStartTime;
      const isTimeout = totalElapsed >= OVERALL_BUDGET_MS - 3000;

      // Server-side audit log (no secrets exposed)
      console.warn(
        JSON.stringify({
          requestId,
          event: "math_ocr_failed_all_models",
          totalElapsedMs: totalElapsed,
          totalAttempts,
          attemptedModels,
          isTimeout,
        })
      );

      if (isTimeout) {
        return NextResponse.json<MathOcrError>(
          {
            ok: false,
            code: "UPSTREAM_TIMEOUT",
            retryable: true,
            requestId,
            message: "The math AI service timed out while processing. Please try again.",
            error: "ការដំណើរការលើសកំណត់ពេល (Timeout)៖ ម៉ាស៊ីន AI ដំណើរការយឺតជាងធម្មតា។ សូមចុច 'ព្យាយាមម្តងទៀត'។",
          },
          { status: 504 }
        );
      }

      return NextResponse.json<MathOcrError>(
        {
          ok: false,
          code: "MODEL_UNAVAILABLE",
          retryable: true,
          requestId,
          message: "The math AI service is temporarily busy. Please try again.",
          error: "ម៉ាស៊ីន AI កំពុងមានសំណើច្រើន (Service Busy)៖ ប្រព័ន្ធកំពុងដំណើរការមមាញឹកបន្តិច។ សូមចុច 'ព្យាយាមម្តងទៀត'។",
        },
        { status: 503 }
      );
    }

    // Technical telemetry in server log only (redacted secrets)
    console.info(
      JSON.stringify({
        requestId,
        event: "math_ocr_success",
        selectedModel,
        totalAttempts,
        durationMs: Date.now() - overallStartTime,
      })
    );

    try {
      const cleaned = responseText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned) as MathOcrResponse;

      if (!parsed.latex || !parsed.joditHtml) {
        throw new Error("Model response missing required latex or joditHtml fields");
      }

      // KaTeX normalization and validation
      const katexValidation = validateLatexWithKatex(parsed.latex);
      parsed.latex = katexValidation.normalized;

      // HTML and SVG sanitization
      parsed.joditHtml = sanitizeJoditHtml(parsed.joditHtml);

      // Normalize Khmer text using Unicode NFC & grapheme-safe rules
      if (!parsed.transcription) {
        parsed.transcription = parsed.latex;
      }
      parsed.transcription = normalizeKhmerText(parsed.transcription);

      // Verify mathematical syntax & structure (balanced parens/braces, frac, radicals, matrix)
      const syntaxValidation = validateMathematicalSyntax(parsed.latex, parsed.mathml);
      if (!syntaxValidation.valid && syntaxValidation.errors.length > 0) {
        parsed.uncertainParts = [
          ...(parsed.uncertainParts || []),
          ...syntaxValidation.errors,
        ];
      }

      if (!parsed.mathml) {
        parsed.mathml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mtext>${parsed.transcription || "Math Expression"}</mtext></math>`;
      } else {
        const mathmlValidation = validateMathML(parsed.mathml);
        parsed.mathml = mathmlValidation.normalized;
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
          ok: false,
          error: "កំហុសទម្រង់ទិន្នន័យ (Parse Error)៖ ម៉ាស៊ីន AI បញ្ចេញទិន្នន័យមិនត្រូវតាមទម្រង់ JSON។",
          details: "Malformed response format from model.",
          code: "PARSE_ERROR",
          retryable: true,
          requestId,
          message: "Malformed response from AI model. Please retry.",
        },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    console.error("[/api/math-ocr] Unhandled error:", err);
    return NextResponse.json<MathOcrError>(
      {
        ok: false,
        error: "ម៉ាស៊ីនមេជួបបញ្ហាផ្ទៃក្នុង (Internal Server Error)៖ សូមព្យាយាមម្តងទៀត។",
        details: "An internal server error occurred while processing the math expression.",
        code: "SERVER_ERROR",
        retryable: true,
        requestId,
        message: "An internal server error occurred. Please try again.",
      },
      { status: 500 }
    );
  }
}
