/**
 * Module 04: Structured Column Calculation Engine
 *
 * Implements strict place-value column alignment for all elementary mathematical operations:
 * - Addition (operands, carrying digits, result)
 * - Subtraction (operands, borrowing marks, result)
 * - Multiplication (multiplicand, multiplier, partial products, final result)
 * - Division (divisor, dividend, quotient, multiplication rows, subtraction rows, remainder)
 * - Fractions (numerator centered over denominator, aligned fraction bars)
 * - Decimals (decimal points strictly aligned in one vertical column)
 */

import {
  toKhmerNumeral,
  fromKhmerNumeral,
} from "./deterministic-math-verifier";

export type CalculationRole =
  | "operand"
  | "operator"
  | "separator"
  | "result"
  | "carrying"
  | "borrowing"
  | "quotient"
  | "step"
  | "remainder";

export interface StructuredCalculationRow {
  role: CalculationRole;
  operator?: string;
  digits: string[]; // Length equals columns.length. Empty string "" for blank cells
  label?: string;
  highlight?: boolean;
}

export interface FractionStep {
  numerator: string;
  denominator: string;
  operator?: string;
}

export interface StructuredCalculation {
  type: "arithmetic" | "division" | "fraction" | "decimal";
  columns: string[]; // Names/roles of each column e.g. ["thousands", "hundreds", "tens", "ones"]
  rows: StructuredCalculationRow[];
  captionKhmer?: string;
  fractionData?: {
    expression: string;
    steps: FractionStep[];
    result: { numerator: string; denominator: string };
  };
}

/**
 * Standard Cambodian place names for integer columns
 */
const INTEGER_PLACE_NAMES = [
  "ones", // ខ្ទង់ឯកតា
  "tens", // ខ្ទង់ដប់
  "hundreds", // ខ្ទង់រយ
  "thousands", // ខ្ទង់ពាន់
  "ten_thousands", // ខ្ទង់ម៉ឺន
  "hundred_thousands", // ខ្ទង់សែន
  "millions", // ខ្ទង់លាន
];

const DECIMAL_PLACE_NAMES = [
  "tenths", // ខ្ទង់ភាគដប់
  "hundredths", // ខ្ទង់ភាគរយ
  "thousandths", // ខ្ទង់ភាគពាន់
  "ten_thousandths", // ខ្ទង់ភាគម៉ឺន
];

/**
 * Normalizes operator symbols to standard Khmer/math presentation
 */
export function normalizeOperator(op: string): string {
  const clean = op.trim();
  if (clean === "+" || clean === "បូក") return "+";
  if (clean === "-" || clean === "−" || clean === "ដក") return "−";
  if (clean === "*" || clean === "×" || clean === "x" || clean === "X" || clean === "គុណ")
    return "×";
  if (clean === "/" || clean === "÷" || clean === ":" || clean === "ចែក") return "÷";
  return clean;
}

/**
 * Pad array of digits with leading characters ('០' by default for place-value columns)
 */
function padLeading(digits: string[], targetLen: number, padChar = "០"): string[] {
  const padCount = Math.max(0, targetLen - digits.length);
  return [...Array(padCount).fill(padChar), ...digits];
}

/**
 * Pad array of digits with trailing characters ('០' by default for decimal place-value columns)
 */
function padTrailing(digits: string[], targetLen: number, padChar = "០"): string[] {
  const padCount = Math.max(0, targetLen - digits.length);
  return [...digits, ...Array(padCount).fill(padChar)];
}

/**
 * Build structured integer arithmetic (Addition, Subtraction, Multiplication)
 */
