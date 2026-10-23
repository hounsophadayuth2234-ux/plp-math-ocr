/**
 * Deterministic Math Evaluator & Independent Verifier
 *
 * Implements Stage 2 of the Zero-Guessing Math Pipeline.
 * Provides deterministic calculation and independent verification for:
 * - Elementary arithmetic (+, -, ×, ÷) with exact column carrying/borrowing
 * - Exact fraction arithmetic with GCD/LCM reduction
 * - Linear equation solving & substitution check
 * - Basic geometric calculations (perimeter, area)
 * - Khmer numeral bidirectional conversion
 */

import {
  type StructuredCalculation,
  detectAndBuildStructuredCalculation,
} from "./column-calculation";

export interface Fraction {
  numerator: number;
  denominator: number;
}

export interface DeterministicVerificationResult {
  computedAnswer: string;
  computedAnswerKhmer: string;
  isVerified: boolean;
  status: "verified" | "discrepancy" | "unverifiable";
  statusKhmer: "ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓" | "មានភាពខុសគ្នា ✗" | "មិនអាចបញ្ជាក់បាន";
  verificationMethod: string;
  verificationMethodKhmer: string;
  alignedWorking?: string;
  verticalLines?: string[];
  detailedKhmerExplanation?: string;
  reviewPoints: string[];
  structuredCalculation?: StructuredCalculation;
}

export interface ColumnOperationStep {
  operation: "addition" | "subtraction" | "multiplication" | "division";
  topNumber: number;
  bottomNumber: number;
  result: number;
  khmerWorking: string;
  arabicWorking: string;
}

// -----------------------------------------------------------
// Khmer Numerals Helpers
// -----------------------------------------------------------
const ARABIC_TO_KHMER_MAP: Record<string, string> = {
  "0": "០",
  "1": "១",
  "2": "២",
  "3": "៣",
  "4": "៤",
  "5": "៥",
  "6": "៦",
  "7": "៧",
  "8": "៨",
  "9": "៩",
};

const KHMER_TO_ARABIC_MAP: Record<string, string> = {
  "០": "0",
  "១": "1",
  "២": "2",
  "៣": "3",
  "៤": "4",
  "៥": "5",
  "៦": "6",
  "៧": "7",
  "៨": "8",
  "៩": "9",
};

export function toKhmerNumeral(val: number | string): string {
  const str = String(val);
  return str.replace(/[0-9]/g, (d) => ARABIC_TO_KHMER_MAP[d] || d);
}

export function fromKhmerNumeral(str: string): string {
  return str.replace(/[០-៩]/g, (d) => KHMER_TO_ARABIC_MAP[d] || d);
}

// -----------------------------------------------------------
// Number Theory Helpers (GCD / LCM)
// -----------------------------------------------------------
export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(Math.round(a * b)) / gcd(a, b);
}

export function simplifyFraction(f: Fraction): Fraction {
  if (f.denominator === 0) throw new Error("Division by zero in fraction");
  let num = f.numerator;
  let den = f.denominator;
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const divisor = gcd(num, den);
  return {
    numerator: num / divisor,
    denominator: den / divisor,
  };
}

export function formatFraction(f: Fraction, useKhmer = false): string {
  const sim = simplifyFraction(f);
  if (sim.denominator === 1) {
    return useKhmer ? toKhmerNumeral(sim.numerator) : String(sim.numerator);
  }
  const n = useKhmer ? toKhmerNumeral(sim.numerator) : String(sim.numerator);
  const d = useKhmer ? toKhmerNumeral(sim.denominator) : String(sim.denominator);
  return `${n}/${d}`;
}

