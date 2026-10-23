/**
 * Safe Khmer Text Normalization Utility
 *
 * Cleans AI-generated educational text and explanations:
 * - Fixes common educational typos (e.g., "សមមីការ" -> "សមីការ")
 * - Removes accidental Thai contamination (e.g., "กำจัด")
 * - Removes unrelated foreign language characters from Khmer sentences
 * - STRICTLY PRESERVES:
 *   - Mathematical equations, symbols (+, -, ×, ÷, =, <, >)
 *   - LaTeX formatting ($...$, $$...$$, \(...\), \[...\])
 *   - MathML tags (<math>...</math>)
 *   - SVG markup (<svg>...</svg>)
 *   - HTML tags and attributes (<div class="...">...</div>)
 *   - Numbers (Khmer ០-៩ and Arabic 0-9)
 *   - Units (ស.ម, ម.ម, គ.ក, ដុំ, ក្បាល, etc.)
 */

// Known educational typos mapping
const KHMER_TYPO_MAP: [RegExp, string][] = [
  [/សមមីការណ៍/g, "សមីការ"],
  [/សមមីការ/g, "សមីការ"],
  [/កាដោះស្រាយ/g, "ការដោះស្រាយ"],
  [/ប្រភាគបែង/g, "ភាគបែង"],
  [/ប្រភាគយក/g, "ភាគយក"],
  [/តួរចែក/g, "តូចែក"],
  [/តួរគុណ/g, "តួគុណ"],
  [/ផល្លបូក/g, "ផលបូក"],
  [/ផល្លដក/g, "ផលដក"],
  [/ផល្លគុណ/g, "ផលគុណ"],
  [/ផល្លចែក/g, "ផលចែក"],
  [/រង្វង់មូលល/g, "រង្វង់មូល"],
  [/ត្រីកោណណ/g, "ត្រីកោណ"],
  [/ចតុកោណណ/g, "ចតុកោណ"],
];

// Regex matching accidental Thai Unicode characters (\u0E00-\u0E7F)
const THAI_CHAR_REGEX = /[\u0E00-\u0E7F]+/g;

/**
 * Normalizes plain Khmer educational text (fixing typos and removing Thai words)
 * without touching numbers, variables, and math operators.
 */
export function normalizeKhmerPlainText(text: string): string {
  if (!text || typeof text !== "string") return "";

  let cleaned = text;

  // 1. Remove accidental Thai words/scripts
  cleaned = cleaned.replace(THAI_CHAR_REGEX, "");

  // 2. Fix known typos
  for (const [typoRegex, replacement] of KHMER_TYPO_MAP) {
    cleaned = cleaned.replace(typoRegex, replacement);
  }

  // 3. Clean up multiple spaces left by removals, without breaking newlines
  cleaned = cleaned
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n");

  return cleaned;
}

/**
 * Normalizes Khmer text that may contain HTML, SVG, LaTeX, or MathML.
 * Safely parses the string so that tags, attributes, and mathematical expressions
 * are untouched, and only the human-readable text nodes are normalized.
 */
export function normalizeKhmerEducationalText(content: string): string {
  if (!content || typeof content !== "string") return "";

  // Tokenize string into preserved blocks (HTML tags, LaTeX, MathML, SVG) and text blocks
  // Regex matches:
  // 1. Full SVG blocks: <svg[\s\S]*?<\/svg>
  // 2. Full MathML blocks: <math[\s\S]*?<\/math>
  // 3. Display / Inline LaTeX: \$\$[\s\S]*?\$\$ | \$[^\$]+?\$ | \\\[[\s\S]*?\\\] | \\\([\s\S]*?\\\)
  // 4. HTML tags: <[^>]+>
  const tokenRegex = /(<svg[\s\S]*?<\/svg>|<math[\s\S]*?<\/math>|\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|<[^>]+>)/gi;

  const parts = content.split(tokenRegex);

  return parts
    .map((part) => {
      if (!part) return "";
      // If it starts with < (tag/svg/math) or contains LaTeX ($ or \), keep byte-identical
      if (
        part.startsWith("<") ||
        part.startsWith("$") ||
        part.startsWith("\\[") ||
        part.startsWith("\\(")
      ) {
        return part;
      }
      // Otherwise, normalize the pure text snippet
      return normalizeKhmerPlainText(part);
    })
    .join("");
}
