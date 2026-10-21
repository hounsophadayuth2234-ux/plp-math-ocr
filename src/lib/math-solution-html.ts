/**
 * Canonical Math Solution HTML Renderer & Sanitizer
 *
 * Requirements:
 * 1. Single canonical solution object renders BOTH the on-screen UI and the copied/downloaded HTML.
 * 2. Strictly safe escaping & sanitization (no scripts, no event handlers, no unsafe links).
 * 3. Preserves Khmer diacritics, subscripts, equations, aligned column math, and verification badges.
 * 4. Dual-mode clipboard support:
 *    - "ចម្លងជាអត្ថបទ" (Copy Text): plain text with line breaks, NO HTML tags.
 *    - "ចម្លងកូដ HTML" (Copy HTML): full standalone HTML source code (<!doctype html>...<article>...).
 *      Clipboard text/plain contains raw HTML source code, while text/html contains rich rendered HTML.
 * 5. Strict 3-Mode Contract:
 *    - Mode 1 ("solve"): problem + final answer + verification status only. NO steps, NO vertical lines.
 *    - Mode 2 ("generate"): problem + formulas + steps + vertical working. STRICTLY NO final answer block.
 *    - Mode 3 ("verify"): problem + formulas + student answer + steps + vertical working + final answer + verification.
 */

import type { MathSolverProblem, SolverMode } from "@/app/api/math-solver/route";
import {
  renderColumnCalculationHtml,
  renderColumnCalculationText,
  detectAndBuildStructuredCalculation,
} from "./column-calculation";

export function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml) return "";
  // Strip dangerous tags: script, iframe, object, embed, link, form, meta
  let clean = rawHtml.replace(
    /<(script|iframe|object|embed|link|form|svg|base)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );
  clean = clean.replace(/<(script|iframe|object|embed|link|form|svg|base)\b[^>]*\/>/gi, "");
  // Strip inline event handlers: onclick, onerror, onload, onmouseover, etc.
  clean = clean.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  clean = clean.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // Strip javascript: URLs
  clean = clean.replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'href="#"');
  clean = clean.replace(/src\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'src=""');
  return clean;
}

export interface RenderSolutionOptions {
  gradeTitle?: string;
  solverModeTitle?: string;
  documentTitle?: string;
  solverMode?: SolverMode;
}

/**
 * Determine effective mode from options or problem fields
 */
function getEffectiveMode(problem: MathSolverProblem, options?: RenderSolutionOptions): SolverMode {
  if (options?.solverMode) return options.solverMode;
  if (problem.mode) return problem.mode;
  if (options?.solverModeTitle) {
    const t = options.solverModeTitle.toLowerCase();
    if (t.includes("verify") || t.includes("ផ្ទៀងផ្ទាត់")) return "verify";
    if (t.includes("generate") || t.includes("បង្កើត")) return "generate";
    if (t.includes("solve") || t.includes("ដោះស្រាយ")) return "solve";
  }
  if (problem.extractedAnswer || problem.answerStatus) return "verify";
  if (!problem.finalAnswer && (problem.solutionKhmer || problem.verticalLines)) return "generate";
  return "solve";
}

/**
 * Render the Canonical Solution Object to pure HTML
 * Returns a complete, valid, standalone HTML document conforming to the Mode Contract.
 */