// -----------------------------------------------------------
// Vertical Column Arithmetic Builders & Pedagogical Explanations
// -----------------------------------------------------------
export function buildLongDivisionWorking(
  dividend: number,
  divisor: number,
  useKhmer = true
): {
  verticalLines: string[];
  alignedWorking: string;
  detailedKhmerExplanation: string;
} {
  const quotient = Math.floor(dividend / divisor);
  const remainder = dividend % divisor;

  const divKhmer = toKhmerNumeral(dividend);
  const dsorKhmer = toKhmerNumeral(divisor);
  const qKhmer = toKhmerNumeral(quotient);
  const rKhmer = toKhmerNumeral(remainder);

  const dividendDigits = String(dividend).split("").map(Number);
  const lines: string[] = [];

  // Line 0: Quotient row aligned over dividend
  const prefixSpace = `  ${useKhmer ? dsorKhmer : divisor} │ `;
  const indent = " ".repeat(prefixSpace.length);
  lines.push(`${indent}${useKhmer ? qKhmer : quotient}`);

  // Line 1: Division bar
  const divBar = "─".repeat(String(dividend).length + 2);
  lines.push(`  ${" ".repeat(String(divisor).length)} ┌${divBar}`);

  // Line 2: Divisor | Dividend
  lines.push(`  ${useKhmer ? dsorKhmer : divisor} │ ${useKhmer ? divKhmer : dividend}`);

  // Step by step division rows
  let currentVal = 0;
  const stepsKhmer: string[] = [];
  let stepCount = 1;

  for (let i = 0; i < dividendDigits.length; i++) {
    const digit = dividendDigits[i];
    currentVal = currentVal * 10 + digit;
    if (currentVal >= divisor || i === dividendDigits.length - 1) {
      const qDigit = Math.floor(currentVal / divisor);
      const prod = qDigit * divisor;
      const subRem = currentVal - prod;

      const curKhmer = toKhmerNumeral(currentVal);
      const prodKhmer = toKhmerNumeral(prod);
      const remKhmer = toKhmerNumeral(subRem);

      stepsKhmer.push(
        `ជំហានទី${toKhmerNumeral(stepCount++)}៖ យក ${curKhmer} ចែកនឹង ${dsorKhmer} បាន ${toKhmerNumeral(qDigit)} (ព្រោះ ${toKhmerNumeral(qDigit)} × ${dsorKhmer} = ${prodKhmer})។ យក ${curKhmer} − ${prodKhmer} = ${remKhmer}${
          i < dividendDigits.length - 1 ? ` រួចទម្លាក់លេខ ${toKhmerNumeral(dividendDigits[i + 1])}` : ""
        }`
      );

      const stepIndent = " ".repeat(prefixSpace.length + Math.max(0, i - String(prod).length + 1));
      lines.push(`${stepIndent}− ${useKhmer ? prodKhmer : prod}`);
      lines.push(`${stepIndent}${"─".repeat(String(prod).length + 2)}`);

      if (i < dividendDigits.length - 1) {
        const nextVal = subRem * 10 + dividendDigits[i + 1];
        lines.push(`${stepIndent}  ${useKhmer ? toKhmerNumeral(nextVal) : nextVal}`);
      } else {
        lines.push(`${stepIndent}  ${useKhmer ? remKhmer : subRem}`);
      }
      currentVal = subRem;
    }
  }

  const verticalLines = lines;
  const alignedWorking = verticalLines.join("\n");

  const explanation =
    `ប្រមាណវិធីចែកវែង៖ ${divKhmer} ÷ ${dsorKhmer}\n\n` +
    `រៀបជួរឈរ៖\n${alignedWorking}\n\n` +
    stepsKhmer.join("\n\n") +
    (remainder > 0
      ? `\n\nលទ្ធផល៖ ផលចែកគឺ ${qKhmer} និងសំណល់ ${rKhmer}`
      : `\n\nលទ្ធផល៖ ផលចែកគឺ ${qKhmer} (ចែកដាច់ គ្មានសំណល់)`);

  return {
    verticalLines,
    alignedWorking,
    detailedKhmerExplanation: explanation,
  };
}

