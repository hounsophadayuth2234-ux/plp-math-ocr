import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { getSessionUser } from "@/lib/auth-session";
import { ActivityTracker } from "@/lib/activity-tracker";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { validateImageUpload } from "@/lib/image-upload-validator";
import {
  PersistentCacheStore,
  buildDeterministicCacheKey,
  computeExactSha256,
  computeNormalizedImageSha256,
  computeNormalizedTextFingerprint,
} from "@/lib/persistent-cache-store";
import {
  buildModule04Artifacts,
  uploadArtifactsToGoogleDrive,
} from "@/lib/gemini-cache-artifacts";
import {
  renderCanonicalSolutionHtml,
  renderCanonicalSolutionPlainText,
} from "@/lib/math-solution-html";
import {
  verifyMathResultDeterministically,
  DeterministicVerificationResult,
} from "@/lib/deterministic-math-verifier";
import {
  type StructuredCalculation,
  type VerticalCalculation,
  type MathSolution,
  detectAndBuildStructuredCalculation,
  verticalToStructuredCalculation,
  structuredToVerticalCalculation,
  toMathSolution,
} from "@/lib/column-calculation";
import { validateVerticalCalculation } from "@/lib/math-solution-html";

export const maxDuration = 60;

// -----------------------------------------------------------
// Response and Error Interfaces
// -----------------------------------------------------------
export type SolverMode = "solve" | "generate" | "verify";
export type DetailLevel = "short" | "step_by_step" | "teacher";
export type GradeLevel =
  | "auto"
  | "grade_1"
  | "grade_2"
  | "grade_3"
  | "grade_4"
  | "grade_5"
  | "grade_6";

export interface VisualInterpretation {
  recognizedObjects: string; // វត្ថុដែលបានស្គាល់ (fruits, toys, dots, shapes, place-value blocks, fractions)
  objectCount: string; // ចំនួនវត្ថុ
  arrangement?: string; // របៀបរៀបចំ: ជួរដេក / ជួរឈរ / ជាក្រុម / ចែកជាចំណែក
  interpretedOperation: string; // ប្រមាណវិធីដែលបានបកស្រាយ (e.g., 4 × 6 = 24, 12 ÷ 3 = 4, 8 - 3 = 5, 3/4)
  confidence: "high" | "medium" | "low";
  confidenceKhmer: string;
  possibleAlternatives?: string[];
}

export interface MathSolverProblem {
  id: string;
  mode?: SolverMode;
  extractedProblem: string;
  visualInterpretation?: VisualInterpretation;
  inferredGrade?: string;
  inferredGradeKhmer?: string;
  // Mode 2: Generate Full Solution fields
  given?: string; // អ្វីដែលគេឱ្យ
  toFind?: string; // អ្វីដែលត្រូវរក
  formulas?: string; // រូបមន្តដែលត្រូវប្រើ
  // Mode 3: Verification fields
  extractedAnswer?: string;
  answerStatus?: "correct" | "incorrect" | "unverifiable";
  answerStatusKhmer?: string;
  incorrectStep?: string;
  errorExplanationKhmer?: string;
  correctedStep?: string;
  // Core solving & explanation
  solution?: string;
  solutionKhmer: string;
  alignedWorking?: string;
  verticalLines?: string[];
  finalAnswer?: string;
  verification?: string;
  deterministicResult?: DeterministicVerificationResult;
  structuredCalculation?: StructuredCalculation;
  verticalCalculations?: VerticalCalculation[];
  mathSolution?: MathSolution;
  confidence: "high" | "medium" | "low";
  confidenceKhmer: string;
  ambiguousParts?: string[];
  reviewSuggestions?: string[];
}

