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

export {
  toKhmerNumeral,
  fromKhmerNumeral,
};

export type MathOperation =
  | "addition"
  | "subtraction"
  | "multiplication"
  | "division"
  | "fraction"
  | "decimal"
  | "geometry"
  | "other";

export type VerticalRowRole =
  | "carry"
  | "borrow"
  | "operand"
  | "partial-product"
  | "separator"
  | "result"
  | "quotient"
  | "remainder"
  | "working";

export type CalculationRole =
  | VerticalRowRole
  | "operator"
  | "carrying"
  | "borrowing"
  | "step";

export interface VerticalRow {
  role: VerticalRowRole;
  operator?: string;
  cells: string[];
  borderBottom?: boolean;
}

export interface VerticalCalculation {
  operation: "addition" | "subtraction" | "multiplication" | "division";
  columns: string[];
  rows: VerticalRow[];
}

export interface MathStep {
  stepNumber: number;
  titleKhmer: string;
  explanationKhmer: string;
  calculationText?: string;
  calculationHtml?: string;
}

export interface MathSolution {
  problemStatement: string;
  operation: MathOperation;
  finalAnswer?: string;
  explanationKhmer?: string;
  steps: MathStep[];
  verticalCalculations: VerticalCalculation[];
  verification?: string;
  id?: string;
  mode?: "solve" | "generate" | "verify";
  inferredGrade?: string;
  inferredGradeKhmer?: string;
  visualInterpretation?: any;
  given?: string;
  toFind?: string;
  formulas?: string;
  extractedAnswer?: string;
  answerStatus?: "correct" | "incorrect" | "unverifiable";
  answerStatusKhmer?: string;
  incorrectStep?: string;
  errorExplanationKhmer?: string;
  correctedStep?: string;
  confidence?: "high" | "medium" | "low";
  confidenceKhmer?: string;
  ambiguousParts?: string[];
  reviewSuggestions?: string[];
  deterministicResult?: any;
}

export interface StructuredCalculationRow {
  role: CalculationRole;
  operator?: string;
  digits: string[]; // Length equals columns.length. Empty string "" for blank cells
  cells?: string[]; // Canonical alias for digits
  label?: string;
  highlight?: boolean;
  borderBottom?: boolean;
}

export interface FractionStep {
  numerator: string;
  denominator: string;
  operator?: string;
}

export interface DivisionStep {
  qDigit: number;
  prod: number;
  prodKhmer: string;
  diff: number;
  diffKhmer: string;
  broughtVal: number;
  broughtKhmer: string;
  isLast: boolean;
}

export interface DivisionData {
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
  dividendKhmer: string;
  divisorKhmer: string;
  quotientKhmer: string;
  remainderKhmer: string;
  steps: DivisionStep[];
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
  divisionData?: DivisionData;
}

/**
 * Standard Cambodian place names for integer columns
 */
export const INTEGER_PLACE_NAMES = [
  "ones", // ខ្ទង់រាយ
  "tens", // ខ្ទង់ដប់
  "hundreds", // ខ្ទង់រយ
  "thousands", // ខ្ទង់ពាន់
  "ten_thousands", // ខ្ទង់ម៉ឺន
  "hundred_thousands", // ខ្ទង់សែន
  "millions", // ខ្ទង់លាន
];

export const KHMER_INTEGER_PLACE_LABELS: Record<string, string> = {
  ones: "រាយ",
  tens: "ដប់",
  hundreds: "រយ",
  thousands: "ពាន់",
  ten_thousands: "ម៉ឺន",
  hundred_thousands: "សែន",
  millions: "លាន",
};

export const DECIMAL_PLACE_NAMES = [
  "tenths", // ខ្ទង់ភាគដប់
  "hundredths", // ខ្ទង់ភាគរយ
  "thousandths", // ខ្ទង់ភាគពាន់
  "ten_thousandths", // ខ្ទង់ភាគម៉ឺន
];

export const KHMER_DECIMAL_PLACE_LABELS: Record<string, string> = {
  decimal_point: "·",
  tenths: "ភាគដប់",
  hundredths: "ភាគរយ",
  thousandths: "ភាគពាន់",
  ten_thousandths: "ភាគម៉ឺន",
};

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
 * Pad array of digits with leading characters (empty string by default for place-value columns)
 */
function padLeading(digits: string[], targetLen: number, padChar = ""): string[] {
  const padCount = Math.max(0, targetLen - digits.length);
  return [...Array(padCount).fill(padChar), ...digits];
}

/**
 * Pad array of digits with trailing characters (empty string by default for decimal place-value columns)
 */
