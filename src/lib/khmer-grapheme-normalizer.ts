/**
 * Khmer Grapheme-Aware Normalization, Linguistic Metrics & Mathematical Syntax Validation
 *
 * Requirements satisfied:
 * - NFC normalization and zero-width/non-breaking space sanitization.
 * - Grapheme cluster segmentation (Intl.Segmenter('km') with robust fallback)
 *   preventing corruption or splitting of Khmer vowels, subscripts (ជើង), and diacritics.
 * - Quality metrics: CER on grapheme clusters, WER on normalized words, exact numeric match.
 * - Formula structure and mathematical syntax validators:
 *   balanced parentheses, balanced LaTeX braces, valid \frac, valid \sqrt,
 *   valid superscript/subscript operands, matrix dimension consistency,
 *   and well-formed MathML validation.
 */

// ── 1. Khmer Unicode Normalization ──

/**
 * Normalizes Khmer text using Unicode NFC normalization, removes zero-width spaces (\u200B),
 * standardizes non-breaking spaces (\u00A0), collapses horizontal whitespace, and trims.
 * NEVER strips Khmer combining marks, subscripts (ជើង), or diacritics.
 */
export function normalizeKhmerText(rawText: string): string {
  if (!rawText || typeof rawText !== "string") return "";

  return rawText
    .normalize("NFC")
    .replace(/\u200B/g, "") // Remove zero-width spaces used as word boundaries
    .replace(/\u00A0/g, " ") // Convert non-breaking spaces to standard space
    .replace(/[ \t]+/g, " ") // Collapse multiple spaces/tabs
    .trim();
}

/**
 * Fallback grapheme splitter for environments lacking Intl.Segmenter.
 * Groups consonants with subsequent coeng (U+17D2 + consonant), dependent vowels, and diacritics.
 */
export function fallbackGraphemeSplit(text: string): string[] {
  if (!text) return [];

  const graphemes: string[] = [];
  // Khmer combining marks range: \u17B4-\u17D3, \u17DD, etc.
  const isKhmerCombining = (code: number) =>
    (code >= 0x17b4 && code <= 0x17d3) || code === 0x17dd || code === 0x17c6;

  let currentCluster = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.codePointAt(0) || 0;

    if (code === 0x17d2) {
      // Coeng (subscript indicator): attach to current and grab following consonant
      currentCluster += char;
      if (i + 1 < text.length) {
        currentCluster += text[++i];
      }
    } else if (isKhmerCombining(code)) {
      // Combining vowel or diacritic: attaches to current base
      currentCluster += char;
    } else {
      // New base grapheme
      if (currentCluster.length > 0) {
        graphemes.push(currentCluster);
      }
      currentCluster = char;
    }
  }

  if (currentCluster.length > 0) {
    graphemes.push(currentCluster);
  }

  return graphemes;
}

/**
 * Splits text into user-perceived visual grapheme clusters.
 * Uses Intl.Segmenter with "km" locale when available, and fallbackGraphemeSplit otherwise.
 */
export function splitGraphemes(text: string): string[] {
  if (!text) return [];

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    try {
      type IntlSegmenterConstructor = new (
        locales?: string | string[],
        options?: { granularity?: string }
      ) => {
        segment: (input: string) => Iterable<{ segment: string }>;
      };
      const SegmenterClass = (Intl as unknown as { Segmenter: IntlSegmenterConstructor }).Segmenter;
      const segmenter = new SegmenterClass("km", {
        granularity: "grapheme",
      });
      return [...segmenter.segment(text)].map((item) => item.segment);
    } catch {
      // Fallback if locale instantiation fails
      return fallbackGraphemeSplit(text);
    }
  }

  return fallbackGraphemeSplit(text);
}

// ── 2. Quality Metrics: CER, WER & Numeric Exact Match ──

/**
 * Calculates Levenshtein edit distance between two arrays of tokens/graphemes.
 */