export function renderCanonicalSolutionHtml(
  problem: MathSolverProblem,
  options?: RenderSolutionOptions
): string {
  const mode = getEffectiveMode(problem, options);
  const isMode1 = mode === "solve";
  const isMode2 = mode === "generate";
  const isMode3 = mode === "verify";

  const docTitle = options?.documentTitle || "PLP Math Content — សន្លឹកដំណោះស្រាយគណិតវិទ្យា";
  const gradeLabel = options?.gradeTitle || problem.inferredGradeKhmer || "ថ្នាក់បឋមសិក្សា";
  const modeLabel =
    options?.solverModeTitle ||
    (isMode1
      ? "ដោះស្រាយលំហាត់ (ចម្លើយ)"
      : isMode2
      ? "បង្កើតដំណោះស្រាយ (វិធីដោះស្រាយ)"
      : "ដោះស្រាយ + ផ្ទៀងផ្ទាត់ (ពេញលេញ)");

  const parts: string[] = [];

  // Standalone HTML5 Document Opening
  parts.push("<!doctype html>\n");
  parts.push('<html lang="km">\n');
  parts.push("<head>\n");
  parts.push('<meta charset="utf-8">\n');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">\n');
  parts.push(`<title>${escapeHtml(docTitle)}</title>\n`);
  parts.push("<style>\n");
  parts.push(`
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Kantumruy Pro", "Siemreap", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.7;
  color: #1e293b;
  background-color: #f8fafc;
  margin: 0;
  padding: 24px 16px;
}
.solution {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
.solution-header {
  border-bottom: 2px solid #6366f1;
  padding-bottom: 12px;
  margin-bottom: 20px;
}
.solution-header h1 {
  margin: 0 0 6px 0;
  color: #312e81;
  font-size: 20px;
  font-weight: 700;
}
.badges {
  font-size: 13px;
  color: #64748b;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.badge-grade {
  background: #eef2ff;
  color: #4338ca;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
}
.badge-mode {
  background: #f1f5f9;
  color: #475569;
  padding: 2px 8px;
  border-radius: 6px;
}
.section-title {
  margin: 0 0 6px 0;
  font-size: 14px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
}
.problem-box {
  background: #f1f5f9;
  border-left: 4px solid #6366f1;
  padding: 12px 16px;
  border-radius: 0 8px 8px 0;
  font-size: 14px;
  color: #0f172a;
  white-space: pre-wrap;
  margin-bottom: 20px;
}
.framework-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 20px;
  font-size: 13px;
}
.student-review {
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 20px;
}
.student-review.correct {
  background: #ecfdf5;
  border: 1px solid #10b981;
  color: #065f46;
}
.student-review.incorrect {
  background: #fef2f2;
  border: 1px solid #ef4444;
  color: #991b1b;
}
.solution-steps {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  font-size: 14px;
  color: #1e293b;
  line-height: 1.8;
  white-space: pre-wrap;
  margin-bottom: 20px;
}
.vertical-calc {
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  background: #0f172a;
  color: #6ee7b7;
  padding: 14px;
  border-radius: 8px;
  margin: 14px 0 20px 0;
  font-size: 14px;
  line-height: 1.5;
  overflow-x: auto;
  font-weight: 600;
}
.column-calculation {
  border-collapse: collapse;
  display: inline-table;
  margin: 12px 0;
  font-family: "Noto Sans Khmer", "Kantumruy Pro", Arial, sans-serif;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}
.column-calculation .operator-cell {
  width: 32px;
  text-align: center;
  font-weight: 700;
  padding: 2px 4px;
}
.column-calculation .digit-cell {
  width: 36px;
  min-width: 36px;
  text-align: center;
  padding: 2px 4px;
}
.column-calculation .separator-row td {
  border-top: 3px solid #111827;
  height: 4px;
  padding: 0;
}
.fraction-calculation {
  display: inline-flex;
  align-items: center;
  margin: 12px 0;
  font-family: "Noto Sans Khmer", "Kantumruy Pro", Arial, sans-serif;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
.fraction-calculation .fraction-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.fraction-calculation .fraction-term {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  vertical-align: middle;
  padding: 0 4px;
}
.fraction-calculation .fraction-bar {
  width: 100%;
  border-top: 2px solid #111827;
  margin: 2px 0;
}
.fraction-calculation .fraction-op {
  padding: 0 6px;
  font-weight: 700;
}
.final-answer-box {
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border: 1.5px solid #10b981;
  border-radius: 8px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.final-answer-title {
  font-size: 12px;
  font-weight: 700;
  color: #065f46;
  text-transform: uppercase;
  display: block;
  margin-bottom: 2px;
}
.final-answer-value {
  font-size: 18px;
  font-weight: 800;
  color: #047857;
  font-family: monospace;
}
.badge-status {
  background: #10b981;
  color: #ffffff;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
}
.verification-box {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 20px;
  font-size: 13px;
}
.footer {
  margin-top: 24px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}
`);
  parts.push("</style>\n");
  parts.push("</head>\n");
  parts.push("<body>\n");
  parts.push('<article class="solution">\n');
  parts.push('  <main class="plp-solution-sheet">\n');

  // Document Title / Header
  parts.push('  <header class="solution-header plp-header">\n');
  parts.push('    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #4338ca; margin-bottom: 4px;">PLP Math Content</div>\n');
  parts.push(`    <h1 style="margin: 0 0 6px 0; color: #1e1b4b; font-size: 20px; font-weight: 800;">${escapeHtml(docTitle)}</h1>\n`);
  parts.push('    <div class="badges">\n');
  parts.push(`      <span class="badge-grade">${escapeHtml(gradeLabel)}</span>\n`);
  parts.push(`      <span class="badge-mode">${escapeHtml(modeLabel)}</span>\n`);
  parts.push("    </div>\n");
  parts.push("  </header>\n\n");

  // Visual Interpretation (Mode 2 or Mode 3 only)
  if (!isMode1 && problem.visualInterpretation) {
    const vi = problem.visualInterpretation;
    parts.push('  <section class="visual-interpretation-block" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 20px;">\n');
    parts.push('    <h2 class="section-title">🔍 ការបកស្រាយរូបភាព (Visual Interpretation)</h2>\n');
    parts.push('    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">\n');
    parts.push(`      <tr><td style="padding: 4px 8px; font-weight: 600; width: 35%;">វត្ថុដែលបានស្គាល់៖</td><td style="padding: 4px 8px;">${escapeHtml(vi.recognizedObjects)}</td></tr>\n`);
    parts.push(`      <tr><td style="padding: 4px 8px; font-weight: 600;">ចំនួនវត្ថុ៖</td><td style="padding: 4px 8px; font-family: monospace; font-weight: 600;">${escapeHtml(vi.objectCount)}</td></tr>\n`);
    if (vi.arrangement) {
      parts.push(`      <tr><td style="padding: 4px 8px; font-weight: 600;">របៀបរៀបចំ៖</td><td style="padding: 4px 8px;">${escapeHtml(vi.arrangement)}</td></tr>\n`);
    }
    parts.push(`      <tr><td style="padding: 4px 8px; font-weight: 600;">ប្រមាណវិធីដែលបានបកស្រាយ៖</td><td style="padding: 4px 8px; color: #4338ca; font-weight: 600;">${escapeHtml(vi.interpretedOperation)}</td></tr>\n`);
    parts.push(`      <tr><td style="padding: 4px 8px; font-weight: 600;">កម្រិតទំនុកចិត្ត៖</td><td style="padding: 4px 8px;">${escapeHtml(vi.confidenceKhmer || vi.confidence)}</td></tr>\n`);
    parts.push("    </table>\n");
    if (vi.possibleAlternatives && vi.possibleAlternatives.length > 0) {
      parts.push(`    <div style="margin-top: 8px; padding: 6px 10px; background: #fef3c7; border-radius: 6px; font-size: 12px; color: #92400e;"><strong>ការបកស្រាយផ្សេងទៀត៖</strong> ${escapeHtml(vi.possibleAlternatives.join(" ឬ "))}</div>\n`);
    }
    parts.push("  </section>\n\n");
  }

  // 1. Problem Statement (Mandatory in all modes)
  parts.push('  <section class="problem-statement-section">\n');
  parts.push('    <h2 class="section-title">ប្រធានលំហាត់</h2>\n');
  parts.push(`    <div class="problem-box">${escapeHtml(problem.extractedProblem)}</div>\n`);
  parts.push("  </section>\n\n");

  // 2. Educational Framework (Given, To Find, Formulas) - Mode 2 & Mode 3 only
  if (!isMode1 && (problem.given || problem.toFind || problem.formulas)) {
    parts.push('  <section class="framework-box">\n');
    if (problem.given) {
      parts.push(`    <div style="margin-bottom: 8px;"><strong>អ្វីដែលគេឱ្យ (Given)៖</strong> <span>${escapeHtml(problem.given)}</span></div>\n`);
    }
    if (problem.toFind) {
      parts.push(`    <div style="margin-bottom: 8px;"><strong>អ្វីដែលត្រូវរក (To Find)៖</strong> <span>${escapeHtml(problem.toFind)}</span></div>\n`);
    }
    if (problem.formulas) {
      parts.push(`    <div><strong>រូបមន្តដែលត្រូវប្រើ (Formulas)៖</strong> <span style="font-family: monospace; color: #4338ca; font-weight: 600;">${escapeHtml(problem.formulas)}</span></div>\n`);
    }
    parts.push("  </section>\n\n");
  }

  // 3. Student Answer Review - Mode 3 only
  if (isMode3 && problem.extractedAnswer) {
    const isCorrect = problem.answerStatus === "correct";
    parts.push(`  <section class="student-review ${isCorrect ? "correct" : "incorrect"}">\n`);
    parts.push('    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">\n');
    parts.push(`      <strong>ចម្លើយរបស់សិស្សក្នុងរូបភាព៖</strong>\n`);
    parts.push(`      <span style="background: ${isCorrect ? "#10b981" : "#ef4444"}; color: #ffffff; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">${escapeHtml(problem.answerStatusKhmer || (isCorrect ? "ត្រឹមត្រូវ ✓" : "មិនទាន់ត្រឹមត្រូវ ✗"))}</span>\n`);
    parts.push("    </div>\n");
    parts.push(`    <div style="font-family: monospace; font-size: 14px; margin-bottom: 8px;">${escapeHtml(problem.extractedAnswer)}</div>\n`);
    if (problem.answerStatus === "incorrect") {
      if (problem.incorrectStep) {
        parts.push(`    <div style="font-size: 12px; margin-top: 6px;"><strong>ជំហានដែលខុស៖</strong> ${escapeHtml(problem.incorrectStep)}</div>\n`);
      }
      if (problem.errorExplanationKhmer) {
        parts.push(`    <div style="font-size: 12px; margin-top: 4px;"><strong>ការពន្យល់កំហុស៖</strong> ${escapeHtml(problem.errorExplanationKhmer)}</div>\n`);
      }
      if (problem.correctedStep) {
        parts.push(`    <div style="font-size: 12px; margin-top: 4px;"><strong>ជំហានត្រឹមត្រូវ៖</strong> ${escapeHtml(problem.correctedStep)}</div>\n`);
      }
    }
    parts.push("  </section>\n\n");
  }

  // 4. Step-by-Step Solution & Aligned Column Working
  // STRICT CONTRACT: Mode 2 & Mode 3 ONLY. In Mode 1, this must NOT be rendered.
  if (!isMode1 && (problem.solutionKhmer || problem.solution || problem.verticalLines || problem.alignedWorking)) {
    parts.push('  <section class="solution-body-section">\n');
    parts.push('    <h2 class="section-title">វិធីដោះស្រាយ</h2>\n');
    if (problem.solutionKhmer || problem.solution) {
      parts.push(`    <div class="solution-steps">${escapeHtml(problem.solutionKhmer || problem.solution)}</div>\n`);
    }

    const vertText =
      problem.verticalLines && problem.verticalLines.length > 0
        ? problem.verticalLines.join("\n")
        : problem.alignedWorking;

    const structuredCalc =
      problem.structuredCalculation ||
      detectAndBuildStructuredCalculation(
        problem.extractedProblem,
        problem.finalAnswer,
        problem.verticalLines
      );

    if (structuredCalc || vertText) {
      parts.push('    <div style="color: #64748b; font-size: 11px; margin-top: 10px; font-weight: 600; text-transform: uppercase;">ការគណនាតាមជួរឈរ (Vertical Calculation):</div>\n');
      if (structuredCalc) {
        parts.push(renderColumnCalculationHtml(structuredCalc));
      }
      if (vertText) {
        parts.push(`    <pre class="vertical-calc">${escapeHtml(vertText)}</pre>\n`);
      }
    }
    parts.push("  </section>\n\n");
  }

  // 5. Final Answer Badge
  // STRICT CONTRACT:
  // - Mode 1 ("solve"): Render final answer!
  // - Mode 2 ("generate"): STRICTLY DO NOT render final answer!
  // - Mode 3 ("verify"): Render final answer!
  if (!isMode2 && problem.finalAnswer) {
    parts.push('  <section class="final-answer-section">\n');
    parts.push('    <div class="final-answer-box">\n');
    parts.push("      <div>\n");
    parts.push('        <span class="final-answer-title">ចម្លើយចុងក្រោយ</span>\n');
    parts.push(`        <span class="final-answer-value">${escapeHtml(problem.finalAnswer)}</span>\n`);
    parts.push("      </div>\n");
    parts.push('      <span class="badge-status">សម្រេច ✓</span>\n');
    parts.push("    </div>\n");
    parts.push("  </section>\n\n");
  }

  // 6. Deterministic Verification
  // Mode 1 (status only if available) & Mode 3 (full verification)
  if ((isMode1 || isMode3) && (problem.verification || problem.deterministicResult)) {
    const isDetVerified = problem.deterministicResult?.isVerified !== false;
    parts.push('  <section class="verification-box">\n');
    parts.push('    <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #334155;">🛡️ ការពិនិត្យផ្ទៀងផ្ទាត់ (Verification)</h3>\n');
    if (problem.deterministicResult) {
      parts.push(`    <div style="font-size: 13px; color: #475569; margin-bottom: 4px;"><strong>ស្ថានភាព៖</strong> <span style="font-weight: 700; color: ${isDetVerified ? "#059669" : "#dc2626"};">${escapeHtml(problem.deterministicResult.statusKhmer || (isDetVerified ? "ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓" : "មានភាពខុសគ្នា ✗"))}</span></div>\n`);
      if (isMode3) {
        parts.push(`    <div style="font-size: 13px; color: #475569; margin-bottom: 4px;"><strong>វិធីផ្ទៀងផ្ទាត់៖</strong> ${escapeHtml(problem.deterministicResult.verificationMethodKhmer || problem.deterministicResult.verificationMethod)}</div>\n`);
      }
    } else if (problem.verification) {
      parts.push(`    <div style="font-size: 13px; color: #334155; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(problem.verification)}</div>\n`);
    }
    parts.push("  </section>\n\n");
  }

  // 7. Footer
  parts.push('  <footer class="footer plp-footer" style="border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 24px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b;">\n');
  parts.push('    <div style="font-weight: 600; color: #312e81;">PLP Math Content · DYT ECOSYSTEM</div>\n');
  parts.push('    <div style="color: #94a3b8; font-style: italic;">សម្រាប់ការសិក្សា</div>\n');
  parts.push("  </footer>\n");
  parts.push('  </main>\n');
  parts.push('</article>\n');
  parts.push("</body>\n");
  parts.push("</html>");

  return sanitizeHtml(parts.join(""));
}

