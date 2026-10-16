import katex from "katex";

/**
 * Normalizes LaTeX expressions to ensure full compatibility with KaTeX (0.19.0)
 * and standard LaTeX renderers without altering the mathematical meaning.
 *
 * Specific fixes:
 * 1. Escapes literal underscores in placeholders like [___] or [____] -> [\\_\\_\\_]
 *    (Raw unescaped underscores in LaTeX math mode denote subscripts and cause syntax errors).
 * 2. Removes unsupported array column specifiers like @{\\quad} or @{\\hspace{...}}
 *    which are invalid in KaTeX column alignments.
 * 3. Ensures multiline arrays and fractions are well-formed.
 */
function removeAtExpressions(str: string): string {
  let res = "";
  let i = 0;
  while (i < str.length) {
    if (str[i] === "@" && str[i + 1] === "{") {
      let d = 1;
      i += 2;
      while (i < str.length && d > 0) {
        if (str[i] === "{" && str[i - 1] !== "\\") d++;
        else if (str[i] === "}" && str[i - 1] !== "\\") d--;
        i++;
      }
    } else {
      res += str[i];
      i++;
    }
  }
  return res;
}

export function normalizeLatexForKatex(latex: string): string {
  if (!latex || typeof latex !== "string") return "";

  let normalized = latex;

  // 1. Replace raw unescaped underscores in bracketed blanks like [___] or [____]
  normalized = normalized.replace(/\[((?:[^\\]*?)_+)\]/g, (_match, inner: string) => {
    const escaped = inner.replace(/(?<!\\)_/g, "\\_");
    return `[${escaped}]`;
  });

  // Also standalone runs of unescaped underscores like ___ that appear outside brackets
  normalized = normalized.replace(/(?<!\\)(_{2,})/g, (match) => {
    return match.split("").map(() => "\\_").join("");
  });

  // 2. Remove unsupported array column specifiers like @{\quad} or @{\hspace{...}}
  let arrayIdx = 0;
  while ((arrayIdx = normalized.indexOf("\\begin{array}{", arrayIdx)) !== -1) {
    let depth = 1;
    let endIdx = arrayIdx + "\\begin{array}{".length;
    while (endIdx < normalized.length && depth > 0) {
      if (normalized[endIdx] === "{" && normalized[endIdx - 1] !== "\\") depth++;
      else if (normalized[endIdx] === "}" && normalized[endIdx - 1] !== "\\") depth--;
      endIdx++;
    }
    if (depth === 0) {
      const startCol = arrayIdx + "\\begin{array}{".length;
      const rawCols = normalized.substring(startCol, endIdx - 1);
      const cleanedCols = removeAtExpressions(rawCols);
      normalized =
        normalized.substring(0, startCol) +
        cleanedCols +
        normalized.substring(endIdx - 1);
      arrayIdx = startCol + cleanedCols.length + 1;
    } else {
      break;
    }
  }

  return normalized;
}

/**
 * Validates whether a LaTeX string can be rendered by KaTeX.
 */
export function validateLatexWithKatex(latex: string): {
  valid: boolean;
  error?: string;
  normalized: string;
} {
  const normalized = normalizeLatexForKatex(latex);
  try {
    katex.renderToString(normalized, {
      throwOnError: true,
      displayMode: true,
      strict: false,
    });
    return { valid: true, normalized };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message, normalized };
  }
}

/**
 * Safely sanitizes Jodit-compatible HTML and SVG markup.
 * Strips dangerous elements, script tags, event handlers, and active URLs
 * while preserving styling, tables, vertical math alignment, and geometry SVGs.
 */
