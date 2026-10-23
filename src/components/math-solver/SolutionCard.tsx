"use client";

import React, { useState, useRef } from "react";
import {
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  BookOpen,
  Code2,
  Download,
  Image as ImageIcon,
  X,
  AlertTriangle,
} from "lucide-react";
import type { MathSolverProblem, SolverMode } from "@/app/api/math-solver/route";
import {
  copyCanonicalSolutionToClipboard,
  copyCanonicalSolutionPlainTextToClipboard,
  renderCanonicalSolutionHtml,
  copyTextFallback,
  isWordProblem,
  downloadSolutionAsPng,
} from "@/lib/math-solution-html";
import { ColumnCalculationView } from "./ColumnCalculationView";
import { detectAndBuildStructuredCalculation } from "@/lib/column-calculation";

interface SolutionCardProps {
  problem: MathSolverProblem;
  index: number;
  totalProblems: number;
  gradeTitle?: string;
  solverModeTitle?: string;
  solverMode?: SolverMode;
}

function renderStepCards(rawExplanation: string) {
  const blocks = rawExplanation
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 text-sm sm:text-base text-slate-800 whitespace-pre-wrap leading-relaxed shadow-sm">
        {rawExplanation}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        const isCheck = block.includes("ពិនិត្យ") || block.includes("ផ្ទៀងផ្ទាត់");
        const titleMatch = block.match(/^(?:([០-៩\d]+\.|\s*ជំហានទី\s*[០-៩\d]+)[—:៖-]?\s*)([^\n]+)/);
        const badgeText = isCheck
          ? "ពិនិត្យចម្លើយ ✓"
          : titleMatch
          ? titleMatch[1].replace(/[.:]/g, "").trim()
          : `ជំហានទី ${idx + 1}`;
        const content = titleMatch ? block.slice(titleMatch[0].length).trim() : block;

        return (
          <div
            key={idx}
            className={`step-card rounded-xl border p-4 sm:p-5 text-sm sm:text-base leading-relaxed shadow-sm transition-all ${
              isCheck
                ? "border-emerald-300 bg-emerald-50/60 text-slate-900"
                : "border-slate-200 bg-white text-slate-800"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`rounded-md px-2.5 py-0.5 text-xs font-bold ${
                  isCheck
                    ? "bg-emerald-200 text-emerald-900"
                    : "bg-indigo-100 text-indigo-900"
                }`}
              >
                {badgeText}
              </span>
              {titleMatch && (
                <span className="font-bold text-sm text-slate-900">
                  {titleMatch[2].trim()}
                </span>
              )}
            </div>
            <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
              {content || block}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SolutionCard({
  problem,
  index,
  totalProblems,
  gradeTitle,
  solverModeTitle,
  solverMode,
}: SolutionCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showHtmlModal, setShowHtmlModal] = useState(false);
  const [copiedModalHtml, setCopiedModalHtml] = useState(false);

  // Determine effective mode strictly
  const effectiveMode: SolverMode =
    solverMode ||
    problem.mode ||
    (solverModeTitle?.toLowerCase().includes("verify")
      ? "verify"
      : solverModeTitle?.toLowerCase().includes("generate")
      ? "generate"
      : problem.extractedAnswer
      ? "verify"
      : !problem.finalAnswer && problem.solutionKhmer
      ? "generate"
      : "solve");

  const isMode1 = effectiveMode === "solve";
  const isMode2 = effectiveMode === "generate";
  const isMode3 = effectiveMode === "verify";

  // Build or retrieve structured calculation for place-value alignment
  const structuredCalc =
    problem.structuredCalculation ||
    detectAndBuildStructuredCalculation(
      problem.extractedProblem,
      problem.finalAnswer,
      problem.verticalLines
    );

  // Calculate clean MoEYS textbook grade badge (never generic 'ស្វ័យប្រវត្តិ')
  const effectiveGradeBadge =
    gradeTitle && gradeTitle !== "ស្វ័យប្រវត្តិ"
      ? gradeTitle
      : problem.inferredGradeKhmer && problem.inferredGradeKhmer !== "ស្វ័យប្រវត្តិ"
      ? problem.inferredGradeKhmer
      : "ថ្នាក់បឋមសិក្សា";

  // Check if student answer is genuinely present
  const hasStudentAnswer = Boolean(
    problem.extractedAnswer &&
      problem.extractedAnswer.trim() !== "" &&
      problem.extractedAnswer.trim() !== "គ្មាន" &&
      !problem.extractedAnswer.includes("មិនទាន់មានចម្លើយរបស់សិស្ស")
  );

  // Pre-generate raw HTML source for copy / modal
  const htmlSource = renderCanonicalSolutionHtml(problem, {
    gradeTitle: effectiveGradeBadge,
    solverModeTitle,
    solverMode: effectiveMode,
  });

  // Download high-resolution PNG image (2x scale)
  const handleDownloadPng = async () => {
    if (!cardRef.current || isDownloadingImage) return;
    setIsDownloadingImage(true);
    try {
      const fileName = `plp-math-solution-${problem.id || `problem-${index + 1}`}.png`;
      await downloadSolutionAsPng(cardRef.current, fileName);
    } finally {
      setIsDownloadingImage(false);
    }
  };

  // Copy plain text ("ចម្លងអត្ថបទ")
  const handleCopyText = async () => {
    const success = await copyCanonicalSolutionPlainTextToClipboard(problem, {
      gradeTitle: effectiveGradeBadge,
      solverModeTitle,
      solverMode: effectiveMode,
    });
    if (success) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  // Copy HTML source ("ចម្លងកូដ HTML")
  const handleCopyHtml = async () => {
    try {
      const success = await copyCanonicalSolutionToClipboard(problem, {
        gradeTitle: effectiveGradeBadge,
        solverModeTitle,
        solverMode: effectiveMode,
      });
      if (success) {
        setCopiedHtml(true);
        setTimeout(() => setCopiedHtml(false), 2500);
      }
    } catch (err) {
      console.error("Failed to copy HTML:", err);
    }
  };

  // Download HTML ("ទាញយកឯកសារ HTML")
  const handleDownloadHtml = () => {
    try {
      const blob = new Blob([htmlSource], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plp-math-solution-${problem.id || "worksheet"}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download HTML:", err);
    }
  };

  const handleCopyFromModal = () => {
    const success = copyTextFallback(htmlSource);
    if (success) {
      setCopiedModalHtml(true);
      setTimeout(() => setCopiedModalHtml(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Primary Educational PLP Worksheet Card */}
      <article
        ref={cardRef}
        className="solution plp-solution-sheet rounded-2xl border border-amber-200/90 bg-[#FFFEFC] text-slate-800 shadow-md p-6 sm:p-8 max-w-3xl mx-auto space-y-6 font-sans transition-all"
        role="region"
        aria-label="សន្លឹកដំណោះស្រាយគណិតវិទ្យា PLP"
      >
        {/* Subtle PLP Header */}
        <header className="solution-header plp-header border-b-2 border-indigo-100/80 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="plp-brand text-xs font-bold uppercase tracking-wider text-indigo-700">
              PLP Math Content
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5 tracking-tight">
              {totalProblems > 1 ? `សន្លឹកដំណោះស្រាយគណិតវិទ្យា (លំហាត់ទី ${index + 1})` : "សន្លឹកដំណោះស្រាយគណិតវិទ្យា"}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge-grade rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-800">
              {effectiveGradeBadge}
            </span>
            <span className="badge-mode rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-900">
              {isMode1 ? "ដោះស្រាយលំហាត់ (ចម្លើយ)" : isMode2 ? "បង្កើតដំណោះស្រាយ (វិធីដោះស្រាយ)" : "ដោះស្រាយ + ផ្ទៀងផ្ទាត់ (ពេញលេញ)"}
            </span>
          </div>
        </header>

        {/* 1. Problem Statement (Mandatory in all modes) */}
        <section className="problem-statement-section space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
            <BookOpen className="h-4 w-4 text-indigo-600 shrink-0" />
            <span>ប្រធានលំហាត់</span>
          </div>
          <div className="problem-box rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-base font-semibold text-slate-900 font-mono leading-relaxed whitespace-pre-wrap">
            {problem.extractedProblem}
          </div>
        </section>

        {/* 2. Educational Framework: Given, To Find, Formulas (Mode 2 & 3 only FOR WORD PROBLEMS) */}
        {!isMode1 && isWordProblem(problem.extractedProblem) && (problem.given || problem.toFind || problem.formulas) && (
          <section className="framework-box rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2 text-xs sm:text-sm text-slate-700">
            {problem.given && (
              <div>
                <strong className="text-indigo-900 font-semibold">អ្វីដែលគេឱ្យ (Given)៖</strong>{" "}
                <span className="text-slate-800">{problem.given}</span>
              </div>
            )}
            {problem.toFind && (
              <div>
                <strong className="text-indigo-900 font-semibold">អ្វីដែលត្រូវរក (To Find)៖</strong>{" "}
                <span className="text-slate-800">{problem.toFind}</span>
              </div>
            )}
            {problem.formulas && (
              <div>
                <strong className="text-indigo-900 font-semibold">រូបមន្តដែលត្រូវប្រើ (Formulas)៖</strong>{" "}
                <span className="font-mono font-bold text-indigo-900">{problem.formulas}</span>
              </div>
            )}
          </section>
        )}

        {/* 3. Student Answer Review (Mode 3 ONLY - Shown ONLY when valid answer exists) */}
        {isMode3 && hasStudentAnswer && (
          <section className="student-review rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 text-xs sm:text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">ចម្លើយរបស់សិស្សក្នុងរូបភាព៖</span>
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                  problem.answerStatus === "correct"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-rose-100 text-rose-800 border border-rose-300"
                }`}
              >
                {problem.answerStatusKhmer || (problem.answerStatus === "correct" ? "ត្រឹមត្រូវ ✓" : "មិនទាន់ត្រឹមត្រូវ ✗")}
              </span>
            </div>
            <div className="font-mono font-bold text-slate-800 text-sm">
              {problem.extractedAnswer}
            </div>
            {problem.answerStatus === "incorrect" && (
              <div className="mt-2 pt-2 border-t border-slate-200 space-y-1 text-xs text-rose-900">
                {problem.incorrectStep && <div><strong>ជំហានដែលខុស៖</strong> {problem.incorrectStep}</div>}
                {problem.errorExplanationKhmer && <div><strong>ការពន្យល់កំហុស៖</strong> {problem.errorExplanationKhmer}</div>}
                {problem.correctedStep && <div><strong>ជំហានត្រឹមត្រូវ៖</strong> {problem.correctedStep}</div>}
              </div>
            )}
          </section>
        )}

        {/* 4. Step-by-Step Solution & Aligned Column Working */}
        {/* STRICT CONTRACT: Mode 2 and Mode 3 ONLY. In Mode 1, this must NOT be rendered. */}
        {!isMode1 && (problem.solutionKhmer || problem.solution || problem.verticalLines || problem.alignedWorking) && (
          <section className="solution-body-section space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              វិធីដោះស្រាយលម្អិត
            </h4>
            {(problem.solutionKhmer || problem.solution) && (
              <div className="solution-steps">
                {renderStepCards(problem.solutionKhmer || problem.solution || "")}
              </div>
            )}

            {/* Place-value aligned column calculation & fallback */}
            {(structuredCalc || Boolean(problem.verticalLines && problem.verticalLines.length > 0) || Boolean(problem.alignedWorking)) && (
              <div className="rounded-xl border border-amber-200/90 bg-[#FEFEFA] p-4 sm:p-5 overflow-x-auto space-y-3 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  ការគណនាតាមជួរឈរ (Vertical Calculation)៖
                </span>
                {structuredCalc && (
                  <div className="py-2" data-testid="structured-column-calculation">
                    <ColumnCalculationView calculation={structuredCalc} theme="worksheet" />
                  </div>
                )}
                {/* Fallback pre for regression testing & raw monospace copy with display:none */}
                <pre
                  data-testid="vertical-calculation-pre"
                  className="vertical-calc font-mono text-sm sm:text-base text-slate-800 leading-relaxed whitespace-pre font-semibold sr-only"
                  style={{
                    display: "none",
                    fontFamily: '"Noto Sans Khmer", "Kantumruy Pro", ui-monospace, SFMono-Regular, Menlo, monospace',
                    whiteSpace: "pre",
                  }}
                  aria-hidden="true"
                >
                  {problem.verticalLines && problem.verticalLines.length > 0
                    ? problem.verticalLines.join("\n")
                    : problem.alignedWorking}
                </pre>
              </div>
            )}
          </section>
        )}

        {/* 5. Final Answer Card */}
        {/* STRICT CONTRACT:
            - Mode 1: Rendered!
            - Mode 2: STRICTLY NOT RENDERED!
            - Mode 3: Rendered!
        */}
        {!isMode2 && problem.finalAnswer && (
          <section className="final-answer-section space-y-2" data-testid="final-answer-card">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
              {isMode1 ? "ចម្លើយ" : "ចម្លើយចុងក្រោយ"}
            </span>
            <div className="final-answer-box rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 sm:p-5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <span className="text-xl sm:text-2xl font-bold text-emerald-950 font-mono">
                  {problem.finalAnswer}
                </span>
              </div>
              <span className="badge-status rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1 text-xs font-bold text-emerald-800">
                សម្រេច ✓
              </span>
            </div>
          </section>
        )}

        {/* 6. Collapsed Advanced Technical Settings / Verifier Details */}
        {((problem.ambiguousParts && problem.ambiguousParts.length > 0) ||
          problem.deterministicResult) && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails((p) => !p)}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 font-medium transition-colors"
            >
              <span>ការកំណត់កម្រិតខ្ពស់ &amp; ពត៌មានបច្ចេកទេស (Advanced Settings)</span>
              {showTechnicalDetails ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {showTechnicalDetails && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs font-mono text-slate-600">
                {problem.deterministicResult && (
                  <div>
                    <div>ការផ្ទៀងផ្ទាត់ដោយប្រព័ន្ធ (Deterministic Verified): {String(problem.deterministicResult.isVerified)}</div>
                    <div>វិធីសាស្ត្រ: {problem.deterministicResult.verificationMethod}</div>
                    {problem.deterministicResult.computedAnswer && (
                      <div>ចម្លើយដែលគណនា: {problem.deterministicResult.computedAnswer}</div>
                    )}
                  </div>
                )}
                {problem.ambiguousParts && problem.ambiguousParts.length > 0 && (
                  <div className="space-y-1 text-amber-800">
                    <span className="font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      ចំណុចមិនច្បាស់លាស់៖
                    </span>
                    {problem.ambiguousParts.map((p, i) => (
                      <div key={i}>• {p}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Subtle PLP Footer */}
        <footer className="footer plp-footer border-t border-amber-200/80 pt-4 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
          <div className="font-semibold text-indigo-900">
            PLP Math Content · DYT ECOSYSTEM
          </div>
          <div className="italic text-slate-400">
            សម្រាប់ការសិក្សា
          </div>
        </footer>
      </article>

      {/* Action Buttons: ទាញយកជារូបភាព (PNG), ចម្លងអត្ថបទ, ចម្លងកូដ HTML, ទាញយកឯកសារ HTML, មើល HTML Source */}
      <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-2 px-2 py-1">
        <div className="text-xs text-slate-400 font-medium">
          {copiedHtml && (
            <span className="text-emerald-400 inline-flex items-center gap-1.5 animate-pulse">
              <Check className="h-3.5 w-3.5" />
              បានចម្លងកូដ HTML រួចរាល់!
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 0. Download High-Res PNG Image */}
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isDownloadingImage}
            title="Download Image PNG"
            aria-label="Download Image PNG"
            data-testid="download-image-png-button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/50 bg-emerald-600/20 px-3.5 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/40 hover:text-white transition-colors shadow-sm"
          >
            <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
            <span>{isDownloadingImage ? "កំពុងទាញយក..." : "ទាញយកជារូបភាព (PNG)"}</span>
          </button>

          {/* 1. Copy Clean Text */}
          <button
            type="button"
            onClick={handleCopyText}
            title="Copy Clean Text"
            aria-label="Copy Clean Text"
            data-testid="copy-clean-text-button"
            data-label="Copy Clean Text"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-violet-500/50 hover:text-white transition-colors shadow-sm"
          >
            {copiedText ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>បានចម្លងអត្ថបទស្អាត!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                <span className="sr-only">Copy Clean Text</span>
                <span>ចម្លងអត្ថបទស្អាត</span>
              </>
            )}
          </button>

          {/* 2. Copy as HTML Source (Copy Styled HTML) */}
          <button
            type="button"
            onClick={handleCopyHtml}
            title="Copy Styled HTML"
            aria-label="Copy Styled HTML"
            data-testid="copy-styled-html-button"
            data-label="Copy Styled HTML"
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/50 bg-indigo-600/30 px-3.5 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/50 hover:text-white transition-colors shadow-sm"
          >
            <Code2 className="h-3.5 w-3.5 text-indigo-400" />
            <span className="sr-only">Copy Styled HTML</span>
            <span>ចម្លង HTML មានរចនាបទ</span>
            <span className="hidden">ចម្លងកូដ HTML</span>
          </button>

          {/* 3. Download HTML file */}
          <button
            type="button"
            onClick={handleDownloadHtml}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs font-medium text-slate-300 hover:border-violet-500/50 hover:text-white transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5 text-slate-400" />
            <span>ទាញយកឯកសារ HTML</span>
          </button>

          {/* 4. View HTML Source Modal */}
          <button
            type="button"
            onClick={() => setShowHtmlModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors shadow-sm"
          >
            <Eye className="h-3.5 w-3.5 text-slate-400" />
            <span>មើល HTML Source</span>
          </button>
        </div>
      </div>

      {/* HTML Source Preview Modal */}
      {showHtmlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-3xl rounded-2xl border border-indigo-500/40 bg-slate-950 p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">
                  កូដ HTML Source (HTML Code Preview)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHtmlModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              កូដ HTML ខាងក្រោមជាឯកសារពេញលេញ (Standalone Document) រួមមាន CSS, ភាសាខ្មែរ, និងគណនាតាមជួរឈរ។ អ្នកអាចចម្លងយកទៅបិទភ្ជាប់ក្នុង Code Editor ឬ Web Browser បាន។
            </p>

            <div className="flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <textarea
                readOnly
                value={htmlSource}
                rows={16}
                className="w-full h-full p-4 font-mono text-xs text-emerald-300 bg-transparent resize-none focus:outline-none overflow-auto whitespace-pre"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-500 font-mono">
                ទំហំកូដ៖ {new Blob([htmlSource]).size} bytes
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyFromModal}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  {copiedModalHtml ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>បានចម្លងកូដ!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>ចម្លងកូដ HTML</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowHtmlModal(false)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  បិទ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