export interface MathSolverResponse {
  problems: MathSolverProblem[];
  totalProblems: number;
  outputLanguage: "khmer" | "khmer_english" | "english";
  solverMode: SolverMode;
  detailLevel?: DetailLevel;
  gradeLevel: GradeLevel;
  inferredGrade?: string;
  inferredGradeKhmer?: string;
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
  cached?: boolean;
  fromCache?: boolean;
  cacheKey?: string;
  driveFileIds?: Record<string, string>;
  driveLinks?: Record<string, string>;
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
// Grade Level Pedagogical Guidelines
// -----------------------------------------------------------
function getGradeGuidance(grade: GradeLevel): string {
  switch (grade) {
    case "grade_1":
    case "grade_2":
      return `Target Audience: ថ្នាក់ទី ១ និង ទី ២ (Grades 1–2 MoEYS Cambodian Primary Students)
- ប្រើឃ្លាខ្លីៗ ងាយយល់បំផុតសម្រាប់កុមារតូច។
- ផ្តោតលើ «ខ្ទង់រាយ» និង «ខ្ទង់ដប់» (ឬដល់ខ្ទង់រយ)។
- ការរាប់បន្ថែម ការបូកមានត្រាទុក ១ និងការដកមានខ្ចី ១ ដប់។
- ប្រើវត្ថុរាប់ជាក់ស្តែង (ផ្លែឈើ, ផ្កាយ, ចំណុច, ម្រាមដៃ, ប្រដាប់ក្មេងលេង)។
- ហាមប្រើពាក្យបច្ចេកទេសពិបាក ឬពិជគណិតស្មុគស្មាញ។`;

    case "grade_3":
    case "grade_4":
      return `Target Audience: ថ្នាក់ទី ៣ និង ទី ៤ (Grades 3–4 MoEYS Cambodian Primary Students)
- ពន្យល់ច្បាស់ៗតាមខ្ទង់ («ខ្ទង់រាយ», «ខ្ទង់ដប់», «ខ្ទង់រយ», «ខ្ទង់ពាន់», «ខ្ទង់ម៉ឺន»)។
- ការគុណតាមជួរឈរ (ផលគុណទី១, ផលគុណទី២) ដោយរំកិលតាមខ្ទង់។
- ការចែកជួរឈរ (តំណាងចែក, តួចែក, ផលចែក, សំណល់) តាមទម្រង់សៀវភៅគោលខ្មែរ (L-bracket / T-grid)។
- ប្រភាគសាមញ្ញ (ភាគយក, ភាគបែង), ចំនួនទសភាគដំបូង, រង្វាស់រង្វាល់ និងបរិមាត្រ។`;

    case "grade_5":
    case "grade_6":
      return `Target Audience: ថ្នាក់ទី ៥ និង ទី ៦ (Grades 5–6 MoEYS Cambodian Primary Students)
- គាំទ្រចំនួនទសភាគ (ដាក់ចំណុចទសភាគ ',' ឬ '.' ឱ្យត្រង់ជួរឈរគ្នា រវាងផ្នែកគត់ និងផ្នែកទសភាគ)។
- ប្រភាគ, ភាគរយ (%), អនុបាត, និងចំណោទពហុជំហានតាមទម្រង់សៀវភៅគោល (មាន «ប្រមាណវិធី» និង «របៀបឆ្លើយ» ដាច់ដោយឡែកយ៉ាងស្អាត)។
- ផ្ទៃក្រឡា និងមាឌធរណីមាត្រ ដោយពន្យល់រូបមន្តច្បាស់លាស់។
- សមីការលីនេអ៊ែរសាមញ្ញ និងការរក្សាសមភាពអង្គសងខាង។`;

    case "auto":
    default:
      return `Target Audience: ស្វ័យប្រវត្តិ (Auto-detect Grade 1-6 according to MoEYS standards)
- Carefully analyze problem complexity, visual representations, numbers, and operations.
- Determine the most appropriate Cambodian primary grade level: "ថ្នាក់ទី ១", "ថ្នាក់ទី ២", "ថ្នាក់ទី ៣", "ថ្នាក់ទី ៤", "ថ្នាក់ទី ៥", or "ថ្នាក់ទី ៦".
- Set "inferredGrade" (e.g. "grade_2") and "inferredGradeKhmer" (e.g. "ថ្នាក់ទី ២").
- Adjust the explanation tone, vocabulary, and methods strictly to match that MoEYS grade level.`;
  }
}

// -----------------------------------------------------------
// Gemini Vision Prompts
// -----------------------------------------------------------
const EXTRACTION_ONLY_PROMPT = `You are a mathematical document and visual problem analyzer specializing in Cambodian elementary school mathematics (Grades 1 to 6).

Your task is to:
1. Accurately transcribe any visible mathematical problem into "extractedProblem".
2. VISUAL PROBLEM UNDERSTANDING (CRITICAL):
   The image does NOT need to contain readable text! If the image depicts objects (fruits, toys, dots, blocks, animals), geometric shapes, charts, place-value blocks, fractions shown as shaded parts, or crossed-out items:
   - Identify visual objects, count them, and infer the intended math problem.
   - Example 1: 4 rows of 6 apples -> "៤ ជួរ មានផ្លែប៉ោម ៦ ក្នុងមួយជួរ (៤ × ៦)"
   - Example 2: 12 candies divided into 3 equal rings -> "ស្ករគ្រាប់ ១២ ចែកជា ៣ ក្រុមស្មើគ្នា (១២ ÷ ៣)"
   - Example 3: 8 stars with 3 crossed out -> "ផ្កាយ ៨ មាន ៣ ត្រូវបានគូសខ្វែង (៨ - ៣)"
   - Example 4: Circle divided into 4 parts with 3 shaded -> "ប្រភាគ ៣/៤"
   Fill the "visualInterpretation" block:
   {
     "recognizedObjects": "វត្ថុដែលបានស្គាល់",
     "objectCount": "ចំនួនសរុប និង របៀបរៀបចំ",
     "arrangement": "ជួរដេក / ជួរឈរ / ជាក្រុម / ចែកជាចំណែក",
     "interpretedOperation": "ប្រមាណវិធីដែលបានបកស្រាយ",
     "confidence": "high" | "medium" | "low",
     "confidenceKhmer": "កម្រិតទំនុកចិត្តខ្ពស់" | "កម្រិតទំនុកចិត្តមធ្យម" | "កម្រិតទំនុកចិត្តទាប",
     "possibleAlternatives": ["..."]
   }
3. If an existing student answer or handwritten work is visible, extract it into "extractedAnswer".
4. ANTI-HALLUCINATION & ZERO-GUESSING:
   If any number, count, sign, exponent, or diagram label is ambiguous or could have multiple interpretations, DO NOT GUESS. List in "ambiguousParts" and provide possible interpretations in "possibleAlternatives".
5. Set confidence: "high" (>90%), "medium" (70-90%), "low" (<70%).
6. Leave "solution", "solutionKhmer", "finalAnswer", and "verification" as empty strings for this extraction stage.

Return a valid JSON object matching the MathSolverResponse schema.`;

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
  if (
    /high demand|temporarily unavailable|service unavailable|overloaded|resource exhausted|rate limit|too many requests|quota|is not available/i.test(
      msg
    )
  )
    return true;
  if (/timeout|timed out|fetch failed|network|econnreset|econnrefused|socket hang up|abort/i.test(msg))
    return true;
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
    const solverMode = ((formData.get("solverMode") as string) || "solve").toLowerCase() as SolverMode; // "solve" | "generate" | "verify"
    const detailLevel = ((formData.get("detailLevel") as string) || "step_by_step").toLowerCase() as DetailLevel;
    const gradeLevel = ((formData.get("gradeLevel") as string) || "auto").toLowerCase() as GradeLevel;
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
          error: "No image or problem text provided",
          errorKhmer: "សូមបញ្ចូលរូបភាព ឬវាយបញ្ចូលអត្ថបទលំហាត់មុនចុចដំណើរការ។",
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

