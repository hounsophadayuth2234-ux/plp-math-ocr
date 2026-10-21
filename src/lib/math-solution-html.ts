/**
 * Canonical Math Solution HTML Renderer & Sanitizer
 *
 * Requirements:
 * 1. Single canonical solution object renders BOTH the on-screen UI and the copied/downloaded HTML.
 * 2. Strictly safe escaping & sanitization (no scripts, no event handlers, no unsafe links).
 * 3. Preserves Khmer diacritics, subscripts, equations, aligned column math, and verification badges.
 * 4. Dual-mode clipboard support: rich text/html + plain-text fallback.
 */

import type { MathSolverProblem } from "@/app/api/math-solver/route";

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
  // Strip dangerous tags: script, iframe, object, embed, link, form, style, meta
  let clean = rawHtml.replace(
    /<(script|iframe|object|embed|link|form|style|meta|svg|base)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );
  clean = clean.replace(/<(script|iframe|object|embed|link|form|style|meta|svg|base)\b[^>]*\/>/gi, "");
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
}

/**
 * Render the Canonical Solution Object to pure HTML
 * Used for both on-screen rendering and "Copy as HTML" / Download.
 */
export function renderCanonicalSolutionHtml(
  problem: MathSolverProblem,
  options?: RenderSolutionOptions
): string {
  const parts: string[] = [];

  const fontStack =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Kantumruy Pro', 'Siemreap', Roboto, Helvetica, Arial, sans-serif";

  parts.push(
    `<div class="math-solution-document" style="font-family: ${fontStack}; line-height: 1.65; color: #1e293b; max-width: 760px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">`
  );

  // Document Title / Header
  parts.push(
    `<div class="solution-header" style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px;">`
  );
  parts.push(
    `<h2 style="margin: 0 0 6px 0; color: #312e81; font-size: 20px; font-weight: 700;">${escapeHtml(
      options?.documentTitle || "ដំណោះស្រាយគណិតវិទ្យា — ថ្នាក់បឋមសិក្សា"
    )}</h2>`
  );
  if (options?.gradeTitle || options?.solverModeTitle) {
    parts.push(
      `<div style="font-size: 13px; color: #64748b; display: flex; gap: 12px; flex-wrap: wrap;">`
    );
    if (options?.gradeTitle) {
      parts.push(
        `<span style="background: #eef2ff; color: #4338ca; padding: 2px 8px; border-radius: 6px; font-weight: 600;">${escapeHtml(
          options.gradeTitle
        )}</span>`
      );
    }
    if (options?.solverModeTitle) {
      parts.push(
        `<span style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 6px;">${escapeHtml(
          options.solverModeTitle
        )}</span>`
      );
    }
    parts.push(`</div>`);
  }
  parts.push(`</div>`);

  // Section 1: Visual Interpretation (if visual problem detected)
  if (problem.visualInterpretation) {
    const vi = problem.visualInterpretation;
    parts.push(
      `<div class="visual-interpretation-block" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 20px;">`
    );
    parts.push(
      `<h3 style="margin: 0 0 10px 0; font-size: 14px; color: #0f172a; font-weight: 700;">🔍 ការបកស្រាយរូបភាព (Visual Interpretation)</h3>`
    );
    parts.push(
      `<table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">`
    );
    parts.push(
      `<tr><td style="padding: 4px 8px; font-weight: 600; width: 35%;">វត្ថុដែលបានស្គាល់៖</td><td style="padding: 4px 8px;">${escapeHtml(
        vi.recognizedObjects
      )}</td></tr>`
    );
    parts.push(
      `<tr><td style="padding: 4px 8px; font-weight: 600;">ចំនួនវត្ថុ៖</td><td style="padding: 4px 8px; font-family: monospace; font-weight: 600;">${escapeHtml(
        vi.objectCount
      )}</td></tr>`
    );
    if (vi.arrangement) {
      parts.push(
        `<tr><td style="padding: 4px 8px; font-weight: 600;">របៀបរៀបចំ៖</td><td style="padding: 4px 8px;">${escapeHtml(
          vi.arrangement
        )}</td></tr>`
      );
    }
    parts.push(
      `<tr><td style="padding: 4px 8px; font-weight: 600;">ប្រមាណវិធីដែលបានបកស្រាយ៖</td><td style="padding: 4px 8px; color: #4338ca; font-weight: 600;">${escapeHtml(
        vi.interpretedOperation
      )}</td></tr>`
    );
    parts.push(
      `<tr><td style="padding: 4px 8px; font-weight: 600;">កម្រិតទំនុកចិត្ត៖</td><td style="padding: 4px 8px;">${escapeHtml(
        vi.confidenceKhmer || vi.confidence
      )}</td></tr>`
    );
    parts.push(`</table>`);

    if (vi.possibleAlternatives && vi.possibleAlternatives.length > 0) {
      parts.push(
        `<div style="margin-top: 8px; padding: 6px 10px; background: #fef3c7; border-radius: 6px; font-size: 12px; color: #92400e;">`
      );
      parts.push(
        `<strong>ការបកស្រាយផ្សេងទៀតដែលអាចមាន៖</strong> ${escapeHtml(
          vi.possibleAlternatives.join(" ឬ ")
        )}`
      );
      parts.push(`</div>`);
    }
    parts.push(`</div>`);
  }

  // Section 2: Problem Statement
  parts.push(`<div class="problem-statement-section" style="margin-bottom: 20px;">`);
  parts.push(
    `<h3 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 700; color: #475569; text-transform: uppercase;">១. ប្រធានលំហាត់</h3>`
  );
  parts.push(
    `<div style="background: #f1f5f9; border-left: 4px solid #6366f1; padding: 12px 16px; border-radius: 0 8px 8px 0; font-size: 14px; color: #0f172a; white-space: pre-wrap;">${escapeHtml(
      problem.extractedProblem
    )}</div>`
  );
  parts.push(`</div>`);

  // Section 3: Educational Framework (Given, To Find, Formulas)
  if (problem.given || problem.toFind || problem.formulas) {
    parts.push(
      `<div class="educational-framework-section" style="margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">`
    );
    if (problem.given) {
      parts.push(
        `<div style="margin-bottom: 8px;"><strong style="color: #475569; font-size: 13px;">អ្វីដែលគេឱ្យ (Given):</strong> <span style="font-size: 13px; color: #1e293b;">${escapeHtml(
          problem.given
        )}</span></div>`
      );
    }
    if (problem.toFind) {
      parts.push(
        `<div style="margin-bottom: 8px;"><strong style="color: #475569; font-size: 13px;">អ្វីដែលត្រូវរក (To Find):</strong> <span style="font-size: 13px; color: #1e293b;">${escapeHtml(
          problem.toFind
        )}</span></div>`
      );
    }
    if (problem.formulas) {
      parts.push(
        `<div><strong style="color: #475569; font-size: 13px;">រូបមន្តដែលត្រូវប្រើ (Formulas):</strong> <span style="font-size: 13px; font-family: monospace; color: #4338ca; font-weight: 600;">${escapeHtml(
          problem.formulas
        )}</span></div>`
      );
    }
    parts.push(`</div>`);
  }

  // Section 4: Existing Student Answer Verification (if present)
  if (problem.extractedAnswer) {
    const isCorrect = problem.answerStatus === "correct";
    const statusBg = isCorrect ? "#ecfdf5" : "#fef2f2";
    const statusBorder = isCorrect ? "#10b981" : "#ef4444";
    const statusColor = isCorrect ? "#065f46" : "#991b1b";

    parts.push(
      `<div class="student-answer-review" style="background: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 8px; padding: 14px; margin-bottom: 20px;">`
    );
    parts.push(
      `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">`
    );
    parts.push(
      `<strong style="color: ${statusColor}; font-size: 13px;">ចម្លើយរបស់សិស្សក្នុងរូបភាព៖</strong>`
    );
    parts.push(
      `<span style="background: ${statusBorder}; color: #ffffff; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">${escapeHtml(
        problem.answerStatusKhmer || (isCorrect ? "ត្រឹមត្រូវ ✓" : "មិនទាន់ត្រឹមត្រូវ ✗")
      )}</span>`
    );
    parts.push(`</div>`);
    parts.push(
      `<div style="font-family: monospace; font-size: 14px; color: #0f172a; margin-bottom: 8px;">${escapeHtml(
        problem.extractedAnswer
      )}</div>`
    );

    if (problem.answerStatus === "incorrect") {
      if (problem.incorrectStep) {
        parts.push(
          `<div style="font-size: 12px; color: #991b1b; margin-top: 6px;"><strong>ជំហានដែលខុស៖</strong> ${escapeHtml(
            problem.incorrectStep
          )}</div>`
        );
      }
      if (problem.errorExplanationKhmer) {
        parts.push(
          `<div style="font-size: 12px; color: #7f1d1d; margin-top: 4px;"><strong>ការពន្យល់កំហុស៖</strong> ${escapeHtml(
            problem.errorExplanationKhmer
          )}</div>`
        );
      }
      if (problem.correctedStep) {
        parts.push(
          `<div style="font-size: 12px; color: #065f46; margin-top: 4px;"><strong>ជំហានត្រឹមត្រូវ៖</strong> ${escapeHtml(
            problem.correctedStep
          )}</div>`
        );
      }
    }
    parts.push(`</div>`);
  }

  // Section 5: Step-by-Step Solution & Aligned Column Working
  parts.push(`<div class="solution-body-section" style="margin-bottom: 20px;">`);
  parts.push(
    `<h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #475569; text-transform: uppercase;">២. វិធីដោះស្រាយលម្អិត</h3>`
  );
  parts.push(
    `<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 14px; color: #1e293b; line-height: 1.8; white-space: pre-wrap;">${escapeHtml(
      problem.solutionKhmer || problem.solution
    )}</div>`
  );

  // Aligned column working (vertical addition, subtraction with borrowing, multiplication, fractions)
  if (problem.alignedWorking) {
    parts.push(
      `<div class="aligned-working-block" style="margin-top: 14px; background: #0f172a; color: #f8fafc; border-radius: 8px; padding: 14px; font-family: 'Courier New', Courier, monospace; font-size: 14px; line-height: 1.5; white-space: pre; overflow-x: auto;">`
    );
    parts.push(
      `<div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; text-transform: uppercase; font-family: ${fontStack};">ការគណនាតាមជួរឈរ (Vertical Calculation):</div>`
    );
    parts.push(escapeHtml(problem.alignedWorking));
    parts.push(`</div>`);
  }
  parts.push(`</div>`);

  // Section 6: Final Answer Badge
  parts.push(`<div class="final-answer-section" style="margin-bottom: 20px;">`);
  parts.push(
    `<div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1.5px solid #10b981; border-radius: 8px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between;">`
  );
  parts.push(`<div>`);
  parts.push(
    `<span style="font-size: 12px; font-weight: 700; color: #065f46; text-transform: uppercase; display: block; margin-bottom: 2px;">ចម្លើយចុងក្រោយ (Final Answer)</span>`
  );
  parts.push(
    `<span style="font-size: 18px; font-weight: 800; color: #047857; font-family: monospace;">${escapeHtml(
      problem.finalAnswer
    )}</span>`
  );
  parts.push(`</div>`);
  parts.push(
    `<span style="background: #10b981; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700;">សម្រេច ✓</span>`
  );
  parts.push(`</div>`);
  parts.push(`</div>`);

  // Section 7: Deterministic Verification (Stage 2 proof)
  if (problem.verification || problem.deterministicResult) {
    const isDetVerified = problem.deterministicResult?.isVerified !== false;
    parts.push(
      `<div class="verification-section" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 20px;">`
    );
    parts.push(
      `<h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #334155; display: flex; align-items: center; gap: 6px;">🛡️ ការពិនិត្យផ្ទៀងផ្ទាត់ដោយប្រព័ន្ធសុក្រឹត (Deterministic Verification)</h4>`
    );
    if (problem.deterministicResult) {
      parts.push(
        `<div style="font-size: 13px; color: #475569; margin-bottom: 6px;"><strong>លទ្ធផលផ្ទៀងផ្ទាត់៖</strong> <span style="font-weight: 700; color: ${
          isDetVerified ? "#059669" : "#dc2626"
        };">${escapeHtml(
          problem.deterministicResult.statusKhmer || (isDetVerified ? "ផ្ទៀងផ្ទាត់ត្រឹមត្រូវ ✓" : "មានភាពខុសគ្នា ✗")
        )}</span></div>`
      );
      parts.push(
        `<div style="font-size: 13px; color: #475569; margin-bottom: 6px;"><strong>វិធីផ្ទៀងផ្ទាត់៖</strong> ${escapeHtml(
          problem.deterministicResult.verificationMethodKhmer ||
            problem.deterministicResult.verificationMethod
        )}</div>`
      );
      parts.push(
        `<div style="font-size: 13px; color: #475569;"><strong>ចម្លើយដែលបានគណនា៖</strong> <span style="font-family: monospace; font-weight: 700;">${escapeHtml(
          problem.deterministicResult.computedAnswerKhmer ||
            problem.deterministicResult.computedAnswer
        )}</span></div>`
      );
    } else if (problem.verification) {
      parts.push(
        `<div style="font-size: 13px; color: #334155; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(
          problem.verification
        )}</div>`
      );
    }
    parts.push(`</div>`);
  }

  // Section 8: Ambiguities & Review Points (Zero-Guessing Invariant)
  const allReviewPoints = [
    ...(problem.ambiguousParts || []),
    ...(problem.reviewSuggestions || []),
    ...(problem.deterministicResult?.reviewPoints || []),
  ];

  if (allReviewPoints.length > 0) {
    parts.push(
      `<div class="review-points-section" style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin-bottom: 10px;">`
    );
    parts.push(
      `<h4 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #92400e;">⚠️ ចំណុចដែលត្រូវឱ្យអ្នកប្រើពិនិត្យឡើងវិញ (Points for Review):</h4>`
    );
    parts.push(`<ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #78350f;">`);
    for (const pt of allReviewPoints) {
      parts.push(`<li style="margin-bottom: 4px;">${escapeHtml(pt)}</li>`);
    }
    parts.push(`</ul>`);
    parts.push(`</div>`);
  }

  // Footer metadata
  parts.push(
    `<div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center;">`
  );
  parts.push(
    `DYT ECOSYSTEM • កម្មវិធីដោះស្រាយគណិតវិទ្យាថ្នាក់បឋមសិក្សា (Module 04: Khmer Math Solver)`
  );
  parts.push(`</div>`);

  parts.push(`</div>`);

  return sanitizeHtml(parts.join(""));
}

