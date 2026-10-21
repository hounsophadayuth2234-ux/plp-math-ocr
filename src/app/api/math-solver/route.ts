import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { validateImageUpload } from "@/lib/image-upload-validator";

export const maxDuration = 60;

// -----------------------------------------------------------
// Response and Error Interfaces
// -----------------------------------------------------------
export interface MathSolverProblem {
  id: string;
  extractedProblem: string;
  extractedAnswer?: string;
  answerStatus?: "correct" | "incorrect" | "unverifiable";
  answerStatusKhmer?: string;
  incorrectStep?: string;
  correctedStep?: string;
  solution: string;
  solutionKhmer: string;
  finalAnswer: string;
  verification: string;
  confidence: "high" | "medium" | "low";
  confidenceKhmer: string;
  ambiguousParts?: string[];
  reviewSuggestions?: string[];
}

export interface MathSolverResponse {
  problems: MathSolverProblem[];
  totalProblems: number;
  outputLanguage: "khmer" | "khmer_english" | "english";
  extractedText: string;
  imageQualityNote?: string;
  inferenceProvider: string;
  mode?: "extract" | "solve" | "full";
  timings: {
    preprocessMs: number;
    extractionMs: number;
    reasoningMs: number;
    totalMs: number;
  };
}

export interface MathSolverError {
  ok: false;
  error: string;
  errorKhmer: string;
  details?: string;
  code: string;
  retryable: boolean;
  requestId: string;
}

// -----------------------------------------------------------
// Gemini Vision Prompts
// -----------------------------------------------------------
const FULL_SOLVER_PROMPT = `You are an expert Khmer mathematics tutor and problem solver with deep expertise in both Khmer-language education and mathematical reasoning.

Your task is to:
1. Extract all mathematical problems from the uploaded image
2. Solve each problem step by step
3. If an existing answer is visible, verify whether it is correct or incorrect
4. Provide clear Khmer explanations suitable for students

CRITICAL RULES:

EXTRACTION:
- Extract all visible mathematical content faithfully
- Handle printed Khmer, printed English, handwritten text, Arabic numerals, Khmer numerals
- Detect fractions, decimals, percentages, negative numbers, algebra, equations, inequalities, exponents, radicals, functions, sequences, calculus, geometry, trigonometry, word problems, tables, matrices
- If a diagram is present, describe its relevant information
- If multiple problems exist, number and separate them

ANTI-HALLUCINATION:
- If any symbol, number, exponent, fraction, sign, or character is ambiguous or unreadable, DO NOT GUESS
- Mark ambiguous parts in "ambiguousParts" array
- Provide possible interpretations and ask user to confirm
- Set confidence appropriately: "high" (>90% sure), "medium" (70-90%), "low" (<70%)
- Never invent missing numbers, invisible signs, unknown exponents, unreadable denominators, or diagram measurements

ANSWER VERIFICATION:
- If the image contains an existing written answer:
  1. Identify the original problem
  2. Identify the student's answer
  3. Solve independently
  4. Compare answers
  5. If incorrect: identify the exact wrong step, explain why it's wrong, provide correction
- Never mark an answer correct just because it visually looks plausible

KHMER EXPLANATION:
- Use natural educational Khmer, not machine translation
- Preserve Khmer diacritics and subscript characters
- Use clear numbered steps
- Use Khmer for explanation, standard mathematical notation for equations
- Style: "យើងមានសមីការ៖", "ជំហានទី១៖", "ដូច្នេះ ចម្លើយគឺ៖", "ពិនិត្យឡើងវិញ៖"

Return a valid JSON object with this structure:
{
  "problems": [
    {
      "id": "q1",
      "extractedProblem": "the exact problem extracted",
      "extractedAnswer": "student's existing answer if visible, or null",
      "answerStatus": "correct" | "incorrect" | "unverifiable" | null,
      "answerStatusKhmer": "ត្រឹមត្រូវ" | "មិនទាន់ត្រឹមត្រូវ" | "មិនអាចផ្ទៀងផ្ទាត់បាន" | null,
      "incorrectStep": "description of wrong step if answer is incorrect, or null",
      "correctedStep": "correct version of the wrong step, or null",
      "solution": "step-by-step solution in mathematical notation",
      "solutionKhmer": "step-by-step solution explained in Khmer",
      "finalAnswer": "the final numerical or algebraic answer",
      "verification": "verification/check work",
      "confidence": "high" | "medium" | "low",
      "confidenceKhmer": "កម្រិតទំនុកចិត្តខ្ពស់" | "កម្រិតទំនុកចិត្តមធ្យម" | "កម្រិតទំនុកចិត្តទាប",
      "ambiguousParts": [],
      "reviewSuggestions": []
    }
  ],
  "totalProblems": 1,
  "extractedText": "full raw extracted text from image",
  "imageQualityNote": "note about image quality if relevant"
}`;

