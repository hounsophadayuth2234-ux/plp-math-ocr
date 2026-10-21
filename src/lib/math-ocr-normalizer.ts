/**
 * Gemini Output Normalization and Multi-Format Sanitizer
 *
 * Dedicated to Feature 1 (PLP Math Content / Math OCR).
 * Ensures deterministic extraction and strict sanitization of:
 * 1. LaTeX (KaTeX 0.19.0 verified, no markdown fences)
 * 2. HTML (Jodit-compatible, strict allowlist for tags & inline CSS, no active scripts/handlers)
 * 3. MathML (W3C standard namespace, allowlisted math tags, no script/event handlers)
 * 4. Khmer text & Unicode mathematical symbols preserved with NFC normalization.
 */

import { normalizeKhmerText } from "./khmer-grapheme-normalizer";
import { normalizeLatexForKatex } from "./math-ocr-utils";

export interface MathOcrResult {
  explanationKhmer?: string;
  latex: string;
  mathml: string;
  html: string;
  sourceText?: string;
  warnings?: string[];
}

// -----------------------------------------------------------
// Allowlisted HTML tags and attributes for inline math
// -----------------------------------------------------------
export const ALLOWED_HTML_TAGS = new Set([
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "strong",
  "em",
  "b",
  "i",
  "br",
  "sup",
  "sub",
  // MathML elements allowed inside HTML
  "math",
  "mrow",
  "mfrac",
  "msup",
  "msub",
  "msubsup",
  "msqrt",
  "mroot",
  "mtable",
  "mtr",
  "mtd",
  "mn",
  "mi",
  "mo",
  "mtext",
  // Geometry SVG elements (pure presentation)
  "svg",
  "g",
  "path",
  "line",
  "rect",
  "circle",
  "text",
  "polyline",
  "polygon",
]);

const ALLOWED_INLINE_CSS_PROPERTIES = new Set([
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-align",
  "vertical-align",
  "white-space",
  "display",
  "margin",
  "margin-top",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "padding",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "border",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "border-collapse",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "line-height",
  "flex-direction",
  "align-items",
  "justify-content",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "fill",
]);

/**
 * Sanitizes inline CSS style strings according to the strict allowlist.
 * Removes forbidden properties like position: fixed, uncontrolled z-index, expression(), etc.
 */
export function sanitizeInlineStyle(styleAttr: string): string {
  if (!styleAttr || typeof styleAttr !== "string") return "";

  const declarations = styleAttr.split(";");
  const safeDeclarations: string[] = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;

    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();

    if (!ALLOWED_INLINE_CSS_PROPERTIES.has(prop)) continue;

    // Reject dangerous values: expression, url, javascript, position fixed
    if (/expression|javascript:|url\(/i.test(val)) continue;
    if (prop === "position" && /fixed|absolute/i.test(val)) continue;

    safeDeclarations.push(`${prop}: ${val}`);
  }

  return safeDeclarations.join("; ");
}

/**
 * Strict HTML sanitizer for math presentation.
 * Strips disallowed tags, event handlers, scripts, active protocols, and unsafe styles.
 */
export function sanitizeMathHtml(html: string): string {
  if (!html || typeof html !== "string") return "";

  // 1. Remove markdown fences if present
  let cleaned = html
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // 2. Strip dangerous script/style blocks with contents
  cleaned = cleaned.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "");

  // 3. Strip dangerous executable tags
  cleaned = cleaned.replace(
    /<\/?(?:script|style|iframe|object|embed|form|input|button|link|meta|base|applet|frame|frameset|foreignObject|animate|set|use|handler|discard|feImage)[^>]*>/gi,
    ""
  );

  // 4. Strip all event handlers: on*
  cleaned = cleaned.replace(/\s+on[a-zA-Z0-9_\-:]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // 5. Strip dangerous active protocols (javascript:, vbscript:, data:text/html)
  cleaned = cleaned.replace(
    /(?:href|src|xlink:href|action|formaction|background|poster)\s*=\s*(?:"\s*(?:javascript|vbscript|data:\s*text\/html|data:\s*application\/)[^"]*"|'\s*(?:javascript|vbscript|data:\s*text\/html|data:\s*application\/)[^']*'|(?:javascript|vbscript|data:\s*text\/html|data:\s*application\/)[^\s>]*)/gi,
    ""
  );

  // 6. Sanitize inline style attributes
  cleaned = cleaned.replace(/\s+style\s*=\s*"([^"]*)"/gi, (_match, styleContent: string) => {
    const safe = sanitizeInlineStyle(styleContent);
    return safe ? ` style="${safe}"` : "";
  });
  cleaned = cleaned.replace(/\s+style\s*=\s*'([^']*)'/gi, (_match, styleContent: string) => {
    const safe = sanitizeInlineStyle(styleContent);
    return safe ? ` style="${safe}"` : "";
  });

  return cleaned.trim();
}

/**
 * Sanitizes LaTeX output: removes markdown code fences, embedded HTML/scripts,
 * and escapes KaTeX-incompatible constructs.
 */
