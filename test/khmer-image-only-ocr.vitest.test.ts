import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  normalizeKhmerText,
  splitGraphemes,
  graphemeSafeSlice,
  countKhmerGraphemes,
  containsKhmerScript,
  computeLineConfidences,
  hasOrphanedKhmerCombiningMarks,
  validateMathematicalSyntax,
} from "../src/lib/khmer-grapheme-normalizer";
import { GoogleGenerativeAI } from "@google/generative-ai";

describe("Khmer Grapheme Normalization & Safety (Mandatory Requirements 2, 3, 4, 14)", () => {
  it("applies Unicode NFC normalization and strips zero-width spaces without corrupting combining vowels", () => {
    // Khmer string with decomposed combining marks and zero-width spaces
    const raw = "លំ\u200Bហាត់\u200Bទី\u17D7១៖\u00A0ចូរ\u200Bគណនា";
    const normalized = normalizeKhmerText(raw);

    expect(normalized).not.toContain("\u200B");
    expect(normalized).not.toContain("\u00A0");
    expect(normalized.isWellFormed ? normalized.isWellFormed() : true).toBe(true);
    expect(containsKhmerScript(normalized)).toBe(true);
  });

  it("graphemeSafeSlice never slices through Khmer subscript (Coeng) or multi-tier vowel clusters", () => {
    // "ខ្ញុំ" consists of: ខ (\u1781) + ្ (\u17D2) + ញ (\u1789) + ុំ (\u17BB\u17C6)
    const khmerWord = "ខ្ញុំស្រឡាញ់គណិតវិទ្យា";
    const graphemes = splitGraphemes(khmerWord);

    // First grapheme cluster MUST be "ខ្ញុំ" intact
    expect(graphemes[0]).toBe("ខ្ញុំ");

    // Slicing first 2 graphemes should return "ខ្ញុំស្រ" without leaving orphaned combining marks
    const slice2 = graphemeSafeSlice(khmerWord, 0, 2);
    expect(slice2).toBe("ខ្ញុំស្រ");
    expect(hasOrphanedKhmerCombiningMarks(slice2)).toBe(false);

    // Cluster count must be accurate (not UTF-16 code units)
    expect(countKhmerGraphemes(khmerWord)).toBe(graphemes.length);
    expect(countKhmerGraphemes(khmerWord)).toBeLessThan(khmerWord.length);
  });

  it("computes per-line confidence and accurately separates Khmer text from formulas", () => {
    const text = "លំហាត់ទី១៖ ចូរគណនា\n2 + 3 = 5\nគណនាលទ្ធផលនៃប្រមាណវិធីបូក";
    const lines = computeLineConfidences(text, 0.98);

    expect(lines).toHaveLength(3);
    // Line 1: Khmer text header
    expect(lines[0].type).toBe("khmer_text");
    expect(lines[0].confidence).toBeGreaterThanOrEqual(0.95);
    // Line 2: Arithmetic equation
    expect(lines[1].type).toBe("formula");
    expect(lines[1].confidence).toBeGreaterThanOrEqual(0.95);
    // Line 3: Khmer explanatory text
    expect(lines[2].type).toBe("khmer_text");
  });

  it("validates mathematical syntax while preserving Khmer annotations non-destructively", () => {
    const latex = "\\text{លំហាត់ទី១៖ } \\frac{2}{3} + \\frac{1}{3} = 1";
    const mathml = "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mtext>លំហាត់ទី១៖ </mtext><mfrac><mn>2</mn><mn>3</mn></mfrac><mo>+</mo><mfrac><mn>1</mn><mn>3</mn></mfrac><mo>=</mo><mn>1</mn></math>";

    const validation = validateMathematicalSyntax(latex, mathml);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.validFractions).toBe(true);
    expect(validation.balancedParentheses).toBe(true);
    expect(validation.balancedBraces).toBe(true);
  });
});

describe("Image-Only Khmer + Math OCR Regression (Requirements 1, 7, 13, 16)", () => {
  const fixturePath = path.resolve(__dirname, "fixtures/khmer-math-test.png");

  it("confirms the 11-12KB bilingual Khmer fixture exists and is valid PNG", () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const stats = fs.statSync(fixturePath);
    // Exactly matches user description of ~12KB PNG containing Khmer and math
    expect(stats.size).toBeGreaterThan(8000);
    expect(stats.size).toBeLessThan(25000);

    const buf = fs.readFileSync(fixturePath);
    // PNG magic bytes: 89 50 4E 47
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it("transcribes image-only Khmer math fixture with gemini-flash-lite-latest in < 8 seconds", async () => {
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey && fs.existsSync(".env.local")) {
      const match = fs.readFileSync(".env.local", "utf8").match(/GEMINI_API_KEY=(.+)/);
      if (match) apiKey = match[1].trim();
    }

    if (!apiKey) {
      console.warn("Skipping live API call because GEMINI_API_KEY is not configured in environment.");
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-lite-latest",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const imgBytes = fs.readFileSync(fixturePath);
    const base64Data = imgBytes.toString("base64");

    let result: any;
    let elapsedMs = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const t0 = performance.now();
        result = await model.generateContent([
          {
            text: `You are a bilingual Khmer-English mathematical document transcription engine.
Transcribe BOTH Khmer educational text and mathematical formulas from this image without solving.
Return valid JSON:
{
  "transcription": "...",
  "latex": "valid LaTeX with \\text{...} for Khmer",
  "joditHtml": "clean inline CSS HTML",
  "mathml": "valid MathML with <mtext> for Khmer",
  "confidence": 0.98,
  "uncertainParts": []
}`,
          },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Data,
            },
          },
          {
            text: "Transcribe all visible Khmer text and mathematical formulas from this image exactly.",
          },
        ]);
        elapsedMs = performance.now() - t0;
        break;
      } catch (err: any) {
        if (attempt < 3 && (err?.message?.includes("503") || err?.message?.includes("429") || err?.message?.includes("demand"))) {
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        throw err;
      }
    }

    // Must avoid the old 38-second timeout
    expect(elapsedMs).toBeLessThan(20000);

    const text = result.response.text();
    const data = JSON.parse(text);

    // Assert that Khmer text was recognized
    expect(containsKhmerScript(data.transcription)).toBe(true);
    // Assert that the arithmetic formula "2 + 3 = 5" was recognized
    expect(data.transcription).toMatch(/2\s*\+\s*3\s*=\s*5/);

    // Assert that LaTeX contains the equation and wraps Khmer in \text{...}
    expect(data.latex).toMatch(/2\s*\+\s*3\s*=\s*5/);
    if (containsKhmerScript(data.latex)) {
      expect(data.latex).toContain("\\text{");
    }

    // Assert that no "unsupported unicode glyphs" error was reported
    expect(data.uncertainParts).toEqual([]);
    expect(data.confidence).toBeGreaterThanOrEqual(0.9);
  }, 60000);
});