    const sessionUser = await getSessionUser(req);
    const userId = sessionUser?.id || (process.env.NODE_ENV === "test" ? "usr_test_default" : "usr_anonymous");
    const username = sessionUser?.username || "user";

    let exactImageSha256: string | undefined;
    let normalizedImageSha256: string | undefined;
    let inputFingerprint = "";

    if (imageBytes) {
      const buf = Buffer.from(imageBytes);
      exactImageSha256 = computeExactSha256(buf);
      normalizedImageSha256 = computeNormalizedImageSha256(buf);
      inputFingerprint = exactImageSha256;
    } else {
      const norm = computeNormalizedTextFingerprint(problemTextInput);
      inputFingerprint = norm.fingerprint;
    }

    const primaryModel = "gemini-flash-lite-latest";
    const promptVersion = "math_solver_v2.0";

    const cacheKey = buildDeterministicCacheKey({
      module: "module04_math_solver",
      userId,
      grade: gradeLevel,
      mode: solverMode,
      language: outputLanguage,
      inputFingerprint,
      options: {
        action,
        detailLevel,
        existingAnswer: existingAnswerInput.trim(),
        includeVerification,
        solveQuestions: solveQuestions || "",
      },
      modelName: primaryModel,
      promptVersion,
    });

    let cached = await PersistentCacheStore.get<MathSolverResponse>(cacheKey, userId);
    if (!cached && exactImageSha256) {
      cached = await PersistentCacheStore.lookupByContent<MathSolverResponse>({
        userId,
        module: "module04_math_solver",
        grade: gradeLevel,
        mode: solverMode,
        language: outputLanguage,
        modelName: primaryModel,
        promptVersion,
        exactImageSha256,
        normalizedImageSha256,
      });
    }

    if (cached) {
      console.info(
        JSON.stringify({
          requestId,
          event: "math_solver_cache_hit",
          cacheKey: cached.cacheKey,
          durationMs: Date.now() - overallStartTime,
        })
      );
      if (sessionUser) {
        ActivityTracker.recordActivity({
          userId: sessionUser.id,
          username: sessionUser.username,
          displayName: sessionUser.displayName,
          role: sessionUser.role,
          module: "04_math_solver",
          action: solverMode || "solve_problem",
          title: problemTextInput?.slice(0, 80) || imageFile?.name || "Khmer Math Solution (Cached)",
          details: { gradeLevel, solverMode, cached: true },
        }).catch(() => {});
      }

      return NextResponse.json<MathSolverResponse>(
        {
          ...cached.outputFields,
          cached: true,
          fromCache: true,
          cacheKey: cached.cacheKey,
          driveFileIds: cached.driveFileIds,
          driveLinks: cached.driveLinks,
          timings: {
            ...cached.outputFields.timings,
            totalMs: Date.now() - overallStartTime,
          },
        },
        { status: 200 }
      );
    }

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

    // Language & Grade guidance
    const gradeGuidance = getGradeGuidance(gradeLevel);
    const languageInstruction =
      outputLanguage === "khmer_english"
        ? "Provide explanations in Khmer with English mathematical terms where helpful."
        : outputLanguage === "english"
        ? "Provide explanations in English."
        : "Provide ALL explanations in natural, grammatically correct Khmer with proper Khmer diacritics and subscripts.";

    const questionFilter =
      solveQuestions && solveQuestions !== "all"
        ? `\nOnly solve these specific questions: ${solveQuestions}.`
        : "";

    // Build Gemini request parts
    const genAI = new GoogleGenerativeAI(apiKey);
    const parts: Part[] = [];