/**
 * Plain-text fallback for clipboard writing
 */
export function renderCanonicalSolutionPlainText(
  problem: MathSolverProblem,
  options?: RenderSolutionOptions
): string {
  const lines: string[] = [];

  lines.push("==================================================");
  lines.push(options?.documentTitle || "ដំណោះស្រាយគណិតវិទ្យា — ថ្នាក់បឋមសិក្សា");
  if (options?.gradeTitle) lines.push(`កម្រិតថ្នាក់៖ ${options.gradeTitle}`);
  if (options?.solverModeTitle) lines.push(`ទម្រង់៖ ${options.solverModeTitle}`);
  lines.push("==================================================");
  lines.push("");

  if (problem.visualInterpretation) {
    const vi = problem.visualInterpretation;
    lines.push("🔍 ការបកស្រាយរូបភាព (Visual Interpretation):");
    lines.push(`- វត្ថុដែលបានស្គាល់៖ ${vi.recognizedObjects}`);
    lines.push(`- ចំនួនវត្ថុ៖ ${vi.objectCount}`);
    if (vi.arrangement) lines.push(`- របៀបរៀបចំ៖ ${vi.arrangement}`);
    lines.push(`- ប្រមាណវិធីដែលបានបកស្រាយ៖ ${vi.interpretedOperation}`);
    lines.push(`- កម្រិតទំនុកចិត្ត៖ ${vi.confidenceKhmer || vi.confidence}`);
    lines.push("");
  }

  lines.push("១. ប្រធានលំហាត់៖");
  lines.push(problem.extractedProblem);
  lines.push("");

  if (problem.given) lines.push(`អ្វីដែលគេឱ្យ៖ ${problem.given}`);
  if (problem.toFind) lines.push(`អ្វីដែលត្រូវរក៖ ${problem.toFind}`);
  if (problem.formulas) lines.push(`រូបមន្តដែលត្រូវប្រើ៖ ${problem.formulas}`);
  if (problem.given || problem.toFind || problem.formulas) lines.push("");

  if (problem.extractedAnswer) {
    lines.push(`ចម្លើយសិស្សក្នុងរូបភាព៖ ${problem.extractedAnswer}`);
    lines.push(`ស្ថានភាព៖ ${problem.answerStatusKhmer || problem.answerStatus}`);
    if (problem.incorrectStep) lines.push(`ជំហានដែលខុស៖ ${problem.incorrectStep}`);
    if (problem.correctedStep) lines.push(`ជំហានត្រឹមត្រូវ៖ ${problem.correctedStep}`);
    lines.push("");
  }

  lines.push("២. វិធីដោះស្រាយលម្អិត៖");
  lines.push(problem.solutionKhmer || problem.solution);
  lines.push("");

  if (problem.alignedWorking) {
    lines.push("ការគណនាតាមជួរឈរ (Vertical Calculation):");
    lines.push(problem.alignedWorking);
    lines.push("");
  }

  lines.push(`ចម្លើយចុងក្រោយ៖ ${problem.finalAnswer}`);
  lines.push("");

  if (problem.deterministicResult) {
    lines.push("🛡️ ការពិនិត្យផ្ទៀងផ្ទាត់ដោយប្រព័ន្ធសុក្រឹត៖");
    lines.push(`- លទ្ធផល៖ ${problem.deterministicResult.statusKhmer}`);
    lines.push(`- វិធី៖ ${problem.deterministicResult.verificationMethodKhmer}`);
    lines.push(`- ចម្លើយគណនា៖ ${problem.deterministicResult.computedAnswerKhmer}`);
    lines.push("");
  } else if (problem.verification) {
    lines.push(`ការពិនិត្យផ្ទៀងផ្ទាត់៖ ${problem.verification}`);
    lines.push("");
  }

  const allReview = [
    ...(problem.ambiguousParts || []),
    ...(problem.reviewSuggestions || []),
  ];
  if (allReview.length > 0) {
    lines.push("⚠️ ចំណុចដែលត្រូវពិនិត្យឡើងវិញ៖");
    allReview.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Universal Dual-Type Clipboard Copy
 * Writes both text/html and text/plain to clipboard if supported,
 * falling back to navigator.clipboard.writeText.
 */
export async function copyCanonicalSolutionToClipboard(
  problem: MathSolverProblem,
  options?: RenderSolutionOptions
): Promise<boolean> {
  const htmlContent = renderCanonicalSolutionHtml(problem, options);
  const textContent = renderCanonicalSolutionPlainText(problem, options);

  if (typeof window === "undefined" || !navigator.clipboard) {
    return false;
  }

  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      const blobHtml = new Blob([htmlContent], { type: "text/html" });
      const blobText = new Blob([textContent], { type: "text/plain" });
      const item = new ClipboardItem({
        "text/html": blobHtml,
        "text/plain": blobText,
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (err) {
    console.warn("ClipboardItem write failed, falling back to text copy:", err);
  }

  // Fallback to text copy
  try {
    await navigator.clipboard.writeText(htmlContent);
    return true;
  } catch (err) {
    console.error("Clipboard copy failed completely:", err);
    return false;
  }
}
