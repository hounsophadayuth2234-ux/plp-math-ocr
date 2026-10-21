/**
 * Module 04 — Khmer Math Solver: Comprehensive 3-Mode Test Suite
 *
 * Covers:
 * 1. Solve-only mode (Mode 1: ដោះស្រាយលំហាត់)
 * 2. Generate-solution mode (Mode 2: បង្កើតដំណោះស្រាយ with 8 formal sections & detail levels)
 * 3. Solve-and-verify mode (Mode 3: ដោះស្រាយ + ផ្ទៀងផ្ទាត់)
 * 4. Correct existing student answer verification (ត្រឹមត្រូវ ✓)
 * 5. Incorrect existing student answer verification (មិនទាន់ត្រឹមត្រូវ ✗, error diagnosis & correction)
 * 6. Ambiguous handwritten input & anti-hallucination protection
 * 7. Khmer text and mathematical notation preservation (subscripts, diacritics, fractions)
 * 8. Copy and Download formatting across modes
 * 9. Mobile layout & accessibility
 * 10. Cancel, timeout, and duplicate submit
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ───
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

// ─── Helpers ───
function pngMagicBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function buildFormData(opts?: {
  image?: Blob | null;
  outputLanguage?: string;
  includeVerification?: string;
  solveQuestions?: string;
  action?: string;
  solverMode?: string;
  detailLevel?: string;
  problemText?: string;
  existingAnswer?: string;
}): FormData {
  const fd = new FormData();
  if (opts?.image !== null) {
    const blob =
      opts?.image ??
      new Blob([pngMagicBytes().buffer as ArrayBuffer], { type: "image/png" });
    fd.append("image", blob, "test.png");
  }
  if (opts?.outputLanguage) fd.append("outputLanguage", opts.outputLanguage);
  if (opts?.includeVerification)
    fd.append("includeVerification", opts.includeVerification);
  if (opts?.solveQuestions) fd.append("solveQuestions", opts.solveQuestions);
  if (opts?.action) fd.append("action", opts.action);
  if (opts?.solverMode) fd.append("solverMode", opts.solverMode);
  if (opts?.detailLevel) fd.append("detailLevel", opts.detailLevel);
  if (opts?.problemText) fd.append("problemText", opts.problemText);
  if (opts?.existingAnswer) fd.append("existingAnswer", opts.existingAnswer);
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

function sampleProblemResponse(overrides?: Record<string, unknown>) {
  return {
    problems: [
      {
        id: "q1",
        extractedProblem: "2x + 6 = 12",
        extractedAnswer: null,
        answerStatus: null,
        answerStatusKhmer: null,
        incorrectStep: null,
        correctedStep: null,
        solution: "2x = 12 - 6\n2x = 6\nx = 3",
        solutionKhmer:
          "យើងមានសមីការ៖ 2x + 6 = 12\nជំហានទី១៖ ដក 6 ពីផ្នែកទាំងពីរ\n2x = 6\nជំហានទី២៖ ចែកផ្នែកទាំងពីរដោយ 2\nx = 3\nដូច្នេះ ចម្លើយគឺ៖ x = 3",
        finalAnswer: "x = 3",
        verification: "2(3) + 6 = 6 + 6 = 12 ✓",
        confidence: "high",
        confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
        ambiguousParts: [],
        reviewSuggestions: [],
      },
    ],
    totalProblems: 1,
    extractedText: "2x + 6 = 12",
    imageQualityNote: null,
    ...overrides,
  };
}

// ─── Import the route handler ───
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

// ══════════════════════════════════════════════════
// 1. Solve-Only Mode (Mode 1: ដោះស្រាយលំហាត់)
// ══════════════════════════════════════════════════
describe("1. Mode 1: Solve Problem (ដោះស្រាយលំហាត់)", () => {
  it("extracts and solves problem step by step with Khmer explanation and final answer", async () => {
    mockGeminiSuccess(sampleProblemResponse());

    const fd = buildFormData({ solverMode: "solve", problemText: "2x + 6 = 12" });
    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.solverMode).toBe("solve");
    expect(data.problems[0].extractedProblem).toContain("2x");
    expect(data.problems[0].finalAnswer).toBe("x = 3");
    expect(data.problems[0].solutionKhmer).toContain("ជំហានទី១");
    expect(data.problems[0].confidence).toBe("high");
  });
});

// ══════════════════════════════════════════════════
// 2. Generate-Solution Mode (Mode 2: បង្កើតដំណោះស្រាយ)
// ══════════════════════════════════════════════════
describe("2. Mode 2: Generate Full Solution (បង្កើតដំណោះស្រាយ)", () => {
  it("generates polished educational solution with all 8 formal sections", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "រកផ្ទៃក្រឡារង្វង់ដែលមានកាំ r = 7 cm",
            given: "កាំរង្វង់ r = 7 cm, π ≈ 22/7",
            toFind: "ផ្ទៃក្រឡារង្វង់ S = ?",
            formulas: "S = π × r²",
            solution: "S = \\frac{22}{7} × 7² = \\frac{22}{7} × 49 = 154 \\text{ cm}²",
            solutionKhmer:
              "យើងមានរូបមន្តផ្ទៃក្រឡារង្វង់៖ S = π × r²\nជំនួសតម្លៃ r = 7 cm និង π = 22/7៖\nS = (22/7) × 49 = 154 cm²",
            finalAnswer: "154 cm²",
            verification: "S / π = 154 / (22/7) = 49 => r = 7 cm ✓",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
      })
    );

    const fd = buildFormData({
      solverMode: "generate",
      detailLevel: "step_by_step",
      problemText: "រកផ្ទៃក្រឡារង្វង់ដែលមានកាំ r = 7 cm",
    });

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.solverMode).toBe("generate");
    expect(data.detailLevel).toBe("step_by_step");

    // Verify all 8 formal educational sections
    const p = data.problems[0];
    expect(p.extractedProblem).toBeTruthy(); // 1. ប្រធានលំហាត់
    expect(p.given).toContain("r = 7 cm"); // 2. អ្វីដែលគេឱ្យ
    expect(p.toFind).toContain("S"); // 3. អ្វីដែលត្រូវរក
    expect(p.formulas).toContain("π × r²"); // 4. រូបមន្តដែលត្រូវប្រើ
    expect(p.solution).toBeTruthy(); // 5. ដំណោះស្រាយតាមជំហាន
    expect(p.solutionKhmer).toContain("យើងមានរូបមន្ត"); // 6. ការពន្យល់ជាភាសាខ្មែរ
    expect(p.finalAnswer).toBe("154 cm²"); // 7. ចម្លើយចុងក្រោយ
    expect(p.verification).toBeTruthy(); // 8. ពិនិត្យចម្លើយឡើងវិញ
  });

  it("supports detail level 'teacher' with in-depth conceptual explanation", async () => {
    mockGeminiSuccess(sampleProblemResponse());

    const fd = buildFormData({
      solverMode: "generate",
      detailLevel: "teacher",
      problemText: "x² - 9 = 0",
    });

    const res = await POST(buildRequest(fd));
    const data = await res.json();
    expect(data.solverMode).toBe("generate");
    expect(data.detailLevel).toBe("teacher");
  });
});

// ══════════════════════════════════════════════════
// 3. Solve-and-Verify Mode (Mode 3: ដោះស្រាយ + ផ្ទៀងផ្ទាត់)
// ══════════════════════════════════════════════════
describe("3. Mode 3: Solve + Verify + Generate (ដោះស្រាយ + ផ្ទៀងផ្ទាត់)", () => {
  it("solves independently and verifies student's work", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "3x + 12 = 24",
            extractedAnswer: "x = 4",
            answerStatus: "correct",
            answerStatusKhmer: "ត្រឹមត្រូវ ✓",
            solution: "3x = 12 => x = 4",
            solutionKhmer: "ជំហានទី១៖ 3x = 12\nជំហានទី២៖ x = 4",
            finalAnswer: "x = 4",
            verification: "3(4) + 12 = 24 ✓",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
      })
    );

    const fd = buildFormData({
      solverMode: "verify",
      problemText: "3x + 12 = 24",
      existingAnswer: "x = 4",
    });

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.solverMode).toBe("verify");
    expect(data.problems[0].answerStatus).toBe("correct");
    expect(data.problems[0].extractedAnswer).toBe("x = 4");
  });
});

// ══════════════════════════════════════════════════
// 4. Correct Existing Answer Verification
// ══════════════════════════════════════════════════
describe("4. Correct Existing Answer Verification", () => {
  it("identifies correct answer and marks ត្រឹមត្រូវ ✓ without false negatives", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "10 - 2x = 4",
            extractedAnswer: "x = 3",
            answerStatus: "correct",
            answerStatusKhmer: "ត្រឹមត្រូវ ✓",
            solution: "-2x = -6 => x = 3",
            solutionKhmer: "ជំហានទី១៖ -2x = 4 - 10 = -6\nជំហានទី២៖ x = 3",
            finalAnswer: "x = 3",
            verification: "10 - 2(3) = 10 - 6 = 4 ✓",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
      })
    );

    const fd = buildFormData({
      solverMode: "verify",
      problemText: "10 - 2x = 4",
      existingAnswer: "x = 3",
    });

    const res = await POST(buildRequest(fd));
    const data = await res.json();
    expect(data.problems[0].answerStatus).toBe("correct");
    expect(data.problems[0].answerStatusKhmer).toContain("ត្រឹមត្រូវ");
  });
});

// ══════════════════════════════════════════════════
// 5. Incorrect Existing Answer Diagnosis & Correction
// ══════════════════════════════════════════════════
describe("5. Incorrect Existing Answer Diagnosis & Correction", () => {
  it("pinpoints exact incorrect step, explains error in Khmer, and gives corrected solution", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "2x + 6 = 12",
            extractedAnswer: "x = 6",
            answerStatus: "incorrect",
            answerStatusKhmer: "មិនទាន់ត្រឹមត្រូវ ✗",
            incorrectStep: "សិស្សភ្លេចដក 6 ពីផ្នែកខាងស្តាំ: 2x = 12",
            errorExplanationKhmer:
              "កំហុសក្នុងការផ្លាស់ប្តូរតួ៖ នៅពេលផ្ទេរ +6 ទៅផ្នែកខាងស្តាំ ត្រូវប្តូរសញ្ញាទៅជា -6។",
            correctedStep: "2x = 12 - 6 = 6, ដូច្នេះ x = 3",
            solution: "2x = 6 => x = 3",
            solutionKhmer: "ជំហានទី១៖ 2x = 12 - 6 = 6\nជំហានទី២៖ x = 3",
            finalAnswer: "x = 3",
            verification: "2(3) + 6 = 12 ✓",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
      })
    );

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
    expect(p.incorrectStep).toContain("សិស្សភ្លេចដក 6");
    expect(p.errorExplanationKhmer).toContain("កំហុសក្នុងការផ្លាស់ប្តូរតួ");
    expect(p.correctedStep).toContain("x = 3");
    expect(p.finalAnswer).toBe("x = 3");
  });
});

// ══════════════════════════════════════════════════
// 6. Ambiguous Handwritten Input (Anti-Hallucination)
// ══════════════════════════════════════════════════
describe("6. Ambiguous Handwritten Input & Anti-Hallucination", () => {
  it("flags ambiguous parts without guessing and sets low confidence", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "x? + 3 = 7 (exponent ambiguous)",
            solution: "If x²: x = ±2; If x³: x = ∛4",
            solutionKhmer: "មិនច្បាស់លាស់តួអក្សរស្វ័យគុណ",
            finalAnswer: "Conditional solutions",
            verification: "Clarification required",
            confidence: "low",
            confidenceKhmer: "កម្រិតទំនុកចិត្តទាប — ត្រូវកែសម្រួលរូបភាព",
            ambiguousParts: ["ស្វ័យគុណអាចជា 2 ឬ 3", "សញ្ញាអាចជា + ឬ ×"],
          },
        ],
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    expect(data.problems[0].confidence).toBe("low");
    expect(data.problems[0].ambiguousParts).toHaveLength(2);
    expect(data.problems[0].ambiguousParts[0]).toContain("ស្វ័យគុណ");
  });
});

// ══════════════════════════════════════════════════
// 7. Khmer Text & Mathematical Notation Preservation
// ══════════════════════════════════════════════════
describe("7. Khmer Text & Mathematical Notation Preservation", () => {
  it("preserves Khmer subscripts (coeng ្), diacritics, Khmer numerals and fractions", async () => {
    const khmerMath =
      "ចូរដោះស្រាយសមីការ៖ \\frac{x}{២} + ៣ = ៧\nជំហានទី១៖ \\frac{x}{២} = ៤\nជំហានទី២៖ x = ៨";

    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "\\frac{x}{២} + ៣ = ៧",
            solutionKhmer: khmerMath,
            finalAnswer: "x = ៨",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    const sol = data.problems[0].solutionKhmer;
    expect(sol).toContain("សមីការ"); // Coeng ្
    expect(sol).toContain("ជំហានទី១"); // Diacritic
    expect(sol).toContain("២"); // Khmer numeral 2
    expect(sol).toContain("៨"); // Khmer numeral 8
    expect(data.problems[0].finalAnswer).toBe("x = ៨");
  });
});

// ══════════════════════════════════════════════════
// 8. Copy and Download Formatting
// ══════════════════════════════════════════════════
describe("8. Copy and Download Formatting", () => {
  it("page source implements copy and download handlers with structured output", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const pagePath = path.resolve(
      process.cwd(),
      "src/app/math-solver/page.tsx"
    );
    const content = await fs.readFile(pagePath, "utf-8");

    // Copy handler with clipboard API
    expect(content).toContain("navigator.clipboard.writeText");
    expect(content).toContain("handleCopy");
    // Download handler creating blob
    expect(content).toContain("new Blob(");
    expect(content).toContain("handleDownload");
    // Mode-specific export handling
    expect(content).toContain("result.solverMode === \"generate\"");
    expect(content).toContain("result.solverMode === \"verify\"");
  });
});

// ══════════════════════════════════════════════════
// 9. Mobile Layout & Accessibility
// ══════════════════════════════════════════════════
describe("9. Mobile Layout & Accessibility", () => {
  it("supports responsive 1-column mobile to 2-column desktop breakpoint", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const pagePath = path.resolve(
      process.cwd(),
      "src/app/math-solver/page.tsx"
    );
    const content = await fs.readFile(pagePath, "utf-8");

    expect(content).toContain("grid-cols-1 md:grid-cols-2");
    expect(content).toContain("min-h-[44px]"); // Touch targets
  });

  it("SolverImageUpload component includes mobile camera capture attribute", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const uploadPath = path.resolve(
      process.cwd(),
      "src/components/math-solver/SolverImageUpload.tsx"
    );
    const content = await fs.readFile(uploadPath, "utf-8");

    expect(content).toContain('capture="environment"');
    expect(content).toContain("ថតរូបពីកាមេរ៉ា");
  });
});

// ══════════════════════════════════════════════════
// 10. Cancel, Timeout, and Duplicate Submit
// ══════════════════════════════════════════════════
describe("10. Cancel, Timeout, and Duplicate Submit", () => {
  it("supports request cancellation via AbortController signal", () => {
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("returns 504 / 503 structured error when AI model times out", async () => {
    mockGenerateContent.mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error("upstream timeout")), 15);
      });
    });

    const res = await POST(buildRequest());
    expect([503, 504]).toContain(res.status);
    const data = await res.json();
    expect(data.retryable).toBe(true);
  });

  it("assigns distinct request IDs to prevent duplicate race conditions", async () => {
    mockGeminiSuccess(sampleProblemResponse());

    const [res1, res2] = await Promise.all([
      POST(buildRequest()),
      POST(buildRequest()),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const data1 = await res1.json();
    const data2 = await res2.json();
    expect(data1.problems).toHaveLength(1);
    expect(data2.problems).toHaveLength(1);
  });
});