    // System prompt with visual mathematics and pedagogical constraints
    const SYSTEM_CORE = `You are a master Cambodian elementary mathematics educator (Grades 1 to 6) and visual problem reasoning engine.

GRADE LEVEL CONTEXT:
${gradeGuidance}

VISUAL UNDERSTANDING RULES (MANDATORY):
- Accurately solve mathematical problems.
- Understand visual math problems, typed Khmer numerals (០-៩), Arabic numerals (0-9), handwritten arithmetic, visual objects, fractions, and basic geometry.
- Images often contain NO text at all. You must infer the mathematical problem directly from visual patterns:
  1. Object Counting: counted fruits, toys, stars, dots, animals, place-value blocks.
  2. Visual Addition: combining two groups of objects.
  3. Visual Subtraction: crossing out objects or removing them from a set.
  4. Visual Multiplication: arrays of rows and columns (e.g. 4 rows of 6 objects = 4 × 6 = 24), repeated groups.
  5. Visual Division: equal sharing of objects into rings or sets (e.g. 12 objects in 3 groups = 12 ÷ 3 = 4).
  6. Fractions: geometric shapes divided into equal parts with shaded regions (e.g. circle with 3 out of 4 parts shaded = 3/4).
  7. Number Lines: jumps or intervals on a number line.
  8. Geometry & Measurement: labelled diagrams showing length, width, radius, angles, perimeter, or area.
  9. Ambiguity Invariant: If a visual layout has multiple valid interpretations, DO NOT GUESS. Note the possibilities in "possibleAlternatives" and ask user to confirm.

PLACE-VALUE ALIGNMENT FOR VERTICAL ARITHMETIC (MANDATORY):
When the problem is vertical arithmetic involving addition (+), subtraction (−), multiplication (×), or division (÷):
- Return place-value-aligned structured data in "verticalCalculations".
- Every digit must be represented individually in its own place-value cell/column.
- Every operator (+, −, ×, ÷) must be represented individually in its own operator column. Do not put the operator inside a digit cell.
- Carry values ("carry") and borrow values ("borrow") must be represented individually in dedicated rows.
- Every horizontal line must be represented as a separator row, never as guessed spaces.
- Explain each step in correct, age-appropriate Khmer.
- Never use random whitespace as the alignment mechanism.
- Never rely on proportional-font spacing.
- Never put multiple digits from one place-value column into one cell.
- Never put a whole number such as "431" into one cell.
- Never return application UI, debug information, API metadata, model details, request IDs, or diagnostics.

CAMBODIAN MoEYS PRIMARY TEXTBOOK TERMINOLOGY & FORMAT (MANDATORY):
- Terminology Rule: ALWAYS use primary textbook terms: «ខ្ទង់រាយ» (NEVER use «ខ្ទង់ឯកតា»), «ខ្ទង់ដប់», «ខ្ទង់រយ», «ខ្ទង់ពាន់», «ត្រាទុក», «ខ្ចី».
- Zero foreign script typos: NEVER use Thai characters (e.g. NEVER write ผลដក or ผลบวก; ALWAYS write purely Khmer: ផលដក, ផលបូក, ផលគុណ, ផលចែក).
- Division Form: Cambodian textbook vertical division uses an L-bracket / T-grid layout (Left: Dividend/តំណាងចែក with subtraction steps and Remainder/សំណល់; Right: Divisor/តួចែក in top-right box over Quotient/ផលចែក separated by a vertical border).

EXPLICIT ALIGNMENT RULES:
- For ៤៣១ + ៦៥: The ៦ goes under ៣ (tens column). The ៥ goes under ១ (ones column/ខ្ទង់រាយ). The ៤ stays under hundreds. The result ៤, ៩, ៦ stays under hundreds, tens, and ones respectively.
- For ៧៩៥ − ៥៤: The ៥ goes under ៩, ៤ goes under ៥. Result ៧, ៤, ១ under hundreds, tens, and ones respectively.
- For ៧០២ − ២៧៨: Handles borrowing rows (ones borrows from tens, tens from hundreds).
- For ២៤ × ៣: Partial products rows aligned by place value.
- For ៨៤ ÷ ៤: Division quotient and working steps aligned.
- For decimals (e.g. ១២.៥ + ៣.៧៥): Align decimal points in their own dedicated column.
- For fractions (e.g. ១/២ + ១/៤): Preserve numerator and denominator structure.
- Use Khmer minus "−" or ASCII "-" consistently.

STRUCTURED JSON SCHEMA:
If returning vertical calculations, include "verticalCalculations": [
  {
    "operation": "addition" | "subtraction" | "multiplication" | "division",
    "columns": ["hundreds", "tens", "ones"],
    "rows": [
      { "role": "operand", "operator": "", "cells": ["៤", "៣", "១"] },
      { "role": "operand", "operator": "+", "cells": ["០", "៦", "៥"] },
      { "role": "separator", "cells": ["", "", ""], "borderBottom": true },
      { "role": "result", "operator": "", "cells": ["៤", "៩", "៦"] }
    ]
  }
]

HTML TABLE STYLES (IF RETURNING HTML REPRESENTATION):
- Vertical arithmetic must be represented as a strict HTML table.
- Use one <td> per logical place-value cell with fixed width (e.g., style="width:36px; height:34px; text-align:center; vertical-align:middle;").
- Use one <td> for the operator column (e.g., style="width:36px; height:34px; text-align:center; vertical-align:middle;").
- Table style must include: style="border-collapse:collapse; font-family:monospace; font-size:18px; text-align:right;"
- Separator line must use: <tr class="separator-row"><td colspan="N" style="border-bottom:2px solid #000; height:6px;"></td></tr>
- Do NOT use <pre> as the primary alignment mechanism.
- Do NOT use repeated spaces for alignment.
- Do NOT use Tailwind classes or external CSS.
- Do NOT return <script>, onclick, onerror, iframes, forms, or unsafe HTML.

ZERO-GUESSING RULES:
- Never invent numbers or guess unreadable digits or signs.
- If any exponent, sign, denominator, or diagram label is unclear, flag in "ambiguousParts" and set confidence to "low".
- For vertical column calculations, format the aligned working in "alignedWorking".`;

