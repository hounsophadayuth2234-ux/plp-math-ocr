import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  calculateMathImageDimensions,
  MAX_MATH_IMAGE_WIDTH,
  DEFAULT_QUALITY,
  FALLBACK_QUALITY,
} from "../src/lib/math-ocr-prep";
import {
  sanitizeMathHtml,
  sanitizeMathLatex,
  sanitizeMathMLMarkup,
  sanitizeInlineStyle,
  normalizeGeminiMathOutput,
} from "../src/lib/math-ocr-normalizer";
import {
  POST as postMathOcr,
  getBackoffMs,
  setMathOcrDelayFunction,
  isTransientProviderError,
} from "../src/app/api/math-ocr/route";

// Mock GoogleGenerativeAI
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockImplementation(({ model }: { model: string }) => ({
  modelName: model,
  generateContent: (...args: unknown[]) => mockGenerateContent(...args),
}));

vi.mock("@/lib/rate-limiter", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: class {
      apiKey: string;
      constructor(apiKey: string) {
        this.apiKey = apiKey;
      }
      getGenerativeModel(args: { model: string; generationConfig?: unknown }) {
        return mockGetGenerativeModel(args);
      }
    },
  };
});

describe("Feature 1 — Math OCR Production Polish & Resilience Vitest Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockClear();
    mockGetGenerativeModel.mockImplementation(({ model }: { model: string }) => ({
      modelName: model,
      generateContent: (...args: unknown[]) => mockGenerateContent(...args),
    }));
    process.env = { ...originalEnv };
    process.env.GEMINI_API_KEY = "test-secret-gemini-key-12345";
    // Inject zero-delay deterministic runner for tests
    setMathOcrDelayFunction(async () => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setMathOcrDelayFunction(null);
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Client-Side Image Dimensions, Proportional Resizing & Zero Upscaling
  // ==========================================================================
  describe("Client-side Image Preparation & Geometry", () => {
    it("1. Image width is capped at 1280px when original width > 1280px", () => {
      const dim = calculateMathImageDimensions(2560, 1440, MAX_MATH_IMAGE_WIDTH);
      expect(dim.targetW).toBe(1280);
      expect(dim.wasResized).toBe(true);
    });

    it("2. Aspect ratio is strictly preserved during resize", () => {
      const origW = 2000;
      const origH = 1000; // 2:1
      const dim = calculateMathImageDimensions(origW, origH, MAX_MATH_IMAGE_WIDTH);
      expect(dim.targetW).toBe(1280);
      expect(dim.targetH).toBe(640);
      expect(dim.targetW / dim.targetH).toBeCloseTo(origW / origH, 2);
    });

    it("3. Images smaller than 1280px are NOT upscaled", () => {
      const dim = calculateMathImageDimensions(800, 600, MAX_MATH_IMAGE_WIDTH);
      expect(dim.targetW).toBe(800);
      expect(dim.targetH).toBe(600);
      expect(dim.wasResized).toBe(false);
    });

    it("4. Quality constants specify WebP quality 0.85 and fallback 0.70", () => {
      expect(DEFAULT_QUALITY).toBe(0.85);
      expect(FALLBACK_QUALITY).toBe(0.70);
    });

    it("5. Throws clear error on invalid or negative dimensions", () => {
      expect(() => calculateMathImageDimensions(0, 100)).toThrow("Invalid image dimensions");
      expect(() => calculateMathImageDimensions(-50, 100)).toThrow("Invalid image dimensions");
    });
  });

  // ==========================================================================
  // 2. Gemini Retry, Backoff & Rate Limit Handling
  // ==========================================================================
  describe("Gemini Transient Retry & Error Classification", () => {
    it("6. Backoff schedule generates ~400-800ms for attempt 1 and ~900-1600ms for attempt 2", () => {
      for (let i = 0; i < 20; i++) {
        const backoff0 = getBackoffMs(0);
        expect(backoff0).toBeGreaterThanOrEqual(400);
        expect(backoff0).toBeLessThanOrEqual(800);

        const backoff1 = getBackoffMs(1);
        expect(backoff1).toBeGreaterThanOrEqual(900);
        expect(backoff1).toBeLessThanOrEqual(1600);
      }
    });

    it("7. Classifies 429, 503, 502, 504, timeout, network failure as transient", () => {
      expect(isTransientProviderError(new Error("429 Too Many Requests"))).toBe(true);
      expect(isTransientProviderError(new Error("503 Service Unavailable"))).toBe(true);
      expect(isTransientProviderError(new Error("504 Gateway Timeout"))).toBe(true);
      expect(isTransientProviderError(new Error("socket hang up"))).toBe(true);
      expect(isTransientProviderError(new Error("fetch failed"))).toBe(true);
      expect(isTransientProviderError(new Error("Rate limit reached"))).toBe(true);
    });

    it("8. Does NOT classify 400, 401, 403, or invalid API key as transient", () => {
      expect(isTransientProviderError(new Error("400 Bad Request"))).toBe(false);
      expect(isTransientProviderError(new Error("401 Unauthorized"))).toBe(false);
      expect(isTransientProviderError(new Error("403 Forbidden: API_KEY_INVALID"))).toBe(false);
      expect(isTransientProviderError(new Error("Invalid JSON input syntax"))).toBe(false);
    });

    it("9. Retries transient 429 and succeeds on attempt 2 without failing", async () => {
      process.env.GEMINI_MODEL_PRIORITY = "single-model-429";

      mockGenerateContent
        .mockRejectedValueOnce(new Error("[429] Quota exceeded temporarily"))
        .mockResolvedValueOnce({
          response: {
            text: () =>
              JSON.stringify({
                latex: "x + y = 10",
                joditHtml: "<div style=\"font-size: 20px;\">x + y = 10</div>",
                mathml: "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mrow><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo><mn>10</mn></mrow></math>",
                transcription: "x + y = 10",
              }),
          },
        });

      const fd = new FormData();
      fd.append("rawText", "x + y = 10");

      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        body: fd,
      });

      const res = await postMathOcr(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.latex).toBe("x + y = 10");
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("10. Retries transient 503 and respects maximum 3 total attempts", async () => {
      process.env.GEMINI_MODEL_PRIORITY = "single-model-503";

      // 3 failures
      mockGenerateContent
        .mockRejectedValueOnce(new Error("[503] Overloaded"))
        .mockRejectedValueOnce(new Error("[503] Overloaded"))
        .mockRejectedValueOnce(new Error("[503] Overloaded"));

      const fd = new FormData();
      fd.append("rawText", "2 + 2 = 4");

      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        body: fd,
      });

      const res = await postMathOcr(req);
      expect(res.status).toBe(503);
      expect(mockGenerateContent).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      const data = await res.json();
      expect(data.code).toBe("MODEL_UNAVAILABLE");
      expect(data.error).toContain("ម៉ាស៊ីន AI កំពុងមានសំណើច្រើន");
    });

    it("11. Fails immediately on 400 Bad Request with ZERO retries", async () => {
      process.env.GEMINI_MODEL_PRIORITY = "model-fatal";

      mockGenerateContent.mockRejectedValueOnce(new Error("[400] Bad Request: Invalid arguments"));

      const fd = new FormData();
      fd.append("rawText", "3x = 9");

      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        body: fd,
      });

      const res = await postMathOcr(req);
      expect(res.status).toBe(503);
      // Non-transient error caused loop to break immediately without 2nd or 3rd attempts
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 3. Gemini Output Normalization, Markdown Fences & Sanitization
  // ==========================================================================
  describe("Gemini Output Normalization & Code Fence Stripping", () => {
    it("12. Strips markdown fences from LaTeX", () => {
      const raw = "```latex\n\\frac{a}{b} = c\n```";
      const cleaned = sanitizeMathLatex(raw);
      expect(cleaned).toBe("\\frac{a}{b} = c");
      expect(cleaned).not.toContain("```");
    });

    it("13. Strips markdown fences from MathML", () => {
      const raw = "```xml\n<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mi>x</mi></math>\n```";
      const cleaned = sanitizeMathMLMarkup(raw);
      expect(cleaned).toBe("<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mi>x</mi></math>");
      expect(cleaned).not.toContain("```");
    });

    it("14. Strips markdown fences from HTML", () => {
      const raw = "```html\n<div style=\"color: #000;\">x²</div>\n```";
      const cleaned = sanitizeMathHtml(raw);
      expect(cleaned).toContain("style=\"color: #000");
      expect(cleaned).toContain("x²</div>");
      expect(cleaned).not.toContain("```");
    });

    it("15. Normalizes unlabelled and mixed Gemini response with Khmer explanation", () => {
      const geminiOutput = `
លំហាត់ទី១៖ ចូរគណនាតម្លៃនៃកន្សោម
\`\`\`latex
x^2 + 5x + 6 = 0
\`\`\`

\`\`\`html
<div style="font-size: 24px; color: #111;">x² + 5x + 6 = 0</div>
\`\`\`

\`\`\`mathml
<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>5</mn><mi>x</mi><mo>+</mo><mn>6</mn><mo>=</mo><mn>0</mn></mrow></math>
\`\`\`
      `;

      const norm = normalizeGeminiMathOutput(geminiOutput);
      expect(norm.latex).toBe("x^2 + 5x + 6 = 0");
      expect(norm.html).toContain("font-size: 24px; color: #111");
      expect(norm.mathml).toContain("<math");
      expect(norm.explanationKhmer).toContain("លំហាត់ទី១៖ ចូរគណនាតម្លៃនៃកន្សោម");
    });
  });

  // ==========================================================================
  // 4. Strict HTML & MathML Security Sanitization
  // ==========================================================================
  describe("Security Sanitization (XSS, Event Handlers, Script protocols)", () => {
    it("16. Removes script, iframe, object, and style tags entirely", () => {
      const dangerousHtml = `
        <div style="color: red;">
          <script>alert("XSS")</script>
          <iframe src="https://evil.com"></iframe>
          <object data="malware.swf"></object>
          <span>Safe Math</span>
        </div>
      `;
      const sanitized = sanitizeMathHtml(dangerousHtml);
      expect(sanitized).not.toContain("<script");
      expect(sanitized).not.toContain("alert");
      expect(sanitized).not.toContain("<iframe");
      expect(sanitized).not.toContain("<object");
      expect(sanitized).toContain("<span>Safe Math</span>");
    });

    it("17. Removes inline event handlers (onclick, onload, onerror)", () => {
      const eventHtml = `<span onclick="stealData()" onload="run()" onerror="fail()">x</span>`;
      const sanitized = sanitizeMathHtml(eventHtml);
      expect(sanitized).not.toContain("onclick");
      expect(sanitized).not.toContain("onload");
      expect(sanitized).not.toContain("onerror");
      expect(sanitized).not.toContain("stealData");
    });

    it("18. Removes javascript: active URL protocols", () => {
      const protoHtml = `<a href="javascript:alert(1)">Link</a><img src="javascript:void(0)" />`;
      const sanitized = sanitizeMathHtml(protoHtml);
      expect(sanitized).not.toContain("javascript:");
    });

    it("19. Allowlisted inline styles remain while dangerous CSS is stripped", () => {
      const rawStyle = "color: #000; font-size: 24px; position: fixed; z-index: 99999; border-collapse: collapse; background: expression(alert(1));";
      const safeStyle = sanitizeInlineStyle(rawStyle);
      expect(safeStyle).toContain("color: #000");
      expect(safeStyle).toContain("font-size: 24px");
      expect(safeStyle).toContain("border-collapse: collapse");
      expect(safeStyle).not.toContain("position: fixed");
      expect(safeStyle).not.toContain("z-index");
      expect(safeStyle).not.toContain("expression");
    });

    it("20. Preserves Khmer characters and mathematical Unicode symbols perfectly", () => {
      const khmerMath = "គណនា៖ \\frac{1}{2} + \\frac{3}{4} = [\\_\\_\\_]";
      const sanitized = sanitizeMathLatex(khmerMath);
      expect(sanitized).toContain("គណនា៖");
      expect(sanitized).toContain("\\frac{1}{2}");
      expect(sanitized).toContain("[\\_\\_\\_]");
    });

    it("21. Sanitizes MathML markup and strips unsafe annotations", () => {
      const dangerousMathML = `
        <math xmlns="http://www.w3.org/1998/Math/MathML" onclick="alert(1)">
          <mrow>
            <mi>x</mi>
            <script>console.log(1)</script>
          </mrow>
        </math>
      `;
      const sanitized = sanitizeMathMLMarkup(dangerousMathML);
      expect(sanitized).not.toContain("onclick");
      expect(sanitized).not.toContain("<script");
      expect(sanitized).toContain("<mi>x</mi>");
    });
  });

  // ==========================================================================
  // 5. Leakage Prevention
  // ==========================================================================
  describe("Information Leakage Prevention", () => {
    it("22. API keys and diagnostics never leak in outputs", () => {
      const secret = "AIzaSyTestSecretKey1234567890";
      process.env.GEMINI_API_KEY = secret;

      const norm = normalizeGeminiMathOutput(`
        \`\`\`latex
        x = 5
        \`\`\`
      `);

      expect(JSON.stringify(norm)).not.toContain(secret);
    });
  });
});
