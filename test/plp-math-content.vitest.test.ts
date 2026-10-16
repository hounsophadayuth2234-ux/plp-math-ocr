import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as postMathOcr } from "../src/app/api/math-ocr/route";
import { CORE_TOOLS } from "../src/config/tools";
import nextConfig from "../next.config";
import { metadata as plpMetadata } from "../src/app/plp-math-content/layout";
import {
  normalizeLatexForKatex,
  validateLatexWithKatex,
  sanitizeJoditHtml,
  validateMathML,
} from "../src/lib/math-ocr-utils";

describe("PLP Math Content - Clean URL, Redirects, and Safety Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // 1. Next.js Config Permanent 308 Redirect
  it("1. next.config.ts configures permanent 308 redirect from /math-ocr to /plp-math-content", async () => {
    expect(nextConfig.redirects).toBeDefined();
    if (nextConfig.redirects) {
      const redirectsList = await nextConfig.redirects();
      const mathRedirect = redirectsList.find(
        (r) => r.source === "/math-ocr" && r.destination === "/plp-math-content"
      );
      expect(mathRedirect).toBeDefined();
      expect(mathRedirect?.permanent).toBe(true);
    }
  });

  // 2. Navigation Tools configuration uses clean /plp-math-content route
  it("2. CORE_TOOLS configures Module 01 with clean route /plp-math-content and clean title", () => {
    const mod1 = CORE_TOOLS.find((t) => t.number === 1);
    expect(mod1).toBeDefined();
    expect(mod1?.href).toBe("/plp-math-content");
    expect(mod1?.title).toBe("PLP Math Content");
    expect(mod1?.shortTitle).toBe("PLP Math Content");
    expect(mod1?.description).toContain("LaTeX, Jodit HTML, and MathML");
  });

  // 3. SEO Metadata and Canonical URL verification
  it("3. layout.tsx provides clean title, canonical URL, and OpenGraph metadata", () => {
    expect(plpMetadata.title).toBe("PLP Math Content");
    expect(plpMetadata.description).toBe(
      "Convert math images and text into LaTeX, Jodit HTML, and MathML."
    );
    expect(plpMetadata.alternates?.canonical).toBe(
      "https://ai-toolkit-hub-nu.vercel.app/plp-math-content"
    );
    expect((plpMetadata.openGraph as Record<string, unknown>)?.url).toBe(
      "https://ai-toolkit-hub-nu.vercel.app/plp-math-content"
    );
    expect((plpMetadata.openGraph as Record<string, unknown>)?.title).toBe("PLP Math Content");
  });

  // 4. Verification that /api/math-ocr route contract is strictly preserved
  it("4. preserves POST /api/math-ocr contract without accidental renaming", async () => {
    const fd = new FormData();
    fd.append("rawText", "x^2 + 5x + 6 = 0");

    process.env.GEMINI_API_KEY = "dummy-test-key";
    const req = new NextRequest("http://localhost:3000/api/math-ocr", {
      method: "POST",
      body: fd,
    });

    // Validates handler exists, accepts formData, and handles upstream gracefully
    expect(typeof postMathOcr).toBe("function");
    const res = await postMathOcr(req);
    expect(res).toBeDefined();
  });

  // 5. Math Safety Test: x² + 5x + 6 = 0
  it("5. validates standard quadratic equation compiles in KaTeX without errors", () => {
    const latex = "x^2 + 5x + 6 = 0";
    const sanitized = normalizeLatexForKatex(latex);
    const validation = validateLatexWithKatex(sanitized);
    expect(validation.valid).toBe(true);
  });

  // 6. Math Safety Test: Vertical addition with unfilled placeholder
  it("6. validates vertical addition 684 + 257 with blank [___] escapes underscores", () => {
    const rawLatex = "\\begin{array}{r@{\\quad}l} 684 \\\\ + 257 \\\\ \\hline [___] \\end{array}";
    const sanitized = normalizeLatexForKatex(rawLatex);

    // Replaces unsupported @{\quad}
    expect(sanitized).not.toContain("@{\\quad}");
    expect(sanitized).toContain("[\\_\\_\\_]");

    const validation = validateLatexWithKatex(sanitized);
    expect(validation.valid).toBe(true);
  });

  // 7. Math Safety Test: 7y³ - 19y = 42 and 3/8 + 5/12 = [___]
  it("7. validates multiline fractions and placeholder 7y^3 - 19y = 42", () => {
    const rawLatex = "7y^3 - 19y = 42 \\\\ \\frac{3}{8} + \\frac{5}{12} = [___]";
    const sanitized = normalizeLatexForKatex(rawLatex);
    expect(sanitized).toContain("[\\_\\_\\_]");

    const validation = validateLatexWithKatex(sanitized);
    expect(validation.valid).toBe(true);
  });

  // 8. Jodit HTML sanitization: preserves vertical math, strips scripts
  it("8. Jodit HTML sanitization preserves vertical tables and strips dangerous script tags", () => {
    const unsafeHtml = `
      <div style="font-size: 28px;">
        <table style="border-collapse: collapse;"><tr><td>684</td></tr></table>
        <script>alert('xss')</script>
        <img src="x" onerror="alert(1)" />
      </div>
    `;
    const clean = sanitizeJoditHtml(unsafeHtml);
    expect(clean).toContain("<table");
    expect(clean).toContain("684");
    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain("onerror");
  });

  // 9. MathML Validation
  it("9. validates well-formed W3C MathML markup", () => {
    const mathml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>5</mn><mi>x</mi><mo>+</mo><mn>6</mn><mo>=</mo><mn>0</mn></mrow></math>`;
    const validation = validateMathML(mathml);
    expect(validation.valid).toBe(true);
  });

  // 10. Large image 413 response test
  it("10. returns HTTP 413 with descriptive PAYLOAD_TOO_LARGE when image exceeds 4.5 MB", async () => {
    const largeBuffer = new Uint8Array(5 * 1024 * 1024);
    largeBuffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const largeBlob = new Blob([largeBuffer], { type: "image/png" });

    const fd = new FormData();
    fd.append("image", largeBlob, "oversized.png");

    const req = new NextRequest("http://localhost:3000/api/math-ocr", {
      method: "POST",
      body: fd,
    });

    const res = await postMathOcr(req);
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.code).toBe("PAYLOAD_TOO_LARGE");
    expect(data.error).toContain("4.5 MB");
  });
});