/**
 * Plain-text renderer for clipboard writing
 * Strictly obeys the 3-Mode Contract:
 * - Mode 1: Problem + Final Answer only (no detailed solution steps).
 * - Mode 2: Problem + Framework + Solution Steps + Vertical Calculation (NO final answer).
 * - Mode 3: Problem + Framework + Student Answer + Solution Steps + Vertical Calculation + Final Answer + Verification.
 */
export function renderCanonicalSolutionPlainText(
  problem: MathSolverProblem,
  options?: RenderSolutionOptions
): string {
  const mode = getEffectiveMode(problem, options);
  const isMode1 = mode === "solve";
  const isMode2 = mode === "generate";
  const isMode3 = mode === "verify";

  const lines: string[] = [];

  lines.push("==================================================");
  lines.push(options?.documentTitle || "PLP Math Content — សន្លឹកដំណោះស្រាយគណិតវិទ្យា");
  if (options?.gradeTitle) lines.push(`កម្រិតថ្នាក់៖ ${options.gradeTitle}`);
  if (options?.solverModeTitle) lines.push(`ទម្រង់៖ ${options.solverModeTitle}`);
  lines.push("==================================================");
  lines.push("");

  // Mode 2 & Mode 3: Visual interpretation
  if (!isMode1 && problem.visualInterpretation) {
    const vi = problem.visualInterpretation;
    lines.push("🔍 ការបកស្រាយរូបភាព (Visual Interpretation):");
    lines.push(`- វត្ថុដែលបានស្គាល់៖ ${vi.recognizedObjects}`);
    lines.push(`- ចំនួនវត្ថុ៖ ${vi.objectCount}`);
    if (vi.arrangement) lines.push(`- របៀបរៀបចំ៖ ${vi.arrangement}`);
    lines.push(`- ប្រមាណវិធីដែលបានបកស្រាយ៖ ${vi.interpretedOperation}`);
    lines.push(`- កម្រិតទំនុកចិត្ត៖ ${vi.confidenceKhmer || vi.confidence}`);
    lines.push("");
  }

  // Problem Statement
  lines.push(`ប្រធានលំហាត់៖ ${problem.extractedProblem}`);
  lines.push("");

  // Framework (Mode 2 & 3 only)
  if (!isMode1 && (problem.given || problem.toFind || problem.formulas)) {
    if (problem.given) lines.push(`អ្វីដែលគេឱ្យ៖ ${problem.given}`);
    if (problem.toFind) lines.push(`អ្វីដែលត្រូវរក៖ ${problem.toFind}`);
    if (problem.formulas) lines.push(`រូបមន្តដែលត្រូវប្រើ៖ ${problem.formulas}`);
    lines.push("");
  }

  // Student Answer Review (Mode 3 only)
  if (isMode3 && problem.extractedAnswer) {
    lines.push(`ចម្លើយសិស្សក្នុងរូបភាព៖ ${problem.extractedAnswer}`);
    lines.push(`ស្ថានភាព៖ ${problem.answerStatusKhmer || problem.answerStatus}`);
    if (problem.incorrectStep) lines.push(`ជំហានដែលខុស៖ ${problem.incorrectStep}`);
    if (problem.correctedStep) lines.push(`ជំហានត្រឹមត្រូវ៖ ${problem.correctedStep}`);
    lines.push("");
  }

  // Step-by-Step Solution & Vertical Lines (Mode 2 & Mode 3 ONLY)
  if (!isMode1 && (problem.solutionKhmer || problem.solution || problem.verticalLines || problem.alignedWorking)) {
    lines.push("វិធីដោះស្រាយ៖");
    const sol = problem.solutionKhmer || problem.solution;
    if (sol) {
      lines.push(sol);
      lines.push("");
    }

    const structuredCalc =
      problem.structuredCalculation ||
      (!problem.verticalLines || problem.verticalLines.length === 0
        ? detectAndBuildStructuredCalculation(
            problem.extractedProblem,
            problem.finalAnswer,
            problem.verticalLines
          )
        : undefined);

    const vertText = structuredCalc
      ? renderColumnCalculationText(structuredCalc)
      : problem.verticalLines && problem.verticalLines.length > 0
      ? problem.verticalLines.join("\n")
      : problem.alignedWorking;

    if (vertText) {
      lines.push("ការគណនាតាមជួរឈរ (Vertical Calculation):");
      lines.push(vertText);
      lines.push("");
    }
  }

  // Final Answer (Mode 1 & Mode 3 ONLY - STRICTLY OMITTED IN MODE 2)
  if (!isMode2 && problem.finalAnswer) {
    lines.push(`ចម្លើយ៖ ${problem.finalAnswer}`);
    lines.push("");
  }

  // Verification
  if ((isMode1 || isMode3) && (problem.deterministicResult || problem.verification)) {
    if (problem.deterministicResult) {
      lines.push(`ស្ថានភាពផ្ទៀងផ្ទាត់៖ ${problem.deterministicResult.statusKhmer}`);
      if (isMode3) {
        lines.push(`វិធីផ្ទៀងផ្ទាត់៖ ${problem.deterministicResult.verificationMethodKhmer}`);
      }
      lines.push("");
    } else if (problem.verification) {
      lines.push(`ការពិនិត្យផ្ទៀងផ្ទាត់៖ ${problem.verification}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Fallback for browser copying when ClipboardItem / navigator.clipboard is unavailable
 */
export function copyTextFallback(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return successful;
  } catch (e) {
    console.error("Textarea copy fallback error:", e);
    return false;
  }
}

/**
 * Universal Dual-Type Clipboard Copy for "ចម្លងកូដ HTML"
 * Writes both:
 * - text/plain = complete HTML source string (so code editors paste raw tags & css)
 * - text/html  = rendered sanitized HTML (so rich text editors paste formatted document)
 */
export async function copyCanonicalSolutionToClipboard(
  problem: MathSolverProblem,
  options?: RenderSolutionOptions
): Promise<boolean> {
  const htmlSource = renderCanonicalSolutionHtml(problem, options);

  if (typeof window === "undefined") {
    return false;
  }

  // 1. Primary: ClipboardItem dual-write with text/plain = htmlSource!
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        const blobHtml = new Blob([htmlSource], { type: "text/html" });
        const blobText = new Blob([htmlSource], { type: "text/plain" });
        const item = new ClipboardItem({
          "text/html": blobHtml,
          "text/plain": blobText,
        });
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch (err) {
      console.warn("ClipboardItem write failed, falling back to writeText:", err);
    }

    // 2. Secondary: writeText fallback
    try {
      if (navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(htmlSource);
        return true;
      }
    } catch (err) {
      console.warn("writeText failed, falling back to textarea fallback:", err);
    }
  }

  // 3. Fallback: document.execCommand textarea copy
  return copyTextFallback(htmlSource);
}

/**
 * Copy Plain Text Solution to Clipboard ("ចម្លងអត្ថបទ")
 * Writes strictly plain text with line breaks and NO HTML tags.
 */
export async function copyCanonicalSolutionPlainTextToClipboard(
  problem: MathSolverProblem,
  options?: RenderSolutionOptions
): Promise<boolean> {
  const plainText = renderCanonicalSolutionPlainText(problem, options);

  if (typeof window === "undefined") {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(plainText);
      return true;
    } catch {
      // fallback
    }
  }

  return copyTextFallback(plainText);
}