function editDistance<T>(seq1: T[], seq2: T[]): number {
  const m = seq1.length;
  const n = seq2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (seq1[i - 1] === seq2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculates Character Error Rate (CER) over Khmer visual grapheme clusters.
 * CER = Levenshtein(reference_graphemes, hypothesis_graphemes) / reference_graphemes.length.
 */
export function calculateKhmerCER(reference: string, hypothesis: string): number {
  const normRef = normalizeKhmerText(reference);
  const normHyp = normalizeKhmerText(hypothesis);

  const refGraphemes = splitGraphemes(normRef);
  const hypGraphemes = splitGraphemes(normHyp);

  if (refGraphemes.length === 0) {
    return hypGraphemes.length === 0 ? 0 : 1;
  }

  const dist = editDistance(refGraphemes, hypGraphemes);
  return dist / refGraphemes.length;
}

/**
 * Calculates Word Error Rate (WER) on normalized text.
 * Splits on standard whitespace after Khmer normalization.
 */
export function calculateKhmerWER(reference: string, hypothesis: string): number {
  const normRef = normalizeKhmerText(reference);
  const normHyp = normalizeKhmerText(hypothesis);

  const refWords = normRef.split(/\s+/).filter(Boolean);
  const hypWords = normHyp.split(/\s+/).filter(Boolean);

  if (refWords.length === 0) {
    return hypWords.length === 0 ? 0 : 1;
  }

  const dist = editDistance(refWords, hypWords);
  return dist / refWords.length;
}

/**
 * Extracts and compares numeric answers and operands for exact match.
 * Normalizes both Western Arabic digits (0-9) and Khmer digits (០-៩).
 */
export function convertKhmerDigitsToWestern(text: string): string {
  if (!text) return "";
  const khmerZeroCode = 0x17e0;
  return text.replace(/[\u17E0-\u17E9]/g, (ch) => {
    return String(ch.charCodeAt(0) - khmerZeroCode);
  });
}

/**
 * Evaluates whether all numeric sequences in the reference match the hypothesis in order.
 */
export function calculateNumericExactMatch(reference: string, hypothesis: string): boolean {
  const normRef = convertKhmerDigitsToWestern(normalizeKhmerText(reference));
  const normHyp = convertKhmerDigitsToWestern(normalizeKhmerText(hypothesis));

  const extractNumbers = (str: string): string[] => {
    const matches = str.match(/-?\d+(?:\.\d+)?/g);
    return matches ? matches.map((n) => Number(n).toString()) : [];
  };

  const refNums = extractNumbers(normRef);
  const hypNums = extractNumbers(normHyp);

  if (refNums.length === 0 && hypNums.length === 0) return true;
  if (refNums.length !== hypNums.length) return false;

  for (let i = 0; i < refNums.length; i++) {
    if (refNums[i] !== hypNums[i]) return false;
  }

  return true;
}

// ── 3. Mathematical Structure & Syntax Validation ──

export interface MathematicalSyntaxValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  balancedParentheses: boolean;
  balancedBraces: boolean;
  validFractions: boolean;
  validScripts: boolean;
  validRadicals: boolean;
  validMatrices: boolean;
  mathmlValid: boolean;
}

/**
 * Validates balance of parentheses, brackets, and braces.
 */
export function validateBalancedDelimiters(latex: string): {
  balancedParens: boolean;
  balancedBraces: boolean;
  balancedBrackets: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < latex.length; i++) {
    const char = latex[i];
    const prevChar = i > 0 ? latex[i - 1] : "";

    // Ignore escaped braces \{ and \}
    if (char === "{" && prevChar !== "\\") braceDepth++;
    else if (char === "}" && prevChar !== "\\") {
      braceDepth--;
      if (braceDepth < 0) errors.push("Unmatched closing brace '}' at position " + i);
    } else if (char === "(" && prevChar !== "\\") parenDepth++;
    else if (char === ")" && prevChar !== "\\") {
      parenDepth--;
      if (parenDepth < 0) errors.push("Unmatched closing parenthesis ')' at position " + i);
    } else if (char === "[" && prevChar !== "\\") bracketDepth++;
    else if (char === "]" && prevChar !== "\\") {
      bracketDepth--;
      if (bracketDepth < 0) errors.push("Unmatched closing bracket ']' at position " + i);
    }
  }

  if (braceDepth > 0) errors.push(`Unclosed '${braceDepth}' LaTeX curly brace(s) '{'`);
  if (parenDepth > 0) errors.push(`Unclosed '${parenDepth}' parenthesis '('`);
  if (bracketDepth > 0) errors.push(`Unclosed '${bracketDepth}' bracket '['`);

  return {
    balancedParens: parenDepth === 0,
    balancedBraces: braceDepth === 0,
    balancedBrackets: bracketDepth === 0,
    errors,
  };
}