    if (action === "extract") {
      parts.push({ text: EXTRACTION_ONLY_PROMPT });
      parts.push({ text: SYSTEM_CORE });
      if (imageBytes) {
        parts.push({
          inlineData: {
            mimeType: verifiedMimeType,
            data: Buffer.from(imageBytes).toString("base64"),
          },
        });
      }
      parts.push({
        text: "Transcribe or visually interpret this math problem now. Return valid JSON.",
      });
    } else if (solverMode === "generate") {
      // MODE 2: GENERATE FULL SOLUTION (Method only - STRICTLY NO FINAL ANSWER BLOCK)
      const GENERATE_PROMPT = `${SYSTEM_CORE}

MODE 2: “បង្កើតដំណោះស្រាយ” (Generate Solution - Method Only)
Detail Level Requested: "${detailLevel}"

${problemTextInput ? `PROBLEM STATEMENT:\n${problemTextInput}` : "Extract or visually infer the problem from the image."}

STRICT MODE 2 CONTRACT (CRITICAL):
- Purpose: Show the method only.
- Output MUST contain:
  1. "extractedProblem": Full problem statement in Khmer.
  2. "visualInterpretation": If visual-only or diagram-based, provide recognizedObjects, objectCount, arrangement, interpretedOperation.
  3. "given": អ្វីដែលគេឱ្យ (Given values/parameters).
  4. "toFind": អ្វីដែលត្រូវរក (Target quantity/variable).
  5. "formulas": រូបមន្តដែលត្រូវប្រើ (Mathematical formulas/theorems used).
  6. "solution": Step-by-step working without a standalone final answer.
  7. "solutionKhmer": Complete, pedagogical Khmer explanation matching the target grade. The explanation may end with the final calculation step, but do NOT add a separate answer block.
  8. "alignedWorking": Vertical column calculation layout if arithmetic, or fraction reduction steps.
  9. "inferredGrade" and "inferredGradeKhmer".
- Output MUST NOT contain:
  - DO NOT output a separate final answer section!
  - DO NOT output a standalone final numeric answer!
  - DO NOT output a "ចម្លើយចុងក្រោយ" block!
  - Keep "finalAnswer" as empty string ("").

${languageInstruction}

Return a valid JSON object matching the standard schema.`;

      parts.push({ text: GENERATE_PROMPT });
      if (imageBytes) {
        parts.push({
          inlineData: {
            mimeType: verifiedMimeType,
            data: Buffer.from(imageBytes).toString("base64"),
          },
        });
      }
      parts.push({
        text: `Generate the method-only educational solution now for Grade "${gradeLevel}". Return valid JSON.`,
      });
    } else if (solverMode === "verify") {
      // MODE 3: SOLVE + VERIFY (Both Method and Final Answer)
      const VERIFY_PROMPT = `${SYSTEM_CORE}

MODE 3: “ដោះស្រាយ + ផ្ទៀងផ្ទាត់” (Solve + Verify - Full Solution & Final Answer)

${problemTextInput ? `PROBLEM:\n${problemTextInput}` : "Extract or visually infer the problem from the image."}
${existingAnswerInput ? `STUDENT'S EXISTING ANSWER / WORK:\n${existingAnswerInput}` : "Extract the student's written answer from the image."}

STRICT MODE 3 CONTRACT:
- Purpose: Show BOTH answer and complete solution, and compare student's answer.
- Output MUST contain:
  1. "extractedProblem": Full problem statement.
  2. "formulas" / "given" / "toFind": Formal framework.
  3. "solution" and "solutionKhmer": Full pedagogical working.
  4. "alignedWorking": True vertical arithmetic with preserved newlines.
  5. "finalAnswer": Final verified answer.
  6. "verification": Verification calculation and mathematical proof.
  7. "extractedAnswer", "answerStatus" ("correct" | "incorrect" | "unverifiable"), "answerStatusKhmer", and if incorrect: "incorrectStep", "errorExplanationKhmer", "correctedStep".

${languageInstruction}

Return a valid JSON object.`;

      parts.push({ text: VERIFY_PROMPT });
      if (imageBytes) {
        parts.push({
          inlineData: {
            mimeType: verifiedMimeType,
            data: Buffer.from(imageBytes).toString("base64"),
          },
        });
      }
      parts.push({
        text: "Perform independent solving and student answer verification now. Return valid JSON.",
      });
    } else {
      // MODE 1: SOLVE PROBLEM (Answer Only - NO DETAILED METHOD)
      const SOLVE_PROMPT = `${SYSTEM_CORE}

MODE 1: “ដោះស្រាយលំហាត់” (Solve Problem - Answer Only)

${problemTextInput ? `PROBLEM TO SOLVE:\n${problemTextInput}` : "Extract or visually infer the problem from the image."}
${
  existingAnswerInput && includeVerification
    ? `EXISTING ANSWER TO VERIFY:\n${existingAnswerInput}`
    : ""
}

STRICT MODE 1 CONTRACT (CRITICAL):
- Purpose: Give the final answer ONLY.
- Output MUST contain:
  1. "extractedProblem": Extracted math problem statement.
  2. "finalAnswer": Clear, concise final answer (e.g. "៧៤១").
  3. "verification": Verification status / proof if available.
- Output MUST NOT contain:
  - DO NOT output step-by-step explanation! Keep "solution" and "solutionKhmer" empty ("").
  - DO NOT output pedagogical solution!
  - DO NOT output vertical working! Keep "alignedWorking" empty or null.
  - DO NOT output detailed formula explanation! Keep "formulas", "given", "toFind" empty.

${languageInstruction}${questionFilter}

Return a valid JSON object matching the standard schema.`;

      parts.push({ text: SOLVE_PROMPT });
      if (imageBytes) {
        parts.push({
          inlineData: {
            mimeType: verifiedMimeType,
            data: Buffer.from(imageBytes).toString("base64"),
          },
        });
      }
      parts.push({
        text: "Solve this problem now and return final answer only in valid JSON.",
      });
    }

    // Candidate models with failover
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

    // -----------------------------------------------------------
    // STAGE 2: Deterministic Verification & Math Engine
    // -----------------------------------------------------------
    try {
      const parsed = JSON.parse(responseText);
      const totalMs = Date.now() - overallStartTime;

      let rawProblems: Record<string, unknown>[] = [];
      if (Array.isArray(parsed.problems)) {
        rawProblems = parsed.problems;
      } else if (parsed.extractedProblem || parsed.solution || problemTextInput) {
        rawProblems = [parsed];
      }

      const inferredGradeGlobal =
        gradeLevel !== "auto"
          ? gradeLevel
          : (parsed.inferredGrade as string) ||
            (parsed.inferred_grade as string) ||
            "grade_3";
      const inferredGradeKhmerGlobal =
        inferredGradeGlobal === "grade_1"
          ? "ថ្នាក់ទី ១"
          : inferredGradeGlobal === "grade_2"
          ? "ថ្នាក់ទី ២"
          : inferredGradeGlobal === "grade_3"
          ? "ថ្នាក់ទី ៣"
          : inferredGradeGlobal === "grade_4"
          ? "ថ្នាក់ទី ៤"
          : inferredGradeGlobal === "grade_5"
          ? "ថ្នាក់ទី ៥"
          : inferredGradeGlobal === "grade_6"
          ? "ថ្នាក់ទី ៦"
          : "ថ្នាក់ទី ៣";

      const problems: MathSolverProblem[] = rawProblems.map((p, i) => {
        const id = (p.id as string) || `q${i + 1}`;
        const extractedProblem =
          (p.extractedProblem as string) ||
          (p.extracted_problem as string) ||
          problemTextInput ||
          "";
        let finalAnswer = (p.finalAnswer as string) || (p.final_answer as string) || "";
        const extractedAnswer =
          (p.extractedAnswer as string) ||
          (p.extracted_answer as string) ||
          existingAnswerInput ||
          undefined;

        // Visual interpretation block
        const rawVi = (p.visualInterpretation || p.visual_interpretation) as
          | Record<string, unknown>
          | undefined;
        let visualInterpretation: VisualInterpretation | undefined = undefined;
        if (rawVi && (rawVi.recognizedObjects || rawVi.recognized_objects || rawVi.interpretedOperation)) {
          visualInterpretation = {
            recognizedObjects:
              (rawVi.recognizedObjects as string) ||
              (rawVi.recognized_objects as string) ||
              "វត្ថុក្នុងរូបភាព",
            objectCount:
              (rawVi.objectCount as string) || (rawVi.object_count as string) || "",
            arrangement:
              (rawVi.arrangement as string) || undefined,
            interpretedOperation:
              (rawVi.interpretedOperation as string) ||
              (rawVi.interpreted_operation as string) ||
              extractedProblem,
            confidence:
              ((rawVi.confidence as string) || "medium") as "high" | "medium" | "low",
            confidenceKhmer:
              (rawVi.confidenceKhmer as string) ||
              (rawVi.confidence_khmer as string) ||
              "កម្រិតទំនុកចិត្តមធ្យម",
            possibleAlternatives:
              (rawVi.possibleAlternatives as string[]) ||
              (rawVi.possible_alternatives as string[]) ||
              undefined,
          };
        }

        // STAGE 2: Deterministic verification check
        let deterministicResult: DeterministicVerificationResult | undefined = undefined;
        let alignedWorking =
          (p.alignedWorking as string) || (p.aligned_working as string) || undefined;
        let verticalLines: string[] | undefined = Array.isArray(p.verticalLines)
          ? p.verticalLines
          : Array.isArray(p.vertical_lines)
          ? p.vertical_lines
          : undefined;

        if (action !== "extract" && (extractedProblem || finalAnswer)) {
          try {
            deterministicResult = verifyMathResultDeterministically(
              extractedProblem,
              finalAnswer,
              {
                existingStudentAnswer: extractedAnswer,
                gradeLevel,
                solverMode,
              }
            );

            // Always prioritize deterministic vertical lines and aligned working if available
            if (deterministicResult.verticalLines && deterministicResult.verticalLines.length > 0) {
              verticalLines = deterministicResult.verticalLines;
              alignedWorking = deterministicResult.alignedWorking || deterministicResult.verticalLines.join("\n");
            } else if (deterministicResult.alignedWorking) {
              alignedWorking = deterministicResult.alignedWorking;
              verticalLines = alignedWorking.split("\n");
            }
          } catch (detErr) {
            console.warn("Deterministic verifier error:", detErr);
          }
        }

        // If verticalLines is still missing but alignedWorking has newlines, split it
        if (!verticalLines && alignedWorking && alignedWorking.includes("\n")) {
          verticalLines = alignedWorking.split("\n");
        } else if (verticalLines && !alignedWorking) {
          alignedWorking = verticalLines.join("\n");
        }

        const ambiguousParts =
          (p.ambiguousParts as string[]) || (p.ambiguous_parts as string[]) || [];
        const reviewSuggestions =
          (p.reviewSuggestions as string[]) || (p.review_suggestions as string[]) || [];

        // If deterministic check flags a discrepancy, add to review suggestions
        if (deterministicResult && deterministicResult.status === "discrepancy") {
          reviewSuggestions.push(
            `ប្រព័ន្ធគណនាសុក្រឹតបានរកឃើញភាពខុសគ្នា៖ ចម្លើយគណនាគឺ ${deterministicResult.computedAnswerKhmer}`
          );
        }

        // Pedagogical Khmer explanation for elementary math
        let solutionKhmer = (p.solutionKhmer as string) || (p.solution_khmer as string) || "";
        if (
          deterministicResult?.detailedKhmerExplanation &&
          (gradeLevel === "auto" ||
            gradeLevel === "grade_1" ||
            gradeLevel === "grade_2" ||
            gradeLevel === "grade_3" ||
            gradeLevel === "grade_6" ||
            solutionKhmer.length < 120 ||
            !solutionKhmer.includes("ខ្ទង់"))
        ) {
          solutionKhmer = deterministicResult.detailedKhmerExplanation;
        }

        // If finalAnswer was missing or empty, use deterministic computed answer
        if (!finalAnswer && deterministicResult?.computedAnswerKhmer) {
          finalAnswer = deterministicResult.computedAnswerKhmer;
        }

        // STRICT THREE-MODE RESPONSE CONTRACT ENFORCEMENT
        let responseSolution = (p.solution as string) || "";
        let responseSolutionKhmer = solutionKhmer;
        let responseAlignedWorking = alignedWorking;
        let responseVerticalLines = verticalLines;
        let responseFinalAnswer = finalAnswer;
        let responseGiven = (p.given as string) || undefined;
        let responseToFind = (p.toFind as string) || (p.to_find as string) || undefined;
        let responseFormulas = (p.formulas as string) || undefined;

        if (solverMode === "solve") {
          // MODE 1: ANSWER ONLY
          // MUST NOT contain step-by-step explanation, pedagogical solution, vertical working, or detailed formulas
          responseSolution = "";
          responseSolutionKhmer = "";
          responseAlignedWorking = undefined;
          responseVerticalLines = undefined;
          responseGiven = undefined;
          responseToFind = undefined;
          responseFormulas = undefined;
        } else if (solverMode === "generate") {
          // MODE 2: METHOD ONLY
          // MUST NOT contain a separate final answer section, a standalone final numeric answer, or a "ចម្លើយចុងក្រោយ" block
          responseFinalAnswer = "";
        }
        // MODE 3 retains all fields

        const probBase = {
          id,
          mode: solverMode,
          extractedProblem,
          visualInterpretation,
          inferredGrade: (p.inferredGrade as string) || inferredGradeGlobal,
          inferredGradeKhmer: (p.inferredGradeKhmer as string) || inferredGradeKhmerGlobal,
          given: responseGiven,
          toFind: responseToFind,
          formulas: responseFormulas,
          extractedAnswer,
          answerStatus:
            (p.answerStatus === "correct" ||
            p.answerStatus === "incorrect" ||
            p.answerStatus === "unverifiable"
              ? p.answerStatus
              : p.answer_status === "correct" ||
                p.answer_status === "incorrect" ||
                p.answer_status === "unverifiable"
              ? p.answer_status
              : undefined) as "correct" | "incorrect" | "unverifiable" | undefined,
          answerStatusKhmer:
            (p.answerStatusKhmer as string) || (p.answer_status_khmer as string) || undefined,
          incorrectStep: (p.incorrectStep as string) || (p.incorrect_step as string) || undefined,
          errorExplanationKhmer:
            (p.errorExplanationKhmer as string) ||
            (p.error_explanation_khmer as string) ||
            undefined,
          correctedStep: (p.correctedStep as string) || (p.corrected_step as string) || undefined,
          solution: responseSolution,
          solutionKhmer: responseSolutionKhmer,
          alignedWorking: responseAlignedWorking,
          verticalLines: responseVerticalLines,
          finalAnswer: responseFinalAnswer,
          verification: (p.verification as string) || "",
          deterministicResult,
        };

        // Resolve vertical calculations and canonical MathSolution
        let structuredCalc: StructuredCalculation | undefined = undefined;
        let verticalCalculations: VerticalCalculation[] | undefined = undefined;

        if (solverMode !== "solve") {
          // Check if model returned valid verticalCalculations
          const modelVerts = (p.verticalCalculations || p.vertical_calculations) as any[];
          if (Array.isArray(modelVerts) && modelVerts.length > 0) {
            const validVerts: VerticalCalculation[] = [];
            for (const v of modelVerts) {
              const valRes = validateVerticalCalculation(v);
              if (valRes.valid) {
                validVerts.push(v);
              }
            }
            if (validVerts.length > 0) {
              verticalCalculations = validVerts;
              structuredCalc = verticalToStructuredCalculation(validVerts[0]);
            }
          }

          // Fallback to deterministic calculation or detection
          if (!structuredCalc) {
            structuredCalc =
              deterministicResult?.structuredCalculation ||
              detectAndBuildStructuredCalculation(
                extractedProblem,
                finalAnswer,
                responseVerticalLines
              ) ||
              undefined;

            if (structuredCalc) {
              verticalCalculations = [structuredToVerticalCalculation(structuredCalc)];
            }
          }
        }

        const mathSolution = toMathSolution(
          {
            ...probBase,
            structuredCalculation: structuredCalc,
            verticalCalculations,
          },
          { solverMode }
        );

        return {
          ...probBase,
          structuredCalculation: structuredCalc,
          verticalCalculations: mathSolution.verticalCalculations,
          mathSolution,
          confidence: ((p.confidence as string) || "medium") as "high" | "medium" | "low",
          confidenceKhmer:
            (p.confidenceKhmer as string) ||
            (p.confidence_khmer as string) ||
            "កម្រិតទំនុកចិត្តមធ្យម",
          ambiguousParts,
          reviewSuggestions,
        };
      });

      const response: MathSolverResponse = {
        problems,
        totalProblems: problems.length,
        outputLanguage: outputLanguage as "khmer" | "khmer_english" | "english",
        solverMode,
        detailLevel: solverMode === "generate" ? detailLevel : undefined,
        gradeLevel,
        inferredGrade: inferredGradeGlobal,
        inferredGradeKhmer: inferredGradeKhmerGlobal,
        extractedText: parsed.extractedText || parsed.extracted_text || problemTextInput || "",
        imageQualityNote: parsed.imageQualityNote || parsed.image_quality_note,
        inferenceProvider: `Serverless Gemini Vision (${selectedModel}) + Stage 2 Deterministic Verifier`,
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
          solverMode,
          gradeLevel,
          inferredGrade: inferredGradeGlobal,
          totalProblems: problems.length,
          durationMs: totalMs,
        })
      );

      // Save durable artifacts to Google Drive
      const solutionHtml = problems.map((p) => renderCanonicalSolutionHtml(p)).join("\n<hr/>\n");
      const solutionText = problems.map((p) => renderCanonicalSolutionPlainText(p)).join("\n\n---\n\n");

      const artifacts = buildModule04Artifacts({
        username,
        originalImage: imageBytes
          ? {
              buffer: Buffer.from(imageBytes),
              filename: imageFile?.name || "problem.png",
              mimeType: verifiedMimeType,
            }
          : undefined,
        problemText: problemTextInput,
        solutionText,
        solutionHtml,
      });

      const uploadResult = await uploadArtifactsToGoogleDrive(userId, artifacts);

      await PersistentCacheStore.set<MathSolverResponse>({
        cacheKey,
        userId,
        module: "module04_math_solver",
        grade: gradeLevel,
        mode: solverMode,
        language: outputLanguage,
        normalizedInputFingerprint: inputFingerprint,
        exactImageSha256,
        normalizedImageSha256,
        normalizedQuestionText: problemTextInput.trim(),
        modelName: selectedModel,
        promptVersion,
        outputFields: response,
        driveFileIds: uploadResult.driveFileIds,
        driveLinks: uploadResult.driveLinks,
        mimeTypes: uploadResult.mimeTypes,
        timestamps: {
          createdAt: Date.now(),
          cachedAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
        processingStatus: uploadResult.allSucceeded ? "completed" : "partial",
        source: "gemini",
      });

      response.cached = false;
      response.fromCache = false;
      response.cacheKey = cacheKey;
      response.driveFileIds = uploadResult.driveFileIds;
      response.driveLinks = uploadResult.driveLinks;
      if (sessionUser) {
        ActivityTracker.recordActivity({
          userId: sessionUser.id,
          username: sessionUser.username,
          displayName: sessionUser.displayName,
          role: sessionUser.role,
          module: "04_math_solver",
          action: solverMode || "solve_problem",
          title: problemTextInput?.slice(0, 80) || imageFile?.name || "Khmer Math Solution",
          details: { gradeLevel, solverMode, finalAnswer: response.problems?.[0]?.finalAnswer },
        }).catch(() => {});
      }

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