export function buildStructuredIntegerArithmetic(
  aNum: number,
  op: string,
  bNum: number,
  resNum?: number
): StructuredCalculation {
  const opSymbol = normalizeOperator(op);
  const calculatedRes =
    resNum !== undefined
      ? resNum
      : opSymbol === "+"
      ? aNum + bNum
      : opSymbol === "−"
      ? aNum - bNum
      : opSymbol === "×"
      ? aNum * bNum
      : Math.floor(aNum / bNum);

  const aDigitsKhmer = toKhmerNumeral(Math.abs(Math.round(aNum))).split("");
  const bDigitsKhmer = toKhmerNumeral(Math.abs(Math.round(bNum))).split("");
  const resDigitsKhmer = toKhmerNumeral(Math.abs(Math.round(calculatedRes))).split("");

  const maxDigits = Math.max(aDigitsKhmer.length, bDigitsKhmer.length, resDigitsKhmer.length);

  // Generate column names from left to right
  const columns: string[] = [];
  for (let i = maxDigits - 1; i >= 0; i--) {
    columns.push(INTEGER_PLACE_NAMES[i] || `col_${i}`);
  }

  const rows: StructuredCalculationRow[] = [];

  // Row 1: First operand (top number)
  rows.push({
    role: "operand",
    operator: "",
    digits: padLeading(aDigitsKhmer, maxDigits),
  });

  // Row 2: Second operand with operator in operator column
  rows.push({
    role: "operand",
    operator: opSymbol,
    digits: padLeading(bDigitsKhmer, maxDigits),
  });

  // Multi-digit multiplication: add partial product rows if bNum has >= 2 digits
  if (opSymbol === "×" && Math.abs(bNum) >= 10) {
    const bDigitsRaw = String(Math.abs(bNum)).split("").reverse();
    rows.push({
      role: "separator",
      digits: Array(maxDigits).fill("─"),
    });

    for (let i = 0; i < bDigitsRaw.length; i++) {
      const d = parseInt(bDigitsRaw[i], 10);
      const partial = aNum * d * Math.pow(10, i);
      const partialKhmer = toKhmerNumeral(partial).split("");
      rows.push({
        role: "step",
        operator: i === 0 ? "" : "+",
        digits: padLeading(partialKhmer, maxDigits),
        label: `ផលគុណផ្នែកទី ${toKhmerNumeral(i + 1)}`,
      });
    }
  }

  // Separator bar row
  rows.push({
    role: "separator",
    digits: Array(maxDigits).fill("─"),
  });

  // Result row
  rows.push({
    role: "result",
    operator: "",
    digits: padLeading(resDigitsKhmer, maxDigits),
  });

  return {
    type: "arithmetic",
    columns,
    rows,
    captionKhmer: `ការគណនាតាមជួរឈរ៖ ${toKhmerNumeral(aNum)} ${opSymbol} ${toKhmerNumeral(bNum)} = ${toKhmerNumeral(calculatedRes)}`,
  };
}

/**
 * Build structured decimal arithmetic with decimal points in their own vertical column
 */
export function buildStructuredDecimalArithmetic(
  aNum: number,
  op: string,
  bNum: number,
  resNum?: number
): StructuredCalculation {
  const opSymbol = normalizeOperator(op);
  const calculatedRes =
    resNum !== undefined
      ? resNum
      : opSymbol === "+"
      ? aNum + bNum
      : opSymbol === "−"
      ? aNum - bNum
      : aNum * bNum;

  // Split into integer and fractional parts
  const splitNumber = (n: number) => {
    // Format to avoid JS float precision issues (max 6 decimals)
    const fixed = Math.round(n * 1000000) / 1000000;
    const parts = String(Math.abs(fixed)).split(".");
    return {
      intKhmer: toKhmerNumeral(parts[0]).split(""),
      fracKhmer: parts[1] ? toKhmerNumeral(parts[1]).split("") : [],
    };
  };

  const aParts = splitNumber(aNum);
  const bParts = splitNumber(bNum);
  const resParts = splitNumber(calculatedRes);

  const maxIntLen = Math.max(aParts.intKhmer.length, bParts.intKhmer.length, resParts.intKhmer.length);
  const maxFracLen = Math.max(aParts.fracKhmer.length, bParts.fracKhmer.length, resParts.fracKhmer.length, 1);

  // Construct column names: integer columns + "decimal_point" + fraction columns
  const columns: string[] = [];
  for (let i = maxIntLen - 1; i >= 0; i--) {
    columns.push(INTEGER_PLACE_NAMES[i] || `int_${i}`);
  }
  columns.push("decimal_point");
  for (let i = 0; i < maxFracLen; i++) {
    columns.push(DECIMAL_PLACE_NAMES[i] || `frac_${i}`);
  }

  const assembleRowDigits = (intD: string[], fracD: string[]): string[] => {
    const paddedInt = padLeading(intD, maxIntLen);
    const paddedFrac = padTrailing(fracD, maxFracLen);
    return [...paddedInt, ".", ...paddedFrac];
  };

  const rows: StructuredCalculationRow[] = [];

  // Row 1: Operand A
  rows.push({
    role: "operand",
    operator: "",
    digits: assembleRowDigits(aParts.intKhmer, aParts.fracKhmer),
  });

  // Row 2: Operand B
  rows.push({
    role: "operand",
    operator: opSymbol,
    digits: assembleRowDigits(bParts.intKhmer, bParts.fracKhmer),
  });

  // Separator
  rows.push({
    role: "separator",
    digits: Array(columns.length).fill("─"),
  });

  // Result
  rows.push({
    role: "result",
    operator: "",
    digits: assembleRowDigits(resParts.intKhmer, resParts.fracKhmer),
  });

  return {
    type: "decimal",
    columns,
    rows,
    captionKhmer: `ប្រមាណវិធីទសភាគ៖ ${toKhmerNumeral(aNum)} ${opSymbol} ${toKhmerNumeral(bNum)} = ${toKhmerNumeral(calculatedRes)}`,
  };
}