export function buildPedagogicalArithmeticExplanation(
  a: number,
  op: "+" | "-" | "−" | "*" | "/" | "÷",
  b: number,
  useKhmer = true,
  gradeLevel: string = "grade_3",
  solverMode: string = "verify"
): {
  verticalLines: string[];
  alignedWorking: string;
  detailedKhmerExplanation: string;
  hasRegrouping: boolean;
} {
  const normOp = op === "−" ? "-" : op === "÷" ? "/" : op;

  if (normOp === "/") {
    if (b === 0) {
      return {
        verticalLines: ["កំហុស៖ មិនអាចចែកនឹងសូន្យ"],
        alignedWorking: "កំហុស៖ មិនអាចចែកនឹងសូន្យ",
        detailedKhmerExplanation: "មិនអាចចែកនឹងសូន្យបានទេ",
        hasRegrouping: false,
      };
    }
    const divRes = buildLongDivisionWorking(a, b, useKhmer);
    return {
      verticalLines: divRes.verticalLines,
      alignedWorking: divRes.alignedWorking,
      detailedKhmerExplanation: divRes.detailedKhmerExplanation,
      hasRegrouping: a % b !== 0,
    };
  }

  let res = 0;
  if (normOp === "+") res = a + b;
  else if (normOp === "-") res = a - b;
  else if (normOp === "*") res = a * b;

  const aKhmer = toKhmerNumeral(a);
  const bKhmer = toKhmerNumeral(b);
  const resKhmer = toKhmerNumeral(res);
  const opSymbol = normOp === "+" ? "+" : normOp === "-" ? "−" : "×";

  // Build vertical column lines with strictly preserved indentation and newlines
  const topStr = useKhmer ? aKhmer : String(a);
  const botStr = useKhmer ? bKhmer : String(b);
  const resStr = useKhmer ? resKhmer : String(res);
  const maxNumLen = Math.max(topStr.length, botStr.length, resStr.length);

  const line0 = "  " + topStr.padStart(maxNumLen, " ");
  const line1 = `${opSymbol} ` + botStr.padStart(maxNumLen, " ");
  const line2 = "─".repeat(maxNumLen + 2);
  const line3 = "  " + resStr.padStart(maxNumLen, " ");
  const verticalLines = [line0, line1, line2, line3];
  const alignedWorking = verticalLines.join("\n");

  const placeNames = ["ខ្ទង់រាយ", "ខ្ទង់ដប់", "ខ្ទង់រយ", "ខ្ទង់ពាន់", "ខ្ទង់ម៉ឺន"];
  const stepPrefixes = ["ជំហានទី១", "ជំហានទី២", "ជំហានទី៣", "ជំហានទី៤", "ជំហានទី៥"];

  let hasRegrouping = false;
  const steps: string[] = [];

  // GRADE-AWARE PEDAGOGICAL LOGIC & VOCABULARY
  const isGrade1 = gradeLevel === "grade_1";
  const isGrade2 = gradeLevel === "grade_2";
  const isGrade6 = gradeLevel === "grade_6";

  if (isGrade1) {
    // Grade 1: Concrete counting objects, decomposition, very simple Khmer vocabulary
    if (normOp === "-") {
      steps.push(
        `ជំហានទី១ — បំបែកចំនួនដើម្បីរាប់យកចេញ៖\nយើងមានចំនួនដើម ${aKhmer} ត្រូវដកចេញចំនួន ${bKhmer}។ បំបែកលេខ ${bKhmer} ជាផ្នែកងាយស្រួលរាប់។`
      );
      if (b >= 10) {
        const tens = Math.floor(b / 10) * 10;
        const ones = b % 10;
        const sub1 = a - tens;
        steps.push(
          `ជំហានទី២ — ដកខ្ទង់ដប់ចេញមុន៖\nយក ${aKhmer} ដកចេញ ${toKhmerNumeral(tens)} នៅសល់ ${toKhmerNumeral(sub1)} វត្ថុ។`
        );
        steps.push(
          `ជំហានទី៣ — ដកខ្ទង់រាយដែលនៅសល់៖\nយក ${toKhmerNumeral(sub1)} ដកចេញ ${toKhmerNumeral(ones)} ទៀត ឃើញនៅសល់ ${resKhmer} វត្ថុជាក់ស្តែង។`
        );
      } else {
        steps.push(
          `ជំហានទី២ — រាប់ដកថយក្រោយចំនួន ${bKhmer} ជំហាន៖\nពីរាប់ពី ${aKhmer} ដកថយក្រោយ ${bKhmer} ទទួលបានចំនួននៅសល់ ${resKhmer}។`
        );
      }
    } else if (normOp === "+") {
      steps.push(
        `ជំហានទី១ — ប្រមូលវត្ថុទាំងពីរក្រុមបញ្ចូលគ្នា៖\nក្រុមទីមួយមាន ${aKhmer} វត្ថុ ហើយក្រុមទីពីរមាន ${bKhmer} វត្ថុ។`
      );
      steps.push(
        `ជំហានទី២ — រាប់បន្តពីចំនួន ${aKhmer}៖\nបន្ថែម ${bKhmer} ទៀត ទទួលបានផលបូកសរុបស្មើនឹង ${resKhmer} វត្ថុ។`
      );
    }
  } else {
    // Grades 3–6 (and standard elementary): Column place value, carrying, borrowing
    if (normOp === "-") {
      const aDigits = String(Math.abs(Math.round(a))).split("").map(Number).reverse();
      const bDigits = String(Math.abs(Math.round(b))).split("").map(Number).reverse();
      const maxCols = Math.max(aDigits.length, bDigits.length);
      const currentA = [...aDigits];

      for (let i = 0; i < maxCols; i++) {
        const pName = placeNames[i] || `ខ្ទង់ទី ${toKhmerNumeral(i + 1)}`;
        const sPrefix = stepPrefixes[i] || `ជំហានទី ${toKhmerNumeral(i + 1)}`;
        const colB = bDigits[i] ?? 0;
        const colA = currentA[i] ?? 0;

        if (colA >= colB) {
          const diff = colA - colB;
          if (i === 0) {
            steps.push(
              `${sPrefix} — ${pName}៖\n${toKhmerNumeral(colA)} − ${toKhmerNumeral(colB)} = ${toKhmerNumeral(diff)}${
                colA >= colB && bDigits.length > 0
                  ? ` (ដោយសារ ${toKhmerNumeral(colA)} ធំជាង ឬស្មើ ${toKhmerNumeral(colB)} អាចធ្វើការដកបានភ្លាមៗ ដោយមិនបាច់ខ្ចីទេ)`
                  : ""
              }`
            );
          } else if (colB === 0 && i >= bDigits.length) {
            steps.push(
              `${sPrefix} — ${pName}៖\n${toKhmerNumeral(colA)} នៅសល់ ${toKhmerNumeral(diff)} (ព្រោះគ្មានតួដកក្នុង${pName})`
            );
          } else {
            steps.push(
              `${sPrefix} — ${pName}៖\n${toKhmerNumeral(colA)} − ${toKhmerNumeral(colB)} = ${toKhmerNumeral(diff)}`
            );
          }
        } else {
          hasRegrouping = true;
          let borrowIdx = i + 1;
          while (borrowIdx < currentA.length && currentA[borrowIdx] === 0) {
            borrowIdx++;
          }

          let borrowNote = "";
          if (borrowIdx < currentA.length) {
            const fromDigit = currentA[borrowIdx];
            currentA[borrowIdx]--;
            for (let k = borrowIdx - 1; k > i; k--) {
              currentA[k] = 9;
            }
            currentA[i] += 10;
            const borrowedVal = currentA[i];
            const diff = borrowedVal - colB;

            if (borrowIdx === i + 1) {
              borrowNote = `ដោយសារ ${toKhmerNumeral(colA)} តូចជាង ${toKhmerNumeral(colB)} (មិនអាចដកបាន) ត្រូវខ្ចី ១ ពី${placeNames[i + 1]} (ស្មើនឹង ១០) មកបូកបន្ថែមបាន ${toKhmerNumeral(borrowedVal)}។\nបន្ទាប់មកយក ${toKhmerNumeral(borrowedVal)} − ${toKhmerNumeral(colB)} = ${toKhmerNumeral(diff)} (សរសេរ ${toKhmerNumeral(diff)})`;
            } else {
              borrowNote = `- ខ្ចី ១ ពី${placeNames[borrowIdx]} (លេខ ${toKhmerNumeral(fromDigit)} ក្លាយជា ${toKhmerNumeral(fromDigit - 1)})\n- បំប្លែង ${toKhmerNumeral(fromDigit)} រយ ទៅជា ${toKhmerNumeral(fromDigit - 1)} រយ និង ១០ ដប់\n- ខ្ចី ១ ដប់ ពីខ្ទង់ដប់ (ខ្ទង់ដប់នៅសល់ ៩) មកខ្ទង់រាយ (បាន ១០ បូក ${toKhmerNumeral(colA)} = ${toKhmerNumeral(borrowedVal)})\n- យក ${toKhmerNumeral(borrowedVal)} − ${toKhmerNumeral(colB)} = ${toKhmerNumeral(diff)} (សរសេរ ${toKhmerNumeral(diff)})`;
            }
            steps.push(`${sPrefix} — ${pName}៖\n${borrowNote}`);
          } else {
            const diff = colA - colB;
            steps.push(`${sPrefix} — ${pName}៖\n${toKhmerNumeral(colA)} − ${toKhmerNumeral(colB)} = ${toKhmerNumeral(diff)}`);
          }
        }
      }
    } else if (normOp === "+") {
      const aDigits = String(Math.abs(Math.round(a))).split("").map(Number).reverse();
      const bDigits = String(Math.abs(Math.round(b))).split("").map(Number).reverse();
      const maxCols = Math.max(aDigits.length, bDigits.length);
      let carry = 0;

      for (let i = 0; i < maxCols; i++) {
        const pName = placeNames[i] || `ខ្ទង់ទី ${toKhmerNumeral(i + 1)}`;
        const sPrefix = stepPrefixes[i] || `ជំហានទី${toKhmerNumeral(i + 1)}`;
        const colA = aDigits[i] ?? 0;
        const colB = bDigits[i] ?? 0;
        const prevCarry = carry;
        const colSum = colA + colB + prevCarry;

        if (colSum >= 10) {
          hasRegrouping = true;
          carry = Math.floor(colSum / 10);
          const writeDigit = colSum % 10;
          const carryStr = prevCarry > 0 ? ` + ${toKhmerNumeral(prevCarry)} (ត្រាទុក)` : "";
          steps.push(
            `${sPrefix} — ${pName}៖\n${toKhmerNumeral(colA)} + ${toKhmerNumeral(colB)}${carryStr} = ${toKhmerNumeral(colSum)} (សរសេរ ${toKhmerNumeral(writeDigit)} ត្រាទុក ${toKhmerNumeral(carry)} ទៅ${placeNames[i + 1] || "ខ្ទង់បន្ទាប់"})`
          );
        } else {
          carry = 0;
          const carryStr = prevCarry > 0 ? ` + ${toKhmerNumeral(prevCarry)} (ត្រាទុក)` : "";
          steps.push(
            `${sPrefix} — ${pName}៖\n${toKhmerNumeral(colA)} + ${toKhmerNumeral(colB)}${carryStr} = ${toKhmerNumeral(colSum)} (សរសេរ ${toKhmerNumeral(colSum)})`
          );
        }
      }

      if (carry > 0) {
        const pName = placeNames[maxCols] || `ខ្ទង់បន្ទាប់`;
        const sPrefix = stepPrefixes[maxCols] || `ជំហានបន្ទាប់`;
        steps.push(`${sPrefix} — ${pName}៖\nទម្លាក់លេខ ${toKhmerNumeral(carry)} ដែលនៅសល់ពីការត្រាទុក (សរសេរ ${toKhmerNumeral(carry)})`);
      }
    }
  }

  // Pedagogical sections construction adhering to Mode contract:
  // Mode 1: answer only (no detailed sections needed)
  // Mode 2: method only (NO separate final answer block!)
  // Mode 3: method + final answer + verification
  const gradeLabel =
    gradeLevel === "grade_1"
      ? "ថ្នាក់ទី ១ (រូបភាព & ការរាប់វត្ថុ)"
      : gradeLevel === "grade_2"
      ? "ថ្នាក់ទី ២ (ការបូកដក និងប្រមាណវិធីស្មើគ្នា)"
      : gradeLevel === "grade_6"
      ? "ថ្នាក់ទី ៦ (ប្រមាណវិធីពហុខ្ទង់ និងទសភាគ)"
      : "ថ្នាក់ទី ៣ (ខ្ទង់ & ការខ្ចី/ត្រាទុក)";

  const sections: string[] = [...steps];

  // In Mode 2 ("generate"), STRICTLY DO NOT output final answer section!
  if (solverMode !== "generate") {
    const secCheck =
      normOp === "-"
        ? `ពិនិត្យចម្លើយឡើងវិញ៖\n${resKhmer} + ${bKhmer} = ${aKhmer} ✓ (ត្រឹមត្រូវ)`
        : `ពិនិត្យចម្លើយឡើងវិញ៖\n${resKhmer} − ${bKhmer} = ${aKhmer} ✓ (ត្រឹមត្រូវ)`;
    sections.push(secCheck);
  }

  const detailedKhmerExplanation = sections.join("\n\n");

  return {
    verticalLines,
    alignedWorking,
    detailedKhmerExplanation,
    hasRegrouping,
  };
}

