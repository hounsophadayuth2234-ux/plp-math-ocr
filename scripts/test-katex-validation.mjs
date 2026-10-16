import katex from "katex";

function removeAtExpressions(str) {
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

export function normalizeLatexForKatex(latex) {
  if (!latex || typeof latex !== "string") return latex;

  let normalized = latex;

  // 1. Replace raw unescaped underscores in bracketed blanks like [___] or [____]
  normalized = normalized.replace(/\[((?:[^\\]*?)_+)\]/g, (match, inner) => {
    const escaped = inner.replace(/(?<!\\)_/g, "\\_");
    return `[${escaped}]`;
  });

  // Also standalone runs of unescaped underscores like ___ that might appear without brackets
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
      normalized = normalized.substring(0, startCol) + cleanedCols + normalized.substring(endIdx - 1);
      arrayIdx = startCol + cleanedCols.length + 1;
    } else {
      break;
    }
  }

  return normalized;
}

const testCases = [
  { name: "Quadratic", latex: "x^2 + 5x + 6 = 0" },
  { name: "Raw [___] (Unescaped)", latex: "7y^3 - 19y = 42 \\\\ 3/8 + 5/12 = [___]" },
  { name: "Fraction with [_____]", latex: "\\frac{3}{8} + \\frac{5}{12} = [_____]" },
  { name: "Standalone ___", latex: "7y^3 - 19y = 42 \\\\ 3/8 + 5/12 = ___" },
  { name: "Vertical Addition with @{\\quad}", latex: "\\begin{array}{r@{\\quad}l} 684 \\\\ + 257 \\\\ \\hline [___] \\end{array}" },
  { name: "Vertical Addition multiple columns", latex: "\\begin{array}{r@{\\hspace{1em}}r@{\\quad}r} 6 & 8 & 4 \\\\ + & 2 & 5 \\\\ \\hline & [___] & \\end{array}" },
];

console.log("KaTeX Version:", katex.version);
for (const tc of testCases) {
  const norm = normalizeLatexForKatex(tc.latex);
  try {
    katex.renderToString(norm, { throwOnError: true });
    console.log(`[PASS] ${tc.name} -> ${norm}`);
  } catch (err) {
    console.log(`[FAIL] ${tc.name}: ${err.message}`);
  }
}
