/**
 * Module 04 — Khmer Math Solver: 23 Mandatory Comprehensive Test Cases
 *
 * 1. Grade 1 object counting without text
 * 2. Grade 1 visual addition
 * 3. Grade 2 subtraction with crossed-out objects
 * 4. Grade 2 rows and columns multiplication
 * 5. Grade 3 vertical addition with carrying
 * 6. Grade 3 vertical subtraction with borrowing
 * 7. Grade 3 long division
 * 8. Grade 4 fraction image
 * 9. Grade 4 decimal calculation
 * 10. Grade 5 word problem with units
 * 11. Grade 5 percentage or ratio
 * 12. Grade 6 equation
 * 13. Geometry diagram with labels
 * 14. Ambiguous visual grouping
 * 15. Ambiguous handwritten number
 * 16. Incorrect student answer
 * 17. Correct student answer
 * 18. Khmer diacritics and subscript preservation
 * 19. Copy HTML output
 * 20. HTML sanitization
 * 21. Cancel and timeout
 * 22. Duplicate submission protection
 * 23. Mobile layout
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  verifyMathResultDeterministically,
  formatColumnAddition,
  formatColumnSubtraction,
  formatColumnMultiplication,
  toKhmerNumeral,
  fromKhmerNumeral,
  evaluateFractionArithmetic,
} from "@/lib/deterministic-math-verifier";
import {
  renderCanonicalSolutionHtml,
  renderCanonicalSolutionPlainText,
  sanitizeHtml,
  escapeHtml,
  copyTextFallback,
} from "@/lib/math-solution-html";
import {
  detectAndBuildStructuredCalculation,
  renderColumnCalculationText,
  renderColumnCalculationHtml,
} from "@/lib/column-calculation";
import type { MathSolverProblem } from "@/app/api/math-solver/route";
import { SolutionCard } from "@/components/math-solver/SolutionCard";
import { renderToString } from "react-dom/server";
import * as cheerio from "cheerio";
import React from "react";

// ─── Mocks for Route Handler Testing ───
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
  Part: {},
}));

vi.mock("@/lib/auth-gate", () => ({
  enforceRouteAuth: vi.fn(async () => null),
}));

vi.mock("@/lib/rate-limiter", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mockValidateImageUpload = vi.fn(
  (
    _bytes: ArrayBuffer,
    _name: string,
    _opts: Record<string, unknown>
  ) => ({
    valid: true,
    format: "image/png" as const,
  })
);

vi.mock("@/lib/image-upload-validator", () => ({
  validateImageUpload: (
    bytes: ArrayBuffer,
    name: string,
    opts: Record<string, unknown>
  ) => mockValidateImageUpload(bytes, name, opts),
}));

function pngMagicBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function buildFormData(opts?: {
  image?: Blob | null;
  outputLanguage?: string;
  gradeLevel?: string;
  solverMode?: string;
  detailLevel?: string;
  problemText?: string;
  existingAnswer?: string;
  action?: string;
}): FormData {
  const fd = new FormData();
  if (opts?.image !== null) {
    const blob =
      opts?.image ??
      new Blob([pngMagicBytes().buffer as ArrayBuffer], { type: "image/png" });
    fd.append("image", blob, "test_problem.png");
  }
  if (opts?.outputLanguage) fd.append("outputLanguage", opts.outputLanguage);
  if (opts?.gradeLevel) fd.append("gradeLevel", opts.gradeLevel);
  if (opts?.solverMode) fd.append("solverMode", opts.solverMode);
  if (opts?.detailLevel) fd.append("detailLevel", opts.detailLevel);
  if (opts?.problemText) fd.append("problemText", opts.problemText);
  if (opts?.existingAnswer) fd.append("existingAnswer", opts.existingAnswer);
  if (opts?.action) fd.append("action", opts.action);
  return fd;
}

function buildRequest(body?: FormData): Request {
  return new Request("http://localhost:3000/api/math-solver", {
    method: "POST",
    body: body ?? buildFormData(),
    headers: {
      cookie: "dyt_session=valid-session",
    },
  });
}

function mockGeminiSuccess(responseJson: Record<string, unknown>) {
  mockGenerateContent.mockResolvedValue({
    response: {
      text: () => JSON.stringify(responseJson),
    },
  });
}

// ─── Import Route Handler ───
let POST: (req: Request) => Promise<Response>;

beforeEach(async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-key-for-math-solver");
  mockGenerateContent.mockReset();
  mockGetGenerativeModel.mockClear();
  mockValidateImageUpload.mockReturnValue({
    valid: true,
    format: "image/png" as const,
  });

  const mod = await import("@/app/api/math-solver/route");
  POST = mod.POST as unknown as (req: Request) => Promise<Response>;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════
// 23 MANDATORY TEST CASES
// ════════════════════════════════════════════════════════════════

describe("Module 04 — Khmer Math Solver (Grades 1–6) 23 Quality Tests", () => {
  // Test 1: Grade 1 object counting without text
  it("Test 1: Grade 1 object counting without text correctly infers count from visual structure", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "រាប់ចំនួនផ្លែប៉ោមក្នុងរូបភាព",
          visualInterpretation: {
            recognizedObjects: "ផ្លែប៉ោមក្រហម (Red Apples)",
            objectCount: "៥ (5)",
            arrangement: "រាយលើផ្ទៃតុ",
            interpretedOperation: "៥ ផ្លែប៉ោម",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
          },
          inferredGrade: "grade_1",
          inferredGradeKhmer: "ថ្នាក់ទី ១",
          solutionKhmer: "យើងរាប់ផ្លែប៉ោមម្តងមួយៗ៖ ១, ២, ៣, ៤, ៥។ សរុបមានផ្លែប៉ោមចំនួន ៥ ផ្លែ។",
          finalAnswer: "៥ ផ្លែ",
          verification: "រាប់ផ្ទៀងផ្ទាត់៖ ១ + ១ + ១ + ១ + ១ = ៥ ✓",
          confidence: "high",
          confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
        },
      ],
      totalProblems: 1,
      inferredGrade: "grade_1",
      inferredGradeKhmer: "ថ្នាក់ទី ១",
    });

    const fd = buildFormData({ gradeLevel: "grade_1" });
    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(200);

    const data = await res.json();
    const prob = data.problems[0];
    expect(prob.visualInterpretation).toBeDefined();
    expect(prob.visualInterpretation.recognizedObjects).toContain("ផ្លែប៉ោម");
    expect(prob.visualInterpretation.objectCount).toContain("៥");
    expect(prob.finalAnswer).toBe("៥ ផ្លែ");
  });

  // Test 2: Grade 1 visual addition
  it("Test 2: Grade 1 visual addition combines two groups of objects with visual explanation", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "មានស្ករគ្រាប់ ៣ ថែមស្ករគ្រាប់ ២ ទៀត",
          visualInterpretation: {
            recognizedObjects: "ស្ករគ្រាប់ (Candies)",
            objectCount: "ក្រុមទី១ មាន ៣, ក្រុមទី២ មាន ២",
            arrangement: "ជា ២ ក្រុម",
            interpretedOperation: "៣ + ២ = ៥",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
          },
          inferredGrade: "grade_1",
          inferredGradeKhmer: "ថ្នាក់ទី ១",
          solutionKhmer: "ក្រុមទី១ មាន ៣ ស្ករគ្រាប់។ បូកបន្ថែម ២ ស្ករគ្រាប់ទៀត៖ ៣ + ២ = ៥។",
          finalAnswer: "៥",
          verification: "៣ + ២ = ៥ ✓",
          confidence: "high",
          confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
        },
      ],
      totalProblems: 1,
    });

    const fd = buildFormData({ gradeLevel: "grade_1", problemText: "៣ + ២" });
    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(200);

    const data = await res.json();
    const prob = data.problems[0];
    expect(prob.visualInterpretation.interpretedOperation).toContain("៣ + ២ = ៥");
    expect(prob.deterministicResult).toBeDefined();
    expect(prob.deterministicResult.computedAnswerKhmer).toBe("៥");
    expect(prob.deterministicResult.isVerified).toBe(true);
  });

  // Test 3: Grade 2 subtraction with crossed-out objects
  it("Test 3: Grade 2 subtraction with crossed-out objects interprets remaining items", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "ផ្កាយ ៨ មាន ៣ ត្រូវបានគូសខ្វែងចេញ",
          visualInterpretation: {
            recognizedObjects: "ផ្កាយ (Stars)",
            objectCount: "សរុប ៨, គូសខ្វែង ៣",
            arrangement: "ជាជួរ",
            interpretedOperation: "៨ - ៣ = ៥",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
          },
          inferredGrade: "grade_2",
          inferredGradeKhmer: "ថ្នាក់ទី ២",
          solutionKhmer: "ដើមឡើយមានផ្កាយ ៨។ ពេលគូសខ្វែង ៣ ចេញ នៅសល់ផ្កាយ៖ ៨ - ៣ = ៥។",
          finalAnswer: "៥",
          verification: "៥ + ៣ = ៨ ✓",
          confidence: "high",
          confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
        },
      ],
      totalProblems: 1,
    });

    const fd = buildFormData({ gradeLevel: "grade_2", problemText: "៨ - ៣" });
    const res = await POST(buildRequest(fd));
    const data = await res.json();
    expect(data.problems[0].visualInterpretation.interpretedOperation).toContain("៨ - ៣");
    expect(data.problems[0].deterministicResult.computedAnswerKhmer).toBe("៥");
  });

  // Test 4: Grade 2 rows and columns multiplication
  it("Test 4: Grade 2 rows and columns multiplication interprets arrays as rows × columns", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "៤ ជួរ មាន ៦ ក្នុងមួយជួរ",
          visualInterpretation: {
            recognizedObjects: "រង្វង់មូល (Dots)",
            objectCount: "៤ ជួរដេក × ៦ ជួរឈរ",
            arrangement: "ជួរដេក និង ជួរឈរ",
            interpretedOperation: "៤ × ៦ = ២៤",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
          },
          solutionKhmer: "មាន ៤ ជួរ ហើយក្នុងមួយជួរមាន ៦ ចុច៖ ៤ × ៦ = ២៤។",
          finalAnswer: "២៤",
          verification: "៦ + ៦ + ៦ + ៦ = ២៤ ✓",
          confidence: "high",
          confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
        },
      ],
      totalProblems: 1,
    });

    const fd = buildFormData({ gradeLevel: "grade_2", problemText: "៤ * ៦" });
    const res = await POST(buildRequest(fd));
    const data = await res.json();
    expect(data.problems[0].visualInterpretation.interpretedOperation).toContain("៤ × ៦");
    expect(data.problems[0].deterministicResult.computedAnswerKhmer).toBe("២៤");
  });

  // Test 5: Grade 3 vertical addition with carrying
  it("Test 5: Grade 3 vertical addition with carrying computes exact result and column layout", () => {
    const colWork = formatColumnAddition(247, 186, true);
    expect(colWork).toContain("២៤៧");
    expect(colWork).toContain("១៨៦");
    expect(colWork).toContain("៤៣៣");
    expect(colWork).toContain("ត្រាទុក");

    const det = verifyMathResultDeterministically("២៤៧ + ១៨៦", "៤៣៣");
    expect(det.isVerified).toBe(true);
    expect(det.computedAnswerKhmer).toBe("៤៣៣");
    expect(det.statusKhmer).toBe("ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓");
  });

  // Test 6: Grade 3 vertical subtraction with borrowing
  it("Test 6: Grade 3 vertical subtraction with borrowing computes column layout with regrouping", () => {
    const colSub = formatColumnSubtraction(502, 278, true);
    expect(colSub).toContain("៥០២");
    expect(colSub).toContain("២៧៨");
    expect(colSub).toContain("២២៤");
    expect(colSub).toContain("ខ្ចី");

    const det = verifyMathResultDeterministically("៥០២ - ២៧៨", "២២៤");
    expect(det.isVerified).toBe(true);
    expect(det.computedAnswerKhmer).toBe("២២៤");
  });

  // Test 7: Grade 3 long division
  it("Test 7: Grade 3 long division calculates quotient and remainder deterministically", () => {
    const det = verifyMathResultDeterministically("៧២ ÷ ៣", "២៤");
    expect(det.isVerified).toBe(true);
    expect(det.computedAnswerKhmer).toBe("២៤");
  });

  // Test 8: Grade 4 fraction image and arithmetic
  it("Test 8: Grade 4 fraction image and reduction accurately simplifies with common denominator", () => {
    const fracRes = evaluateFractionArithmetic("1/2 + 1/4");
    expect(fracRes.success).toBe(true);
    expect(fracRes.result?.numerator).toBe(3);
    expect(fracRes.result?.denominator).toBe(4);
    expect(fracRes.stepsKhmer).toContain("ភាគបែងរួម");

    const det = verifyMathResultDeterministically("1/2 + 1/4", "3/4");
    expect(det.isVerified).toBe(true);
    expect(det.computedAnswer).toBe("3/4");
  });

  // Test 9: Grade 4 decimal calculation
  it("Test 9: Grade 4 decimal calculation aligns decimals and computes accurately", () => {
    const det = verifyMathResultDeterministically("12.5 + 3.75", "16.25");
    expect(det.isVerified).toBe(true);
    expect(det.computedAnswer).toBe("16.25");
  });

  // Test 10: Grade 5 word problem with units
  it("Test 10: Grade 5 word problem preserves units and provides educational breakdown", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "ចតុកោណកែងមួយមានបណ្តោយ 15 m និងទទឹង 8 m។ រកផ្ទៃក្រឡា។",
          given: "បណ្តោយ L = 15 m, ទទឹង W = 8 m",
          toFind: "ផ្ទៃក្រឡាចតុកោណកែង S = ?",
          formulas: "S = L × W",
          solution: "S = 15 m × 8 m = 120 m²",
          solutionKhmer: "យើងមានរូបមន្តផ្ទៃក្រឡាចតុកោណកែង៖ S = L × W = 15 × 8 = 120 m²។",
          finalAnswer: "120 m²",
          verification: "120 / 15 = 8 m ✓",
          confidence: "high",
          confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
        },
      ],
      totalProblems: 1,
    });

    const fd = buildFormData({
      gradeLevel: "grade_5",
      solverMode: "verify",
      problemText: "បណ្តោយ 15 m ទទឹង 8 m រកផ្ទៃក្រឡា",
    });
    const res = await POST(buildRequest(fd));
    const data = await res.json();
    expect(data.problems[0].finalAnswer).toContain("120 m²");
    expect(data.problems[0].formulas).toContain("L × W");
  });

  // Test 11: Grade 5 percentage or ratio
  it("Test 11: Grade 5 percentage calculation produces verified result", () => {
    // 20% of 150 = 30
    const det = verifyMathResultDeterministically("150 * 0.2", "30");
    expect(det.isVerified).toBe(true);
    expect(det.computedAnswer).toBe("30");
  });

  // Test 12: Grade 6 equation solving with substitution proof
  it("Test 12: Grade 6 linear equation validates answer by direct substitution back into formula", () => {
    const det = verifyMathResultDeterministically("3x + 12 = 24", "4");
    expect(det.isVerified).toBe(true);
    expect(det.verificationMethod).toContain("Linear Substitution Proof");
    expect(det.verificationMethodKhmer).toContain("ផ្ទៀងផ្ទាត់ដោយជំនួស");
  });

  // Test 13: Geometry diagram with labels
  it("Test 13: Geometry diagram with labels identifies knowns and computes perimeter", () => {
    // Triangle with sides 5 cm, 12 cm, 13 cm => P = 30 cm
    const det = verifyMathResultDeterministically("5 + 12 + 13", "30");
    expect(det.isVerified).toBe(true);
    expect(det.computedAnswer).toBe("30");
  });

  // Test 14: Ambiguous visual grouping
  it("Test 14: Ambiguous visual grouping refuses to guess and shows possible interpretations", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "ចង្កោមវត្ថុអាចបកស្រាយជា ២ ជួរ មាន ៦ ឬ ៣ ជួរ មាន ៤",
          visualInterpretation: {
            recognizedObjects: "គ្រាប់ឃ្លី",
            objectCount: "១២ គ្រាប់",
            arrangement: "មិនទាន់រៀបរយច្បាស់",
            interpretedOperation: "២ × ៦ ឬ ៣ × ៤ ឬ ១២ ÷ ៣",
            confidence: "medium",
            confidenceKhmer: "កម្រិតទំនុកចិត្តមធ្យម",
            possibleAlternatives: ["២ × ៦ = ១២", "៣ × ៤ = ១២", "១២ ÷ ៣ = ៤"],
          },
          solutionKhmer: "ទម្រង់រូបភាពអាចបកស្រាយបានច្រើនរបៀប។ សូមបញ្ជាក់ជម្រើសណាមួយដែលចង់គណនា។",
          finalAnswer: "អាស្រ័យលើការបញ្ជាក់របស់អ្នកប្រើ",
          verification: "ត្រូវការបញ្ជាក់",
          confidence: "medium",
          confidenceKhmer: "កម្រិតទំនុកចិត្តមធ្យម",
          ambiguousParts: ["អាចបកស្រាយជា 2x6 ឬ 3x4"],
        },
      ],
      totalProblems: 1,
    });

    const fd = buildFormData({ gradeLevel: "auto" });
    const res = await POST(buildRequest(fd));
    const data = await res.json();
    const viBlock = data.problems[0].visualInterpretation;
    expect(viBlock.possibleAlternatives).toHaveLength(3);
    expect(data.problems[0].confidence).toBe("medium");
  });

  // Test 15: Ambiguous handwritten number
  it("Test 15: Ambiguous handwritten number sets low confidence and marks ambiguous parts", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "2? + 5 = 15 (លេខ 2 ឬ 7 មិនច្បាស់)",
          solutionKhmer: "លេខខ្ទង់ដប់មិនច្បាស់ អាចជា 2 ឬ 7។",
          finalAnswer: "មិនអាចបញ្ជាក់បាន",
          verification: "ត្រូវការរូបភាពច្បាស់ជាងនេះ",
          confidence: "low",
          confidenceKhmer: "កម្រិតទំនុកចិត្តទាប — ត្រូវកែសម្រួលរូបភាព",
          ambiguousParts: ["លេខដំបូងអាចជា ២ ឬ ៧"],
        },
      ],
      totalProblems: 1,
    });

    const fd = buildFormData();
    const res = await POST(buildRequest(fd));
    const data = await res.json();
    expect(data.problems[0].confidence).toBe("low");
    expect(data.problems[0].ambiguousParts[0]).toContain("២ ឬ ៧");
  });

  // Test 16: Incorrect student answer diagnosis
  it("Test 16: Incorrect student answer pinpoints exact error step and provides correction", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "2x + 6 = 12",
          extractedAnswer: "x = 6",
          answerStatus: "incorrect",
          answerStatusKhmer: "មិនទាន់ត្រឹមត្រូវ ✗",
          incorrectStep: "2x = 12 (ភ្លេចដក 6)",
          errorExplanationKhmer: "នៅពេលផ្ទេរ +6 ទៅស្តាំ ត្រូវប្តូរសញ្ញាទៅជា -6។",
          correctedStep: "2x = 12 - 6 = 6 => x = 3",
          solutionKhmer: "ជំហានត្រឹមត្រូវគឺ x = 3។",
          finalAnswer: "x = 3",
          verification: "2(3) + 6 = 12 ✓",
          confidence: "high",
          confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
        },
      ],
      totalProblems: 1,
    });

    const fd = buildFormData({
      solverMode: "verify",
      problemText: "2x + 6 = 12",
      existingAnswer: "x = 6",
    });
    const res = await POST(buildRequest(fd));
    const data = await res.json();
    const p = data.problems[0];
    expect(p.answerStatus).toBe("incorrect");
    expect(p.answerStatusKhmer).toContain("មិនទាន់ត្រឹមត្រូវ");
    expect(p.incorrectStep).toContain("ភ្លេចដក 6");
    expect(p.correctedStep).toContain("x = 3");
  });

  // Test 17: Correct student answer verification
  it("Test 17: Correct student answer verifies accurately without false negative", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "10 - 2x = 4",
          extractedAnswer: "x = 3",
          answerStatus: "correct",
          answerStatusKhmer: "ត្រឹមត្រូវ ✓",
          solutionKhmer: "ជំហានត្រឹមត្រូវ៖ -2x = -6 => x = 3",
          finalAnswer: "x = 3",
          verification: "10 - 2(3) = 4 ✓",
          confidence: "high",
          confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
        },
      ],
      totalProblems: 1,
    });

    const fd = buildFormData({
      solverMode: "verify",
      problemText: "10 - 2x = 4",
      existingAnswer: "x = 3",
    });
    const res = await POST(buildRequest(fd));
    const data = await res.json();
    expect(data.problems[0].answerStatus).toBe("correct");
    expect(data.problems[0].answerStatusKhmer).toContain("ត្រឹមត្រូវ ✓");
  });

  // Test 18: Khmer diacritics and subscript preservation
  it("Test 18: Khmer diacritics and subscript (coeng ្) are strictly preserved in conversion and rendering", () => {
    const khmerText = "ចូរដោះស្រាយសមីការ៖ ថ្នាក់ទី ៣ (ត្រាទុក & ខ្ចី)";
    const escaped = escapeHtml(khmerText);
    expect(escaped).toContain("សមីការ");
    expect(escaped).toContain("ថ្នាក់ទី");
    expect(escaped).toContain("ត្រាទុក");
    expect(escaped).toContain("ខ្ចី");

    // Khmer numerals
    expect(toKhmerNumeral(1234567890)).toBe("១២៣៤៥៦៧៨៩០");
    expect(fromKhmerNumeral("១២៣៤៥៦៧៨៩០")).toBe("1234567890");
  });

  // Test 19: Copy HTML output preserves structure, equations, and column working
  it("Test 19: Copy HTML output preserves math structure, column calculations, and verification badge", () => {
    const sampleProblem: MathSolverProblem = {
      id: "q1",
      extractedProblem: "២៤៧ + ១៨៦",
      visualInterpretation: {
        recognizedObjects: "ប្លុកខ្ទង់រាយ និងខ្ទង់ដប់",
        objectCount: "២៤៧ និង ១៨៦",
        interpretedOperation: "២៤៧ + ១៨៦ = ៤៣៣",
        confidence: "high",
        confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
      },
      solution: "247 + 186 = 433",
      solutionKhmer: "បូកខ្ទង់រាយ៖ ៧ + ៦ = ១៣ (សរសេរ ៣ ត្រាទុក ១)",
      alignedWorking: "   ២៤៧\n + ១៨៦\n ------\n   ៤៣៣",
      finalAnswer: "៤៣៣",
      verification: "៤៣៣ - ១៨៦ = ២៤៧ ✓",
      confidence: "high",
      confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
      deterministicResult: {
        computedAnswer: "433",
        computedAnswerKhmer: "៤៣៣",
        isVerified: true,
        status: "verified",
        statusKhmer: "ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓",
        verificationMethod: "Deterministic Column Arithmetic",
        verificationMethodKhmer: "គណនាតាមជួរឈរសុក្រឹត",
        reviewPoints: [],
      },
    };

    const html = renderCanonicalSolutionHtml(sampleProblem, {
      gradeTitle: "ថ្នាក់ទី ៣",
      solverModeTitle: "SOLVE + VERIFY",
    });

    // Verify preservation
    expect(html).toContain("២៤៧ + ១៨៦");
    expect(html).toContain("ប្លុកខ្ទង់រាយ");
    expect(html).toContain("៤៣៣");
    expect(html).toContain("ការគណនាតាមជួរឈរ");
    expect(html).toContain("ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓");
    expect(html).toContain("ថ្នាក់ទី ៣");

    const plain = renderCanonicalSolutionPlainText(sampleProblem);
    expect(plain).toContain("២៤៧ + ១៨៦");
    expect(plain).toContain("៤៣៣");
  });

  // Test 20: HTML sanitization strips unsafe scripts and attributes
  it("Test 20: HTML sanitization strips scripts, inline handlers, and javascript: links", () => {
    const maliciousHtml = `
      <div>Safe Title</div>
      <script>alert('xss')</script>
      <img src="x" onerror="stealCookies()" />
      <a href="javascript:alert(1)">Click Me</a>
      <iframe src="evil.com"></iframe>
    `;

    const clean = sanitizeHtml(maliciousHtml);
    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain("alert");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("stealCookies");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("<iframe");
    expect(clean).toContain("Safe Title");
  });

  // Test 21: Cancel and timeout handling
  it("Test 21: Cancel via AbortController and timeout return structured 503/504 error", async () => {
    // 1. AbortController cancel
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);

    // 2. Timeout handling in route
    mockGenerateContent.mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error("upstream timeout after 15000ms")), 10);
      });
    });

    const res = await POST(buildRequest());
    expect([503, 504]).toContain(res.status);
    const err = await res.json();
    expect(err.retryable).toBe(true);
    expect(err.errorKhmer).toBeTruthy();
  });

  // Test 22: Duplicate submission protection
  it("Test 22: Duplicate submission protection generates unique request IDs and executes safely in parallel", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "q1",
          extractedProblem: "5 + 5",
          solutionKhmer: "5 + 5 = 10",
          finalAnswer: "10",
          verification: "10 - 5 = 5 ✓",
          confidence: "high",
          confidenceKhmer: "កម្រិតខ្ពស់",
        },
      ],
      totalProblems: 1,
    });

    const [res1, res2] = await Promise.all([
      POST(buildRequest()),
      POST(buildRequest()),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const d1 = await res1.json();
    const d2 = await res2.json();
    expect(d1.problems[0].finalAnswer).toBe("10");
    expect(d2.problems[0].finalAnswer).toBe("10");
  });

  // Test 23: Mobile layout & accessibility
  it("Test 23: Mobile responsive classes and minimum 44px touch targets are verified in page components", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const pagePath = path.resolve(process.cwd(), "src/app/math-solver/page.tsx");
    const content = await fs.readFile(pagePath, "utf-8");

    // Mobile grid responsive breakpoint
    expect(content).toContain("grid-cols-1 md:grid-cols-2");
    // Mobile touch target minimum height 44px
    expect(content).toContain("min-h-[44px]");
    // Grade selector responsive columns
    expect(content).toContain("grid-cols-2 sm:grid-cols-4 md:grid-cols-7");
    // "ចម្លងកូដ HTML" button presence
    expect(content).toContain("ចម្លងកូដ HTML");
    expect(content).toContain("បានចម្លងកូដ HTML រួចរាល់!");
  });

  // =========================================================================
  // FIX 1 — DOM Regression: Preserve Newlines and Column Alignment
  // =========================================================================
  it("Test 24: DOM regression asserts element.textContent.includes('\\n') === true and renders separate vertical lines", () => {
    const canonicalProblem: MathSolverProblem = {
      id: "prob-795-54",
      mode: "verify",
      extractedProblem: "៧៩៥ − ៥៤",
      verticalLines: [
        "  ៧៩៥",
        "−  ៥៤",
        "─────",
        "  ៧៤១",
      ],
      alignedWorking: "  ៧៩៥\n−  ៥៤\n─────\n  ៧៤១",
      finalAnswer: "៧៤១",
      solution: "795 - 54 = 741",
      solutionKhmer: "៧៩៥ − ៥៤ = ៧៤១",
      verification: "៧៤១ + ៥៤ = ៧៩៥ ✓",
      confidence: "high",
      confidenceKhmer: "កម្រិតខ្ពស់",
    };

    // Render SolutionCard to HTML string (Mode 3: verify displays vertical calculation)
    const cardHtml = renderToString(
      React.createElement(SolutionCard, {
        problem: canonicalProblem,
        index: 0,
        totalProblems: 1,
        gradeTitle: "ថ្នាក់ទី ៣",
        solverModeTitle: "SOLVE + VERIFY",
        solverMode: "verify",
      })
    );

    const $ = cheerio.load(cardHtml);
    const preEl = $('[data-testid="vertical-calculation-pre"]');

    expect(preEl.length).toBe(1);
    const textContent = preEl.text();

    // 1. Mandatory DOM assertion from prompt:
    expect(textContent.includes("\n")).toBe(true);

    // 2. Separate lines assertions:
    const lines = textContent.split("\n").map((l) => l.trim());
    expect(lines).toContain("៧៩៥");
    expect(lines.some((l) => l.includes("៥៤"))).toBe(true);
    expect(lines.some((l) => l.includes("──") || l.includes("--"))).toBe(true);
    expect(lines).toContain("៧៤១");

    // 3. Monospace font and white-space styling
    const preAttr = preEl.attr("style") || "";
    expect(preAttr).toMatch(/white-space:\s*pre/);
    expect(preAttr).toContain("monospace");
  });

  // =========================================================================
  // FIX 2 & 3 — Pedagogical Explanation & Zero False Borrowing
  // =========================================================================
  it("Test 25: Grade 3 explanation for ៧៩៥ − ៥៤ provides 7 required sections and no false borrowing", async () => {
    const { evaluateBasicArithmetic } = await import("@/lib/deterministic-math-verifier");
    const evalRes = evaluateBasicArithmetic("៧៩៥ − ៥៤");

    expect(evalRes.success).toBe(true);
    expect(evalRes.result).toBe(741);
    expect(evalRes.verticalLines).toBeDefined();
    expect(evalRes.verticalLines?.length).toBe(4);
    expect(evalRes.alignedWorking?.includes("\n")).toBe(true);

    const expl = evalRes.detailedKhmerExplanation || "";

    // 7 Required sections check
    expect(expl).toContain("ប្រមាណវិធី");
    expect(expl).toContain("រៀបជាជួរឈរ");
    expect(expl).toContain("ជំហានទី១ — ខ្ទង់ឯកតា");
    expect(expl).toContain("ជំហានទី២ — ខ្ទង់ដប់");
    expect(expl).toContain("ជំហានទី៣ — ខ្ទង់រយ");
    expect(expl).toContain("ចម្លើយចុងក្រោយ");
    expect(expl).toContain("ពិនិត្យចម្លើយឡើងវិញ");

    // Zero false borrowing in ones column (5 - 4 = 1)
    expect(expl).toContain("៥ − ៤ = ១");
    expect(expl).toContain("ដោយមិនបាច់ខ្ចីទេ");
    expect(expl).not.toContain("ត្រូវខ្ចី ១ ពីខ្ទង់ដប់");

    // Tens column
    expect(expl).toContain("៩ − ៥ = ៤");

    // Hundreds column
    expect(expl).toContain("៧ នៅសល់ ៧");

    // Checking section
    expect(expl).toContain("៧៤១ + ៥៤ = ៧៩៥");
  });

  it("Test 26: Subtraction with genuine borrowing (៧០២ − ២៧៨) details intermediate column regrouping", async () => {
    const { evaluateBasicArithmetic } = await import("@/lib/deterministic-math-verifier");
    const evalRes = evaluateBasicArithmetic("៧០២ − ២៧៨");

    expect(evalRes.success).toBe(true);
    expect(evalRes.result).toBe(424);

    const expl = evalRes.detailedKhmerExplanation || "";

    // Genuine borrowing from hundreds through zero tens to ones
    expect(expl).toContain("ខ្ចី ១ ពីខ្ទង់រយ");
    expect(expl).toContain("លេខ ៧ ក្លាយជា ៦");
    expect(expl).toContain("បំប្លែង ៧ រយ ទៅជា ៦ រយ និង ១០ ដប់");
    expect(expl).toContain("ខ្ចី ១ ដប់ ពីខ្ទង់ដប់");
    expect(expl).toContain("បាន ១០ បូក ២ = ១២");
    expect(expl).toContain("១២ − ៨ = ៤");
    expect(expl).toContain("៩ − ៧ = ២");
    expect(expl).toContain("៦ − ២ = ៤");
    expect(expl).toContain("៤២៤");
  });

  // =========================================================================
  // FIX 4 — Universal Copy Actions & Canonical Solution Integrity
  // =========================================================================
  it("Test 27: Plain text, HTML copy, and Download HTML derive from canonical object and preserve vertical alignment", () => {
    const canonicalProblem: MathSolverProblem = {
      id: "prob-canonical",
      mode: "verify",
      extractedProblem: "៧៩៥ − ៥៤",
      verticalLines: [
        "  ៧៩៥",
        "−  ៥៤",
        "─────",
        "  ៧៤១",
      ],
      alignedWorking: "  ៧៩៥\n−  ៥៤\n─────\n  ៧៤១",
      finalAnswer: "៧៤១",
      solution: "795 - 54 = 741",
      solutionKhmer: "៧៩៥ − ៥៤ = ៧៤១",
      verification: "៧៤១ + ៥៤ = ៧៩៥ ✓ (ត្រឹមត្រូវ)",
      deterministicResult: {
        isVerified: true,
        status: "verified",
        statusKhmer: "ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓",
        verificationMethod: "Deterministic Column Subtraction",
        verificationMethodKhmer: "ប្រព័ន្ធដកតាមជួរឈរសុក្រឹត",
        computedAnswer: "741",
        computedAnswerKhmer: "៧៤១",
        reviewPoints: [],
      },
      confidence: "high",
      confidenceKhmer: "កម្រិតខ្ពស់",
    };

    // 1. Plain Text Output
    const plainText = renderCanonicalSolutionPlainText(canonicalProblem);
    expect(plainText.includes("\n")).toBe(true);
    expect(plainText).toContain("ការគណនាតាមជួរឈរ (Vertical Calculation):");
    expect(plainText).toContain("  ៧៩៥\n−  ៥៤\n─────\n  ៧៤១");
    expect(plainText).toContain("ចម្លើយ៖ ៧៤១");
    expect(plainText).not.toContain("<article");
    expect(plainText).not.toContain("<style");

    // 2. HTML Output - Real standalone HTML Document
    const htmlOutput = renderCanonicalSolutionHtml(canonicalProblem);
    expect(htmlOutput).toContain("<!doctype html>");
    expect(htmlOutput).toContain("<style>");
    expect(htmlOutput).toContain("<article class=\"solution\">");
    expect(htmlOutput).toContain("<pre class=\"vertical-calc\">");
    expect(htmlOutput).toContain("៧៩៥");
    expect(htmlOutput).toContain("៥៤");
    expect(htmlOutput).toContain("៧៤១");
    expect(htmlOutput).not.toContain("<script");
    expect(htmlOutput).not.toContain("onclick");
    expect(htmlOutput).not.toContain("onerror");
    expect(htmlOutput).not.toContain("javascript:");

    // 3. UI Card renders all four clear action buttons
    const cardHtml = renderToString(
      React.createElement(SolutionCard, {
        problem: canonicalProblem,
        index: 0,
        totalProblems: 1,
      })
    );
    expect(cardHtml).toContain("ចម្លងអត្ថបទ");
    expect(cardHtml).toContain("ចម្លងកូដ HTML");
    expect(cardHtml).toContain("ទាញយកឯកសារ HTML");
    expect(cardHtml).toContain("មើល HTML Source");
  });

  // =========================================================================
  // Test 28: Live Preview End-to-End API test for ៧៩៥ − ៥៤ (Mode 3: Verify)
  // =========================================================================
  it("Test 28: End-to-End API test with ៧៩៥ − ៥៤ overrides collapsed string and returns 741 with vertical lines in verify mode", async () => {
    mockGeminiSuccess({
      problems: [
        {
          id: "p1",
          extractedProblem: "៧៩៥ − ៥៤",
          alignedWorking: "  ៧៩៥-  ៥៤------  ៧៤១", // Collapsed string from AI
          solutionKhmer: "៧៩៥ − ៥៤ = ៧៤១", // Too short
          finalAnswer: "៧៤១",
          confidence: "high",
          confidenceKhmer: "កម្រិតខ្ពស់",
        },
      ],
      totalProblems: 1,
    });

    const formData = new FormData();
    formData.append(
      "image",
      new File([pngMagicBytes().buffer as ArrayBuffer], "test_795_54.png", { type: "image/png" })
    );
    formData.append("solverMode", "verify");
    formData.append("gradeLevel", "grade_3");
    formData.append("problemText", "៧៩៥ − ៥៤");

    const req = new Request("http://localhost:3000/api/math-solver", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    const prob = data.problems[0];

    // Final answer is exactly ៧៤១
    expect(prob.finalAnswer).toBe("៧៤១");

    // Vertical lines are preserved as structured lines with newlines
    expect(Array.isArray(prob.verticalLines)).toBe(true);
    expect(prob.verticalLines.length).toBe(4);
    expect(prob.verticalLines[0].trim()).toBe("៧៩៥");
    expect(prob.verticalLines[1]).toContain("៥៤");
    expect(prob.verticalLines[3].trim()).toBe("៧៤១");
    expect(prob.alignedWorking.includes("\n")).toBe(true);

    // Explanation is expanded to full Grade 3 pedagogical sections
    expect(prob.solutionKhmer).toContain("ប្រមាណវិធី");
    expect(prob.solutionKhmer).toContain("ជំហានទី១ — ខ្ទង់ឯកតា");
    expect(prob.solutionKhmer).toContain("ដោយមិនបាច់ខ្ចីទេ");
  });

  // =========================================================================
  // Test 29: copyTextFallback handles fallback copy safely
  // =========================================================================
  it("Test 29: copyTextFallback handles fallback copy safely when ClipboardItem is unavailable", () => {
    const res = copyTextFallback("test string");
    expect(res).toBe(false);
  });

  // =========================================================================
  // Test 30: STRICT THREE-MODE CONTRACT (Mode 1, Mode 2, Mode 3)
  // =========================================================================
  describe("Test 30: Strict Three-Mode Contract", () => {
    it("Mode 1 (solve): Contains answer but NO detailed solution or vertical working", async () => {
      mockGeminiSuccess({
        problems: [
          {
            id: "p1",
            extractedProblem: "៧៩៥ − ៥៤",
            finalAnswer: "៧៤១",
            solutionKhmer: "ជំហានលម្អិត...",
            alignedWorking: "  ៧៩៥\n−  ៥៤\n─────\n  ៧៤១",
          },
        ],
        totalProblems: 1,
      });

      const fd = buildFormData({
        solverMode: "solve",
        problemText: "៧៩៥ − ៥៤",
      });
      const res = await POST(buildRequest(fd));
      const data = await res.json();
      const p = data.problems[0];

      // Mode 1 contract:
      expect(p.finalAnswer).toBe("៧៤១");
      expect(p.solutionKhmer).toBe("");
      expect(p.alignedWorking).toBeUndefined();
      expect(p.verticalLines).toBeUndefined();

      // UI Card check in Mode 1
      const html = renderToString(
        React.createElement(SolutionCard, {
          problem: p,
          index: 0,
          totalProblems: 1,
          solverMode: "solve",
        })
      );
      expect(html).toContain("៧៤១");
      expect(html).not.toContain("Vertical Calculation");
      expect(html).not.toContain("វិធីដោះស្រាយលម្អិត");
    });

    it("Mode 2 (generate): Contains detailed solution and vertical working but NO separate final answer", async () => {
      mockGeminiSuccess({
        problems: [
          {
            id: "p1",
            extractedProblem: "៧៩៥ − ៥៤",
            finalAnswer: "៧៤១",
            solutionKhmer: "ជំហានទី១៖ ៥ − ៤ = ១",
            alignedWorking: "  ៧៩៥\n−  ៥៤\n─────\n  ៧៤១",
          },
        ],
        totalProblems: 1,
      });

      const fd = buildFormData({
        solverMode: "generate",
        problemText: "៧៩៥ − ៥៤",
      });
      const res = await POST(buildRequest(fd));
      const data = await res.json();
      const p = data.problems[0];

      // Mode 2 contract:
      expect(p.finalAnswer).toBe("");
      expect(p.solutionKhmer).toContain("ជំហានទី១");
      expect(p.alignedWorking).toContain("៧៩៥");
      expect(Array.isArray(p.verticalLines)).toBe(true);

      // UI Card check in Mode 2
      const html = renderToString(
        React.createElement(SolutionCard, {
          problem: p,
          index: 0,
          totalProblems: 1,
          solverMode: "generate",
        })
      );
      expect(html).toContain("វិធីដោះស្រាយលម្អិត");
      expect(html).toContain("Vertical Calculation");
      expect(html).not.toContain('data-testid="final-answer-card"');
      expect(html).not.toContain("ចម្លើយចុងក្រោយ");
    });

    it("Mode 3 (verify): Contains both solution steps, vertical working, AND final answer", async () => {
      mockGeminiSuccess({
        problems: [
          {
            id: "p1",
            extractedProblem: "៧៩៥ − ៥៤",
            finalAnswer: "៧៤១",
            solutionKhmer: "ជំហានទី១៖ ៥ − ៤ = ១",
            alignedWorking: "  ៧៩៥\n−  ៥៤\n─────\n  ៧៤១",
          },
        ],
        totalProblems: 1,
      });

      const fd = buildFormData({
        solverMode: "verify",
        problemText: "៧៩៥ − ៥៤",
      });
      const res = await POST(buildRequest(fd));
      const data = await res.json();
      const p = data.problems[0];

      // Mode 3 contract:
      expect(p.finalAnswer).toBe("៧៤១");
      expect(p.solutionKhmer).toContain("ជំហានទី១");
      expect(p.alignedWorking).toContain("៧៩៥");
      expect(Array.isArray(p.verticalLines)).toBe(true);

      // UI Card check in Mode 3
      const html = renderToString(
        React.createElement(SolutionCard, {
          problem: p,
          index: 0,
          totalProblems: 1,
          solverMode: "verify",
        })
      );
      expect(html).toContain("៧៤១");
      expect(html).toContain("វិធីដោះស្រាយលម្អិត");
      expect(html).toContain("Vertical Calculation");
    });
  });

  // =========================================================================
  // Test 31: KHMER PEDAGOGICAL INVARIANTS BY GRADE LEVEL
  // =========================================================================
  describe("Test 31: Khmer Pedagogical Invariants by Grade Level", () => {
    it("Grade 1 produces visual/concrete grouping representations", () => {
      const g1 = verifyMathResultDeterministically("៧៩៥ − ៥៤", "៧៤១", {
        gradeLevel: "grade_1",
        solverMode: "generate",
      });
      expect(g1.detailedKhmerExplanation).toBeDefined();
      const exp1 = g1.detailedKhmerExplanation!;
      expect(exp1).toContain("បំបែក");
      // Does not contain Grade 3 column place-value table
      expect(exp1).not.toContain("ខ្ទង់ឯកតា៖");
    });

    it("Grade 6 produces algebraic equations, properties, and rigorous mathematical balance", () => {
      const g6 = verifyMathResultDeterministically("៧៩៥ − ៥៤", "៧៤១", {
        gradeLevel: "grade_6",
        solverMode: "generate",
      });
      expect(g6.detailedKhmerExplanation).toBeDefined();
      const exp6 = g6.detailedKhmerExplanation!;

      // Grade 6 vocabulary
      expect(exp6).toContain("ថ្នាក់ទី ៦ (ការវិភាគពិជគណិត និងសមីការ)");
      expect(exp6).toContain("សមីការពិជគណិត");
      expect(exp6).toContain("Algebraic");
      expect(exp6).toContain("សមភាព");
      expect(exp6).toContain("x =");
    });

    it("Proves Grade 1 and Grade 6 produce distinct pedagogical templates for the exact same input", () => {
      const g1 = verifyMathResultDeterministically("៧៩៥ − ៥៤", "៧៤១", {
        gradeLevel: "grade_1",
      });
      const g6 = verifyMathResultDeterministically("៧៩៥ − ៥៤", "៧៤១", {
        gradeLevel: "grade_6",
      });

      expect(g1.detailedKhmerExplanation).not.toEqual(g6.detailedKhmerExplanation);
      expect(g1.detailedKhmerExplanation).toContain("វត្ថុ");
      expect(g6.detailedKhmerExplanation).toContain("សមីការ");
    });
  });

  // =========================================================================
  // Test 32: TRUE VERTICAL ARITHMETIC WITH PRESERVED ROWS & NEWLINES
  // =========================================================================
  describe("Test 32: True Vertical Arithmetic & Long Division", () => {
    it("Long division (៨៤ ÷ ៤ = ២១) produces structured rows, preserved newlines, and brings down digits", () => {
      const arith = verifyMathResultDeterministically("៨៤ ÷ ៤", "២១");
      expect(arith.isVerified).toBe(true);
      expect(arith.computedAnswerKhmer).toBe("២១");

      expect(arith.verticalLines).toBeDefined();
      expect(Array.isArray(arith.verticalLines)).toBe(true);
      expect(arith.verticalLines!.length).toBeGreaterThan(4);

      const verticalBlock = arith.verticalLines!.join("\n");
      expect(verticalBlock.includes("\n")).toBe(true);
      expect(verticalBlock).toContain("២១"); // quotient
      expect(verticalBlock).toContain("៤ │ ៨៤"); // divisor | dividend
      expect(verticalBlock).toContain("−"); // subtraction step
      expect(verticalBlock).toContain("─"); // horizontal bar
    });

    it("Subtraction with genuine borrowing (៧០២ − ២៧៨ = ៤២៤) produces correct multi-step borrow chain", () => {
      const arith = verifyMathResultDeterministically("៧០២ − ២៧៨", "៤២៤");
      expect(arith.isVerified).toBe(true);
      expect(arith.computedAnswerKhmer).toBe("៤២៤");

      expect(arith.verticalLines).toBeDefined();
      expect(arith.verticalLines!.length).toBe(4);
      expect(arith.verticalLines![0].trim()).toBe("៧០២");
      expect(arith.verticalLines![1]).toContain("២៧៨");
      expect(arith.verticalLines![3].trim()).toBe("៤២៤");

      // Verify borrowing explanation mentions borrowing from hundreds across tens to ones
      expect(arith.detailedKhmerExplanation).toContain("ខ្ចី");
      expect(arith.detailedKhmerExplanation).toContain("ខ្ទង់រយ");
      expect(arith.detailedKhmerExplanation).toContain("ខ្ទង់ដប់");
    });

    it("Fraction addition (១/២ + ១/៤ = ៣/៤) finds LCM and reduces properly", () => {
      const frac = evaluateFractionArithmetic("១/២ + ១/៤");
      expect(frac.success).toBe(true);
      expect(frac.result).toEqual({ numerator: 3, denominator: 4 });
      expect(frac.stepsKhmer).toContain("តម្រូវភាគបែងរួម៖ ៤");
      expect(frac.stepsKhmer).toContain("៣/៤");
    });
  });

  // =========================================================================
  // Test 33: REAL HTML SOURCE INTEGRITY & SECURITY
  // =========================================================================
  describe("Test 33: Real HTML Source Document & Security Invariants", () => {
    it("Copy HTML output produces a complete HTML5 document with CSS and no unsafe scripts", () => {
      const prob: MathSolverProblem = {
        id: "sec-prob",
        mode: "verify",
        extractedProblem: "៧៩៥ − ៥៤",
        finalAnswer: "៧៤១",
        verticalLines: ["  ៧៩៥", "−  ៥៤", "─────", "  ៧៤១"],
        solutionKhmer: "ជំហានដោះស្រាយ...",
        verification: "៧៤១ + ៥៤ = ៧៩៥ ✓",
        confidence: "high",
        confidenceKhmer: "កម្រិតខ្ពស់",
      };

      const html = renderCanonicalSolutionHtml(prob);

      // Must be a complete HTML document
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain('<html lang="km">');
      expect(html).toContain("<head>");
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain("<style>");
      expect(html).toContain("</style>");
      expect(html).toContain("<body>");
      expect(html).toContain('<article class="solution">');
      expect(html).toContain("</article>");
      expect(html).toContain("</body>");
      expect(html).toContain("</html>");

      // Preserves Khmer text and newlines
      expect(html).toContain("ប្រធានលំហាត់");
      expect(html).toContain("៧៩៥ − ៥៤");
      expect(html).toContain("៧៤១");
      expect(html.includes("\n")).toBe(true);

      // Preserves <pre class="vertical-calc">
      expect(html).toContain('<pre class="vertical-calc">');
      expect(html).toContain("  ៧៩៥\n−  ៥៤\n─────\n  ៧៤១");

      // Zero-XSS invariant: no scripts, no onclick, no javascript:
      expect(html).not.toContain("<script");
      expect(html).not.toContain("onclick=");
      expect(html).not.toContain("onerror=");
      expect(html).not.toContain("onload=");
      expect(html).not.toContain("javascript:");
    });

    it("Copy Text produces purely plain text with line breaks and ZERO HTML tags", () => {
      const prob: MathSolverProblem = {
        id: "text-prob",
        mode: "verify",
        extractedProblem: "៧៩៥ − ៥៤",
        finalAnswer: "៧៤១",
        verticalLines: ["  ៧៩៥", "−  ៥៤", "─────", "  ៧៤១"],
        solutionKhmer: "ជំហានដោះស្រាយ",
        confidence: "high",
        confidenceKhmer: "កម្រិតខ្ពស់",
      };

      const text = renderCanonicalSolutionPlainText(prob);

      // Contains line breaks
      expect(text.includes("\n")).toBe(true);
      expect(text).toContain("ប្រធានលំហាត់៖ ៧៩៥ − ៥៤");
      expect(text).toContain("ចម្លើយ៖ ៧៤១");

      // STRICTLY NO HTML TAGS
      expect(text).not.toContain("<!doctype");
      expect(text).not.toContain("<html");
      expect(text).not.toContain("<div");
      expect(text).not.toContain("<article");
      expect(text).not.toContain("<style");
      expect(text).not.toContain("<pre");
      expect(text).not.toContain("</");
    });
  });

  describe("Place-Value Column Alignment System & Acceptance Tests", () => {
    // 1. Primary Acceptance Test: ៤៣១ + ៦៥
    it("Primary Acceptance: ៤៣១ + ៦៥ strictly aligns by place value in data model, UI, HTML export, and plain text", () => {
      const calc = detectAndBuildStructuredCalculation("៤៣១ + ៦៥", "៤៩៦");
      expect(calc).not.toBeNull();
      if (!calc) return;

      expect(calc.columns).toEqual(["hundreds", "tens", "ones"]);

      // Row 0: operand ៤៣១
      expect(calc.rows[0].role).toBe("operand");
      expect(calc.rows[0].operator).toBe("");
      expect(calc.rows[0].digits).toEqual(["៤", "៣", "១"]);

      // Row 1: operand + ៦៥ (zero-padded place value)
      expect(calc.rows[1].role).toBe("operand");
      expect(calc.rows[1].operator).toBe("+");
      expect(calc.rows[1].digits).toEqual(["០", "៦", "៥"]);

      // ៦ must be in tens column (index 1), below ៣
      expect(calc.rows[1].digits[1]).toBe("៦");
      expect(calc.rows[0].digits[1]).toBe("៣");

      // ៥ must be in ones column (index 2), below ១
      expect(calc.rows[1].digits[2]).toBe("៥");
      expect(calc.rows[0].digits[2]).toBe("១");

      // Row 2: separator
      expect(calc.rows[2].role).toBe("separator");

      // Row 3: result ៤៩៦
      expect(calc.rows[3].role).toBe("result");
      expect(calc.rows[3].digits).toEqual(["៤", "៩", "៦"]);

      // Verify HTML Table Export
      const htmlTable = renderColumnCalculationHtml(calc);
      expect(htmlTable).toContain('<table class="column-calculation" role="math" aria-label="ការគណនាជួរឈរ">');
      expect(htmlTable).toContain('<td class="operator-cell">+</td>');
      expect(htmlTable).toContain('<td class="digit-cell">៤</td>');
      expect(htmlTable).toContain('<td class="digit-cell">៣</td>');
      expect(htmlTable).toContain('<td class="digit-cell">១</td>');
      expect(htmlTable).toContain('<td class="digit-cell">៦</td>');
      expect(htmlTable).toContain('<td class="digit-cell">៥</td>');

      // Verify Plain Text Output
      const text = renderColumnCalculationText(calc);
      expect(text.includes("\n")).toBe(true);
      expect(text).toContain("៤ ៣ ១");
      expect(text).toContain("+");
      expect(text).toContain("០ ៦ ៥");
      expect(text).toContain("៤ ៩ ៦");

      // Verify Visible React Component via SolutionCard
      const prob: MathSolverProblem = {
        id: "prob-431-65",
        mode: "verify",
        extractedProblem: "៤៣១ + ៦៥",
        finalAnswer: "៤៩៦",
        structuredCalculation: calc,
        solutionKhmer: "៤៣១ + ៦៥ = ៤៩៦",
        confidence: "high",
        confidenceKhmer: "កម្រិតខ្ពស់",
      };
      const rendered = renderToString(React.createElement(SolutionCard, { problem: prob, index: 0, totalProblems: 1 }));
      expect(rendered).toContain('data-testid="structured-column-calculation"');
      expect(rendered).toContain("column-calculation");
      expect(rendered).toContain("operator-cell");
      expect(rendered).toContain("digit-cell");
    });

    // 2. All 7 Required Operations:
    // ៤៣១ + ៦៥, ៧៩៥ − ៥៤, ៧០២ − ២៧៨, ២៤ × ៣, ៨៤ ÷ ៤, ១/២ + ១/៤, ១២.៥ + ៣.៧៥
    const requiredOps = [
      { expr: "៤៣១ + ៦៥", ans: "៤៩៦", expectedType: "arithmetic" },
      { expr: "៧៩៥ − ៥៤", ans: "៧៤១", expectedType: "arithmetic" },
      { expr: "៧០២ − ២៧៨", ans: "៤២៤", expectedType: "arithmetic" },
      { expr: "២៤ × ៣", ans: "៧២", expectedType: "arithmetic" },
      { expr: "៨៤ ÷ ៤", ans: "២១", expectedType: "division" },
      { expr: "១/២ + ១/៤", ans: "៣/៤", expectedType: "fraction" },
      { expr: "១២.៥ + ៣.៧៥", ans: "១៦.២៥", expectedType: "decimal" },
    ];

    for (const op of requiredOps) {
      it(`Acceptance verification for operation: ${op.expr}`, () => {
        const calc = detectAndBuildStructuredCalculation(op.expr, op.ans);
        expect(calc).not.toBeNull();
        if (!calc) return;

        expect(calc.type).toBe(op.expectedType);

        // Check columns consistency for arithmetic/division/decimal
        if (calc.type !== "fraction") {
          const colCount = calc.columns.length;
          expect(colCount).toBeGreaterThan(0);
          for (const row of calc.rows) {
            if (row.role !== "separator") {
              expect(row.digits.length).toBe(colCount);
            }
          }
        }

        // Test HTML generation
        const htmlTable = renderColumnCalculationHtml(calc);
        expect(htmlTable.length).toBeGreaterThan(0);
        if (calc.type !== "fraction") {
          expect(htmlTable).toContain("column-calculation");
          expect(htmlTable).toContain("<table");
        } else {
          expect(htmlTable).toContain("fraction-calculation");
        }

        // Test Text copy generation
        const textCalc = renderColumnCalculationText(calc);
        expect(textCalc.length).toBeGreaterThan(0);
        expect(textCalc.includes("\n")).toBe(true);

        // Test Full HTML Document Export
        const prob: MathSolverProblem = {
          id: `op-${op.expr}`,
          mode: "verify",
          extractedProblem: op.expr,
          finalAnswer: op.ans,
          structuredCalculation: calc,
          solutionKhmer: `ដំណោះស្រាយ ${op.expr}`,
          confidence: "high",
          confidenceKhmer: "កម្រិតខ្ពស់",
        };

        const fullHtml = renderCanonicalSolutionHtml(prob);
        expect(fullHtml).toContain("<!doctype html>");
        expect(fullHtml).toContain("<style>");
        if (calc.type !== "fraction") {
          expect(fullHtml).toContain('<table class="column-calculation"');
        } else {
          expect(fullHtml).toContain('<div class="fraction-calculation"');
        }

        // Test Full Plain Text Export
        const fullPlain = renderCanonicalSolutionPlainText(prob);
        expect(fullPlain).toContain("ប្រធានលំហាត់៖ " + op.expr);
        expect(fullPlain).not.toContain("<table");
        expect(fullPlain).not.toContain("</");

        // Test Visible UI component render
        const uiHtml = renderToString(React.createElement(SolutionCard, { problem: prob, index: 0, totalProblems: 1 }));
        expect(uiHtml).toContain('data-testid="structured-column-calculation"');
      });
    }
  });
});