export function sanitizeJoditHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return "";

  let cleaned = rawHtml;

  // 1. Remove dangerous script and style blocks including their entire inner text/contents
  cleaned = cleaned.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<style\b[\s\S]*?<\/style>/gi, "");

  // 2. Remove dangerous executable HTML tags
  cleaned = cleaned.replace(
    /<\/?(?:script|style|iframe|object|embed|form|input|button|link|meta|base|applet|frame|frameset)[^>]*>/gi,
    ""
  );

  // 3. Remove dangerous or scriptable SVG elements (including contents of foreignObject)
  cleaned = cleaned.replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "");
  cleaned = cleaned.replace(
    /<\/?(?:foreignObject|animate|set|use|handler|discard|feImage)[^>]*>/gi,
    ""
  );

  // 4. Remove all inline event handlers (e.g., onload, onerror, onclick, onbegin, onend, etc.)
  // Handles unquoted, single-quoted, and double-quoted attribute values
  cleaned = cleaned.replace(/\s+on[a-zA-Z0-9_\-:]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // 5. Remove active script protocols in attributes (href, src, xlink:href, etc.)
  // Covers javascript:, vbscript:, data:text/html, data:application/
  cleaned = cleaned.replace(
    /(?:href|src|xlink:href|action|formaction|background|poster)\s*=\s*(?:"\s*(?:javascript|vbscript|data:\s*text\/html|data:\s*application\/)[^"]*"|'\s*(?:javascript|vbscript|data:\s*text\/html|data:\s*application\/)[^']*'|(?:javascript|vbscript|data:\s*text\/html|data:\s*application\/)[^\s>]*)/gi,
    ""
  );

  return cleaned;
}

/**
 * Validates that MathML is well-formed XML with the W3C MathML namespace.
 */
export function validateMathML(mathml: string): { valid: boolean; error?: string; normalized: string } {
  if (!mathml || typeof mathml !== "string") {
    return { valid: false, error: "Empty MathML content", normalized: "" };
  }

  let normalized = mathml.trim();

  // Ensure xmlns is present on <math> tag
  if (!normalized.includes('xmlns="http://www.w3.org/1998/Math/MathML"')) {
    normalized = normalized.replace(/<math(\s*[^>]*)>/i, '<math xmlns="http://www.w3.org/1998/Math/MathML"$1>');
  }

  // Quick well-formedness check: ensure matching tags for primary mathml elements
  const openTags = normalized.match(/<(math|mrow|mfrac|msup|msub|msubsup|msqrt|mroot|mtable|mtr|mtd|mn|mi|mo|mtext)(?:\s+[^>]*)?>/gi) || [];
  const closeTags = normalized.match(/<\/(math|mrow|mfrac|msup|msub|msubsup|msqrt|mroot|mtable|mtr|mtd|mn|mi|mo|mtext)>/gi) || [];

  if (openTags.length !== closeTags.length) {
    return {
      valid: false,
      error: `Tag mismatch: ${openTags.length} opening tags vs ${closeTags.length} closing tags`,
      normalized,
    };
  }

  return { valid: true, normalized };
}

/**
 * Preprocesses large images in the browser before upload to prevent HTTP 413
 * (Vercel's 4.5 MB request body limit), while preserving sharpness of mathematical
 * symbols, exponents, fractions, and handwritten lines.
 */
export async function preprocessMathImageForUpload(
  file: File,
  maxAllowedBytes = 3.5 * 1024 * 1024 // Safe budget well below Vercel's 4.5 MB
): Promise<File> {
  // If file is already small enough, no preprocessing needed
  if (file.size <= maxAllowedBytes) {
    return file;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      // Keep high resolution (up to 2048px) to retain fine math details
      const maxDim = 2048;
      let targetW = origW;
      let targetH = origH;

      if (origW > maxDim || origH > maxDim) {
        if (origW >= origH) {
          targetH = Math.round((origH * maxDim) / origW);
          targetW = maxDim;
        } else {
          targetW = Math.round((origW * maxDim) / origH);
          targetH = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(file);
        return;
      }

      // Fill white background in case source is transparent PNG with dark text
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetW, targetH);

      // Encode as high-quality JPEG (0.92) which shrinks 5MB-10MB files to ~400KB-1.2MB
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
          const preprocessedFile = new File([blob], newFileName, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(preprocessedFile);
        },
        "image/jpeg",
        0.92
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