function padTrailing(digits: string[], targetLen: number, padChar = ""): string[] {
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

  // Carry row for Addition (+) whenever any column sum >= 10
  if (opSymbol === "+") {
    const aRev = String(Math.abs(Math.round(aNum))).split("").map(Number).reverse();
    const bRev = String(Math.abs(Math.round(bNum))).split("").map(Number).reverse();
    const carryArr = Array(maxDigits).fill("");
    let carry = 0;
    let hasCarry = false;

    for (let i = 0; i < maxDigits; i++) {
      const dA = aRev[i] ?? 0;
      const dB = bRev[i] ?? 0;
      const sum = dA + dB + carry;
      if (sum >= 10) {
        carry = Math.floor(sum / 10);
        hasCarry = true;
        if (i + 1 < maxDigits) {
          carryArr[i + 1] = toKhmerNumeral(carry);
        }
      } else {
        carry = 0;
      }
    }

    if (hasCarry) {
      const carryCells = [...carryArr].reverse();
      rows.push({
        role: "carry",
        operator: "",
        digits: carryCells,
        cells: carryCells,
        label: "ត្រាទុក (Carrying)",
      });
    }
  }

  // Carry row for Multiplication (×) whenever any column product >= 10
  if (opSymbol === "×" && Math.abs(bNum) < 10) {
    const aRev = String(Math.abs(Math.round(aNum))).split("").map(Number).reverse();
    const mult = Math.abs(Math.round(bNum));
    const carryArr = Array(maxDigits).fill("");
    let carry = 0;
    let hasCarry = false;

    for (let i = 0; i < aRev.length; i++) {
      const prod = aRev[i] * mult + carry;
      if (prod >= 10) {
        carry = Math.floor(prod / 10);
        hasCarry = true;
        if (i + 1 < maxDigits) {
          carryArr[i + 1] = toKhmerNumeral(carry);
        }
      } else {
        carry = 0;
      }
    }

    if (hasCarry) {
      const carryCells = [...carryArr].reverse();
      rows.push({
        role: "carry",
        operator: "",
        digits: carryCells,
        cells: carryCells,
        label: "ត្រាទុក (Carrying)",
      });
    }
  }

  // Borrowing row for subtraction with borrowing
  if (opSymbol === "−") {
    const aRev = String(Math.abs(Math.round(aNum))).split("").map(Number).reverse();
    const bRev = String(Math.abs(Math.round(bNum))).split("").map(Number).reverse();
    const currentA = [...aRev];
    const borrowDisplay = Array(maxDigits).fill("");
    let hasBorrow = false;

    for (let i = 0; i < maxDigits; i++) {
      const colA = currentA[i] ?? 0;
      const colB = bRev[i] ?? 0;
      if (colA < colB) {
        hasBorrow = true;
        let borrowIdx = i + 1;
        while (borrowIdx < currentA.length && currentA[borrowIdx] === 0) {
          borrowIdx++;
        }
        if (borrowIdx < currentA.length) {
          currentA[borrowIdx]--;
          borrowDisplay[borrowIdx] = `(${toKhmerNumeral(currentA[borrowIdx])})`;
          for (let k = borrowIdx - 1; k > i; k--) {
            currentA[k] = 9;
            borrowDisplay[k] = `(${toKhmerNumeral(9)})`;
          }
          currentA[i] += 10;
          borrowDisplay[i] = toKhmerNumeral(currentA[i]);
        }
      }
    }

    if (hasBorrow) {
      const borrowCells = [...borrowDisplay].reverse();
      rows.push({
        role: "borrow",
        operator: "",
        digits: borrowCells,
        cells: borrowCells,
        label: "ចំនួនខ្ចី (Borrowing)",
      });
    }
  }

  // Row 1: First operand (top number)
  const aDigitsPadded = padLeading(aDigitsKhmer, maxDigits);
  rows.push({
    role: "operand",
    operator: "",
    digits: aDigitsPadded,
    cells: aDigitsPadded,
  });

  // Row 2: Second operand with operator in operator column
  const bDigitsPadded = padLeading(bDigitsKhmer, maxDigits);
  rows.push({
    role: "operand",
    operator: opSymbol,
    digits: bDigitsPadded,
    cells: bDigitsPadded,
  });

  // Multi-digit multiplication: add partial product rows if bNum has >= 2 digits
  if (opSymbol === "×" && Math.abs(bNum) >= 10) {
    const bDigitsRaw = String(Math.abs(bNum)).split("").reverse();
    const sep1 = Array(maxDigits).fill("─");
    rows.push({
      role: "separator",
      digits: sep1,
      cells: sep1,
      borderBottom: true,
    });

    for (let i = 0; i < bDigitsRaw.length; i++) {
      const d = parseInt(bDigitsRaw[i], 10);
      const partial = aNum * d * Math.pow(10, i);
      const partialKhmer = toKhmerNumeral(partial).split("");
      const partialDigits = padLeading(partialKhmer, maxDigits);
      rows.push({
        role: "partial-product",
        operator: i === 0 ? "" : "+",
        digits: partialDigits,
        cells: partialDigits,
        label: `ផលគុណផ្នែកទី ${toKhmerNumeral(i + 1)}`,
      });
    }
  }

  // Separator bar row
  const sepEnd = Array(maxDigits).fill("─");
  rows.push({
    role: "separator",
    digits: sepEnd,
    cells: sepEnd,
    borderBottom: true,
  });

  // Result row
  const resDigitsPadded = padLeading(resDigitsKhmer, maxDigits);
  rows.push({
    role: "result",
    operator: "",
    digits: resDigitsPadded,
    cells: resDigitsPadded,
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
  const divisionSteps: DivisionStep[] = [];

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

      const isLast = i === dividendStr.length - 1;
      divisionSteps.push({
        qDigit,
        prod,
        prodKhmer: toKhmerNumeral(prod),
        diff,
        diffKhmer: toKhmerNumeral(diff),
        broughtVal,
        broughtKhmer: toKhmerNumeral(broughtVal),
        isLast,
      });

      if (!isLast) {
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
    divisionData: {
      dividend,
      divisor,
      quotient,
      remainder,
      dividendKhmer: toKhmerNumeral(dividend),
      divisorKhmer: toKhmerNumeral(divisor),
      quotientKhmer: toKhmerNumeral(quotient),
      remainderKhmer: toKhmerNumeral(remainder),
      steps: divisionSteps,
    },
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
 * Produces semantic HTML table matching exactly the visible UI grid according to Cambodian MoEYS standards.
 * Every single digit and operator sits in its own fixed-width <td> cell (36px x 34px, tabular-nums).
 */
export function renderColumnCalculationHtml(
  calc: StructuredCalculation,
  options?: { inlineStyles?: boolean }
): string {
  if (calc.type === "fraction" && calc.fractionData) {
    return renderFractionCalculationHtml(calc);
  }

  if (calc.type === "division") {
    return renderDivisionCalculationHtml(calc, options);
  }

  const inline = !!options?.inlineStyles;
  const numCols = calc.columns.length;
  const parts: string[] = [];

  const tableStyle = inline
    ? ' style="border-collapse: collapse; font-variant-numeric: tabular-nums; font-family: monospace, \'Noto Sans Khmer\', \'Kantumruy Pro\', Arial, sans-serif; font-size: 18px; text-align: right;"'
    : '';

  parts.push(`<table class="column-calculation" role="math" aria-label="ការគណនាជួរឈរ"${tableStyle}>\n`);
  parts.push('  <tbody>\n');

  // 1. Subtle top header row showing place values in Khmer (ពាន់ | រយ | ដប់ | រាយ)
  const hasPlaceHeaders = calc.columns.some((col) => KHMER_INTEGER_PLACE_LABELS[col] || KHMER_DECIMAL_PLACE_LABELS[col]);
  if (hasPlaceHeaders) {
    parts.push('    <tr class="place-header-row" style="color: #64748b; font-size: 11px; font-weight: 600;">\n');
    parts.push('      <th class="operator-cell" style="width: 36px; height: 24px; text-align: center; padding: 0; font-weight: normal;"></th>\n');
    for (let i = 0; i < numCols; i++) {
      const colKey = calc.columns[i];
      const label = KHMER_INTEGER_PLACE_LABELS[colKey] || (colKey === "decimal_point" ? "·" : KHMER_DECIMAL_PLACE_LABELS[colKey] || "");
      const borderStyle = label ? "border-bottom: 1px dashed #cbd5e1;" : "";
      parts.push(`      <th class="place-header-cell" style="width: 36px; height: 24px; text-align: center; vertical-align: middle; padding: 0; ${borderStyle}">${label}</th>\n`);
    }
    parts.push('    </tr>\n');
  }

  // 2. Data Rows
  for (const row of calc.rows) {
    if (row.role === "separator") {
      const sepStyle = ' style="border-bottom: 2px solid #000; height: 6px; padding: 0;"';
      parts.push(`    <tr class="separator-row"><td colspan="${numCols + 1}"${sepStyle}></td></tr>\n`);
      continue;
    }

    const isBorrowOrCarry = row.role === "borrow" || row.role === "carry";
    const isResult = row.role === "result";
    const cellList = (row.cells && row.cells.length > 0) ? row.cells : (row.digits || []);

    // Dedicated Carry/Borrow row highlighted in warm amber (#d97706)
    if (isBorrowOrCarry) {
      parts.push('    <tr class="math-row carry-borrow-row" style="color: #d97706; font-size: 13px; font-weight: 700;">\n');
      parts.push('      <td class="operator-cell" style="width: 36px; height: 28px; text-align: center; padding: 0;"></td>\n');
      for (let i = 0; i < numCols; i++) {
        const val = cellList[i] !== undefined && cellList[i] !== null ? cellList[i] : "";
        parts.push(`      <td class="digit-cell carry-borrow-cell" style="width: 36px; height: 28px; text-align: center; vertical-align: middle; font-size: 13px; font-weight: 700; color: #d97706; padding: 0;">${val}</td>\n`);
      }
      parts.push('    </tr>\n');
      continue;
    }

    const rowClass = `math-row ${row.role}`;
    parts.push(`    <tr class="${rowClass}">\n`);
    const opStyle = inline
      ? ' style="width: 36px; height: 34px; text-align: center; vertical-align: middle; font-weight: 700; font-size: 18px; color: #0f172a;"'
      : '';
    parts.push(`      <td class="operator-cell"${opStyle}>${row.operator || ""}</td>\n`);

    for (let i = 0; i < numCols; i++) {
      const val = cellList[i] !== undefined && cellList[i] !== null ? cellList[i] : "";
      const isPoint = val === ".";
      const cellClass = isPoint ? "digit-cell point-cell" : "digit-cell";
      const fontWeight = isResult ? "font-weight: 800; color: #0f172a;" : "color: #0f172a;";
      const digitStyle = inline
        ? ` style="width: 36px; height: 34px; text-align: center; vertical-align: middle; font-size: 18px; font-variant-numeric: tabular-nums; ${fontWeight}"`
        : '';
      parts.push(`      <td class="${cellClass}"${digitStyle}>${val}</td>\n`);
    }

    parts.push('    </tr>\n');
  }

  parts.push('  </tbody>\n');
  parts.push('</table>\n');

  return parts.join("");
}

/**
 * Render Cambodian MoEYS Primary Textbook vertical division (L-bracket / T-grid layout)
 * Left: Dividend (តំណាងចែក) with aligned subtraction rows and final Remainder (សំណល់)
 * Right: Divisor (តួចែក) in top-right box over Quotient (ផលចែក) separated by vertical line (border-left: 2px solid #0f172a)
 */
function renderDivisionCalculationHtml(
  calc: StructuredCalculation,
  options?: { inlineStyles?: boolean }
): string {
  const inline = !!options?.inlineStyles;
  const div = calc.divisionData;

  const tableStyle = inline
    ? ' style="border-collapse: collapse; font-variant-numeric: tabular-nums; font-family: monospace, \'Noto Sans Khmer\', \'Kantumruy Pro\', Arial, sans-serif; font-size: 18px; margin: 12px 0;"'
    : ' style="border-collapse: collapse; font-variant-numeric: tabular-nums;"';

  if (!div) {
    const numCols = calc.columns.length;
    const parts: string[] = [];
    parts.push(`<table class="column-calculation" data-layout="division-table" role="math" aria-label="ការចែកជួរឈរ"${tableStyle}>\n`);
    parts.push('  <tbody>\n');
    for (const row of calc.rows) {
      if (row.role === "separator") {
        parts.push(`    <tr class="separator-row"><td colspan="${numCols + 1}" style="border-bottom: 2px solid #000; height: 6px; padding: 0;"></td></tr>\n`);
        continue;
      }
      parts.push(`    <tr class="math-row ${row.role}">\n`);
      parts.push(`      <td class="operator-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle; font-weight: 700;">${row.operator || ""}</td>\n`);
      const cellList = (row.cells && row.cells.length > 0) ? row.cells : (row.digits || []);
      for (let i = 0; i < numCols; i++) {
        const val = cellList[i] !== undefined && cellList[i] !== null ? cellList[i] : "";
        parts.push(`      <td class="digit-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle;">${val}</td>\n`);
      }
      parts.push('    </tr>\n');
    }
    parts.push('  </tbody>\n');
    parts.push('</table>\n');
    return parts.join("");
  }

  const parts: string[] = [];
  parts.push(`<table class="column-calculation" data-layout="division-textbook-grid" role="math" aria-label="ប្រមាណវិធីចែកជួរឈរ"${tableStyle}>\n`);
  parts.push('  <tbody>\n');
  parts.push('    <tr>\n');

  // Left side: Dividend & subtraction steps
  const divDigits = div.dividendKhmer.split("");
  const leftCols = Math.max(divDigits.length, 3);

  parts.push('      <td style="vertical-align: top; padding-right: 18px; border-right: 2px solid #0f172a;">\n');
  parts.push('        <table style="border-collapse: collapse; font-variant-numeric: tabular-nums; font-family: monospace, \'Noto Sans Khmer\', \'Kantumruy Pro\', Arial, sans-serif; font-size: 18px; text-align: right;">\n');
  parts.push('          <tbody>\n');

  // Dividend row
  parts.push('            <tr class="math-row dividend">\n');
  parts.push('              <td class="operator-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle;"></td>\n');
  for (let i = 0; i < leftCols; i++) {
    const d = divDigits[i] || "";
    parts.push(`              <td class="digit-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle; font-weight: 700; color: #0f172a;">${d}</td>\n`);
  }
  parts.push('            </tr>\n');

  // Subtraction rows
  for (const step of div.steps) {
    const subDigits = step.prodKhmer.split("");
    parts.push('            <tr class="math-row step">\n');
    parts.push('              <td class="operator-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle; font-weight: 700; color: #0f172a;">−</td>\n');
    const padCount = Math.max(0, leftCols - subDigits.length);
    for (let p = 0; p < padCount; p++) {
      parts.push('              <td class="digit-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle;"></td>\n');
    }
    for (const d of subDigits) {
      parts.push(`              <td class="digit-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle; color: #0f172a;">${d}</td>\n`);
    }
    parts.push('            </tr>\n');

    parts.push(`            <tr class="separator-row"><td colspan="${leftCols + 1}" style="border-bottom: 2px solid #000; height: 4px; padding: 0;"></td></tr>\n`);

    const remDigits = step.broughtKhmer.split("");
    const remPad = Math.max(0, leftCols - remDigits.length);
    const isLast = step.isLast;
    parts.push(`            <tr class="math-row ${isLast ? "remainder" : "step"}">\n`);
    parts.push('              <td class="operator-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle;"></td>\n');
    for (let p = 0; p < remPad; p++) {
      parts.push('              <td class="digit-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle;"></td>\n');
    }
    for (const d of remDigits) {
      parts.push(`              <td class="digit-cell" style="width: 36px; height: 34px; text-align: center; vertical-align: middle; ${isLast ? "font-weight: 800; color: #059669;" : "color: #0f172a;"}">${d}</td>\n`);
    }
    parts.push('            </tr>\n');
  }

  parts.push('          </tbody>\n');
  parts.push('        </table>\n');
  parts.push('      </td>\n');

  // Right side: Divisor on top, Quotient underneath
  parts.push('      <td style="vertical-align: top; padding-left: 18px; min-width: 140px;">\n');
  parts.push('        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px;">\n');
  parts.push('          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px;">តួចែក (Divisor)</div>\n');
  parts.push(`          <div class="digit-cell" style="font-size: 22px; font-weight: 800; color: #0f172a; font-family: monospace, 'Noto Sans Khmer', sans-serif;">${div.divisorKhmer}</div>\n`);
  parts.push('        </div>\n');
  parts.push('        <div>\n');
  parts.push('          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px;">ផលចែក (Quotient)</div>\n');
  parts.push(`          <div style="font-size: 22px; font-weight: 800; color: #4338ca; font-family: monospace, 'Noto Sans Khmer', sans-serif;">${div.quotientKhmer}</div>\n`);
  parts.push('        </div>\n');
  if (div.remainder > 0) {
    parts.push(`        <div style="margin-top: 8px; font-size: 12px; font-weight: 700; color: #d97706;">សំណល់ = ${div.remainderKhmer}</div>\n`);
  }
  parts.push('      </td>\n');

  parts.push('    </tr>\n');
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
      const cellList = row.cells || row.digits || [];
      const digit = cellList[c] || " ";
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

/**
 * Build structured multiplication with explicit partial product rows (e.g. 24 × 3)
 */
export function buildStructuredMultiplicationWithPartialProducts(
  aNum: number,
  bNum: number
): StructuredCalculation {
  const calculatedRes = aNum * bNum;
  const aDigitsKhmer = toKhmerNumeral(Math.abs(Math.round(aNum))).split("");
  const bDigitsKhmer = toKhmerNumeral(Math.abs(Math.round(bNum))).split("");
  const resDigitsKhmer = toKhmerNumeral(Math.abs(Math.round(calculatedRes))).split("");

  const maxDigits = Math.max(aDigitsKhmer.length, bDigitsKhmer.length, resDigitsKhmer.length, 3);
  const columns: string[] = [];
  for (let i = maxDigits - 1; i >= 0; i--) {
    columns.push(INTEGER_PLACE_NAMES[i] || `col_${i}`);
  }

  const rows: StructuredCalculationRow[] = [];
  const pad = (digits: string[]) => padLeading(digits, maxDigits, " ");

  // Multiplicand
  const aPadded = pad(aDigitsKhmer);
  rows.push({
    role: "operand",
    operator: "",
    digits: aPadded,
    cells: aPadded,
  });

  // Multiplier
  const bPadded = pad(bDigitsKhmer);
  rows.push({
    role: "operand",
    operator: "×",
    digits: bPadded,
    cells: bPadded,
  });

  // Top separator
  const sepBar = Array(maxDigits).fill("─");
  rows.push({
    role: "separator",
    digits: sepBar,
    cells: sepBar,
    borderBottom: true,
  });

  // Break down into partial products
  const bDigitsRaw = String(Math.abs(bNum)).split("").reverse();
  const aDigitsRaw = String(Math.abs(aNum)).split("").reverse();

  if (bDigitsRaw.length === 1 && aDigitsRaw.length > 1) {
    const m = parseInt(bDigitsRaw[0], 10);
    for (let i = 0; i < aDigitsRaw.length; i++) {
      const d = parseInt(aDigitsRaw[i], 10);
      const partial = d * Math.pow(10, i) * m;
      const partialKhmer = toKhmerNumeral(partial).split("");
      const pDigits = pad(partialKhmer);
      rows.push({
        role: "partial-product",
        operator: i === 0 ? "" : "+",
        digits: pDigits,
        cells: pDigits,
        label: `ផលគុណផ្នែកទី ${toKhmerNumeral(i + 1)}`,
      });
    }
  } else {
    for (let i = 0; i < bDigitsRaw.length; i++) {
      const d = parseInt(bDigitsRaw[i], 10);
      const partial = aNum * d * Math.pow(10, i);
      const partialKhmer = toKhmerNumeral(partial).split("");
      const pDigits = pad(partialKhmer);
      rows.push({
        role: "partial-product",
        operator: i === 0 ? "" : "+",
        digits: pDigits,
        cells: pDigits,
        label: `ផលគុណផ្នែកទី ${toKhmerNumeral(i + 1)}`,
      });
    }
  }

  // Bottom separator
  rows.push({
    role: "separator",
    digits: sepBar,
    cells: sepBar,
    borderBottom: true,
  });

  // Final result
  const resPadded = pad(resDigitsKhmer);
  rows.push({
    role: "result",
    operator: "",
    digits: resPadded,
    cells: resPadded,
  });

  return {
    type: "arithmetic",
    columns,
    rows,
    captionKhmer: `ផលគុណផ្នែកតាមជួរឈរ៖ ${toKhmerNumeral(aNum)} × ${toKhmerNumeral(bNum)} = ${toKhmerNumeral(calculatedRes)}`,
  };
}

/**
 * Converts a StructuredCalculation to the canonical VerticalCalculation data model
 */
export function structuredToVerticalCalculation(calc: StructuredCalculation): VerticalCalculation {
  let op: "addition" | "subtraction" | "multiplication" | "division" = "addition";
  if (calc.type === "division") {
    op = "division";
  } else {
    const opRow = calc.rows.find((r) => r.operator);
    if (opRow?.operator === "−" || opRow?.operator === "-") op = "subtraction";
    else if (opRow?.operator === "×" || opRow?.operator === "*") op = "multiplication";
    else if (opRow?.operator === "÷" || opRow?.operator === "/") op = "division";
  }

  const rows: VerticalRow[] = calc.rows.map((r) => {
    let role: VerticalRowRole = "operand";
    if (r.role === "separator") role = "separator";
    else if (r.role === "result") role = "result";
    else if (r.role === "carry" || r.role === "carrying") role = "carry";
    else if (r.role === "borrow" || r.role === "borrowing") role = "borrow";
    else if (r.role === "quotient") role = "quotient";
    else if (r.role === "remainder") role = "remainder";
    else if (r.role === "partial-product" || (r.role === "step" && op === "multiplication"))
      role = "partial-product";
    else if (r.role === "step") role = "working";
    else role = "operand";

    const cells = r.cells || r.digits || [];
    return {
      role,
      operator: r.operator,
      cells: [...cells],
      borderBottom: r.borderBottom ?? (r.role === "separator"),
    };
  });

  return {
    operation: op,
    columns: [...calc.columns],
    rows,
  };
}

/**
 * Converts a canonical VerticalCalculation back to StructuredCalculation
 */
export function verticalToStructuredCalculation(vert: VerticalCalculation): StructuredCalculation {
  return {
    type: vert.operation === "division" ? "division" : "arithmetic",
    columns: [...vert.columns],
    rows: vert.rows.map((r) => ({
      role: r.role,
      operator: r.operator,
      digits: [...r.cells],
      cells: [...r.cells],
      borderBottom: r.borderBottom,
    })),
  };
}

/**
 * Transforms any MathSolverProblem or partial object into a strict canonical MathSolution
 */
export function toMathSolution(
  problem: any,
  options?: { solverMode?: "solve" | "generate" | "verify" }
): MathSolution {
  if (
    problem &&
    "problemStatement" in problem &&
    "verticalCalculations" in problem &&
    Array.isArray(problem.verticalCalculations) &&
    Array.isArray(problem.steps)
  ) {
    return problem as MathSolution;
  }

  const problemStatement =
    problem?.extractedProblem || problem?.problemStatement || "";

  // Infer operation
  let operation: MathOperation = "other";
  const norm = fromKhmerNumeral(problemStatement).replace(/\s+/g, "");
  if (norm.includes("/")) {
    operation = /^\d+\/\d+[+\-*/÷]\d+\/\d+$/.test(norm) ? "fraction" : "division";
  } else if (norm.includes("+")) {
    operation = norm.includes(".") ? "decimal" : "addition";
  } else if (norm.includes("-") || norm.includes("−")) {
    operation = norm.includes(".") ? "decimal" : "subtraction";
  } else if (norm.includes("×") || norm.includes("*") || norm.toLowerCase().includes("x")) {
    operation = norm.includes(".") ? "decimal" : "multiplication";
  } else if (norm.includes("÷") || norm.includes(":")) {
    operation = "division";
  }

  const verticalCalculations: VerticalCalculation[] = [];
  const structured =
    problem?.structuredCalculation ||
    detectAndBuildStructuredCalculation(
      problemStatement,
      problem?.finalAnswer,
      problem?.verticalLines
    );

  if (structured) {
    verticalCalculations.push(structuredToVerticalCalculation(structured));
  }

  // Parse steps from solution explanation
  const steps: MathStep[] = [];
  const explanation = problem?.solutionKhmer || problem?.solution || "";
  if (explanation) {
    const rawSteps = explanation.split(/\n\n+/).filter((s: string) => s.trim().length > 0);
    rawSteps.forEach((stepText: string, idx: number) => {
      const titleMatch = stepText.match(/^(?:ជំហានទី\s*([០-៩\d]+)[—:៖-]?\s*)([^\n]+)/);
      const title = titleMatch ? titleMatch[2].trim() : `ជំហានទី ${toKhmerNumeral(idx + 1)}`;
      steps.push({
        stepNumber: idx + 1,
        titleKhmer: title,
        explanationKhmer: stepText.trim(),
        calculationText: stepText.includes("=") ? stepText.split("=")[0].trim() : undefined,
      });
    });
  }

  return {
    problemStatement,
    operation,
    finalAnswer: problem?.finalAnswer,
    explanationKhmer: problem?.solutionKhmer || problem?.solution,
    steps,
    verticalCalculations,
    verification: problem?.verification,
    id: problem?.id,
    mode: problem?.mode || options?.solverMode,
    inferredGrade: problem?.inferredGrade,
    inferredGradeKhmer: problem?.inferredGradeKhmer,
    visualInterpretation: problem?.visualInterpretation,
    given: problem?.given,
    toFind: problem?.toFind,
    formulas: problem?.formulas,
    extractedAnswer: problem?.extractedAnswer,
    answerStatus: problem?.answerStatus,
    answerStatusKhmer: problem?.answerStatusKhmer,
    incorrectStep: problem?.incorrectStep,
    errorExplanationKhmer: problem?.errorExplanationKhmer,
    correctedStep: problem?.correctedStep,
    confidence: problem?.confidence,
    confidenceKhmer: problem?.confidenceKhmer,
    ambiguousParts: problem?.ambiguousParts,
    reviewSuggestions: problem?.reviewSuggestions,
    deterministicResult: problem?.deterministicResult,
  };
}

// Aliases for explicit semantic builder naming
export const buildStructuredIntegerDivision = buildStructuredLongDivision;
export const buildStructuredFractionArithmetic = buildStructuredFraction;

// ====================================================================
// Progressive Step-by-Step Column Calculation & Horizontal Breakdown Models
// ====================================================================

export interface ProgressiveColumnStep {
  stepIndex: number;
  placeKey: string;
  placeNameKhmer: string;
  stepTitleKhmer: string;
  explanationKhmer: string;
  columns: string[];
  activeColIdx: number;
  carryDigits?: string[];
  operandRows: {
    operator?: string;
    digits: string[];
  }[];
  answerBoxes: {
    digit: string;
    status: "active" | "completed" | "empty";
  }[];
}

export interface HorizontalBreakdown {
  titleKhmer: string;
  subTitleKhmer: string;
  expressionKhmer: string;
  bullets: string[];
  conclusionKhmer: string;
  operation: "addition" | "subtraction" | "multiplication" | "division";
  finalAnswerKhmer: string;
}

/**
 * Builds progressive step-by-step column calculation states (ones -> tens -> hundreds...)
 * matching Cambodian MoEYS Primary School Textbook pedagogical models.
 */
export function buildProgressiveColumnSteps(
  aNum: number,
  op: string,
  bNum: number,
  resNum?: number
): ProgressiveColumnStep[] {
  const normOp = normalizeOperator(op);
  const a = Math.abs(Math.round(aNum));
  const b = Math.abs(Math.round(bNum));
  const calculatedRes =
    resNum !== undefined
      ? Math.abs(Math.round(resNum))
      : normOp === "+"
      ? a + b
      : normOp === "−"
      ? a - b
      : normOp === "×"
      ? a * b
      : b !== 0
      ? Math.floor(a / b)
      : 0;

  const aDigits = String(a).split("").map(Number);
  const bDigits = String(b).split("").map(Number);
  const resDigits = String(calculatedRes).split("").map(Number);

  const maxLen = Math.max(aDigits.length, bDigits.length, resDigits.length);
  const columns: string[] = [];
  for (let i = maxLen - 1; i >= 0; i--) {
    columns.push(INTEGER_PLACE_NAMES[i] || `col_${i}`);
  }

  const placeKhmerNames = ["ខ្ទង់រាយ", "ខ្ទង់ដប់", "ខ្ទង់រយ", "ខ្ទង់ពាន់", "ខ្ទង់ម៉ឺន", "ខ្ទង់សែន"];
  const stepPrefixes = ["ជំហានទី១", "ជំហានទី២", "ជំហានទី៣", "ជំហានទី៤", "ជំហានទី៥", "ជំហានទី៦"];

  const steps: ProgressiveColumnStep[] = [];
  const completedAnswers: string[] = Array(maxLen).fill("");

  // -------------------------------------------------------------
  // 1. ADDITION (+)
  // -------------------------------------------------------------
  if (normOp === "+") {
    const aRev = [...aDigits].reverse();
    const bRev = [...bDigits].reverse();
    let carry = 0;
    const carryDisplay = Array(maxLen).fill("");

    const totalSteps = Math.max(aRev.length, bRev.length, resDigits.length);

    for (let i = 0; i < totalSteps; i++) {
      const colIdx = maxLen - 1 - i;
      const dA = aRev[i] ?? 0;
      const dB = bRev[i] ?? 0;

      if (i >= aRev.length && i >= bRev.length && carry === 0) {
        break;
      }

      const prevCarry = carry;
      const sum = dA + dB + carry;
      const nextCarry = Math.floor(sum / 10);
      carry = nextCarry;
      const ansDigit = sum % 10;
      const ansKhmer = toKhmerNumeral(ansDigit);
      completedAnswers[colIdx] = ansKhmer;

      const pName = placeKhmerNames[i] || `ខ្ទង់ទី ${toKhmerNumeral(i + 1)}`;
      const sPrefix = stepPrefixes[i] || `ជំហានទី ${toKhmerNumeral(i + 1)}`;

      // Setup carry display for progressive view
      const stepCarry = [...carryDisplay];
      if (nextCarry > 0 && colIdx - 1 >= 0) {
        carryDisplay[colIdx - 1] = toKhmerNumeral(nextCarry);
      }

      // Pedagogical explanation
      let explanation = "";
      if (i === 0) {
        if (nextCarry === 0) {
          explanation = `បូកចំនួនតាមខ្ទង់។ ខ្ទង់រាយបូកនឹងខ្ទង់រាយ គឺ ${toKhmerNumeral(dA)} + ${toKhmerNumeral(dB)} = ${toKhmerNumeral(sum)} (សរសេរលេខ ${ansKhmer} នៅខ្ទង់រាយ)។`;
        } else {
          explanation = `បូកខ្ទង់រាយ ${toKhmerNumeral(dA)} + ${toKhmerNumeral(dB)} = ${toKhmerNumeral(sum)} ។ រៀបជាក្រុមឡើងវិញ៖ សរសេរលេខ ${ansKhmer} នៅខ្ទង់រាយ និងត្រាទុក ${toKhmerNumeral(nextCarry)} នៅលើខ្ទង់ដប់។`;
        }
      } else if (i >= aRev.length && i >= bRev.length) {
        explanation = `ទម្លាក់លេខ ${toKhmerNumeral(prevCarry)} ដែលនៅសល់ពីការត្រាទុក (សរសេរ ${toKhmerNumeral(prevCarry)})។`;
      } else if (prevCarry > 0) {
        if (nextCarry === 0) {
          explanation = `បូក${pName}នឹង${pName} គឺ ${toKhmerNumeral(dA)} + ${toKhmerNumeral(dB)} + ${toKhmerNumeral(prevCarry)} (ត្រាទុក) = ${toKhmerNumeral(sum)} (សរសេរលេខ ${ansKhmer} នៅ${pName})។`;
        } else {
          explanation = `បូក${pName} គឺ ${toKhmerNumeral(dA)} + ${toKhmerNumeral(dB)} + ${toKhmerNumeral(prevCarry)} (ត្រាទុក) = ${toKhmerNumeral(sum)} ។ សរសេរលេខ ${ansKhmer} នៅ${pName} និងត្រាទុក ${toKhmerNumeral(nextCarry)} នៅលើខ្ទង់បន្ទាប់។`;
        }
      } else {
        if (nextCarry === 0) {
          explanation = `បូក${pName}នឹង${pName} គឺ ${toKhmerNumeral(dA)} + ${toKhmerNumeral(dB)} = ${toKhmerNumeral(sum)} (សរសេរលេខ ${ansKhmer} នៅ${pName})។`;
        } else {
          explanation = `បូក${pName} គឺ ${toKhmerNumeral(dA)} + ${toKhmerNumeral(dB)} = ${toKhmerNumeral(sum)} ។ សរសេរលេខ ${ansKhmer} នៅ${pName} និងត្រាទុក ${toKhmerNumeral(nextCarry)} នៅលើខ្ទង់បន្ទាប់។`;
        }
      }

      // Pad operand rows to maxLen
      const aPadded = padLeading(aDigits.map(toKhmerNumeral), maxLen, "");
      const bPadded = padLeading(bDigits.map(toKhmerNumeral), maxLen, "");

      const answerBoxes = columns.map((_, c) => {
        if (c === colIdx) {
          return { digit: ansKhmer, status: "active" as const };
        } else if (c > colIdx && completedAnswers[c]) {
          return { digit: completedAnswers[c], status: "completed" as const };
        } else {
          return { digit: "", status: "empty" as const };
        }
      });

      steps.push({
        stepIndex: i,
        placeKey: columns[colIdx],
        placeNameKhmer: pName,
        stepTitleKhmer: `${sPrefix} — ${pName}`,
        explanationKhmer: explanation,
        columns,
        activeColIdx: colIdx,
        carryDigits: stepCarry.some((d) => d !== "") ? stepCarry : undefined,
        operandRows: [
          { operator: "", digits: aPadded },
          { operator: "+", digits: bPadded },
        ],
        answerBoxes,
      });
    }

    return steps;
  }

  // -------------------------------------------------------------
  // 2. SUBTRACTION (−)
  // -------------------------------------------------------------
  if (normOp === "−" && a >= b) {
    const aRev = [...aDigits].reverse();
    const bRev = [...bDigits].reverse();
    const currentA = [...aRev];
    const borrowDisplay = Array(maxLen).fill("");

    const totalSteps = Math.max(aRev.length, bRev.length);

    for (let i = 0; i < totalSteps; i++) {
      const colIdx = maxLen - 1 - i;
      const colA = currentA[i] ?? 0;
      const colB = bRev[i] ?? 0;
      const origColA = aRev[i] ?? 0;

      const pName = placeKhmerNames[i] || `ខ្ទង់ទី ${toKhmerNumeral(i + 1)}`;
      const sPrefix = stepPrefixes[i] || `ជំហានទី ${toKhmerNumeral(i + 1)}`;

      let diff = 0;
      let explanation = "";

      if (colA >= colB) {
        diff = colA - colB;
        if (i === 0) {
          explanation = `ដកចំនួនតាមខ្ទង់។ ខ្ទង់រាយដកនឹងខ្ទង់រាយ គឺ ${toKhmerNumeral(colA)} − ${toKhmerNumeral(colB)} = ${toKhmerNumeral(diff)} ។ (ដោយសារ ${toKhmerNumeral(colA)} ធំជាង ${colB === 0 ? "ឬស្មើ " : ""}${toKhmerNumeral(colB)} យើងដកបានភ្លាមៗ សរសេរលេខ ${toKhmerNumeral(diff)} នៅខ្ទង់រាយ)។`;
        } else if (colB === 0 && i >= bRev.length) {
          explanation = `ទម្លាក់${pName} គឺ ${toKhmerNumeral(colA)} (ព្រោះគ្មានតួដក សរសេរលេខ ${toKhmerNumeral(diff)} នៅ${pName})។`;
        } else {
          explanation = `ដក${pName}នឹង${pName} គឺ ${toKhmerNumeral(colA)} − ${toKhmerNumeral(colB)} = ${toKhmerNumeral(diff)} (សរសេរលេខ ${toKhmerNumeral(diff)} នៅ${pName})។`;
        }
      } else {
        // Regrouping / Borrowing
        let borrowIdx = i + 1;
        while (borrowIdx < currentA.length && currentA[borrowIdx] === 0) {
          borrowIdx++;
        }
        if (borrowIdx < currentA.length) {
          currentA[borrowIdx]--;
          borrowDisplay[maxLen - 1 - borrowIdx] = `(${toKhmerNumeral(currentA[borrowIdx])})`;
          for (let k = borrowIdx - 1; k > i; k--) {
            currentA[k] = 9;
            borrowDisplay[maxLen - 1 - k] = `(${toKhmerNumeral(9)})`;
          }
          currentA[i] += 10;
          borrowDisplay[colIdx] = toKhmerNumeral(currentA[i]);
        }
        diff = currentA[i] - colB;
        const nextPName = placeKhmerNames[i + 1] || "ខ្ទង់បន្ទាប់";
        explanation = `ដក${pName} ${toKhmerNumeral(origColA)} − ${toKhmerNumeral(colB)} មិនបានទេ (ព្រោះ ${toKhmerNumeral(origColA)} តូចជាង ${toKhmerNumeral(colB)})។ ត្រូវខ្ចី ១ ដប់ពី${nextPName}មកថែមបាន ${toKhmerNumeral(currentA[i])} រួចយក ${toKhmerNumeral(currentA[i])} − ${toKhmerNumeral(colB)} = ${toKhmerNumeral(diff)} (សរសេរលេខ ${toKhmerNumeral(diff)} នៅ${pName})។`;
      }

      const ansKhmer = toKhmerNumeral(diff);
      completedAnswers[colIdx] = ansKhmer;

      const aPadded = padLeading(aDigits.map(toKhmerNumeral), maxLen, "");
      const bPadded = padLeading(bDigits.map(toKhmerNumeral), maxLen, "");

      const answerBoxes = columns.map((_, c) => {
        if (c === colIdx) {
          return { digit: ansKhmer, status: "active" as const };
        } else if (c > colIdx && completedAnswers[c]) {
          return { digit: completedAnswers[c], status: "completed" as const };
        } else {
          return { digit: "", status: "empty" as const };
        }
      });

      steps.push({
        stepIndex: i,
        placeKey: columns[colIdx],
        placeNameKhmer: pName,
        stepTitleKhmer: `${sPrefix} — ${pName}`,
        explanationKhmer: explanation,
        columns,
        activeColIdx: colIdx,
        carryDigits: borrowDisplay.some((d) => d !== "") ? [...borrowDisplay] : undefined,
        operandRows: [
          { operator: "", digits: aPadded },
          { operator: "−", digits: bPadded },
        ],
        answerBoxes,
      });
    }

    return steps;
  }

  // -------------------------------------------------------------
  // 3. MULTIPLICATION (×)
  // -------------------------------------------------------------
  if (normOp === "×" && b < 10) {
    const aRev = [...aDigits].reverse();
    let carry = 0;
    const carryDisplay = Array(maxLen).fill("");

    for (let i = 0; i < aRev.length; i++) {
      const colIdx = maxLen - 1 - i;
      const dA = aRev[i];
      const prevCarry = carry;
      const prod = dA * b + carry;
      carry = Math.floor(prod / 10);
      const ansDigit = prod % 10;
      const ansKhmer = toKhmerNumeral(ansDigit);
      completedAnswers[colIdx] = ansKhmer;

      const pName = placeKhmerNames[i] || `ខ្ទង់ទី ${toKhmerNumeral(i + 1)}`;
      const sPrefix = stepPrefixes[i] || `ជំហានទី ${toKhmerNumeral(i + 1)}`;

      const stepCarry = [...carryDisplay];
      if (carry > 0 && colIdx - 1 >= 0) {
        carryDisplay[colIdx - 1] = toKhmerNumeral(carry);
      }

      let explanation = "";
      if (carry > 0) {
        const nextPName = placeKhmerNames[i + 1] || "ខ្ទង់បន្ទាប់";
        explanation = `គុណតួគុណនឹងលេខ${pName} គឺ ${toKhmerNumeral(b)} × ${toKhmerNumeral(dA)}${prevCarry > 0 ? ` + ${toKhmerNumeral(prevCarry)} (ត្រាទុក)` : ""} = ${toKhmerNumeral(prod)} ។ សរសេរលេខ ${ansKhmer} នៅ${pName} និងត្រាទុក ${toKhmerNumeral(carry)} នៅ${nextPName}។`;
      } else {
        explanation = `គុណតួគុណនឹងលេខ${pName} គឺ ${toKhmerNumeral(b)} × ${toKhmerNumeral(dA)}${prevCarry > 0 ? ` + ${toKhmerNumeral(prevCarry)} (ត្រាទុក)` : ""} = ${toKhmerNumeral(prod)} (សរសេរលេខ ${ansKhmer} នៅ${pName})។`;
      }

      const aPadded = padLeading(aDigits.map(toKhmerNumeral), maxLen, "");
      const bPadded = padLeading(bDigits.map(toKhmerNumeral), maxLen, "");

      const answerBoxes = columns.map((_, c) => {
        if (c === colIdx) {
          return { digit: ansKhmer, status: "active" as const };
        } else if (c > colIdx && completedAnswers[c]) {
          return { digit: completedAnswers[c], status: "completed" as const };
        } else {
          return { digit: "", status: "empty" as const };
        }
      });

      steps.push({
        stepIndex: i,
        placeKey: columns[colIdx],
        placeNameKhmer: pName,
        stepTitleKhmer: `${sPrefix} — ${pName}`,
        explanationKhmer: explanation,
        columns,
        activeColIdx: colIdx,
        carryDigits: stepCarry.some((d) => d !== "") ? stepCarry : undefined,
        operandRows: [
          { operator: "", digits: aPadded },
          { operator: "×", digits: bPadded },
        ],
        answerBoxes,
      });
    }

    if (carry > 0 && maxLen - 1 - aRev.length >= 0) {
      const colIdx = maxLen - 1 - aRev.length;
      const ansKhmer = toKhmerNumeral(carry);
      completedAnswers[colIdx] = ansKhmer;
      const stepIdx = aRev.length;
      const pName = placeKhmerNames[stepIdx] || "ខ្ទង់បន្ទាប់";
      const sPrefix = stepPrefixes[stepIdx] || `ជំហានទី ${toKhmerNumeral(stepIdx + 1)}`;

      const aPadded = padLeading(aDigits.map(toKhmerNumeral), maxLen, "");
      const bPadded = padLeading(bDigits.map(toKhmerNumeral), maxLen, "");

      const answerBoxes = columns.map((_, c) => {
        if (c === colIdx) {
          return { digit: ansKhmer, status: "active" as const };
        } else if (c > colIdx && completedAnswers[c]) {
          return { digit: completedAnswers[c], status: "completed" as const };
        } else {
          return { digit: "", status: "empty" as const };
        }
      });

      steps.push({
        stepIndex: stepIdx,
        placeKey: columns[colIdx],
        placeNameKhmer: pName,
        stepTitleKhmer: `${sPrefix} — ${pName}`,
        explanationKhmer: `ទម្លាក់លេខត្រាទុក ${ansKhmer} (សរសេរ ${ansKhmer})។`,
        columns,
        activeColIdx: colIdx,
        carryDigits: undefined,
        operandRows: [
          { operator: "", digits: aPadded },
          { operator: "×", digits: bPadded },
        ],
        answerBoxes,
      });
    }

    return steps;
  }

  return steps;
}

/**
 * Builds Horizontal Arithmetic Breakdown according to Cambodian MoEYS Primary Textbook models.
 */
export function buildHorizontalBreakdown(
  problemText: string,
  aNum?: number,
  op?: string,
  bNum?: number,
  resNum?: number
): HorizontalBreakdown | null {
  let a = aNum;
  let o = op;
  let b = bNum;
  let r = resNum;

  if (a === undefined || o === undefined || b === undefined) {
    const norm = fromKhmerNumeral(problemText)
      .replace(/×/g, "*")
      .replace(/[÷:]/g, "/")
      .replace(/−/g, "-")
      .replace(/\s+/g, "")
      .replace(/=/g, "");
    const match = norm.match(/^(-?\d+(?:\.\d+)?)([+\-*/])(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    a = parseFloat(match[1]);
    o = match[2];
    b = parseFloat(match[3]);
  }

  const opSymbol = normalizeOperator(o);
  if (r === undefined) {
    if (opSymbol === "+") r = a + b;
    else if (opSymbol === "−") r = a - b;
    else if (opSymbol === "×") r = a * b;
    else if (opSymbol === "÷") r = b !== 0 ? Math.floor(a / b) : 0;
    else r = 0;
  }

  const aKhmer = toKhmerNumeral(a);
  const bKhmer = toKhmerNumeral(b);
  const rKhmer = toKhmerNumeral(r);

  // 1. Multiplication (×)
  if (opSymbol === "×") {
    // 1a. Multiples of 10 or 10 x N
    if (a === 10 || b === 10) {
      const mult = a === 10 ? b : a;
      const multKhmer = toKhmerNumeral(mult);
      const repCount = Math.min(Math.max(1, mult), 10);
      const repeated = Array(repCount).fill("១០").join(" + ");
      return {
        titleKhmer: "ការដោះស្រាយ",
        subTitleKhmer: "គុណចំនួន ១០ នឹងលេខមួយខ្ទង់ ៖",
        expressionKhmer: `${aKhmer} × ${bKhmer} = ____`,
        bullets: [
          `- ${aKhmer} × ${bKhmer} = ${repeated} = ${rKhmer} (យក ១០ បូកបញ្ចូលគ្នា ${multKhmer} ដង)`,
          `- ១០ ចំនួន ${multKhmer} ដង ស្មើនឹង ${rKhmer}`,
        ],
        conclusionKhmer: `ដូច្នេះ ${aKhmer} × ${bKhmer} = ${rKhmer} ។`,
        operation: "multiplication",
        finalAnswerKhmer: rKhmer,
      };
    }

    // 1b. Multiplication of 2-digit by 1-digit
    if (b < 10 && a >= 10 && a < 100) {
      const onesA = a % 10;
      const tensA = Math.floor(a / 10);
      const prodOnes = b * onesA;
      const prodTens = b * tensA;
      const hasCarry = prodOnes >= 10;
      const onesKhmer = toKhmerNumeral(onesA);
      const tensKhmer = toKhmerNumeral(tensA);
      const prodOnesKhmer = toKhmerNumeral(prodOnes);
      const prodTensKhmer = toKhmerNumeral(prodTens);

      const bullets: string[] = [];
      if (!hasCarry) {
        bullets.push(`- ខ្ទង់រាយ ៖ យក ${bKhmer} × ${onesKhmer} = ${prodOnesKhmer} (គុណតួគុណនឹងលេខខ្ទង់រាយ សរសេរលេខ ${prodOnesKhmer} នៅខ្ទង់រាយ)`);
        bullets.push(`- ខ្ទង់ដប់ ៖ យក ${bKhmer} × ${tensKhmer} = ${prodTensKhmer} (គុណតួគុណនឹងលេខខ្ទង់ដប់ សរសេរលេខ ${prodTensKhmer} នៅខ្ទង់ដប់)`);
      } else {
        const carryVal = Math.floor(prodOnes / 10);
        const remOnes = prodOnes % 10;
        bullets.push(`- ខ្ទង់រាយ ៖ យក ${bKhmer} × ${onesKhmer} = ${prodOnesKhmer} (សរសេរលេខ ${toKhmerNumeral(remOnes)} នៅខ្ទង់រាយ ត្រាទុក ${toKhmerNumeral(carryVal)} នៅខ្ទង់ដប់)`);
        bullets.push(`- ខ្ទង់ដប់ ៖ យក ${bKhmer} × ${tensKhmer} + ${toKhmerNumeral(carryVal)} = ${toKhmerNumeral(prodTens + carryVal)} (សរសេរលេខ ${toKhmerNumeral(prodTens + carryVal)} នៅខ្ទង់ដប់)`);
      }

      return {
        titleKhmer: "ការដោះស្រាយ",
        subTitleKhmer: `គុណចំនួនពីរខ្ទង់នឹងមួយខ្ទង់${hasCarry ? "ដោយមានត្រាទុក" : "ដោយគ្មានត្រាទុក"} ៖`,
        expressionKhmer: `${aKhmer} × ${bKhmer} = ____`,
        bullets,
        conclusionKhmer: `ដូច្នេះ ${aKhmer} × ${bKhmer} = ${rKhmer} ។`,
        operation: "multiplication",
        finalAnswerKhmer: rKhmer,
      };
    }
  }

  // 2. Subtraction (−)
  if (opSymbol === "−" && a >= b) {
    const aDigits = String(a).split("").map(Number).reverse();
    const bDigits = String(b).split("").map(Number).reverse();
    const bullets: string[] = [];
    const placeNames = ["ខ្ទង់រាយ", "ខ្ទង់ដប់", "ខ្ទង់រយ", "ខ្ទង់ពាន់"];

    for (let i = 0; i < Math.max(aDigits.length, bDigits.length); i++) {
      const da = aDigits[i] ?? 0;
      const db = bDigits[i] ?? 0;
      const pName = placeNames[i] || `ខ្ទង់ទី ${toKhmerNumeral(i + 1)}`;
      if (da >= db) {
        const diff = da - db;
        bullets.push(`- ${pName} ៖ យក ${toKhmerNumeral(da)} − ${toKhmerNumeral(db)} = ${toKhmerNumeral(diff)} (ដកលេខ${pName} សរសេរលេខ ${toKhmerNumeral(diff)} នៅ${pName})`);
      } else {
        const diff = da + 10 - db;
        bullets.push(`- ${pName} ៖ ខ្ចី ១ ដប់ពីខ្ទង់បន្ទាប់ យក ${toKhmerNumeral(da + 10)} − ${toKhmerNumeral(db)} = ${toKhmerNumeral(diff)} (សរសេរលេខ ${toKhmerNumeral(diff)} នៅ${pName})`);
      }
    }

    return {
      titleKhmer: "ការដោះស្រាយ",
      subTitleKhmer: a < 100 && b < 100 ? "ដកចំនួនពីរខ្ទង់នឹងពីរខ្ទង់តាមខ្ទង់ ៖" : "ដកចំនួនតាមខ្ទង់ ៖",
      expressionKhmer: `${aKhmer} − ${bKhmer} = ____`,
      bullets,
      conclusionKhmer: `ដូច្នេះ ${aKhmer} − ${bKhmer} = ${rKhmer} ។`,
      operation: "subtraction",
      finalAnswerKhmer: rKhmer,
    };
  }

  // 3. Addition (+)
  if (opSymbol === "+") {
    const aDigits = String(a).split("").map(Number).reverse();
    const bDigits = String(b).split("").map(Number).reverse();
    const bullets: string[] = [];
    const placeNames = ["ខ្ទង់រាយ", "ខ្ទង់ដប់", "ខ្ទង់រយ", "ខ្ទង់ពាន់"];

    for (let i = 0; i < Math.max(aDigits.length, bDigits.length); i++) {
      const da = aDigits[i] ?? 0;
      const db = bDigits[i] ?? 0;
      const sum = da + db;
      const pName = placeNames[i] || `ខ្ទង់ទី ${toKhmerNumeral(i + 1)}`;
      bullets.push(`- ${pName} ៖ យក ${toKhmerNumeral(da)} + ${toKhmerNumeral(db)} = ${toKhmerNumeral(sum)} (បូកលេខ${pName} សរសេរលេខ ${toKhmerNumeral(sum % 10)} នៅ${pName}${sum >= 10 ? ` ត្រាទុក ${toKhmerNumeral(Math.floor(sum / 10))}` : ""})`);
    }

    return {
      titleKhmer: "ការដោះស្រាយ",
      subTitleKhmer: "បូកចំនួនតាមខ្ទង់ ៖",
      expressionKhmer: `${aKhmer} + ${bKhmer} = ____`,
      bullets,
      conclusionKhmer: `ដូច្នេះ ${aKhmer} + ${bKhmer} = ${rKhmer} ។`,
      operation: "addition",
      finalAnswerKhmer: rKhmer,
    };
  }

  return null;
}

/**
 * Renders Progressive Step-by-Step Vertical Tables into self-contained HTML with Inline CSS
 */
export function renderProgressiveColumnStepsHtml(
  steps: ProgressiveColumnStep[],
  options?: {
    operationTitle?: string;
    finalEquation?: string;
    conclusionText?: string;
  }
): string {
  if (!steps || steps.length === 0) return "";
  const parts: string[] = [];

  parts.push('<div class="progressive-column-steps-wrapper" style="margin-top: 14px; margin-bottom: 20px;">\n');
  if (options?.operationTitle) {
    parts.push(`  <div style="color: #ef4444; font-weight: 700; font-size: 16px; margin-bottom: 4px;">ការដោះស្រាយ</div>\n`);
    parts.push(`  <div style="color: #1e3a8a; font-weight: 700; font-size: 14px; margin-bottom: 16px;">${options.operationTitle}</div>\n`);
  }

  steps.forEach((step) => {
    const numCols = step.columns.length;
    parts.push(`  <div class="step-calculation-item" style="margin-bottom: 22px; padding: 14px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">\n`);
    parts.push(`    <div style="font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 4px;">${step.stepTitleKhmer}</div>\n`);
    parts.push(`    <div style="font-size: 14px; color: #1e293b; font-weight: 600; line-height: 1.6; margin-bottom: 12px;">${step.explanationKhmer}</div>\n`);

    // Table
    parts.push('    <table class="column-calculation column-step-table" role="math" aria-label="ការគណនាជួរឈរ" style="border-collapse: collapse; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-variant-numeric: tabular-nums;">\n');
    parts.push('      <tbody>\n');

    // Carry row
    if (step.carryDigits && step.carryDigits.some((d) => d !== "")) {
      parts.push('        <tr class="carry-row" style="height: 24px;">\n');
      parts.push('          <td style="width: 38px;"></td>\n');
      step.carryDigits.forEach((cDigit) => {
        parts.push(`          <td class="digit-cell carry-cell" style="width: 38px; text-align: center; color: #15803d; font-weight: 700; font-size: 12px;">${cDigit || ""}</td>\n`);
      });
      parts.push('        </tr>\n');
    }

    // Operand rows
    step.operandRows.forEach((row) => {
      parts.push('        <tr class="operand-row" style="height: 38px;">\n');
      parts.push(`          <td class="operator-cell" style="width: 38px; text-align: center; color: #2563eb; font-weight: 700; font-size: 18px;">${row.operator || ""}</td>\n`);
      row.digits.forEach((digit, cIdx) => {
        const isActive = cIdx === step.activeColIdx;
        const color = isActive ? "#15803d" : "#2563eb";
        const weight = isActive ? "800" : "700";
        parts.push(`          <td class="digit-cell" style="width: 38px; text-align: center; color: ${color}; font-weight: ${weight}; font-size: 19px;">${digit}</td>\n`);
      });
      parts.push('        </tr>\n');
    });

    // Divider
    parts.push('        <tr class="divider-row">\n');
    parts.push(`          <td colspan="${numCols + 1}" style="border-bottom: 2px solid #94a3b8; height: 4px; padding: 0;"></td>\n`);
    parts.push('        </tr>\n');

    // Answer boxes
    parts.push('        <tr class="answer-box-row" style="height: 48px;">\n');
    parts.push('          <td style="width: 38px;"></td>\n');
    step.answerBoxes.forEach((box) => {
      if (box.status === "active") {
        parts.push(`          <td class="digit-cell answer-box" style="width: 38px; height: 38px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; color: #15803d; font-weight: 800; font-size: 20px; background: #f0fdf4;">${box.digit}</td>\n`);
      } else if (box.status === "completed") {
        parts.push(`          <td class="digit-cell answer-box" style="width: 38px; height: 38px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; color: #2563eb; font-weight: 700; font-size: 20px; background: #ffffff;">${box.digit}</td>\n`);
      } else {
        parts.push('          <td class="digit-cell answer-box" style="width: 38px; height: 38px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; background: #ffffff;"></td>\n');
      }
    });
    parts.push('        </tr>\n');

    parts.push('      </tbody>\n');
    parts.push('    </table>\n');
    parts.push('  </div>\n');
  });

  // Final conclusion line
  if (options?.conclusionText || options?.finalEquation) {
    parts.push('  <div class="progressive-conclusion-box" style="margin-top: 14px; padding: 14px 18px; background: #f8fafc; border-radius: 10px; border-left: 4px solid #2563eb;">\n');
    if (options.conclusionText) {
      parts.push(`    <div style="font-weight: 700; color: #1e293b; font-size: 14px;">${options.conclusionText}</div>\n`);
    }
    if (options.finalEquation) {
      parts.push(`    <div style="font-weight: 800; color: #0f172a; font-size: 16px; margin-top: 4px;">${options.finalEquation}</div>\n`);
    }
    parts.push('  </div>\n');
  }

  parts.push('</div>\n');
  return parts.join("");
}

/**
 * Renders Horizontal Breakdown Card into self-contained HTML with Inline CSS
 */
export function renderHorizontalBreakdownHtml(breakdown: HorizontalBreakdown): string {
  const parts: string[] = [];
  parts.push('<div class="horizontal-breakdown-card" style="background: #fff8f6; border-left: 4px solid #f97316; border-radius: 10px; padding: 18px 20px; margin-top: 12px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">\n');
  parts.push(`  <div style="color: #ef4444; font-weight: 700; font-size: 16px; margin-bottom: 4px;">${breakdown.titleKhmer}</div>\n`);
  parts.push(`  <div style="color: #0f172a; font-weight: 700; font-size: 14px; margin-bottom: 10px;">${breakdown.subTitleKhmer}</div>\n`);
  parts.push(`  <div style="font-weight: 700; font-size: 16px; color: #1e293b; margin-bottom: 12px; font-family: monospace, sans-serif;">${breakdown.expressionKhmer}</div>\n`);
  parts.push('  <div style="margin: 0 0 14px 0;">\n');
  breakdown.bullets.forEach((bullet) => {
    parts.push(`    <div style="font-size: 14px; color: #334155; margin-bottom: 6px; line-height: 1.6;">${bullet}</div>\n`);
  });
  parts.push('  </div>\n');
  parts.push(`  <div style="font-weight: 800; font-size: 16px; color: #991b1b; border-top: 1px dashed #fdba74; padding-top: 10px; margin-top: 10px;">${breakdown.conclusionKhmer}</div>\n`);
  parts.push('</div>\n');
  return parts.join("");
}