/**
 * Build structured long division with step-by-step aligned quotient, subtractions, and remainder
 */
export function buildStructuredLongDivision(
  dividend: number,
  divisor: number
): StructuredCalculation {
  const quotient = Math.floor(dividend / divisor);
  const remainder = dividend % divisor;

  const dividendStr = String(dividend);
  const divisorStr = String(divisor);
  const quotientStr = String(quotient);

  // Layout width
  // Form:   [spaces] [quotient digits]
  //         [divisor] │ [dividend digits]
  //                   − [product]
  //                   ───────────
  const prefixCols = divisorStr.length + 2; // divisor + " │ "
  const totalCols = prefixCols + dividendStr.length;

  const columns: string[] = [];
  for (let i = 0; i < totalCols; i++) {
    columns.push(`div_col_${i}`);
  }

  const rows: StructuredCalculationRow[] = [];

  // Row 0: Quotient row
  const quotientDigitsKhmer = toKhmerNumeral(quotientStr).split("");
  const quotientRowDigits = [
    ...Array(prefixCols).fill(""),
    ...padLeading(quotientDigitsKhmer, dividendStr.length),
  ];
  rows.push({
    role: "quotient",
    operator: "",
    digits: quotientRowDigits,
    label: "ផលចែក (Quotient)",
  });

  // Row 1: Top bar above dividend
  const barDigits = [
    ...Array(prefixCols - 1).fill(""),
    "┌",
    ...Array(dividendStr.length).fill("─"),
  ];
  rows.push({
    role: "separator",
    digits: barDigits,
  });

  // Row 2: Divisor │ Dividend
  const divisorDigitsKhmer = toKhmerNumeral(divisorStr).split("");
  const dividendDigitsKhmer = toKhmerNumeral(dividendStr).split("");
  const divHeaderDigits: string[] = [
    ...padLeading(divisorDigitsKhmer, prefixCols - 1),
    "│",
    ...dividendDigitsKhmer,
  ];
  rows.push({
    role: "operand",
    operator: "",
    digits: divHeaderDigits,
  });

  // Step-by-step division process
  let currentVal = 0;

  for (let i = 0; i < dividendStr.length; i++) {
    currentVal = currentVal * 10 + parseInt(dividendStr[i], 10);
    const qDigit = Math.floor(currentVal / divisor);

    if (qDigit > 0 || i === dividendStr.length - 1) {
      const prod = qDigit * divisor;
      const diff = currentVal - prod;

      const prodKhmer = toKhmerNumeral(prod).split("");
      const stepColPos = prefixCols + i;

      // Subtraction row
      const subDigits = Array(totalCols).fill("");
      const subStartCol = stepColPos - prodKhmer.length + 1;
      for (let j = 0; j < prodKhmer.length; j++) {
        subDigits[subStartCol + j] = prodKhmer[j];
      }
      rows.push({
        role: "step",
        operator: "−",
        digits: subDigits,
      });

      // Line
      const lineDigits = Array(totalCols).fill("");
      for (let j = 0; j < prodKhmer.length; j++) {
        lineDigits[subStartCol + j] = "─";
      }
      rows.push({
        role: "separator",
        digits: lineDigits,
      });

      // Remainder or brought down next value
      const nextColPos = i + 1 < dividendStr.length ? prefixCols + i + 1 : stepColPos;
      const broughtVal = i + 1 < dividendStr.length ? diff * 10 + parseInt(dividendStr[i + 1], 10) : diff;
      const broughtKhmer = toKhmerNumeral(broughtVal).split("");

      const remDigits = Array(totalCols).fill("");
      const remStartCol = nextColPos - broughtKhmer.length + 1;
      for (let j = 0; j < broughtKhmer.length; j++) {
        remDigits[remStartCol + j] = broughtKhmer[j];
      }

      if (i < dividendStr.length - 1) {
        rows.push({
          role: "step",
          digits: remDigits,
        });
      } else {
        rows.push({
          role: "remainder",
          digits: remDigits,
          label: "សំណល់ (Remainder)",
        });
      }

      currentVal = diff;
    }
  }

  return {
    type: "division",
    columns,
    rows,
    captionKhmer: `ប្រមាណវិធីចែកវែង៖ ${toKhmerNumeral(dividend)} ÷ ${toKhmerNumeral(divisor)} = ${toKhmerNumeral(quotient)}${
      remainder > 0 ? ` សំណល់ ${toKhmerNumeral(remainder)}` : ""
    }`,
  };
}

