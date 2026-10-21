import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { validateImageUpload } from "@/lib/image-upload-validator";
import {
  verifyMathResultDeterministically,
  DeterministicVerificationResult,
} from "@/lib/deterministic-math-verifier";
import {
  type StructuredCalculation,
  detectAndBuildStructuredCalculation,
} from "@/lib/column-calculation";

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
      return `Target Audience: ថ្នាក់ទី ១ (Grade 1 Cambodian Students)
- Use extremely simple, welcoming Khmer suitable for 6-7 year olds.
- Rely on visual object counting (fruits, toys, dots, animals, fingers).
- Explain addition (+) as putting objects together and subtraction (-) as taking objects away or crossing them out.
- Do not use complex algebraic symbols or advanced terminology.
- Numbers typically within 1 to 20 or 100.`;

    case "grade_2":
      return `Target Audience: ថ្នាក់ទី ២ (Grade 2 Cambodian Students)
- Use simple, concrete Khmer.
- Support addition and subtraction with and without regrouping (ខ្ទង់ដប់, ខ្ទង់រយ).
- Explain multiplication as repeated addition and rows × columns arrays.
- Explain division as equal sharing into groups.
- Address word problems involving everyday objects and basic riel/currency.`;

    case "grade_3":
      return `Target Audience: ថ្នាក់ទី ៣ (Grade 3 Cambodian Students)
- Explain vertical and horizontal column calculations with carrying (ត្រាទុក) and borrowing (ខ្ចី).
- Focus on place values (រាយ, ដប់, រយ, ពាន់, ម៉ឺន).
- Multiplication tables up to 10×10 and 2-3 digit multiplication.
- Division with remainders and introduction to basic fractions (ភាគបែង, ភាគយក).
- Basic measurements, perimeter of rectangles/squares.`;

    case "grade_4":
      return `Target Audience: ថ្នាក់ទី ៤ (Grade 4 Cambodian Students)
- Fractions: comparison, equal parts, addition/subtraction with same/different denominators.
- Decimals: place value, alignment of decimal points.
- Standard long division with check (ចែកដាច់ និង មានសំណល់).
- Geometric properties: angles, perimeter, and area (ផ្ទៃក្រឡា) of rectangles, triangles.
- Units and unit conversion (m, cm, mm, kg, g, l, ml).`;

    case "grade_5":
      return `Target Audience: ថ្នាក់ទី ៥ (Grade 5 Cambodian Students)
- Multi-step word problems involving fractions, mixed numbers, and decimals.
- Percentages (%) and basic ratios/proportions.
- Area and volume calculations with formulas explained conceptually.
- Explain WHY each formula is applied before calculating.`;

    case "grade_6":
      return `Target Audience: ថ្នាក់ទី ៦ (Grade 6 Cambodian Students / Primary School Graduation)
- Single-variable linear equations and maintaining balance on both sides.
- Complex fractions, percentages, speed-distance-time problems, ratios.
- Comprehensive geometry (area, perimeter, surface area, volume, angle calculation).
- Explain mathematical rationale and rigorous verification steps.`;

    case "auto":
    default:
      return `Target Audience: ស្វ័យប្រវត្តិ (Auto-detect Grade 1-6)
- Carefully analyze the problem complexity, visual representations, and notation.
- Determine the most appropriate Cambodian primary grade level: "ថ្នាក់ទី ១", "ថ្នាក់ទី ២", "ថ្នាក់ទី ៣", "ថ្នាក់ទី ៤", "ថ្នាក់ទី ៥", or "ថ្នាក់ទី ៦".
- Set "inferredGrade" (e.g. "grade_2") and "inferredGradeKhmer" (e.g. "ថ្នាក់ទី ២").
- Adjust the explanation tone, vocabulary, and methods strictly to match that inferred grade.`;
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
        (parsed.inferredGrade as string) ||
        (parsed.inferred_grade as string) ||
        (gradeLevel === "auto" ? "grade_3" : gradeLevel);
      const inferredGradeKhmerGlobal =
        (parsed.inferredGradeKhmer as string) ||
        (parsed.inferred_grade_khmer as string) ||
        (inferredGradeGlobal === "grade_1"
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
          : "ថ្នាក់ទី ៣");

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

        return {
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
          structuredCalculation:
            solverMode === "solve"
              ? undefined
              : deterministicResult?.structuredCalculation ||
                detectAndBuildStructuredCalculation(
                  extractedProblem,
                  finalAnswer,
                  responseVerticalLines
                ) ||
                undefined,
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
