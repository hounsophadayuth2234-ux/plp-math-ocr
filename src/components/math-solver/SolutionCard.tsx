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
} from "lucide-react";
import type { MathSolverProblem } from "@/app/api/math-solver/route";

interface SolutionCardProps {
  problem: MathSolverProblem;
  index: number;
  totalProblems: number;
}

export function SolutionCard({ problem, index, totalProblems }: SolutionCardProps) {
  const [copied, setCopied] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showAmbiguous, setShowAmbiguous] = useState(false);

  const handleCopy = async () => {
    const text = [
      `បញ្ហា៖ ${problem.extractedProblem}`,
      problem.extractedAnswer ? `ចម្លើយដែលមាន៖ ${problem.extractedAnswer}` : "",
      problem.answerStatusKhmer ? `ស្ថានភាព៖ ${problem.answerStatusKhmer}` : "",
      `វិធីដោះស្រាយ៖\n${problem.solutionKhmer || problem.solution}`,
      `ចម្លើយចុងក្រោយ៖ ${problem.finalAnswer}`,
      problem.verification ? `ពិនិត្យ៖ ${problem.verification}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn("Clipboard copy failed");
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
        {/* 1. Extracted Problem */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-violet-400" />
            ១. ប្រធានលំហាត់ដែលបានស្គាល់
          </h4>
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed font-mono">
            {problem.extractedProblem}
          </div>
        </div>

        {/* 2. Existing Answer & Verification */}
        {problem.extractedAnswer && answerBadge && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              ២. ចម្លើយដែលមានក្នុងរូបភាព
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

        {/* 3. Step-by-step Solution */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {problem.extractedAnswer ? "៤" : "៣"}. វិធីដោះស្រាយលម្អិត
          </h4>
          <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-4 text-sm text-slate-100 whitespace-pre-wrap leading-loose">
            {problem.solutionKhmer || problem.solution}
          </div>
        </div>

        {/* 4. Final Answer */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            ចម្លើយចុងក្រោយ
          </h4>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="text-base font-bold text-emerald-200 font-mono">
              {problem.finalAnswer}
            </span>
          </div>
        </div>

        {/* 5. Verification (collapsible) */}
        {problem.verification && (
          <div className="rounded-lg border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowVerification((p) => !p)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-violet-400" />
                ការពិនិត្យផ្ទៀងផ្ទាត់ (Verification)
              </span>
              {showVerification ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showVerification && (
              <div className="border-t border-slate-700 p-4 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                {problem.verification}
              </div>
            )}
          </div>
        )}

        {/* 6. Ambiguous parts */}
        {problem.ambiguousParts && problem.ambiguousParts.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAmbiguous((p) => !p)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-amber-300 hover:bg-amber-950/30 transition-colors"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                កន្លែងដែលអ្នកប្រើគួរពិនិត្យឡើងវិញ ({problem.ambiguousParts.length})
              </span>
              {showAmbiguous ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showAmbiguous && (
              <div className="border-t border-amber-500/20 p-4 space-y-2">
                {problem.ambiguousParts.map((part, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs text-amber-200"
                  >
                    <span className="text-amber-400 font-mono shrink-0">•</span>
                    <span>{part}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Copy button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-medium text-slate-300 hover:border-violet-500/40 hover:text-violet-300 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                បានចម្លង!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                ចម្លងចម្លើយ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