const EXTRACTION_ONLY_PROMPT = `You are a mathematical document OCR engine specializing in Khmer and mathematical notation.

Your task is to:
1. Accurately transcribe all mathematical problems from the image verbatim into "extractedProblem".
2. If an existing student answer is visible (handwritten or typed), extract it into "extractedAnswer".
3. ANTI-HALLUCINATION: If any symbol, exponent, sign, fraction, or character is ambiguous or unreadable, DO NOT GUESS. List them in "ambiguousParts".
4. Set confidence: "high" (>90% sure), "medium" (70-90%), "low" (<70%).
5. Leave "solution", "solutionKhmer", "finalAnswer", and "verification" as empty strings.

Return a valid JSON object:
{
  "problems": [
    {
      "id": "q1",
      "extractedProblem": "the exact problem extracted verbatim",
      "extractedAnswer": "student's existing answer if visible, or null",
      "answerStatus": null,
      "answerStatusKhmer": null,
      "incorrectStep": null,
      "correctedStep": null,
      "solution": "",
      "solutionKhmer": "",
      "finalAnswer": "",
      "verification": "",
      "confidence": "high" | "medium" | "low",
      "confidenceKhmer": "កម្រិតទំនុកចិត្តខ្ពស់" | "កម្រិតទំនុកចិត្តមធ្យម" | "កម្រិតទំនុកចិត្តទាប",
      "ambiguousParts": [],
      "reviewSuggestions": []
    }
  ],
  "totalProblems": 1,
  "extractedText": "full raw extracted text from image",
  "imageQualityNote": null
}`;

// -----------------------------------------------------------
// Helper: timeout wrapper
// -----------------------------------------------------------
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), ms)
    ),
  ]);
}

// -----------------------------------------------------------
// Helper: transient error check
// -----------------------------------------------------------
function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b(429|500|502|503|504)\b/i.test(msg)) return true;
  if (/high demand|temporarily unavailable|service unavailable|overloaded|resource exhausted|rate limit|too many requests|quota|is not available/i.test(msg)) return true;
  if (/timeout|timed out|fetch failed|network|econnreset|econnrefused|socket hang up|abort/i.test(msg)) return true;
  return false;
}

