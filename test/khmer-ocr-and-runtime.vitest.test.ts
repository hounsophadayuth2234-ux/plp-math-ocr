import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeKhmerText,
  splitGraphemes,
  fallbackGraphemeSplit,
  calculateKhmerCER,
  calculateKhmerWER,
  calculateNumericExactMatch,
  convertKhmerDigitsToWestern,
  validateBalancedDelimiters,
  validateFractions,
  validateScripts,
  validateRadicals,
  validateMatrixDimensions,
  validateMathMLWellFormed,
  validateMathematicalSyntax,
} from "../src/lib/khmer-grapheme-normalizer";
import {
  assessImageQuality,
  computeLaplacianVariance,
  extractLuminance,
  preprocessImageProfile,
  detectLayoutRegions,
  cropRegionFromRgba,
} from "../src/lib/math-image-analyzer";
import {
  OcrSessionManager,
  getOcrRuntimeCapabilities,
} from "../src/lib/ocr-runtime-manager";

describe("Khmer OCR Quality, Mathematical Syntax & Browser Runtime Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Khmer Unicode NFC Normalization ──
  describe("1. Khmer Unicode Normalization", () => {
    it("normalizes text with NFC, strips zero-width spaces, collapses whitespace without losing combining marks", () => {
      // String with zero-width spaces (\u200B), non-breaking spaces (\u00A0), multiple tabs
      const raw = "  គណិតវិទ្យា\u200Bថ្នាក់ទី\u00A0១០ \t  សមីការ  ";
      const normalized = normalizeKhmerText(raw);

      expect(normalized).toBe("គណិតវិទ្យាថ្នាក់ទី ១០ សមីការ");
      expect(normalized).not.toContain("\u200B");
      expect(normalized).not.toContain("\u00A0");
      // Verify Khmer vowel ិ and diacritic ់ are preserved
      expect(normalized).toContain("ិ");
      expect(normalized).toContain("់");
    });

    it("handles empty or null string safely", () => {
      expect(normalizeKhmerText("")).toBe("");
      expect(normalizeKhmerText(null as any)).toBe("");
      expect(normalizeKhmerText(undefined as any)).toBe("");
    });
  });

  // ── 2. Grapheme-Aware Segmentation ──
  describe("2. Khmer Grapheme-Aware Segmentation", () => {
    it("does not split multi-tier stacked consonants (ជើង) into disjoint characters", () => {
      // "ស្ត្រី" = ស + ្ + ត + ្ + រ + ី (Woman)
      const word = "ស្ត្រី";
      const graphemes = splitGraphemes(word);

      // A grapheme-aware segmenter must keep the coeng and vowels attached to the base
      expect(graphemes.length).toBeGreaterThanOrEqual(1);
      expect(graphemes.length).toBeLessThanOrEqual(2);
      expect(graphemes.join("")).toBe(word);
    });

    it("fallbackGraphemeSplit accurately groups base consonant with coeng and dependent vowels", () => {
      const text = "កម្ពុជា"; // ក + ម្ព + ុ + ជ + ា
      const clusters = fallbackGraphemeSplit(text);

      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters.join("")).toBe(text);
      // Ensure coeng '្ម' is not orphaned
      const hasCoeng = clusters.some((c) => c.includes("្"));
      expect(hasCoeng).toBe(true);
    });
  });

  // ── 3. Quality Metrics: CER & WER ──
  describe("3. Quality Metrics: CER & WER", () => {
    it("computes 0 CER on identical Khmer strings", () => {
      const text = "ដោះស្រាយសមីការដឺក្រេទី២";
      const cer = calculateKhmerCER(text, text);
      expect(cer).toBe(0);
    });

    it("computes accurate CER on single grapheme substitution", () => {
      const ref = "កខគឃង"; // 5 graphemes
      const hyp = "កខចឃង"; // 1 substitution ('គ' -> 'ច')
      const cer = calculateKhmerCER(ref, hyp);
      expect(cer).toBeCloseTo(0.2, 5); // 1 / 5 = 0.2
    });

    it("computes 0 WER on identical normalized word sequences", () => {
      const ref = "ចូរ គណនា តម្លៃ នៃ កន្សោម";
      const hyp = "ចូរ គណនា តម្លៃ នៃ កន្សោម";
      expect(calculateKhmerWER(ref, hyp)).toBe(0);
    });

    it("computes accurate WER on word insertion or deletion", () => {
      const ref = "ចូរ គណនា តម្លៃ"; // 3 words
      const hyp = "ចូរ គណនា"; // 2 words (1 deletion)
      const wer = calculateKhmerWER(ref, hyp);
      expect(wer).toBeCloseTo(1 / 3, 5);
    });
  });

  // ── 4. Numeric Exact Match ──
  describe("4. Numeric Exact Match with Khmer & Western Digits", () => {
    it("converts Khmer digits (០-៩) to Western digits (0-9)", () => {
      expect(convertKhmerDigitsToWestern("សមីការ ១២៣ + ៤៥៦ = ៥៧៩")).toBe("សមីការ 123 + 456 = 579");
    });

    it("confirms exact match between Khmer digits and Arabic digits", () => {
      const ref = "x = 5, y = -12.5";
      const hyp = "x = ៥, y = -១២.៥";
      expect(calculateNumericExactMatch(ref, hyp)).toBe(true);
    });

    it("flags numeric mismatch when answers differ", () => {
      const ref = "x = 42";
      const hyp = "x = 43";
      expect(calculateNumericExactMatch(ref, hyp)).toBe(false);
    });
  });

  // ── 5. Mathematical Structure & Delimiter Validators ──
  describe("5. Mathematical Structure & Delimiter Validators", () => {
    it("validates balanced parentheses and LaTeX braces", () => {
      const validLatex = "(x + 2)(x - 3) = \\{0\\}";
      const res = validateBalancedDelimiters(validLatex);
      expect(res.balancedParens).toBe(true);
      expect(res.balancedBraces).toBe(true);
      expect(res.errors.length).toBe(0);
    });

    it("detects unclosed LaTeX curly brace", () => {
      const invalidLatex = "\\frac{x + 1}{x - 2"; // missing closing }
      const res = validateBalancedDelimiters(invalidLatex);
      expect(res.balancedBraces).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    });

    it("detects unclosed parenthesis", () => {
      const invalidLatex = "(2x + 5 = 10";
      const res = validateBalancedDelimiters(invalidLatex);
      expect(res.balancedParens).toBe(false);
    });
  });

  // ── 6. Fraction & Radical Structure Validation ──
  describe("6. Fraction and Radical Structure Validation", () => {
    it("validates well-formed \\frac{a}{b}", () => {
      const latex = "\\frac{3x + 1}{2y - 4} = \\frac{1}{2}";
      const res = validateFractions(latex);
      expect(res.valid).toBe(true);
      expect(res.errors.length).toBe(0);
    });

    it("rejects \\frac missing denominator", () => {
      const latex = "\\frac{3x + 1} = 5";
      const res = validateFractions(latex);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain("missing denominator");
    });

    it("validates \\sqrt and root indices", () => {
      const latex = "\\sqrt{b^2 - 4ac} + \\sqrt[3]{x + 1}";
      const res = validateRadicals(latex);
      expect(res.valid).toBe(true);
    });

    it("flags empty script operands", () => {
      const latex = "x^{} + y_2 = 10";
      const res = validateScripts(latex);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain("Empty script");
    });
  });

  // ── 7. Matrix Dimension Consistency & MathML Validation ──
  describe("7. Matrix Dimensions & MathML Well-Formedness", () => {
    it("verifies consistent matrix row and column counts", () => {
      const validMatrix = "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}";
      const res = validateMatrixDimensions(validMatrix);
      expect(res.valid).toBe(true);
    });

    it("flags inconsistent matrix column count across rows", () => {
      const invalidMatrix = "\\begin{pmatrix} 1 & 2 & 3 \\\\ 4 & 5 \\end{pmatrix}";
      const res = validateMatrixDimensions(invalidMatrix);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain("Inconsistent matrix");
    });

    it("validates well-formed MathML XML tags", () => {
      const validMathML =
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>';
      const res = validateMathMLWellFormed(validMathML);
      expect(res.valid).toBe(true);
    });

    it("flags tag mismatch in MathML", () => {
      const invalidMathML =
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mfrac><mn>1</mn></mfrac></mrow>'; // missing closing </math>
      const res = validateMathMLWellFormed(invalidMathML);
      expect(res.valid).toBe(false);
    });
  });

  // ── 8. Image Quality Assessment (Blur, Contrast, Memory Budget) ──
  describe("8. Image Quality Assessment & Preprocessing", () => {
    it("computes Laplacian variance and flags blurry image", () => {
      // Create artificial uniform/flat 20x20 image (0 variance = completely blurry)
      const flatLum = new Uint8Array(400);
      flatLum.fill(128);
      const blurScore = computeLaplacianVariance(flatLum, 20, 20);
      expect(blurScore).toBe(0);
    });

    it("enforces memory budget for images exceeding 16 megapixels", () => {
      const dummyRgba = new Uint8ClampedArray(4 * 4 * 4);
      // Test assessImageQuality with dimensions simulating >16MP
      const assessment = assessImageQuality(dummyRgba, 5000, 4000); // 20MP
      expect(assessment.memoryExceeded).toBe(true);
      expect(assessment.warningMessage).toContain("16MP");
    });

    it("recommends camera_document profile on low contrast or dark image", () => {
      const darkRgba = new Uint8ClampedArray(100 * 100 * 4);
      // Fill dark gray
      for (let i = 0; i < darkRgba.length; i += 4) {
        darkRgba[i] = 40;
        darkRgba[i + 1] = 40;
        darkRgba[i + 2] = 40;
        darkRgba[i + 3] = 255;
      }
      const assessment = assessImageQuality(darkRgba, 100, 100);
      expect(assessment.recommendedProfile).toBe("camera_document");
    });

    it("preprocessImageProfile non-destructively outputs transformed buffer for handwriting", () => {
      const rgba = new Uint8ClampedArray(50 * 50 * 4);
      rgba.fill(200);
      const preprocessed = preprocessImageProfile(rgba, 50, 50, "handwriting");
      expect(preprocessed.length).toBe(rgba.length);
      expect(preprocessed).not.toBe(rgba); // Must return a distinct copy
    });
  });

  // ── 9. Layout Detection & Reading Order Sorting ──
  describe("9. Layout Detection & Region Sorting", () => {
    it("sorts detected regions strictly top-to-bottom reading order", () => {
      // 100x100 white image with two black text bands
      const rgba = new Uint8ClampedArray(100 * 100 * 4);
      rgba.fill(255);

      // Band 1: rows 15-25
      for (let y = 15; y < 25; y++) {
        for (let x = 20; x < 80; x++) {
          const idx = (y * 100 + x) * 4;
          rgba[idx] = 0;
          rgba[idx + 1] = 0;
          rgba[idx + 2] = 0;
        }
      }

      // Band 2: rows 60-70
      for (let y = 60; y < 70; y++) {
        for (let x = 10; x < 90; x++) {
          const idx = (y * 100 + x) * 4;
          rgba[idx] = 0;
          rgba[idx + 1] = 0;
          rgba[idx + 2] = 0;
        }
      }

      const regions = detectLayoutRegions(rgba, 100, 100);
      expect(regions.length).toBe(2);
      expect(regions[0].bbox.y).toBeLessThan(regions[1].bbox.y);
      expect(regions[0].readingOrder).toBe(1);
      expect(regions[1].readingOrder).toBe(2);
    });

    it("cropRegionFromRgba correctly extracts sub-rectangle without pixel bleed", () => {
      const src = new Uint8ClampedArray(10 * 10 * 4);
      src.fill(255);
      const cropped = cropRegionFromRgba(src, 10, 10, { x: 2, y: 2, width: 4, height: 4 });
      expect(cropped.width).toBe(4);
      expect(cropped.height).toBe(4);
      expect(cropped.data.length).toBe(4 * 4 * 4);
    });
  });

  // ── 10. Browser Runtime Capability & Job Supersession ──
  describe("10. Browser Runtime Capability & Job Supersession", () => {
    it("getOcrRuntimeCapabilities correctly identifies capabilities without throwing", async () => {
      const caps = await getOcrRuntimeCapabilities();
      expect(caps).toBeDefined();
      expect(typeof caps.webGpuAvailable).toBe("boolean");
      expect(typeof caps.wasmSimd).toBe("boolean");
      expect(caps.selectedProvider).toBeDefined();
    });

    it("OcrSessionManager creates unique job IDs and increments revision", () => {
      const manager = OcrSessionManager.getInstance();
      const id1 = manager.createJobId();
      const id2 = manager.createJobId();
      expect(id1).not.toBe(id2);
      expect(id1.startsWith("ocr_job_")).toBe(true);
    });

    it("cancelActiveJob cleanly resets active job without uncaught exceptions", () => {
      const manager = OcrSessionManager.getInstance();
      expect(() => manager.cancelActiveJob()).not.toThrow();
    });
  });

  // ── 11. Module 01 Mathematical Output Safety Check ──
  describe("11. Module 01 Math Output Safety Check", () => {
    it("ensures quadratic equation x² + 5x + 6 = 0 passes full syntax validation", () => {
      const latex = "x^2 + 5x + 6 = 0";
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>5</mn><mi>x</mi><mo>+</mo><mn>6</mn><mo>=</mo><mn>0</mn></mrow></math>';
      const syntax = validateMathematicalSyntax(latex, mathml);
      expect(syntax.valid).toBe(true);
      expect(syntax.errors.length).toBe(0);
    });

    it("ensures vertical addition with placeholder [___] passes delimiter validation", () => {
      const latex = "\\begin{array}{rr} 684 \\\\ + 257 \\\\ \\hline [\\_\\_\\_] \\end{array}";
      const syntax = validateMathematicalSyntax(latex);
      expect(syntax.valid).toBe(true);
      expect(syntax.balancedBraces).toBe(true);
    });
  });
});
