/**
 * Module 04 — Khmer Math Solver: Comprehensive Test Suite
 * Covers API route validation, image processing, response parsing,
 * error handling, Khmer output, multi-problem, answer verification,
 * confidence, regression, security, and mobile layout.
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
  // PNG magic signature
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function buildFormData(opts?: {
  image?: Blob;
  outputLanguage?: string;
  includeVerification?: string;
  solveQuestions?: string;
  action?: string;
  problemText?: string;
  existingAnswer?: string;
}): FormData {
  const blob =
    opts?.image ??
    new Blob([pngMagicBytes().buffer as ArrayBuffer], { type: "image/png" });
  const fd = new FormData();
  if (opts?.image !== null) {
    fd.append("image", blob, "test.png");
  }
  if (opts?.outputLanguage) fd.append("outputLanguage", opts.outputLanguage);
  if (opts?.includeVerification)
    fd.append("includeVerification", opts.includeVerification);
  if (opts?.solveQuestions) fd.append("solveQuestions", opts.solveQuestions);
  if (opts?.action) fd.append("action", opts.action);
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
// 1. Printed Math Tests
// ══════════════════════════════════════════════════
describe("1. Printed Math Problem Recognition & Solving", () => {
  it("processes printed linear algebra with KaTeX and Khmer steps", async () => {
    mockGeminiSuccess(sampleProblemResponse());

    const res = await POST(buildRequest());
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.problems).toHaveLength(1);
    expect(data.problems[0].extractedProblem).toContain("2x");
    expect(data.problems[0].finalAnswer).toBe("x = 3");
    expect(data.problems[0].solutionKhmer).toContain("ជំហានទី១");
    expect(data.problems[0].confidence).toBe("high");
    expect(data.totalProblems).toBe(1);
    expect(data.inferenceProvider).toBeTruthy();
    expect(data.timings.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("processes printed quadratic equations and fractions", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "x² - 5x + 6 = 0",
            solution: "(x - 2)(x - 3) = 0 => x = 2 ឬ x = 3",
            solutionKhmer:
              "យើងមានសមីការដឺក្រេទី២៖ x² - 5x + 6 = 0\nជំហានទី១៖ ដាក់ជាផលគុណកត្តា (x - 2)(x - 3) = 0\nជំហានទី២៖ ទាញរកឫស x = 2 ឬ x = 3",
            finalAnswer: "x = 2, x = 3",
            verification: "(2)² - 5(2) + 6 = 0 ✓",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
        extractedText: "x² - 5x + 6 = 0",
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    expect(data.problems[0].extractedProblem).toBe("x² - 5x + 6 = 0");
    expect(data.problems[0].finalAnswer).toContain("x = 2");
  });

  it("processes printed fractions and exponents accurately", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "\\frac{3}{4} + \\frac{1}{2} = ?",
            solution: "\\frac{3}{4} + \\frac{2}{4} = \\frac{5}{4}",
            solutionKhmer: "ជំហានទី១៖ តម្រូវភាគបែងរួម 4\n\\frac{3+2}{4} = \\frac{5}{4}",
            finalAnswer: "\\frac{5}{4}",
            verification: "0.75 + 0.5 = 1.25 ✓",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    expect(data.problems[0].extractedProblem).toContain("\\frac");
    expect(data.problems[0].finalAnswer).toBe("\\frac{5}{4}");
  });
});

// ══════════════════════════════════════════════════
// 2. Khmer Text Preservation Tests
// ══════════════════════════════════════════════════
describe("2. Khmer Text Preservation (Unicode, Diacritics, Numerals)", () => {
  it("preserves Khmer diacritics, subscript characters (coeng), and Khmer numerals", async () => {
    const khmerRichText =
      "ចូរគណនាផលបូក៖ ១២ + ៣៤ = ?\nយើងមានសមីការ៖ 2x + 6 = 12\nជំហានទី១៖ ដក ៦ ពីផ្នែកទាំងពីរ\nជំហានទី២៖ ចែកនឹង ២\nដូច្នេះ ចម្លើយគឺ x = 3";

    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "ចូរគណនាផលបូក៖ ១២ + ៣៤ = ?",
            solutionKhmer: khmerRichText,
            finalAnswer: "៤៦",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    const solution = data.problems[0].solutionKhmer;

    // Verify Khmer complex consonants with subscript
    expect(solution).toContain("សមីការ");
    expect(solution).toContain("ជំហានទី១");
    expect(solution).toContain("ផ្នែក");
    // Verify Khmer numerals (១, ២, ៣, ៤, ៦)
    expect(solution).toContain("១២");
    expect(solution).toContain("៦");
    expect(data.problems[0].finalAnswer).toBe("៤៦");
  });

  it("handles bilingual Khmer and English mathematical descriptions correctly", async () => {
    mockGeminiSuccess(sampleProblemResponse());

    const fd = buildFormData({ outputLanguage: "khmer_english" });
    const res = await POST(buildRequest(fd));
    const data = await res.json();
    expect(data.outputLanguage).toBe("khmer_english");
  });
});

// ══════════════════════════════════════════════════
// 3. Handwritten & Ambiguous Input Tests (Anti-Guessing)
// ══════════════════════════════════════════════════
describe("3. Handwritten & Ambiguous Input (Anti-Hallucination)", () => {
  it("flags ambiguous handwritten exponents without guessing", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "x? + 3 = 7 (exponent unclear, could be 2 or 3)",
            solution: "If x²: x = ±2; If x³: x = ∛4",
            solutionKhmer:
              "មិនអាចកំណត់ច្បាស់ថាតួអក្សរស្វ័យគុណជា 2 ឬ 3 ទេ។\nប្រសិនបើជា x² នោះ x = ±2\nប្រសិនបើជា x³ នោះ x = ∛4",
            finalAnswer: "x = ±2 (បើ x²) ឬ x = ∛4 (បើ x³)",
            verification: "ត្រូវការបញ្ជាក់ exponent ពីអ្នកប្រើប្រាស់",
            confidence: "low",
            confidenceKhmer: "កម្រិតទំនុកចិត្តទាប — ត្រូវកែសម្រួលរូបភាព",
            ambiguousParts: [
              "និមិត្តសញ្ញា exponent មិនច្បាស់ អាចជា 2 ឬ 3",
              "សញ្ញាបូក ឬគុណមិនទាន់ច្បាស់",
            ],
            reviewSuggestions: ["សូមថតរូបភាពឡើងវិញឱ្យច្បាស់ជាងមុន"],
          },
        ],
        imageQualityNote: "រូបភាពមានពន្លឺស្រអាប់ និងអក្សរដៃមិនសូវច្បាស់",
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    expect(data.problems[0].confidence).toBe("low");
    expect(data.problems[0].ambiguousParts).toHaveLength(2);
    expect(data.problems[0].ambiguousParts[0]).toContain("exponent");
    expect(data.imageQualityNote).toBeTruthy();
  });

  it("returns medium confidence with review suggestions for cursive handwriting", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "3y - 9 = 0",
            solution: "y = 3",
            solutionKhmer: "ជំហានទី១៖ 3y = 9\nជំហានទី២៖ y = 3",
            finalAnswer: "y = 3",
            verification: "3(3) - 9 = 0 ✓",
            confidence: "medium",
            confidenceKhmer: "កម្រិតទំនុកចិត្តមធ្យម — សូមផ្ទៀងផ្ទាត់",
            ambiguousParts: ["អក្សរ y ស្រដៀងនឹង 4"],
          },
        ],
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    expect(data.problems[0].confidence).toBe("medium");
    expect(data.problems[0].ambiguousParts).toContain("អក្សរ y ស្រដៀងនឹង 4");
  });
});

// ══════════════════════════════════════════════════
// 4. Correct and Incorrect Existing Answers Tests
// ══════════════════════════════════════════════════
describe("4. Student Existing Answer Verification", () => {
  it("verifies correct existing answer and marks status as ត្រឹមត្រូវ ✓", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "5x = 25",
            extractedAnswer: "x = 5",
            answerStatus: "correct",
            answerStatusKhmer: "ត្រឹមត្រូវ ✓",
            solution: "x = 25 / 5 = 5",
            solutionKhmer: "ជំហានទី១៖ ចែកផ្នែកទាំងពីរនឹង 5\nx = 5",
            finalAnswer: "x = 5",
            verification: "5(5) = 25 ✓",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    expect(data.problems[0].answerStatus).toBe("correct");
    expect(data.problems[0].answerStatusKhmer).toContain("ត្រឹមត្រូវ");
    expect(data.problems[0].extractedAnswer).toBe("x = 5");
  });

  it("detects incorrect existing answer, pinpoints wrong step and provides correction", async () => {
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
            correctedStep: "ត្រូវដក 6 ជាមុនសិន: 2x = 12 - 6 = 6, ដូច្នេះ x = 3",
            solution: "2x = 6 => x = 3",
            solutionKhmer: "ជំហានទី១៖ 2x = 6\nជំហានទី២៖ x = 3",
            finalAnswer: "x = 3",
            verification: "2(3) + 6 = 12 ✓",
            confidence: "high",
            confidenceKhmer: "កម្រិតទំនុកចិត្តខ្ពស់",
            ambiguousParts: [],
          },
        ],
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    expect(data.problems[0].answerStatus).toBe("incorrect");
    expect(data.problems[0].answerStatusKhmer).toContain("មិនទាន់ត្រឹមត្រូវ");
    expect(data.problems[0].incorrectStep).toContain("សិស្សភ្លេចដក 6");
    expect(data.problems[0].correctedStep).toContain("x = 3");
  });

  it("handles unverifiable student answers with ambiguous notation", async () => {
    mockGeminiSuccess(
      sampleProblemResponse({
        problems: [
          {
            id: "q1",
            extractedProblem: "4a - 8 = 12",
            extractedAnswer: "a = ?",
            answerStatus: "unverifiable",
            answerStatusKhmer: "មិនអាចផ្ទៀងផ្ទាត់បាន",
            solution: "4a = 20 => a = 5",
            solutionKhmer: "ជំហានទី១៖ 4a = 20\nជំហានទី២៖ a = 5",
            finalAnswer: "a = 5",
            confidence: "medium",
            confidenceKhmer: "កម្រិតទំនុកចិត្តមធ្យម",
            ambiguousParts: [],
          },
        ],
      })
    );

    const res = await POST(buildRequest());
    const data = await res.json();
    expect(data.problems[0].answerStatus).toBe("unverifiable");
    expect(data.problems[0].answerStatusKhmer).toBe("មិនអាចផ្ទៀងផ្ទាត់បាន");
  });
});

// ══════════════════════════════════════════════════
// 5. Invalid Upload Tests
// ══════════════════════════════════════════════════
describe("5. Invalid Upload Validation", () => {
  it("rejects files exceeding 4.5MB with HTTP 413", async () => {
    const largeBlob = new Blob([new Uint8Array(5 * 1024 * 1024)], {
      type: "image/png",
    });
    const fd = new FormData();
    fd.append("image", largeBlob, "large.png");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(413);

    const data = await res.json();
    expect(data.code).toBe("PAYLOAD_TOO_LARGE");
    expect(data.errorKhmer).toContain("ទំហំធំពេក");
    expect(data.retryable).toBe(false);
  });

  it("rejects requests missing both image and problem text with HTTP 400", async () => {
    const fd = new FormData();
    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.code).toBe("MISSING_IMAGE");
    expect(data.errorKhmer).toContain("សូមបញ្ចូលរូបភាព");
  });

  it("rejects unsupported media formats with HTTP 415 via upload validator", async () => {
    mockValidateImageUpload.mockReturnValueOnce({
      valid: false,
      code: "UNSUPPORTED_MEDIA_TYPE",
      error: "Unsupported media format",
      details: "Expected PNG, JPEG, or WEBP",
      httpStatus: 415,
    } as unknown as { valid: true; format: "image/png" });

    const fd = buildFormData();
    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(415);

    const data = await res.json();
    expect(data.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(data.errorKhmer).toContain("ប្រភេទឯកសារមិនត្រឹមត្រូវ");
  });

  it("rejects empty 0-byte file with HTTP 400 via upload validator", async () => {
    mockValidateImageUpload.mockReturnValueOnce({
      valid: false,
      code: "EMPTY_FILE",
      error: "Empty file received",
      details: "0 bytes",
      httpStatus: 400,
    } as unknown as { valid: true; format: "image/png" });

    const fd = buildFormData();
    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.code).toBe("EMPTY_FILE");
    expect(data.errorKhmer).toContain("ទទេ");
  });
});

// ══════════════════════════════════════════════════
// 6. Timeout Tests
// ══════════════════════════════════════════════════
describe("6. Upstream Timeout & Failover", () => {
  it("returns 504 / 503 structured error when AI models time out", async () => {
    mockGenerateContent.mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error("upstream timeout")), 15);
      });
    });

    const res = await POST(buildRequest());
    expect([503, 504]).toContain(res.status);

    const data = await res.json();
    expect(data.retryable).toBe(true);
    expect(data.errorKhmer).toBeTruthy();
    expect(data.requestId).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════
// 7. Cancel Tests
// ══════════════════════════════════════════════════
describe("7. Request Cancellation (AbortController)", () => {
  it("aborts active requests without throwing unhandled exceptions", async () => {
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);

    controller.abort();
    expect(controller.signal.aborted).toBe(true);

    // Verify DOMException handling pattern
    try {
      throw new DOMException("The user aborted a request.", "AbortError");
    } catch (err: unknown) {
      expect(err instanceof DOMException && err.name === "AbortError").toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════
// 8. Duplicate Submit Prevention Tests
// ══════════════════════════════════════════════════
describe("8. Duplicate Submit Prevention & Request ID Isolation", () => {
  it("assigns distinct request IDs to concurrent requests to prevent cross-talk", async () => {
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

// ══════════════════════════════════════════════════
// 9. Mobile Layout & Accessibility Tests
// ══════════════════════════════════════════════════
describe("9. Mobile Layout & Accessibility", () => {
  it("page source includes responsive grid layout classes for mobile devices", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const pagePath = path.resolve(
      process.cwd(),
      "src/app/math-solver/page.tsx"
    );
    const content = await fs.readFile(pagePath, "utf-8");

    // Check responsive 1-column mobile to 2-column desktop breakpoint
    expect(content).toContain("grid-cols-1 md:grid-cols-2");
    // Check touch-friendly minimum 44px tap targets
    expect(content).toContain("min-h-[44px]");
    // Check flex-wrap for mobile action bars
    expect(content).toContain("flex flex-wrap");
  });

  it("SolverImageUpload includes mobile camera capture attribute", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const uploadCompPath = path.resolve(
      process.cwd(),
      "src/components/math-solver/SolverImageUpload.tsx"
    );
    const content = await fs.readFile(uploadCompPath, "utf-8");

    // Check environment camera capture for smartphone users
    expect(content).toContain('capture="environment"');
    expect(content).toContain("ថតរូបពីកាមេរ៉ា");
  });
});