/**
 * Build structured fraction calculation with aligned terms and common denominators
 */
export function buildStructuredFraction(
  expr: string,
  _stepsText?: string,
  _answerText?: string
): StructuredCalculation {
  // Parse fractions like "១/២ + ១/៤" or "1/2 + 1/4"
  const norm = fromKhmerNumeral(expr).replace(/\s+/g, "");
  const match = norm.match(/^(\d+)\/(\d+)([+\-×*/÷])(\d+)\/(\d+)$/);

  if (match) {
    const n1 = parseInt(match[1], 10);
    const d1 = parseInt(match[2], 10);
    const op = match[3] === "*" || match[3] === "×" ? "×" : match[3] === "/" || match[3] === "÷" ? "÷" : match[3];
    const n2 = parseInt(match[4], 10);
    const d2 = parseInt(match[5], 10);

    let resN = 0;
    let resD = 1;

    if (op === "+") {
      const lcm = (d1 * d2) / gcd(d1, d2);
      resN = n1 * (lcm / d1) + n2 * (lcm / d2);
      resD = lcm;
    } else if (op === "-") {
      const lcm = (d1 * d2) / gcd(d1, d2);
      resN = n1 * (lcm / d1) - n2 * (lcm / d2);
      resD = lcm;
    } else if (op === "×") {
      resN = n1 * n2;
      resD = d1 * d2;
    } else {
      resN = n1 * d2;
      resD = d1 * n2;
    }

    const g = gcd(Math.abs(resN), Math.abs(resD));
    const simpN = resN / g;
    const simpD = resD / g;

    return {
      type: "fraction",
      columns: ["term1", "op", "term2", "eq", "combined", "eq2", "result"],
      rows: [],
      fractionData: {
        expression: `${toKhmerNumeral(n1)}/${toKhmerNumeral(d1)} ${normalizeOperator(op)} ${toKhmerNumeral(n2)}/${toKhmerNumeral(d2)}`,
        steps: [
          { numerator: toKhmerNumeral(n1), denominator: toKhmerNumeral(d1) },
          { numerator: toKhmerNumeral(n2), denominator: toKhmerNumeral(d2), operator: normalizeOperator(op) },
          {
            numerator:
              op === "+"
                ? `${toKhmerNumeral(n1 * (resD / d1))} + ${toKhmerNumeral(n2 * (resD / d2))}`
                : `${toKhmerNumeral(n1 * (resD / d1))} − ${toKhmerNumeral(n2 * (resD / d2))}`,
            denominator: toKhmerNumeral(resD),
            operator: "=",
          },
          { numerator: toKhmerNumeral(simpN), denominator: toKhmerNumeral(simpD), operator: "=" },
        ],
        result: { numerator: toKhmerNumeral(simpN), denominator: toKhmerNumeral(simpD) },
      },
      captionKhmer: `ប្រមាណវិធីប្រភាគ៖ ${toKhmerNumeral(n1)}/${toKhmerNumeral(d1)} ${normalizeOperator(op)} ${toKhmerNumeral(n2)}/${toKhmerNumeral(d2)} = ${toKhmerNumeral(simpN)}/${toKhmerNumeral(simpD)}`,
    };
  }

  // Fallback
  return {
    type: "fraction",
    columns: ["col_0"],
    rows: [],
    captionKhmer: expr,
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Parses any math problem and produces a deterministic StructuredCalculation
 */
export function detectAndBuildStructuredCalculation(
  problemText: string,
  finalAnswer?: string,
  verticalLinesFallback?: string[]
): StructuredCalculation | null {
  if (!problemText) return null;

  const norm = fromKhmerNumeral(problemText)
    .replace(/×/g, "*")
    .replace(/[÷:]/g, "/")
    .replace(/−/g, "-")
    .replace(/\s+/g, "")
    .replace(/=/g, "");

  // 1. Fractions: a/b [+-*/] c/d
  if (norm.includes("/") && /^\d+\/\d+[+\-*/]\d+\/\d+$/.test(norm)) {
    return buildStructuredFraction(problemText, undefined, finalAnswer);
  }

  // 2. Binary operations: a op b
  const binMatch = norm.match(/^(-?\d+(?:\.\d+)?)([+\-*/])(-?\d+(?:\.\d+)?)$/);
  if (binMatch) {
    const a = parseFloat(binMatch[1]);
    const op = binMatch[2];
    const b = parseFloat(binMatch[3]);

    if (!isNaN(a) && !isNaN(b)) {
      // Division
      if (op === "/") {
        if (Number.isInteger(a) && Number.isInteger(b) && b !== 0) {
          return buildStructuredLongDivision(Math.abs(a), Math.abs(b));
        }
      }

      // Decimals (either has decimal point)
      if (binMatch[1].includes(".") || binMatch[3].includes(".")) {
        return buildStructuredDecimalArithmetic(a, op, b);
      }

      // Integers
      if (Number.isInteger(a) && Number.isInteger(b)) {
        return buildStructuredIntegerArithmetic(a, op, b);
      }
    }
  }

  // 3. Fallback from verticalLines if available
  if (verticalLinesFallback && verticalLinesFallback.length >= 3) {
    const lines = verticalLinesFallback.filter((l) => l.trim().length > 0);
    const maxLen = Math.max(...lines.map((l) => l.length));
    const columns = Array(maxLen)
      .fill("")
      .map((_, i) => `col_${i}`);

    const rows: StructuredCalculationRow[] = lines.map((line, idx) => {
      const isSep = line.includes("─") || line.includes("-");
      const isLast = idx === lines.length - 1;
      const opMatch = line.match(/^([+−×*÷\-])\s*(.*)$/);
      let op = "";
      let content = line;
      if (opMatch) {
        op = normalizeOperator(opMatch[1]);
        content = opMatch[2];
      }

      const digits = padLeading(content.split(""), maxLen);
      return {
        role: isSep ? "separator" : isLast ? "result" : "operand",
        operator: op,
        digits,
      };
    });

    return {
      type: "arithmetic",
      columns,
      rows,
      captionKhmer: problemText,
    };
  }

  return null;
}

/**
 * SECTION 4: Exported HTML Table Generator
 * Produces semantic HTML table matching exactly the visible UI grid
 */
export function renderColumnCalculationHtml(calc: StructuredCalculation): string {
  if (calc.type === "fraction" && calc.fractionData) {
    return renderFractionCalculationHtml(calc);
  }

  const numCols = calc.columns.length;
  const parts: string[] = [];

  parts.push('<table class="column-calculation" role="math" aria-label="ការគណនាជួរឈរ">\n');
  parts.push('  <tbody>\n');

  for (const row of calc.rows) {
    if (row.role === "separator") {
      parts.push(`    <tr class="separator-row"><td colspan="${numCols + 1}"></td></tr>\n`);
      continue;
    }

    const rowClass = `math-row ${row.role}`;
    parts.push(`    <tr class="${rowClass}">\n`);
    parts.push(`      <td class="operator-cell">${row.operator || ""}</td>\n`);

    for (let i = 0; i < numCols; i++) {
      const val = row.digits[i] !== undefined && row.digits[i] !== null ? row.digits[i] : "";
      const isPoint = val === ".";
      const cellClass = isPoint ? "digit-cell point-cell" : "digit-cell";
      parts.push(`      <td class="${cellClass}">${val}</td>\n`);
    }

    parts.push('    </tr>\n');
  }

  parts.push('  </tbody>\n');
  parts.push('</table>\n');

  return parts.join("");
}

/**
 * Render fraction calculation in HTML with centered numerators and aligned fraction bars
 */
function renderFractionCalculationHtml(calc: StructuredCalculation): string {
  if (!calc.fractionData) return "";
  const { steps } = calc.fractionData;

  const parts: string[] = [];
  parts.push('<div class="fraction-calculation" role="math" aria-label="ការគណនាប្រភាគ">\n');
  parts.push('  <div class="fraction-row">\n');

  steps.forEach((step) => {
    if (step.operator) {
      parts.push(`    <span class="fraction-op">${step.operator}</span>\n`);
    }
    parts.push('    <div class="fraction-term">\n');
    parts.push(`      <span class="fraction-num">${step.numerator}</span>\n`);
    parts.push('      <span class="fraction-bar"></span>\n');
    parts.push(`      <span class="fraction-den">${step.denominator}</span>\n`);
    parts.push('    </div>\n');
  });

  parts.push('  </div>\n');
  parts.push('</div>\n');
  return parts.join("");
}

/**
 * SECTION 5: Text Copy Renderer
 * Deterministically generates fixed-width monospace text representation from column indexes.
 * Never uses manually guessed spaces.
 */
export function renderColumnCalculationText(calc: StructuredCalculation): string {
  if (calc.type === "fraction" && calc.fractionData) {
    return renderFractionCalculationText(calc);
  }

  const numCols = calc.columns.length;
  const colWidth = 2; // Each digit cell width
  const opWidth = 3;  // Operator column width ("+  ", "−  ", "   ")

  const lines: string[] = [];

  for (const row of calc.rows) {
    if (row.role === "separator") {
      const sepLen = opWidth + numCols * colWidth;
      lines.push("  " + "─".repeat(sepLen - 2));
      continue;
    }

    let line = "";
    // Operator column
    if (row.operator) {
      line += `${row.operator.padEnd(opWidth, " ")}`;
    } else {
      line += " ".repeat(opWidth);
    }

    // Digit columns
    for (let c = 0; c < numCols; c++) {
      const digit = row.digits[c] || " ";
      line += digit.padStart(colWidth, " ");
    }

    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Render fraction calculation in fixed-width text
 */
function renderFractionCalculationText(calc: StructuredCalculation): string {
  if (!calc.fractionData) return "";
  const { steps } = calc.fractionData;

  let lineNum = " ";
  let lineBar = " ";
  let lineDen = " ";

  steps.forEach((step) => {
    if (step.operator) {
      lineNum += "   ";
      lineBar += ` ${step.operator} `;
      lineDen += "   ";
    }

    const maxW = Math.max(step.numerator.length, step.denominator.length);
    lineNum += ` ${step.numerator.padStart(maxW, " ")} `;
    lineBar += `─`.repeat(maxW + 2);
    lineDen += ` ${step.denominator.padStart(maxW, " ")} `;
  });

  return `${lineNum}\n${lineBar}\n${lineDen}`;
}