export function sanitizeMathLatex(latex: string): string {
  if (!latex || typeof latex !== "string") return "";

  let cleaned = latex
    .replace(/^```(?:latex|tex)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Remove any stray HTML tags embedded in LaTeX
  cleaned = cleaned.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>/g, "");

  // Apply KaTeX compatibility normalizations (underscores, array columns)
  cleaned = normalizeLatexForKatex(cleaned);

  return cleaned.trim();
}

/**
 * Sanitizes MathML output: allows only safe W3C MathML tags,
 * rejects script annotations, event handlers, and active protocols.
 */
export function sanitizeMathMLMarkup(mathml: string): string {
  if (!mathml || typeof mathml !== "string") return "";

  let cleaned = mathml
    .replace(/^```(?:mathml|xml)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Ensure xmlns is present on <math> tag
  if (cleaned.startsWith("<math") && !cleaned.includes('xmlns="http://www.w3.org/1998/Math/MathML"')) {
    cleaned = cleaned.replace(/<math(\s*[^>]*)>/i, '<math xmlns="http://www.w3.org/1998/Math/MathML"$1>');
  }

  // Strip script and unsafe tags
  cleaned = cleaned.replace(/<\/?(?:script|iframe|object|embed|annotation-xml)[^>]*>/gi, "");
  cleaned = cleaned.replace(/\s+on[a-zA-Z0-9_\-:]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  cleaned = cleaned.replace(/href\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, "");

  return cleaned.trim();
}

/**
 * Normalizes raw Gemini output into a clean, strictly-typed MathOcrResult.
 * Handles JSON structures, markdown code blocks, unlabelled blocks, and Khmer commentary.
 */
export function normalizeGeminiMathOutput(rawOutput: string): MathOcrResult {
  const warnings: string[] = [];
  if (!rawOutput || !rawOutput.trim()) {
    return {
      latex: "",
      mathml: "",
      html: "",
      sourceText: "",
      warnings: ["Empty output received from model"],
    };
  }

  const trimmed = rawOutput.trim();

  // 1. Try parsing JSON first (recommended system prompt response)
  let jsonCandidate = trimmed;
  if (jsonCandidate.startsWith("```")) {
    jsonCandidate = jsonCandidate
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  if (jsonCandidate.startsWith("{") && jsonCandidate.endsWith("}")) {
    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      const rawLatex = typeof parsed.latex === "string" ? parsed.latex : "";
      const rawHtml =
        typeof parsed.joditHtml === "string"
          ? parsed.joditHtml
          : typeof parsed.html === "string"
          ? parsed.html
          : "";
      const rawMathML = typeof parsed.mathml === "string" ? parsed.mathml : "";
      const transcription =
        typeof parsed.transcription === "string"
          ? parsed.transcription
          : typeof parsed.rawDescription === "string"
          ? parsed.rawDescription
          : "";

      return {
        explanationKhmer: transcription ? normalizeKhmerText(transcription) : undefined,
        latex: sanitizeMathLatex(rawLatex),
        html: sanitizeMathHtml(rawHtml),
        mathml: sanitizeMathMLMarkup(rawMathML),
        sourceText: transcription || rawLatex,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch {
      warnings.push("Failed to parse JSON response; falling back to code block regex extraction.");
    }
  }

  // 2. Fallback: Parse markdown code blocks and surrounding text
  let latex = "";
  let html = "";
  let mathml = "";
  let explanationKhmer = "";

  // Extract ```latex ... ``` or ```tex ... ```
  const latexMatch = trimmed.match(/```(?:latex|tex)\s*([\s\S]*?)```/i);
  if (latexMatch) {
    latex = latexMatch[1].trim();
  }

  // Extract ```html ... ```
  const htmlMatch = trimmed.match(/```html\s*([\s\S]*?)```/i);
  if (htmlMatch) {
    html = htmlMatch[1].trim();
  }

  // Extract ```mathml ... ``` or ```xml ... ``` with math
  const mathmlMatch = trimmed.match(/```(?:mathml|xml)\s*(<math[\s\S]*?<\/math>)\s*```/i);
  if (mathmlMatch) {
    mathml = mathmlMatch[1].trim();
  }

  // Handle unlabelled code blocks ``` ... ```
  const unlabelledBlocks = trimmed.match(/```\s*([\s\S]*?)```/g) || [];
  for (const block of unlabelledBlocks) {
    const inner = block.replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    if (!mathml && inner.startsWith("<math") && inner.includes("</math>")) {
      mathml = inner;
    } else if (!html && (inner.startsWith("<div") || inner.startsWith("<table") || inner.includes("<span style="))) {
      html = inner;
    } else if (!latex && (inner.includes("\\frac") || inner.includes("\\begin") || inner.includes("\\text{"))) {
      latex = inner;
    }
  }

  // Extract plain text / Khmer text outside code blocks
  const textWithoutBlocks = trimmed.replace(/```[\s\S]*?```/g, "").trim();
  if (textWithoutBlocks) {
    explanationKhmer = normalizeKhmerText(textWithoutBlocks);
  }

  // Check if formats are missing
  if (!latex) warnings.push("LaTeX format was not detected in output.");
  if (!html) warnings.push("HTML format was not detected in output.");
  if (!mathml) warnings.push("MathML format was not detected in output.");

  return {
    explanationKhmer: explanationKhmer || undefined,
    latex: sanitizeMathLatex(latex),
    html: sanitizeMathHtml(html),
    mathml: sanitizeMathMLMarkup(mathml),
    sourceText: textWithoutBlocks || latex,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