/**
 * Validates that all \frac commands have both a numerator and denominator group.
 */
export function validateFractions(latex: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let idx = 0;

  while ((idx = latex.indexOf("\\frac", idx)) !== -1) {
    const startPos = idx;
    idx += 5; // skip \frac
    // skip optional whitespace
    while (idx < latex.length && /\s/.test(latex[idx])) idx++;

    // First group: numerator
    if (idx >= latex.length || latex[idx] !== "{") {
      errors.push(`\\frac at position ${startPos} is missing numerator '{...}'`);
      continue;
    }

    let depth = 1;
    idx++;
    while (idx < latex.length && depth > 0) {
      if (latex[idx] === "{" && latex[idx - 1] !== "\\") depth++;
      else if (latex[idx] === "}" && latex[idx - 1] !== "\\") depth--;
      idx++;
    }
    if (depth > 0) {
      errors.push(`\\frac at position ${startPos} has unclosed numerator`);
      break;
    }

    // skip optional whitespace
    while (idx < latex.length && /\s/.test(latex[idx])) idx++;

    // Second group: denominator
    if (idx >= latex.length || latex[idx] !== "{") {
      errors.push(`\\frac at position ${startPos} is missing denominator '{...}'`);
      continue;
    }

    depth = 1;
    idx++;
    while (idx < latex.length && depth > 0) {
      if (latex[idx] === "{" && latex[idx - 1] !== "\\") depth++;
      else if (latex[idx] === "}" && latex[idx - 1] !== "\\") depth--;
      idx++;
    }
    if (depth > 0) {
      errors.push(`\\frac at position ${startPos} has unclosed denominator`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates superscripts (^) and subscripts (_) operands.
 * Checks for invalid empty script groups like ^{} or unescaped terminal scripts.
 */
export function validateScripts(latex: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < latex.length; i++) {
    const char = latex[i];
    const prevChar = i > 0 ? latex[i - 1] : "";

    // Ignore escaped \_
    if ((char === "^" || char === "_") && prevChar !== "\\") {
      if (i === latex.length - 1) {
        errors.push(`Trailing '${char}' with no operand at end of expression`);
        continue;
      }
      const nextChar = latex[i + 1];
      if (nextChar === " " || nextChar === "\t" || nextChar === "\n") {
        errors.push(`Script operator '${char}' at position ${i} followed by whitespace`);
      }
      if (latex.substr(i + 1, 2) === "{}") {
        errors.push(`Empty script group '${char}{}' at position ${i}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates that \sqrt commands have proper group closures.
 */
export function validateRadicals(latex: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let idx = 0;

  while ((idx = latex.indexOf("\\sqrt", idx)) !== -1) {
    const startPos = idx;
    idx += 5; // skip \sqrt
    while (idx < latex.length && /\s/.test(latex[idx])) idx++;

    // Optional root index [n]
    if (idx < latex.length && latex[idx] === "[") {
      let bDepth = 1;
      idx++;
      while (idx < latex.length && bDepth > 0) {
        if (latex[idx] === "]") bDepth--;
        idx++;
      }
      if (bDepth > 0) {
        errors.push(`\\sqrt at position ${startPos} has unclosed index '[...]'`);
        continue;
      }
      while (idx < latex.length && /\s/.test(latex[idx])) idx++;
    }

    // Required radicand group {...} or single operand
    if (idx < latex.length && latex[idx] === "{") {
      let depth = 1;
      idx++;
      while (idx < latex.length && depth > 0) {
        if (latex[idx] === "{" && latex[idx - 1] !== "\\") depth++;
        else if (latex[idx] === "}" && latex[idx - 1] !== "\\") depth--;
        idx++;
      }
      if (depth > 0) {
        errors.push(`\\sqrt at position ${startPos} has unclosed radicand '{...'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates that LaTeX matrices/arrays have consistent column counts across rows.
 */
export function validateMatrixDimensions(latex: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const matrixRegex = /\\begin\{(matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array)\}(?:\{[^}]*\})?([\s\S]*?)\\end\{\1\}/g;
  let match: RegExpExecArray | null;

  while ((match = matrixRegex.exec(latex)) !== null) {
    const matrixType = match[1];
    const body = match[2];
    const rows = body.split("\\\\").map((r) => r.trim()).filter(Boolean);

    if (rows.length > 0) {
      const colCounts = rows.map((row) => {
        // Count ampersands not escaped
        const ampCount = (row.match(/(?<!\\)&/g) || []).length;
        return ampCount + 1;
      });

      const firstColCount = colCounts[0];
      for (let r = 1; r < colCounts.length; r++) {
        // Allow last row to have trailing empty columns in vertical arrays
        if (colCounts[r] !== firstColCount && matrixType !== "array") {
          errors.push(
            `Inconsistent matrix '${matrixType}' columns: Row 1 has ${firstColCount} columns but Row ${r + 1} has ${colCounts[r]} columns`
          );
          break;
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates MathML XML structure and tag balance.
 */
export function validateMathMLWellFormed(mathml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!mathml) return { valid: true, errors: [] };

  if (!mathml.includes("<math") || !mathml.includes("</math>")) {
    errors.push("Missing root <math> or </math> element");
  }

  // Check tag balance for standard MathML elements
  const tags = ["math", "mrow", "mfrac", "msup", "msub", "msubsup", "msqrt", "mroot", "mtable", "mtr", "mtd", "mn", "mi", "mo", "mtext"];
  for (const tag of tags) {
    const openRegex = new RegExp(`<${tag}(?:\\s+[^>]*)?>`, "gi");
    const closeRegex = new RegExp(`</${tag}>`, "gi");
    const openCount = (mathml.match(openRegex) || []).length;
    const closeCount = (mathml.match(closeRegex) || []).length;
    if (openCount !== closeCount) {
      errors.push(`MathML tag mismatch for <${tag}>: ${openCount} open vs ${closeCount} close`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Comprehensive mathematical syntax validation combining all checks.
 */
export function validateMathematicalSyntax(
  latex: string,
  mathml?: string
): MathematicalSyntaxValidation {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  const delim = validateBalancedDelimiters(latex);
  allErrors.push(...delim.errors);

  const frac = validateFractions(latex);
  allErrors.push(...frac.errors);

  const scripts = validateScripts(latex);
  allErrors.push(...scripts.errors);

  const radicals = validateRadicals(latex);
  allErrors.push(...radicals.errors);

  const matrices = validateMatrixDimensions(latex);
  allErrors.push(...matrices.errors);

  let mathmlValid = true;
  if (mathml) {
    const mm = validateMathMLWellFormed(mathml);
    if (!mm.valid) {
      mathmlValid = false;
      allWarnings.push(...mm.errors);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    balancedParentheses: delim.balancedParens,
    balancedBraces: delim.balancedBraces,
    validFractions: frac.valid,
    validScripts: scripts.valid,
    validRadicals: radicals.valid,
    validMatrices: matrices.valid,
    mathmlValid,
  };
}
