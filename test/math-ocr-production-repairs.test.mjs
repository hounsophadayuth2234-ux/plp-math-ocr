import test from "node:test";
import assert from "node:assert/strict";
import katex from "katex";

// Import our core utility functions
import {
  normalizeLatexForKatex,
  validateLatexWithKatex,
  sanitizeJoditHtml,
  validateMathML,
} from "../src/lib/math-ocr-utils.ts";

test("Math OCR Production Repairs - KaTeX 0.19.0 Validation", async (t) => {
  await t.test("Observation 8a: [___] placeholder is escaped to [\\_\\_\\_] and compiles in KaTeX", () => {
    const rawLatex = "7y^3 - 19y = 42 \\\\ 3/8 + 5/12 = [___]";
    
    // Un-normalized fails KaTeX
    assert.throws(
      () => katex.renderToString(rawLatex, { throwOnError: true }),
      /KaTeX parse error/
    );

    // Normalized passes KaTeX
    const normalized = normalizeLatexForKatex(rawLatex);
    assert.match(normalized, /\\_\\_\\_/);
    const html = katex.renderToString(normalized, { throwOnError: true });
    assert.ok(html.length > 0);

    const validation = validateLatexWithKatex(rawLatex);
    assert.equal(validation.valid, true);
    assert.ok(validation.normalized.length > 0);
  });

  await t.test("Observation 8b: \\begin{array}{r@{\\quad}l} removes unsupported @ column specifier and compiles", () => {
    const rawArrayLatex = "\\begin{array}{r@{\\quad}l} 684 \\\\ + 257 \\\\ \\hline [___] \\end{array}";
    
    // Un-normalized fails KaTeX with unknown column alignment @
    assert.throws(
      () => katex.renderToString(rawArrayLatex, { throwOnError: true }),
      /KaTeX parse error/
    );

    // Normalized passes KaTeX
    const normalized = normalizeLatexForKatex(rawArrayLatex);
    assert.ok(!normalized.includes("@{\\quad}"));
    assert.match(normalized, /\\begin\{array\}\{rl\}/);
    const html = katex.renderToString(normalized, { throwOnError: true });
    assert.ok(html.length > 0);

    const validation = validateLatexWithKatex(rawArrayLatex);
    assert.equal(validation.valid, true);
    assert.ok(validation.normalized);
  });

  await t.test("Standard quadratic equation compiles without regressions", () => {
    const quadratic = "x^2 + 5x + 6 = 0";
    const validation = validateLatexWithKatex(quadratic);
    assert.equal(validation.valid, true);
    assert.ok(validation.normalized);
    const rendered = katex.renderToString(validation.normalized, { throwOnError: true });
    assert.ok(rendered.length > 0);
  });
});

test("Math OCR Production Repairs - Jodit HTML Sanitizer", async (t) => {
  await t.test("Preserves vertical math tables, borders, font sizes, and digit alignment", () => {
    const rawHtml = `<table style="border-collapse: collapse; font-family: 'Courier New', monospace; font-size: 24px; text-align: right; width: auto; margin: 10px 0;">
      <tbody>
        <tr><td style="padding: 2px 6px;">684</td></tr>
        <tr><td style="padding: 2px 6px; border-bottom: 2px solid #000;">+ 257</td></tr>
        <tr><td style="padding: 2px 6px; font-weight: bold;">[___]</td></tr>
      </tbody>
    </table>`;

    const sanitized = sanitizeJoditHtml(rawHtml);
    assert.ok(sanitized.includes("<table"));
    assert.ok(sanitized.includes("border-bottom: 2px solid #000"));
    assert.ok(sanitized.includes("font-size: 24px"));
    assert.ok(sanitized.includes("684"));
    assert.ok(sanitized.includes("+ 257"));
    assert.ok(sanitized.includes("[___]"));
  });

  await t.test("Strips active scripts, event handlers, and javascript: links", () => {
    const dangerousHtml = `<div onclick="alert('pwned')">
      <script>fetch('/stolen-data')</script>
      <a href="javascript:alert(1)">Click</a>
      <img src="x" onerror="alert(2)" />
      <span>Clean text</span>
    </div>`;

    const sanitized = sanitizeJoditHtml(dangerousHtml);
    assert.ok(!sanitized.includes("<script"));
    assert.ok(!sanitized.includes("onclick"));
    assert.ok(!sanitized.includes("onerror"));
    assert.ok(!sanitized.includes("javascript:"));
    assert.ok(sanitized.includes("Clean text"));
  });

  await t.test("Preserves SVG geometry for geometric figures", () => {
    const svgHtml = `<svg width="200" height="150" viewBox="0 0 200 150">
      <polygon points="20,130 160,130 20,30" style="fill:none;stroke:#333;stroke-width:2" />
      <text x="15" y="80">a=3</text>
      <text x="90" y="145">b=4</text>
      <text x="95" y="70">c=5</text>
    </svg>`;

    const sanitized = sanitizeJoditHtml(svgHtml);
    assert.ok(sanitized.includes("<svg"));
    assert.ok(sanitized.includes("<polygon"));
    assert.ok(sanitized.includes("points=\"20,130 160,130 20,30\""));
    assert.ok(sanitized.includes("a=3"));
    assert.ok(sanitized.includes("b=4"));
    assert.ok(sanitized.includes("c=5"));
  });
});

test("Math OCR Production Repairs - MathML Validation", async (t) => {
  await t.test("Validates proper W3C MathML structure", () => {
    const validMathMl = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mrow>
        <msup><mi>x</mi><mn>2</mn></msup>
        <mo>+</mo>
        <mn>5</mn><mi>x</mi>
        <mo>+</mo>
        <mn>6</mn>
        <mo>=</mo>
        <mn>0</mn>
      </mrow>
    </math>`;

    const result = validateMathML(validMathMl);
    assert.equal(result.valid, true);
    assert.ok(result.normalized.includes("xmlns=\"http://www.w3.org/1998/Math/MathML\""));
  });

  await t.test("Detects unclosed or corrupted MathML tags", () => {
    const brokenMathMl = `<math xmlns="http://www.w3.org/1998/Math/MathML">
      <mrow>
        <msup><mi>x</mi>
      </mrow>
    </math>`;

    const result = validateMathML(brokenMathMl);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });
});