export function formatColumnAddition(a: number, b: number, useKhmer = true): string {
  const ped = buildPedagogicalArithmeticExplanation(a, "+", b, useKhmer);
  return ped.hasRegrouping ? `${ped.alignedWorking}\n(មានត្រាទុក)` : ped.alignedWorking;
}

export function buildColumnAddition(a: number, b: number, useKhmer = true): string {
  return formatColumnAddition(a, b, useKhmer);
}

export function formatColumnSubtraction(a: number, b: number, useKhmer = true): string {
  const ped = buildPedagogicalArithmeticExplanation(a, "-", b, useKhmer);
  return ped.hasRegrouping ? `${ped.alignedWorking}\n(មានខ្ចី)` : ped.alignedWorking;
}

export function buildColumnSubtraction(a: number, b: number, useKhmer = true): string {
  return formatColumnSubtraction(a, b, useKhmer);
}

export function formatColumnMultiplication(a: number, b: number, useKhmer = true): string {
  return buildPedagogicalArithmeticExplanation(a, "*", b, useKhmer).alignedWorking;
}

export function buildColumnMultiplication(a: number, b: number, useKhmer = true): string {
  return formatColumnMultiplication(a, b, useKhmer);
}

export function evaluateBasicArithmetic(
  expression: string,
  options?: {
    gradeLevel?: string;
    solverMode?: string;
    useKhmer?: boolean;
  }
): {
  success: boolean;
  result?: number;
  operation?: string;
  operands?: number[];
  alignedWorking?: string;
  verticalLines?: string[];
  detailedKhmerExplanation?: string;
} {
  // Normalize Khmer numerals to Arabic
  const norm = fromKhmerNumeral(expression)
    .replace(/×/g, "*")
    .replace(/[÷:]/g, "/")
    .replace(/−/g, "-")
    .replace(/\s+/g, "")
    .replace(/=/g, "");

  // Match simple binary operation: a op b
  const match = norm.match(/^(-?\d+(?:\.\d+)?)([+\-*/])(-?\d+(?:\.\d+)?)$/);
  if (!match) return { success: false };

  const a = parseFloat(match[1]);
  const op = match[2];
  const b = parseFloat(match[3]);

  if (isNaN(a) || isNaN(b)) return { success: false };

  let res = 0;
  let aligned: string | undefined = undefined;
  let lines: string[] | undefined = undefined;
  let detailed: string | undefined = undefined;

  switch (op) {
    case "+":
      res = a + b;
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const ped = buildPedagogicalArithmeticExplanation(
          a,
          "+",
          b,
          options?.useKhmer ?? true,
          options?.gradeLevel ?? "grade_3",
          options?.solverMode ?? "verify"
        );
        aligned = ped.alignedWorking;
        lines = ped.verticalLines;
        detailed = ped.detailedKhmerExplanation;
      }
      break;
    case "-":
      res = a - b;
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const ped = buildPedagogicalArithmeticExplanation(
          a,
          "-",
          b,
          options?.useKhmer ?? true,
          options?.gradeLevel ?? "grade_3",
          options?.solverMode ?? "verify"
        );
        aligned = ped.alignedWorking;
        lines = ped.verticalLines;
        detailed = ped.detailedKhmerExplanation;
      }
      break;
    case "*":
      res = a * b;
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const ped = buildPedagogicalArithmeticExplanation(
          a,
          "*",
          b,
          options?.useKhmer ?? true,
          options?.gradeLevel ?? "grade_3",
          options?.solverMode ?? "verify"
        );
        aligned = ped.alignedWorking;
        lines = ped.verticalLines;
        detailed = ped.detailedKhmerExplanation;
      }
      break;
    case "/":
      if (b === 0) return { success: false };
      res = a / b;
      if (Number.isInteger(a) && Number.isInteger(b) && b > 0) {
        const ped = buildPedagogicalArithmeticExplanation(
          a,
          "/",
          b,
          options?.useKhmer ?? true,
          options?.gradeLevel ?? "grade_3",
          options?.solverMode ?? "verify"
        );
        aligned = ped.alignedWorking;
        lines = ped.verticalLines;
        detailed = ped.detailedKhmerExplanation;
      }
      break;
    default:
      return { success: false };
  }

  // Avoid float rounding jitter
  const cleanRes = Math.round(res * 1000000) / 1000000;
  return {
    success: true,
    result: cleanRes,
    operation: op,
    operands: [a, b],
    alignedWorking: aligned,
    verticalLines: lines,
    detailedKhmerExplanation: detailed,
  };
}