// -----------------------------------------------------------
// Route Handler
// -----------------------------------------------------------
export async function POST(req: NextRequest) {
  // 1. Enforce Server-Side Session Authentication
  const authBlock = await enforceRouteAuth(req);
  if (authBlock) return authBlock;

  // 2. Enforce Rate Limiting (8 req/min/IP)
  const rateLimitResponse = await enforceRateLimit(req, "math_solver");
  if (rateLimitResponse) return rateLimitResponse;

  const overallStartTime = Date.now();
  const requestId = `msreq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json<MathSolverError>(
        {
          ok: false,
          error: "Invalid form data",
          errorKhmer: "ទិន្នន័យមិនត្រឹមត្រូវ។ សូមបញ្ចូលទិន្នន័យជា multipart/form-data។",
          code: "INVALID_FORM_DATA",
          retryable: false,
          requestId,
        },
        { status: 400 }
      );
    }

    const action = ((formData.get("action") as string) || "full").toLowerCase(); // "extract" | "solve" | "full"
    const imageFile = formData.get("image") as File | null;
    const problemTextInput = (formData.get("problemText") as string) || "";
    const existingAnswerInput = (formData.get("existingAnswer") as string) || "";
    const outputLanguage = (formData.get("outputLanguage") as string) || "khmer";
    const includeVerification = formData.get("includeVerification") !== "false";
    const solveQuestions = formData.get("solveQuestions") as string | null;

    // Validate inputs
    if (!imageFile && !problemTextInput) {
      return NextResponse.json<MathSolverError>(
        {
          ok: false,
          error: "No image provided",
          errorKhmer: "សូមបញ្ចូលរូបភាពមុនចុចដោះស្រាយ។",
          code: "MISSING_IMAGE",
          retryable: false,
          requestId,
        },
        { status: 400 }
      );
    }

    let verifiedMimeType = "image/png";
    let imageBytes: ArrayBuffer | null = null;

    if (imageFile) {
      // Server-side payload size guard (4.5 MB)
      if (imageFile.size > 4.5 * 1024 * 1024) {
        return NextResponse.json<MathSolverError>(
          {
            ok: false,
            error: "Image too large",
            errorKhmer: "រូបភាពមានទំហំធំពេក។ សូមប្រើរូបភាពដែលមានទំហំតូចជាង 4.5 MB។",
            code: "PAYLOAD_TOO_LARGE",
            retryable: false,
            requestId,
          },
          { status: 413 }
        );
      }

      // Validate image magic bytes and dimension limits
      imageBytes = await imageFile.arrayBuffer();
      const validation = validateImageUpload(imageBytes, imageFile.name, {
        maxSizeBytes: 4.5 * 1024 * 1024,
        maxWidth: 4096,
        maxHeight: 4096,
        maxPixels: 16 * 1024 * 1024,
      });

      if (!validation.valid) {
        let errorKhmer = "រូបភាពមិនត្រឹមត្រូវ។";
        if (validation.code === "UNSUPPORTED_MEDIA_TYPE") {
          errorKhmer = "ប្រភេទឯកសារមិនត្រឹមត្រូវ។ សូមបញ្ចូលរូបភាព PNG, JPG, ឬ WEBP។";
        } else if (validation.code === "EMPTY_FILE") {
          errorKhmer = "ឯកសាររូបភាពទទេ។";
        } else if (validation.code === "PAYLOAD_TOO_LARGE") {
          errorKhmer = "រូបភាពមានទំហំធំពេក។";
        }

        return NextResponse.json<MathSolverError>(
          {
            ok: false,
            error: validation.error || "Invalid image",
            errorKhmer,
            details: validation.details,
            code: validation.code,
            retryable: false,
            requestId,
          },
          { status: validation.httpStatus }
        );
      }

      verifiedMimeType = validation.format;
    }

    // Server-side secret validation
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      return NextResponse.json<MathSolverError>(
        {
          ok: false,
          error: "Gemini API key not configured",
          errorKhmer: "មិនទាន់កំណត់ Gemini API Key។ សូមកំណត់ GEMINI_API_KEY ក្នុង Environment Variables។",
          code: "PROVIDER_NOT_CONFIGURED",
          retryable: false,
          requestId,
        },
        { status: 503 }
      );
    }

    const extractionStart = Date.now();

    // Language instruction
    let languageInstruction = "";
    if (outputLanguage === "khmer") {
      languageInstruction = "Provide ALL explanations in Khmer. Use standard mathematical notation for equations.";
    } else if (outputLanguage === "khmer_english") {
      languageInstruction = "Provide explanations in Khmer with English mathematical terms where appropriate.";
    } else {
      languageInstruction = "Provide explanations in English.";
    }

    const questionFilter = solveQuestions && solveQuestions !== "all"
      ? `\nOnly solve these specific questions: ${solveQuestions}. Extract all problems but only solve the specified ones.`
      : "";

    const verificationNote = includeVerification
      ? "\nIf any existing answer is visible or provided, verify it and report whether it is correct or incorrect."
      : "\nDo not perform answer verification even if existing answers are visible.";

    // Build Gemini request parts
    const genAI = new GoogleGenerativeAI(apiKey);
    const parts: Part[] = [];

    if (action === "extract") {
      parts.push({ text: EXTRACTION_ONLY_PROMPT });
      if (imageBytes) {
        const base64Image = Buffer.from(imageBytes).toString("base64");
        parts.push({
          inlineData: {
            mimeType: verifiedMimeType,
            data: base64Image,
          },
        });
      }
      parts.push({
        text: "Extract all mathematical problems from this image without guessing. Return the result in valid JSON.",
      });
    } else if (action === "solve" && problemTextInput) {
      // Solving specific user-reviewed problem text
      const SOLVE_TEXT_PROMPT = `You are an expert Khmer mathematics tutor and problem solver with deep expertise in both Khmer-language education and mathematical reasoning.

Solve the following mathematical problem step by step with clear explanations in Khmer:

PROBLEM TO SOLVE:
${problemTextInput}

${
  existingAnswerInput
    ? `EXISTING STUDENT ANSWER TO VERIFY:\n${existingAnswerInput}\nVerify whether this answer is correct or incorrect. If incorrect, pinpoint the exact incorrect step and provide the correction.`
    : "No existing student answer to verify."
}

CRITICAL RULES:
1. Provide complete step-by-step reasoning in Khmer ("យើងមានសមីការ៖", "ជំហានទី១៖", "ជំហានទី២៖", "ដូច្នេះ ចម្លើយគឺ៖").
2. State final answer clearly in "finalAnswer".
3. Provide verification/check work in "verification".
4. ANTI-HALLUCINATION: If the problem contains ambiguous or missing numbers, DO NOT GUESS. Mark them in "ambiguousParts".
5. Set confidence: "high" (>90%), "medium" (70-90%), "low" (<70%).

${languageInstruction}${verificationNote}

Return a valid JSON object matching the standard schema.`;

      parts.push({ text: SOLVE_TEXT_PROMPT });
      if (imageBytes) {
        // Also attach image for visual context (diagrams, geometry) if available
        const base64Image = Buffer.from(imageBytes).toString("base64");
        parts.push({
          inlineData: {
            mimeType: verifiedMimeType,
            data: base64Image,
          },
        });
      }
      parts.push({
        text: "Solve this problem now and return valid JSON following the schema.",
      });
    } else {
      // Default full extract + solve (used by automated tests and direct flow)
      parts.push({ text: FULL_SOLVER_PROMPT });
      if (imageBytes) {
        const base64Image = Buffer.from(imageBytes).toString("base64");
        parts.push({
          inlineData: {
            mimeType: verifiedMimeType,
            data: base64Image,
          },
        });
      }
      parts.push({
        text: `Extract all mathematical problems from this image and solve them step by step.\n${languageInstruction}${verificationNote}${questionFilter}\n\nReturn the result as a valid JSON object following the schema in the system prompt.`,
      });
    }

    // Try candidate models with failover
    const candidateModels = [
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
      "gemini-3.8-flash",
    ];

    let responseText = "";
    let selectedModel = "";
    const OVERALL_BUDGET_MS = 50000;
    const PER_MODEL_TIMEOUT_MS = 15000;

    for (const modelName of candidateModels) {
      const elapsed = Date.now() - overallStartTime;
      if (elapsed >= OVERALL_BUDGET_MS) break;

      for (let attempt = 0; attempt < 2; attempt++) {
        const currentElapsed = Date.now() - overallStartTime;
        const remaining = OVERALL_BUDGET_MS - currentElapsed;
        if (remaining <= 3000) break;

        const timeout = Math.min(PER_MODEL_TIMEOUT_MS, remaining);

        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.15,
            },
          });

          const result = await withTimeout(
            model.generateContent({ contents: [{ role: "user", parts }] }),
            timeout,
            `Model ${modelName} timed out after ${timeout}ms`
          );

          const candidateText = result.response.text()?.trim();
          if (candidateText) {
            const cleaned = candidateText
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```$/i, "")
              .trim();
            if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
              responseText = cleaned;
              selectedModel = modelName;
              break;
            }
          }
        } catch (err: unknown) {
          const safeMsg = (err instanceof Error ? err.message : String(err))
            .replace(/key=[A-Za-z0-9_.-]+/gi, "key=[REDACTED]")
            .slice(0, 200);
          console.warn(
            JSON.stringify({
              requestId,
              event: "math_solver_attempt_failed",
              model: modelName,
              attempt,
              error: safeMsg,
            })
          );

          if (!isTransientError(err)) break;
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
          }
        }
      }

      if (responseText) break;
    }

    const extractionEnd = Date.now();

    if (!responseText) {
      const totalElapsed = Date.now() - overallStartTime;
      const isTimeout = totalElapsed >= OVERALL_BUDGET_MS - 3000;

      return NextResponse.json<MathSolverError>(
        {
          ok: false,
          error: isTimeout ? "Processing timed out" : "AI service temporarily busy",
          errorKhmer: isTimeout
            ? "ការដំណើរការលើសកំណត់ពេល។ សូមព្យាយាមម្ដងទៀត។"
            : "ម៉ាស៊ីនដោះស្រាយមិនអាចប្រើបានបណ្តោះអាសន្ន។ សូមព្យាយាមម្ដងទៀត។",
          code: isTimeout ? "UPSTREAM_TIMEOUT" : "MODEL_UNAVAILABLE",
          retryable: true,
          requestId,
        },
        { status: isTimeout ? 504 : 503 }
      );
    }

    // Parse response
    try {
      const parsed = JSON.parse(responseText);
      const totalMs = Date.now() - overallStartTime;

      let problems: MathSolverProblem[] = [];

      if (Array.isArray(parsed.problems)) {
        problems = parsed.problems.map((p: Record<string, unknown>, i: number) => ({
          id: (p.id as string) || `q${i + 1}`,
          extractedProblem:
            (p.extractedProblem as string) || (p.extracted_problem as string) || problemTextInput || "",
          extractedAnswer:
            (p.extractedAnswer as string) || (p.extracted_answer as string) || existingAnswerInput || undefined,
          answerStatus: (p.answerStatus as string) || (p.answer_status as string) || undefined,
          answerStatusKhmer: (p.answerStatusKhmer as string) || (p.answer_status_khmer as string) || undefined,
          incorrectStep: (p.incorrectStep as string) || (p.incorrect_step as string) || undefined,
          correctedStep: (p.correctedStep as string) || (p.corrected_step as string) || undefined,
          solution: (p.solution as string) || "",
          solutionKhmer: (p.solutionKhmer as string) || (p.solution_khmer as string) || "",
          finalAnswer: (p.finalAnswer as string) || (p.final_answer as string) || "",
          verification: (p.verification as string) || "",
          confidence: ((p.confidence as string) || "medium") as "high" | "medium" | "low",
          confidenceKhmer: (p.confidenceKhmer as string) || (p.confidence_khmer as string) || "កម្រិតទំនុកចិត្តមធ្យម",
          ambiguousParts: (p.ambiguousParts as string[]) || (p.ambiguous_parts as string[]) || [],
          reviewSuggestions: (p.reviewSuggestions as string[]) || (p.review_suggestions as string[]) || [],
        }));
      } else if (parsed.extractedProblem || parsed.solution || problemTextInput) {
        problems = [
          {
            id: "q1",
            extractedProblem:
              parsed.extractedProblem || parsed.extracted_problem || problemTextInput || "",
            extractedAnswer:
              parsed.extractedAnswer || parsed.extracted_answer || existingAnswerInput || undefined,
            answerStatus: parsed.answerStatus || parsed.answer_status || undefined,
            answerStatusKhmer: parsed.answerStatusKhmer || parsed.answer_status_khmer || undefined,
            incorrectStep: parsed.incorrectStep || parsed.incorrect_step || undefined,
            correctedStep: parsed.correctedStep || parsed.corrected_step || undefined,
            solution: parsed.solution || "",
            solutionKhmer: parsed.solutionKhmer || parsed.solution_khmer || "",
            finalAnswer: parsed.finalAnswer || parsed.final_answer || "",
            verification: parsed.verification || "",
            confidence: parsed.confidence || "medium",
            confidenceKhmer: parsed.confidenceKhmer || parsed.confidence_khmer || "កម្រិតទំនុកចិត្តមធ្យម",
            ambiguousParts: parsed.ambiguousParts || parsed.ambiguous_parts || [],
            reviewSuggestions: parsed.reviewSuggestions || parsed.review_suggestions || [],
          },
        ];
      }

      const response: MathSolverResponse = {
        problems,
        totalProblems: problems.length,
        outputLanguage: outputLanguage as "khmer" | "khmer_english" | "english",
        extractedText: parsed.extractedText || parsed.extracted_text || problemTextInput || "",
        imageQualityNote: parsed.imageQualityNote || parsed.image_quality_note,
        inferenceProvider: `Serverless Gemini Vision (${selectedModel})`,
        mode: action as "extract" | "solve" | "full",
        timings: {
          preprocessMs: Math.round(extractionStart - overallStartTime),
          extractionMs: Math.round((extractionEnd - extractionStart) * 0.3),
          reasoningMs: Math.round((extractionEnd - extractionStart) * 0.7),
          totalMs,
        },
      };

      console.info(
        JSON.stringify({
          requestId,
          event: "math_solver_success",
          selectedModel,
          action,
          totalProblems: problems.length,
          durationMs: totalMs,
        })
      );

      return NextResponse.json<MathSolverResponse>(response, { status: 200 });
    } catch (parseErr) {
      console.error("[math-solver] JSON parse error:", parseErr, "Response:", responseText.slice(0, 500));
      return NextResponse.json<MathSolverError>(
        {
          ok: false,
          error: "Malformed response from AI model",
          errorKhmer: "ម៉ាស៊ីន AI បញ្ចេញទិន្នន័យមិនត្រូវតាមទម្រង់។ សូមព្យាយាមម្ដងទៀត។",
          code: "PARSE_ERROR",
          retryable: true,
          requestId,
        },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    console.error("[/api/math-solver] Unhandled error:", err);
    return NextResponse.json<MathSolverError>(
      {
        ok: false,
        error: "Internal server error",
        errorKhmer: "ម៉ាស៊ីនមេជួបបញ្ហាផ្ទៃក្នុង។ សូមព្យាយាមម្ដងទៀត។",
        code: "SERVER_ERROR",
        retryable: true,
        requestId,
      },
      { status: 500 }
    );
  }
}
