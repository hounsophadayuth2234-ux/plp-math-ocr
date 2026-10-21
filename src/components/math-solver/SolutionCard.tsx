"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Eye,
  BookOpen,
  Code2,
  Sparkles,
  Download,
  X,
} from "lucide-react";
import type { MathSolverProblem, SolverMode } from "@/app/api/math-solver/route";
import {
  copyCanonicalSolutionToClipboard,
  copyCanonicalSolutionPlainTextToClipboard,
  renderCanonicalSolutionHtml,
  copyTextFallback,
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

export function SolutionCard({
  problem,
  index,
  totalProblems,
  gradeTitle,
  solverModeTitle,
  solverMode,
}: SolutionCardProps) {
  const [copiedText, setCopiedText] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [copiedModalHtml, setCopiedModalHtml] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showAmbiguous, setShowAmbiguous] = useState(true);
  const [showHtmlModal, setShowHtmlModal] = useState(false);

  // Determine effective mode
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

  const structuredCalc =
    problem.structuredCalculation ||
    detectAndBuildStructuredCalculation(
      problem.extractedProblem,
      problem.finalAnswer,
      problem.verticalLines
    );

  // Pre-generate raw HTML source for copy / modal
  const htmlSource = renderCanonicalSolutionHtml(problem, {
    gradeTitle,
    solverModeTitle,
    solverMode: effectiveMode,
  });

  // Copy plain text ("ចម្លងអត្ថបទ")
  const handleCopyText = async () => {
    const success = await copyCanonicalSolutionPlainTextToClipboard(problem, {
      gradeTitle,
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
        gradeTitle,
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
      a.download = `math-solution-${problem.id || "problem"}.html`;
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

  const getConfidenceBadge = () => {
    switch (problem.confidence) {
      case "high":
        return {
          bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
          icon: <CheckCircle2 className="h-3.5 w-3.5" />,
          label: problem.confidenceKhmer || "កម្រិតទំនុកចិត្តខ្ពស់",
        };
      case "medium":
        return {
          bg: "bg-amber-500/15 border-amber-500/30 text-amber-300",
          icon: <AlertTriangle className="h-3.5 w-3.5" />,
          label: problem.confidenceKhmer || "កម្រិតទំនុកចិត្តមធ្យម — សូមផ្ទៀងផ្ទាត់",
        };
      case "low":
        return {
          bg: "bg-rose-500/15 border-rose-500/30 text-rose-300",
          icon: <XCircle className="h-3.5 w-3.5" />,
          label: problem.confidenceKhmer || "កម្រិតទំនុកចិត្តទាប — ត្រូវកែសម្រួលរូបភាព",
        };
      default:
        return {
          bg: "bg-slate-500/15 border-slate-500/30 text-slate-300",
          icon: <Eye className="h-3.5 w-3.5" />,
          label: "Unknown",
        };
    }
  };

  const getAnswerStatusBadge = () => {
    if (!problem.answerStatus) return null;
    switch (problem.answerStatus) {
      case "correct":
        return {
          bg: "bg-emerald-500/20 border-emerald-500/40",
          textColor: "text-emerald-300",
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
          label: "ត្រឹមត្រូវ ✓",
        };
      case "incorrect":
        return {
          bg: "bg-rose-500/20 border-rose-500/40",
          textColor: "text-rose-300",
          icon: <XCircle className="h-5 w-5 text-rose-400" />,
          label: "មិនទាន់ត្រឹមត្រូវ ✗",
        };
      case "unverifiable":
        return {
          bg: "bg-amber-500/20 border-amber-500/40",
          textColor: "text-amber-300",
          icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
          label: "មិនអាចផ្ទៀងផ្ទាត់បាន",
        };
      default:
        return null;
    }
  };

  const confidenceBadge = getConfidenceBadge();
  const answerBadge = getAnswerStatusBadge();

  return (
    <div className="rounded-xl border border-violet-500/25 bg-slate-900/60 backdrop-blur-sm overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-violet-500/20 bg-violet-950/30 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/20 text-sm font-bold text-violet-300 font-mono">
            {index + 1}
          </span>
          <h3 className="text-sm font-semibold text-white">
            {totalProblems > 1 ? `លំហាត់ទី ${index + 1}` : "លំហាត់"}
          </h3>
          {problem.inferredGradeKhmer && (
            <span className="rounded-md bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-xs text-indigo-300 font-medium">
              {problem.inferredGradeKhmer}
            </span>
          )}
          <span className="rounded-md bg-violet-900/40 border border-violet-500/30 px-2 py-0.5 text-xs text-violet-300 font-mono uppercase">
            {effectiveMode === "solve"
              ? "MODE 1: ចម្លើយ"
              : effectiveMode === "generate"
              ? "MODE 2: វិធីដោះស្រាយ"
              : "MODE 3: ដោះស្រាយ+ផ្ទៀងផ្ទាត់"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${confidenceBadge.bg}`}
          >
            {confidenceBadge.icon}
            {confidenceBadge.label}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* 1. Visual Interpretation (Mode 2 or Mode 3 only) */}
        {!isMode1 && problem.visualInterpretation && (
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              ការបកស្រាយរូបភាព (Visual Interpretation)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-cyan-500/20 bg-slate-950/60 p-2.5">
                <span className="text-slate-400 block mb-0.5">វត្ថុដែលបានស្គាល់៖</span>
                <span className="font-semibold text-cyan-100">
                  {problem.visualInterpretation.recognizedObjects}
                </span>
              </div>
              <div className="rounded border border-cyan-500/20 bg-slate-950/60 p-2.5">
                <span className="text-slate-400 block mb-0.5">ចំនួនវត្ថុ៖</span>
                <span className="font-semibold font-mono text-cyan-100">
                  {problem.visualInterpretation.objectCount}
                </span>
              </div>
              {problem.visualInterpretation.arrangement && (
                <div className="rounded border border-cyan-500/20 bg-slate-950/60 p-2.5">
                  <span className="text-slate-400 block mb-0.5">របៀបរៀបចំ៖</span>
                  <span className="font-semibold text-cyan-100">
                    {problem.visualInterpretation.arrangement}
                  </span>
                </div>
              )}
              <div className="rounded border border-cyan-500/20 bg-slate-950/60 p-2.5">
                <span className="text-slate-400 block mb-0.5">ប្រមាណវិធីដែលបានបកស្រាយ៖</span>
                <span className="font-bold text-violet-300 font-mono">
                  {problem.visualInterpretation.interpretedOperation}
                </span>
              </div>
            </div>

            {problem.visualInterpretation.possibleAlternatives &&
              problem.visualInterpretation.possibleAlternatives.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-950/30 p-2.5 text-xs text-amber-200">
                  <span className="font-bold text-amber-300 block mb-1">
                    ការបកស្រាយផ្សេងទៀតដែលអាចមាន (សូមបញ្ជាក់)៖
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-100/90">
                    {problem.visualInterpretation.possibleAlternatives.map((alt, i) => (
                      <li key={i}>{alt}</li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        )}

        {/* 2. Extracted Problem (Mandatory in all modes) */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-violet-400" />
            ប្រធានលំហាត់
          </h4>
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed font-mono">
            {problem.extractedProblem}
          </div>
        </div>

        {/* 3. Formal Framework (Mode 2 & Mode 3 only) */}
        {!isMode1 && (problem.given || problem.toFind || problem.formulas) && (
          <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/15 p-4 space-y-2.5 text-xs">
            {problem.given && (
              <div>
                <span className="font-bold text-indigo-300 uppercase">អ្វីដែលគេឱ្យ (Given):</span>
                <p className="mt-1 text-slate-200">{problem.given}</p>
              </div>
            )}
            {problem.toFind && (
              <div>
                <span className="font-bold text-indigo-300 uppercase">អ្វីដែលត្រូវរក (To Find):</span>
                <p className="mt-1 text-slate-200">{problem.toFind}</p>
              </div>
            )}
            {problem.formulas && (
              <div>
                <span className="font-bold text-indigo-300 uppercase">រូបមន្តដែលត្រូវប្រើ:</span>
                <p className="mt-1 font-mono text-indigo-200 font-semibold">{problem.formulas}</p>
              </div>
            )}
          </div>
        )}

        {/* 4. Student Existing Answer & Verification (Mode 3 only) */}
        {isMode3 && problem.extractedAnswer && answerBadge && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              ចម្លើយដែលមានក្នុងរូបភាព
            </h4>
            <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
              <div className="flex items-start gap-3">
                {answerBadge.icon}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-200 font-mono">
                      {problem.extractedAnswer}
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${answerBadge.bg} ${answerBadge.textColor}`}
                    >
                      {answerBadge.label}
                    </span>
                  </div>

                  {problem.answerStatus === "incorrect" && (
                    <div className="mt-2 space-y-2 rounded-lg border border-rose-500/20 bg-rose-950/30 p-3">
                      {problem.incorrectStep && (
                        <div>
                          <span className="text-[11px] font-bold text-rose-400 uppercase">
                            ជំហានដែលខុស៖
                          </span>
                          <p className="mt-1 text-xs text-rose-200 whitespace-pre-wrap">
                            {problem.incorrectStep}
                          </p>
                        </div>
                      )}
                      {problem.errorExplanationKhmer && (
                        <div>
                          <span className="text-[11px] font-bold text-rose-300 uppercase">
                            ការពន្យល់កំហុស៖
                          </span>
                          <p className="mt-1 text-xs text-rose-100 whitespace-pre-wrap">
                            {problem.errorExplanationKhmer}
                          </p>
                        </div>
                      )}
                      {problem.correctedStep && (
                        <div>
                          <span className="text-[11px] font-bold text-emerald-400 uppercase">
                            ជំហានត្រឹមត្រូវ៖
                          </span>
                          <p className="mt-1 text-xs text-emerald-200 whitespace-pre-wrap">
                            {problem.correctedStep}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Step-by-Step Solution & Aligned Working */}
        {/* STRICT CONTRACT: Mode 2 and Mode 3 ONLY. In Mode 1, this must NOT be rendered. */}
        {!isMode1 && (problem.solutionKhmer || problem.solution || problem.verticalLines || problem.alignedWorking) && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              វិធីដោះស្រាយលម្អិត
            </h4>
            {(problem.solutionKhmer || problem.solution) && (
              <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-4 text-sm text-slate-100 whitespace-pre-wrap leading-loose">
                {problem.solutionKhmer || problem.solution}
              </div>
            )}

            {/* Place-value aligned column calculation & monospace fallback */}
            {(structuredCalc || Boolean(problem.verticalLines && problem.verticalLines.length > 0) || Boolean(problem.alignedWorking)) && (
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 overflow-x-auto space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-sans">
                  ការគណនាតាមជួរឈរ (Vertical Calculation):
                </span>
                {structuredCalc && (
                  <div className="py-2" data-testid="structured-column-calculation">
                    <ColumnCalculationView calculation={structuredCalc} />
                  </div>
                )}
                <pre
                  data-testid="vertical-calculation-pre"
                  className="font-mono text-sm text-emerald-300 leading-relaxed whitespace-pre font-semibold"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    whiteSpace: "pre",
                  }}
                >
                  {problem.verticalLines && problem.verticalLines.length > 0
                    ? problem.verticalLines.join("\n")
                    : problem.alignedWorking}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 6. Final Answer */}
        {/* STRICT CONTRACT:
            - Mode 1: Rendered!
            - Mode 2: STRICTLY NOT RENDERED!
            - Mode 3: Rendered!
        */}
        {!isMode2 && problem.finalAnswer && (
          <div className="space-y-2" data-testid="final-answer-card">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              ចម្លើយចុងក្រោយ
            </h4>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <span className="text-base font-bold text-emerald-200 font-mono">
                  {problem.finalAnswer}
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-bold text-emerald-300">
                សម្រេច ✓
              </span>
            </div>
          </div>
        )}

        {/* 7. Deterministic Verification Card */}
        {(isMode1 || isMode3) && (problem.verification || problem.deterministicResult) && (
          <div className="rounded-lg border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowVerification((p) => !p)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                ការពិនិត្យផ្ទៀងផ្ទាត់ដោយប្រព័ន្ធសុក្រឹត (Deterministic Verifier)
              </span>
              {showVerification ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showVerification && (
              <div className="border-t border-slate-700 p-4 space-y-2.5 bg-slate-950/40 text-xs">
                {problem.deterministicResult && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ស្ថានភាពផ្ទៀងផ្ទាត់៖</span>
                      <span
                        className={`font-bold ${
                          problem.deterministicResult.isVerified
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {problem.deterministicResult.statusKhmer}
                      </span>
                    </div>
                    {isMode3 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">វិធីផ្ទៀងផ្ទាត់៖</span>
                        <span className="text-slate-200 font-medium">
                          {problem.deterministicResult.verificationMethodKhmer ||
                            problem.deterministicResult.verificationMethod}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ចម្លើយដែលបានគណនា៖</span>
                      <span className="font-mono font-bold text-emerald-300">
                        {problem.deterministicResult.computedAnswerKhmer ||
                          problem.deterministicResult.computedAnswer}
                      </span>
                    </div>
                  </div>
                )}
                {problem.verification && (
                  <div className="mt-2 pt-2 border-t border-slate-800 text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {problem.verification}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 8. Ambiguous Parts / Review Points */}
        {((problem.ambiguousParts && problem.ambiguousParts.length > 0) ||
          (problem.deterministicResult?.reviewPoints &&
            problem.deterministicResult.reviewPoints.length > 0)) && (
          <div className="rounded-lg border border-amber-500/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAmbiguous((p) => !p)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-amber-300 hover:bg-amber-950/30 transition-colors"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                ចំណុចដែលត្រូវឱ្យអ្នកប្រើពិនិត្យឡើងវិញ (Zero-Guessing Review Points)
              </span>
              {showAmbiguous ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showAmbiguous && (
              <div className="border-t border-amber-500/20 p-4 space-y-2 bg-amber-950/20">
                {[
                  ...(problem.ambiguousParts || []),
                  ...(problem.deterministicResult?.reviewPoints || []),
                ].map((part, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-200">
                    <span className="text-amber-400 font-mono shrink-0">•</span>
                    <span>{part}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons: ចម្លងអត្ថបទ, ចម្លងកូដ HTML, ទាញយកឯកសារ HTML, មើល HTML Source */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            {copiedHtml && (
              <span className="text-emerald-400 font-medium inline-flex items-center gap-1.5 animate-pulse">
                <Check className="h-3.5 w-3.5" />
                បានចម្លងកូដ HTML រួចរាល់!
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Copy Plain Text */}
            <button
              type="button"
              onClick={handleCopyText}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:border-violet-500/40 hover:text-violet-300 transition-colors"
            >
              {copiedText ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  បានចម្លង!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  ចម្លងអត្ថបទ
                </>
              )}
            </button>

            {/* 2. Copy as HTML Source */}
            <button
              type="button"
              onClick={handleCopyHtml}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/20 px-3.5 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 hover:text-white transition-colors shadow-sm"
            >
              <Code2 className="h-3.5 w-3.5 text-indigo-400" />
              ចម្លងកូដ HTML
            </button>

            {/* 3. Download HTML file */}
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:border-violet-500/40 hover:text-violet-300 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" />
              ទាញយកឯកសារ HTML
            </button>

            {/* 4. View HTML Source Modal */}
            <button
              type="button"
              onClick={() => setShowHtmlModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Eye className="h-3.5 w-3.5 text-slate-400" />
              មើល HTML Source
            </button>
          </div>
        </div>
      </div>

      {/* HTML Source Preview Modal */}
      {showHtmlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-3xl rounded-2xl border border-violet-500/40 bg-slate-950 p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
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
                      បានចម្លងកូដ!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      ចម្លងកូដ HTML
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