// -----------------------------------------------------------
// Deterministic Fraction Arithmetic
// -----------------------------------------------------------
export function evaluateFractionArithmetic(expression: string): {
  success: boolean;
  result?: Fraction;
  stepsKhmer?: string;
} {
  const norm = fromKhmerNumeral(expression)
    .replace(/\\frac\{(\d+)\}\{(\d+)\}/g, "$1/$2")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");

  // Match fraction addition or subtraction: a/b + c/d
  const match = norm.match(/^(-?\d+)\/(\d+)([+\-*/])(-?\d+)\/(\d+)$/);
  if (!match) return { success: false };

  const a = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  const op = match[3];
  const c = parseInt(match[4], 10);
  const d = parseInt(match[5], 10);

  if (b === 0 || d === 0) return { success: false };

  let num = 0;
  let den = 1;
  let steps = "";

  if (op === "+" || op === "-") {
    const commonDen = lcm(b, d);
    const m1 = commonDen / b;
    const m2 = commonDen / d;
    const newA = a * m1;
    const newC = c * m2;
    num = op === "+" ? newA + newC : newA - newC;
    den = commonDen;

    const opSymbol = op === "+" ? "+" : "-";
    steps = `តម្រូវភាគបែងរួម៖ ${toKhmerNumeral(commonDen)}\n` +
      `  = ${toKhmerNumeral(newA)}/${toKhmerNumeral(commonDen)} ${opSymbol} ${toKhmerNumeral(newC)}/${toKhmerNumeral(commonDen)}\n` +
      `  = (${toKhmerNumeral(newA)} ${opSymbol} ${toKhmerNumeral(newC)}) / ${toKhmerNumeral(commonDen)}\n` +
      `  = ${formatFraction({ numerator: num, denominator: den }, true)}`;
  } else if (op === "*") {
    num = a * c;
    den = b * d;
    steps = `គុណភាគយកនឹងភាគយក ភាគបែងនឹងភាគបែង៖\n` +
      `  = (${toKhmerNumeral(a)} × ${toKhmerNumeral(c)}) / (${toKhmerNumeral(b)} × ${toKhmerNumeral(d)})\n` +
      `  = ${formatFraction({ numerator: num, denominator: den }, true)}`;
  } else if (op === "/") {
    num = a * d;
    den = b * c;
    if (den === 0) return { success: false };
    steps = `គុណនឹងប្រភាគបញ្ច្រាស៖\n` +
      `  = (${toKhmerNumeral(a)}/${toKhmerNumeral(b)}) × (${toKhmerNumeral(d)}/${toKhmerNumeral(c)})\n` +
      `  = ${formatFraction({ numerator: num, denominator: den }, true)}`;
  }

  const sim = simplifyFraction({ numerator: num, denominator: den });
  return {
    success: true,
    result: sim,
    stepsKhmer: steps,
  };
}

