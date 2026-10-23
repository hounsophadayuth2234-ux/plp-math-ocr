import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  type MathSolution,
  type VerticalCalculation,
  type StructuredCalculation,
  buildStructuredIntegerArithmetic,
  buildStructuredDecimalArithmetic,
  buildStructuredFractionArithmetic,
  buildStructuredMultiplicationWithPartialProducts,
  buildStructuredIntegerDivision,
  detectAndBuildStructuredCalculation,
  structuredToVerticalCalculation,
  verticalToStructuredCalculation,
  toMathSolution,
  renderColumnCalculationHtml,
  renderColumnCalculationText,
} from "@/lib/column-calculation";
import {
  validateVerticalCalculation,
  validateMathSolution,
  renderCanonicalSolutionHtml,
  renderCanonicalSolutionPlainText,
  renderStyledHtml,
  renderCleanText,
  escapeHtml,
} from "@/lib/math-solution-html";
import { POST } from "@/app/api/math-solver/route";
import { NextRequest } from "next/server";

describe("Phase 9: Khmer Math Solver Comprehensive 25-Point Test Suite", () => {
  // 1. Gemini prompt includes strict table/alignment requirements.
  it("Requirement 1: Gemini prompt includes strict table/alignment requirements", () => {
    const routeFilePath = path.resolve(process.cwd(), "src/app/api/math-solver/route.ts");
    const content = fs.readFileSync(routeFilePath, "utf-8");

    expect(content).toContain("PLACE-VALUE ALIGNMENT FOR VERTICAL ARITHMETIC");
    expect(content).toContain("border-collapse:collapse");
    expect(content).toContain("font-family:monospace");
    expect(content).toContain("verticalCalculations");
    expect(content).toContain("border-bottom:2px solid #000");
    expect(content).toContain("Every digit must be represented individually");
    expect(content).toContain("Never put multiple digits from one place-value column into one cell");
  });

  // 2. Parser accepts valid structured output.
  it("Requirement 2: Parser accepts valid structured output", () => {
    const validVert: VerticalCalculation = {
      operation: "addition",
      columns: ["hundreds", "tens", "ones"],
      rows: [
        { role: "operand", cells: ["៤", "៣", "១"] },
        { role: "operand", operator: "+", cells: [" ", "៦", "៥"] },
        { role: "separator", cells: ["", "", ""], borderBottom: true },
        { role: "result", cells: ["៤", "៩", "៦"] },
      ],
    };

    const res = validateVerticalCalculation(validVert);
    expect(res.valid).toBe(true);
    expect(res.calculation).toBeDefined();

    const struct = verticalToStructuredCalculation(validVert);
    expect(struct.columns.length).toBe(3);
    expect(struct.rows.length).toBe(4);
  });

  // 3. Parser rejects malformed column counts.
  it("Requirement 3: Parser rejects malformed column counts", () => {
    const invalidVert = {
      operation: "addition" as const,
      columns: ["hundreds", "tens", "ones"], // 3 columns
      rows: [
        { role: "operand" as const, cells: ["៤", "៣", "១"] }, // 3 cells
        { role: "operand" as const, operator: "+", cells: ["៦", "៥"] }, // 2 cells -> mismatch!
        { role: "result" as const, cells: ["៤", "៩", "៦"] },
      ],
    };

    const res = validateVerticalCalculation(invalidVert);
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.includes("column count mismatch"))).toBe(true);
  });

  // 4. Parser rejects multi-digit content inside one digit cell.
  it("Requirement 4: Parser rejects multi-digit content inside one digit cell", () => {
    const multiDigitVert = {
      operation: "addition" as const,
      columns: ["hundreds", "tens", "ones"],
      rows: [
        { role: "operand" as const, cells: ["៤", "៣១", "១"] }, // "៣១" has 2 digits in 1 cell!
        { role: "operand" as const, operator: "+", cells: [" ", "៦", "៥"] },
        { role: "result" as const, cells: ["៤", "៩", "៦"] },
      ],
    };

    const res = validateVerticalCalculation(multiDigitVert);
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.includes("contains multiple digits"))).toBe(true);
  });

  // 5. Parser rejects scripts and event handlers.
  it("Requirement 5: Parser rejects scripts and event handlers", () => {
    const maliciousSolution = {
      problemStatement: "<script>alert('xss')</script> ៤៣១ + ៦៥",
      operation: "addition" as const,
      steps: [
        {
          stepNumber: 1,
          titleKhmer: "Step 1",
          explanationKhmer: "Explanation <img src=x onerror=alert(1)>",
        },
      ],
      verticalCalculations: [],
    };

    const res = validateMathSolution(maliciousSolution);
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.includes("Unsafe HTML"))).toBe(true);

    // Also verify escapeHtml sanitizes properly
    const escaped = escapeHtml("<script>alert(1)</script><div onclick='run()'>");
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  // 6. ៤៣១ + ៦៥ aligns by hundreds, tens, and ones without leading zero padding.
  it("Requirement 6: ៤៣១ + ៦៥ aligns by hundreds, tens, and ones", () => {
    const calc = buildStructuredIntegerArithmetic(431, "+", 65, 496);
    expect(calc.columns).toEqual(["hundreds", "tens", "ones"]);

    // Operand 1: ៤ ៣ ១
    expect(calc.rows[0].digits).toEqual(["៤", "៣", "១"]);
    // Operand 2: [ ] ៦ ៥
    expect(calc.rows[1].operator).toBe("+");
    expect(calc.rows[1].digits).toEqual(["", "៦", "៥"]);
    // Result: ៤ ៩ ៦
    expect(calc.rows[3].role).toBe("result");
    expect(calc.rows[3].digits).toEqual(["៤", "៩", "៦"]);

    const text = renderColumnCalculationText(calc);
    expect(text).toContain("៤ ៣ ១");
    expect(text).toContain("៦ ៥");
    expect(text).toContain("៤ ៩ ៦");
  });

  // 7. ៧៩៥ − ៥៤ aligns correctly without leading zero padding.
  it("Requirement 7: ៧៩៥ − ៥៤ aligns correctly", () => {
    const calc = buildStructuredIntegerArithmetic(795, "−", 54, 741);
    expect(calc.columns).toEqual(["hundreds", "tens", "ones"]);
    expect(calc.rows[0].digits).toEqual(["៧", "៩", "៥"]);
    expect(calc.rows[1].digits).toEqual(["", "៥", "៤"]);
    expect(calc.rows[3].digits).toEqual(["៧", "៤", "១"]);
  });

  // 8. ៧០២ − ២៧៨ handles borrowing rows.
  it("Requirement 8: ៧០២ − ២៧៨ handles borrowing rows", () => {
    const calc = buildStructuredIntegerArithmetic(702, "−", 278, 424);
    const borrowRow = calc.rows.find((r) => r.role === "borrow");
    expect(borrowRow).toBeDefined();
    expect(borrowRow?.digits).toBeDefined();

    const text = renderColumnCalculationText(calc);
    expect(text).toContain("៧ ០ ២");
    expect(text).toContain("២ ៧ ៨");
    expect(text).toContain("៤ ២ ៤");
  });

  // 9. ២៤ × ៣ aligns partial products.
  it("Requirement 9: ២៤ × ៣ aligns partial products", () => {
    const calc = buildStructuredMultiplicationWithPartialProducts(24, 3);
    const partials = calc.rows.filter((r) => r.role === "partial-product");
    expect(partials.length).toBeGreaterThan(0);

    const resultRow = calc.rows.find((r) => r.role === "result");
    expect(resultRow?.digits.join("").trim()).toBe("៧២");

    const text = renderColumnCalculationText(calc);
    expect(text).toContain("២ ៤");
    expect(text).toContain("៣");
    expect(text).toContain("៧ ២");
  });

  // 10. ៨៤ ÷ ៤ renders division working rows.
  it("Requirement 10: ៨៤ ÷ ៤ renders division working rows", () => {
    const calc = buildStructuredIntegerDivision(84, 4);
    expect(calc.type).toBe("division");
    expect(calc.rows.some((r) => r.role === "quotient")).toBe(true);

    const html = renderColumnCalculationHtml(calc);
    expect(html).toContain("column-calculation");
    expect(html).toContain("៨");
    expect(html).toContain("៤");
  });

  // 11. ១/២ + ១/៤ preserves fraction layout.
  it("Requirement 11: ១/២ + ១/៤ preserves fraction layout", () => {
    const calc = buildStructuredFractionArithmetic("១/២ + ១/៤");
    expect(calc.type).toBe("fraction");
    expect(calc.fractionData?.steps.length).toBeGreaterThan(0);

    const html = renderColumnCalculationHtml(calc);
    expect(html).toContain("fraction-calculation");
    expect(html).toContain("fraction-num");
    expect(html).toContain("fraction-den");
    expect(html).toContain("fraction-bar");
  });

  // 12. ១២.៥ + ៣.៧៥ aligns decimal points.
  it("Requirement 12: ១២.៥ + ៣.៧៥ aligns decimal points", () => {
    const calc = buildStructuredDecimalArithmetic(12.5, "+", 3.75, 16.25);
    expect(calc.columns).toContain("decimal_point");

    const dotIndex = calc.columns.indexOf("decimal_point");
    for (const row of calc.rows) {
      if (row.role !== "separator") {
        expect(row.digits[dotIndex]).toBe(".");
      }
    }
  });

  // 13. Clean Text contains no HTML tags.
  it("Requirement 13: Clean Text contains no HTML tags", () => {
    const prob: MathSolution = {
      problemStatement: "៤៣១ + ៦៥",
      operation: "addition",
      finalAnswer: "៤៩៦",
      explanationKhmer: "យើងបូកខ្ទង់ឯកតាមុន ១ + ៥ = ៦ បន្ទាប់មកខ្ទង់ដប់ ៣ + ៦ = ៩",
      steps: [
        {
          stepNumber: 1,
          titleKhmer: "ខ្ទង់ឯកតា",
          explanationKhmer: "១ + ៥ = ៦",
        },
      ],
      verticalCalculations: [
        structuredToVerticalCalculation(buildStructuredIntegerArithmetic(431, "+", 65, 496)),
      ],
    };

    const cleanText = renderCleanText(prob);
    expect(cleanText).not.toMatch(/<[^>]+>/);
    expect(cleanText).not.toContain("<!doctype html>");
    expect(cleanText).not.toContain("<table");
    expect(cleanText).not.toContain("<style>");
    expect(cleanText).toContain("៤៣១ + ៦៥");
    expect(cleanText).toContain("៤៩៦");
    expect(cleanText.includes("\n")).toBe(true);
  });

  // 14. Styled HTML contains <!doctype html>.
  it("Requirement 14: Styled HTML contains <!doctype html>", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
      solutionKhmer: "ដំណោះស្រាយលម្អិត",
    });

    const styledHtml = renderStyledHtml(prob);
    expect(styledHtml.toLowerCase()).toContain("<!doctype html>");
    expect(styledHtml).toContain('<html lang="km">');
  });

  // 15. Styled HTML contains <style>.
  it("Requirement 15: Styled HTML contains <style>", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
    });

    const styledHtml = renderStyledHtml(prob);
    expect(styledHtml).toContain("<style>");
    expect(styledHtml).toContain("</style>");
  });

  // 16. Styled HTML contains a table or structured grid.
  it("Requirement 16: Styled HTML contains a table or structured grid", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
      structuredCalculation: buildStructuredIntegerArithmetic(431, "+", 65, 496),
    });

    const styledHtml = renderStyledHtml(prob, { solverMode: "verify" });
    expect(styledHtml).toContain("<table");
    expect(styledHtml).toContain("column-calculation");
  });

  // 17. Styled HTML contains one cell per logical digit.
  it("Requirement 17: Styled HTML contains one cell per logical digit", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
      structuredCalculation: buildStructuredIntegerArithmetic(431, "+", 65, 496),
    });

    const styledHtml = renderStyledHtml(prob, { solverMode: "verify" });
    expect(styledHtml).toContain('<td class="digit-cell"');
    expect(styledHtml).toContain(">៤</td>");
    expect(styledHtml).toContain(">៣</td>");
    expect(styledHtml).toContain(">១</td>");
  });

  // 18. Styled HTML contains border-collapse: collapse.
  it("Requirement 18: Styled HTML contains border-collapse: collapse", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
      structuredCalculation: buildStructuredIntegerArithmetic(431, "+", 65, 496),
    });

    const styledHtml = renderStyledHtml(prob, { solverMode: "verify" });
    expect(styledHtml).toContain("border-collapse: collapse");
  });

  // 19. Styled HTML contains border-bottom: 2px solid #000.
  it("Requirement 19: Styled HTML contains border-bottom: 2px solid #000", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
      structuredCalculation: buildStructuredIntegerArithmetic(431, "+", 65, 496),
    });

    const styledHtml = renderStyledHtml(prob, { solverMode: "verify" });
    expect(styledHtml).toContain("border-bottom: 2px solid #000");
  });

  // 20. Styled HTML contains Khmer text.
  it("Requirement 20: Styled HTML contains Khmer text", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
      solutionKhmer: "យើងបូកខ្ទង់ឯកតាមុន",
    });

    const styledHtml = renderStyledHtml(prob);
    expect(styledHtml).toContain("សន្លឹកដំណោះស្រាយគណិតវិទ្យា");
    expect(styledHtml).toContain("ប្រធានលំហាត់");
    expect(styledHtml).toContain("៤៣១ + ៦៥");
  });

  // 21. Styled HTML contains no <script>.
  it("Requirement 21: Styled HTML contains no <script>", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥ <script>alert(1)</script>",
      finalAnswer: "៤៩៦",
      solutionKhmer: "<script>evil()</script>",
    });

    const styledHtml = renderStyledHtml(prob);
    expect(styledHtml).not.toContain("<script>");
    expect(styledHtml).not.toContain("</script>");
    expect(styledHtml).not.toContain("javascript:");
    expect(styledHtml).not.toContain("onerror=");
    expect(styledHtml).not.toContain("onclick=");
  });

  // 22. Styled HTML contains no API keys, JSON, diagnostics, or navigation.
  it("Requirement 22: Styled HTML contains no API keys, JSON, diagnostics, or navigation", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
      deterministicResult: {
        isVerified: true,
        verificationMethod: "unit_test_eval",
        verificationMethodKhmer: "ការផ្ទៀងផ្ទាត់ឯករាជ្យ",
        computedAnswerKhmer: "៤៩៦",
      },
    });

    const styledHtml = renderStyledHtml(prob);
    expect(styledHtml).not.toContain("AIzaSy");
    expect(styledHtml).not.toContain('"requestId":');
    expect(styledHtml).not.toContain('"problems":');
    expect(styledHtml).not.toContain("<nav");
    expect(styledHtml).not.toContain("<aside");
  });

  // 23. Copy Text and Copy Styled HTML are different strings.
  it("Requirement 23: Copy Text and Copy Styled HTML are different strings", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
      structuredCalculation: buildStructuredIntegerArithmetic(431, "+", 65, 496),
    });

    const cleanText = renderCleanText(prob);
    const styledHtml = renderStyledHtml(prob);

    expect(cleanText).not.toBe(styledHtml);
    expect(cleanText.startsWith("<!doctype html>")).toBe(false);
    expect(styledHtml.startsWith("<!doctype html>")).toBe(true);
  });

  // 24. Export generation is deterministic for the same MathSolution object.
  it("Requirement 24: Export generation is deterministic for the same MathSolution object", () => {
    const prob = toMathSolution({
      extractedProblem: "៤៣១ + ៦៥",
      finalAnswer: "៤៩៦",
      solutionKhmer: "ជំហានទី១៖ ខ្ទង់ឯកតា ១ + ៥ = ៦",
      structuredCalculation: buildStructuredIntegerArithmetic(431, "+", 65, 496),
    });

    const html1 = renderStyledHtml(prob);
    const html2 = renderStyledHtml(prob);
    expect(html1).toBe(html2);

    const text1 = renderCleanText(prob);
    const text2 = renderCleanText(prob);
    expect(text1).toBe(text2);
  });

  // 25. API failures return safe recoverable errors instead of throwing uncaught exceptions.
  it("Requirement 25: API failures return safe recoverable errors instead of throwing uncaught exceptions", async () => {
    // Calling POST with completely invalid body
    const req = new NextRequest("http://localhost:3000/api/math-solver", {
      method: "POST",
      body: "not a form data",
      headers: {
        "content-type": "text/plain",
      },
    });

    const response = await POST(req);
    expect(response.status).toBeGreaterThanOrEqual(400);

    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.errorKhmer).toBeDefined();
    expect(typeof data.retryable).toBe("boolean");
  });
});