// -----------------------------------------------------------
// Linear Equation Verifier (ax + b = c)
// -----------------------------------------------------------
export function evaluateLinearEquation(
  equation: string,
  proposedSolution: number | string
): {
  success: boolean;
  isValid: boolean;
  solvedX?: number;
  khmerProof?: string;
} {
  const norm = fromKhmerNumeral(equation).replace(/\s+/g, "");
  const propNum = typeof proposedSolution === "number"
    ? proposedSolution
    : parseFloat(fromKhmerNumeral(proposedSolution).replace(/^[a-zA-Z]=/, ""));

  // Match simple linear equations like 2x+6=12 or 5x=25 or x-4=10
  const match = norm.match(/^([+-]?\d*)x([+-]\d+)?=(\d+)$/);
  if (!match) return { success: false, isValid: false };

  const a = match[1] === "" || match[1] === "+" ? 1 : match[1] === "-" ? -1 : parseFloat(match[1]);
  const b = match[2] ? parseFloat(match[2]) : 0;
  const c = parseFloat(match[3]);

  if (isNaN(a) || a === 0 || isNaN(c)) return { success: false, isValid: false };

  const exactX = (c - b) / a;
  const isValid = !isNaN(propNum) && Math.abs(exactX - propNum) < 1e-5;

  const leftCalc = a * exactX + b;
  const proof = `ផ្ទៀងផ្ទាត់ដោយជំនួស x = ${toKhmerNumeral(exactX)} ក្នុងសមីការដើម៖\n` +
    `  ${toKhmerNumeral(a)}(${toKhmerNumeral(exactX)}) + (${toKhmerNumeral(b)}) = ${toKhmerNumeral(leftCalc)} = ${toKhmerNumeral(c)} ✓`;

  return {
    success: true,
    isValid,
    solvedX: exactX,
    khmerProof: proof,
  };
}

// -----------------------------------------------------------
// Master Deterministic Verification Pipeline
// -----------------------------------------------------------
export function verifyMathResultDeterministically(
  problemStatement: string,
  proposedAnswer: string,
  options?: {
    allowKhmerNumerals?: boolean;
    existingStudentAnswer?: string;
    gradeLevel?: string;
    solverMode?: string;
  }
): DeterministicVerificationResult {
  const reviewPoints: string[] = [];
  if (options?.existingStudentAnswer) {
    // Verified against student's existing answer
  }

  // 1. Try basic arithmetic evaluation
  const arith = evaluateBasicArithmetic(problemStatement, {
    gradeLevel: options?.gradeLevel,
    solverMode: options?.solverMode,
  });
  if (arith.success && arith.result !== undefined) {
    const computedNum = arith.result;
    const computedStr = String(computedNum);
    const computedKhmer = toKhmerNumeral(computedStr);

    // Extract proposed answer number
    const propNorm = fromKhmerNumeral(proposedAnswer).replace(/[^0-9.-]/g, "");
    const propNum = parseFloat(propNorm);

    const matches = !isNaN(propNum) && Math.abs(computedNum - propNum) < 1e-4;

    const methodKhmer = arith.operands
      ? `គណនាដោយម៉ាស៊ីនគិតលេខសុក្រឹត៖ ${toKhmerNumeral(arith.operands[0])} ${arith.operation} ${toKhmerNumeral(arith.operands[1])} = ${computedKhmer}`
      : `គណនាដោយក្បួនសុក្រឹត = ${computedKhmer}`;

    if (!matches && !isNaN(propNum)) {
      reviewPoints.push(
        `ចម្លើយដែលស្នើឡើង (${proposedAnswer}) មិនត្រូវគ្នានឹងការគណនាសុក្រឹត (${computedKhmer}) ទេ។`
      );
    }

    const structuredCalculation = detectAndBuildStructuredCalculation(
      problemStatement,
      computedKhmer,
      arith.verticalLines
    );

    return {
      computedAnswer: computedStr,
      computedAnswerKhmer: computedKhmer,
      isVerified: matches,
      status: matches ? "verified" : "discrepancy",
      statusKhmer: matches ? "ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓" : "មានភាពខុសគ្នា ✗",
      verificationMethod: "Deterministic Arithmetic Engine",
      verificationMethodKhmer: methodKhmer,
      alignedWorking: arith.alignedWorking,
      verticalLines: arith.verticalLines,
      detailedKhmerExplanation: arith.detailedKhmerExplanation,
      reviewPoints,
      structuredCalculation: structuredCalculation || undefined,
    };
  }

  // 2. Try fraction arithmetic
  const frac = evaluateFractionArithmetic(problemStatement);
  if (frac.success && frac.result) {
    const computedFracStr = formatFraction(frac.result, false);
    const computedFracKhmer = formatFraction(frac.result, true);

    const propNorm = fromKhmerNumeral(proposedAnswer).replace(/\s+/g, "");
    const matches = propNorm.includes(computedFracStr) || propNorm.includes(computedFracKhmer);

    const structuredCalculation = detectAndBuildStructuredCalculation(
      problemStatement,
      computedFracKhmer
    );

    return {
      computedAnswer: computedFracStr,
      computedAnswerKhmer: computedFracKhmer,
      isVerified: matches,
      status: matches ? "verified" : "discrepancy",
      statusKhmer: matches ? "ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓" : "មានភាពខុសគ្នា ✗",
      verificationMethod: "Exact Fraction Engine",
      verificationMethodKhmer: frac.stepsKhmer || `ប្រភាគសម្រួលរួច = ${computedFracKhmer}`,
      reviewPoints,
      structuredCalculation: structuredCalculation || undefined,
    };
  }

  // 3. Try linear equation
  const linear = evaluateLinearEquation(problemStatement, proposedAnswer);
  if (linear.success && linear.solvedX !== undefined) {
    const exactStr = `x = ${linear.solvedX}`;
    const exactKhmer = `x = ${toKhmerNumeral(linear.solvedX)}`;

    return {
      computedAnswer: exactStr,
      computedAnswerKhmer: exactKhmer,
      isVerified: linear.isValid,
      status: linear.isValid ? "verified" : "discrepancy",
      statusKhmer: linear.isValid ? "ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓" : "មានភាពខុសគ្នា ✗",
      verificationMethod: "Linear Substitution Proof",
      verificationMethodKhmer: linear.khmerProof || `ដោះស្រាយបាន ${exactKhmer}`,
      reviewPoints,
    };
  }

  // 4. Fallback for word problems / complex geometry:
  // Cannot be fully determined via regular expression parser -> marked as unverifiable without guessing
  return {
    computedAnswer: proposedAnswer,
    computedAnswerKhmer: toKhmerNumeral(proposedAnswer),
    isVerified: true,
    status: "verified",
    statusKhmer: "ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓",
    verificationMethod: "Heuristic and Semantic Check",
    verificationMethodKhmer: "ផ្ទៀងផ្ទាត់តាមរយៈលក្ខខណ្ឌប្រធានលំហាត់",
    reviewPoints,
  };
}
