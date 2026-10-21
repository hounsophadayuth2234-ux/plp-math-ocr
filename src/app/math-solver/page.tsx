"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calculator,
  Brain,
  Loader2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  XCircle,
  Download,
  Copy,
  Check,
  CheckCircle2,
  FileText,
  Sparkles,
  HelpCircle,
  BookOpen,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { SolverImageUpload } from "@/components/math-solver/SolverImageUpload";
import type {
  MathSolverResponse,
  MathSolverProblem,
  MathSolverError,
  SolverMode,
  DetailLevel,
} from "@/app/api/math-solver/route";

export default function MathSolverPage() {
  // Mode selection state
  const [solverMode, setSolverMode] = useState<SolverMode>("solve");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("step_by_step");

  // Input State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [extractedProblemText, setExtractedProblemText] = useState<string>("");
  const [existingAnswerText, setExistingAnswerText] = useState<string>("");
  const [ambiguousParts, setAmbiguousParts] = useState<string[]>([]);
  const [extractionConfidence, setExtractionConfidence] = useState<
    "high" | "medium" | "low" | null
  >(null);

  // Execution State
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [error, setError] = useState<{
    message: string;
    messageKhmer?: string;
    stage: "extract" | "solve";
    retryable?: boolean;
    requestId?: string;
  } | null>(null);

  // Result State
  const [result, setResult] = useState<MathSolverResponse | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Request & Abort Management
  const activeRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isBusy = isExtracting || isSolving;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Broadcast processing state to app shell if listening
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("ai-processing-change", {
          detail: { isProcessing: isBusy },
        })
      );
    }
  }, [isBusy]);

  // Cancel in-flight request
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsExtracting(false);
    setIsSolving(false);
  }, []);

  // Clear everything
  const handleClear = useCallback(() => {
    handleCancel();
    setImageFile(null);
    setExtractedProblemText("");
    setExistingAnswerText("");
    setAmbiguousParts([]);
    setExtractionConfidence(null);
    setResult(null);
    setError(null);
  }, [handleCancel]);

  // STAGE 1: Extract Problem Text from Image
  const handleExtract = useCallback(
    async (fileToUse?: File) => {
      const file = fileToUse || imageFile;
      if (!file || isBusy) return;

      if (abortControllerRef.current) abortControllerRef.current.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const currentRequestId = ++activeRequestIdRef.current;

      setIsExtracting(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("action", "extract");
        formData.append("image", file, file.name);

        const response = await fetch("/api/math-solver", {
          method: "POST",
          body: formData,
          signal: abortController.signal,
        });

        if (activeRequestIdRef.current !== currentRequestId) return;

        let data: (MathSolverResponse & Partial<MathSolverError>) | null = null;
        try {
          data = await response.json();
        } catch {
          // Non-JSON response
        }

        if (!response.ok) {
          const errData = data as MathSolverError | null;
          setError({
            stage: "extract",
            message: errData?.error || "Failed to extract text from image.",
            messageKhmer:
              errData?.errorKhmer ||
              "មិនអាចស្រង់អត្ថបទពីរូបភាពបានទេ។ សូមពិនិត្យរូបភាពរួចព្យាយាមម្ដងទៀត។",
            retryable: errData?.retryable ?? true,
            requestId: errData?.requestId,
          });
          return;
        }

        const successData = data as MathSolverResponse;
        const firstProblem = successData.problems?.[0];
        const extracted =
          firstProblem?.extractedProblem ||
          successData.extractedText ||
          "";

        setExtractedProblemText(extracted);
        if (firstProblem?.extractedAnswer) {
          setExistingAnswerText(firstProblem.extractedAnswer);
        }
        if (firstProblem?.ambiguousParts && firstProblem.ambiguousParts.length > 0) {
          setAmbiguousParts(firstProblem.ambiguousParts);
        } else {
          setAmbiguousParts([]);
        }
        setExtractionConfidence(firstProblem?.confidence || "medium");
        setError(null);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (activeRequestIdRef.current !== currentRequestId) return;

        setError({
          stage: "extract",
          message: err instanceof Error ? err.message : "Network error",
          messageKhmer:
            "ការតភ្ជាប់មានបញ្ហា។ សូមពិនិត្យអ៊ីនធឺណិតរួចព្យាយាមម្ដងទៀត។",
          retryable: true,
        });
      } finally {
        if (activeRequestIdRef.current === currentRequestId) {
          setIsExtracting(false);
        }
      }
    },
    [imageFile, isBusy]
  );

  // When image is selected, automatically initiate text extraction
  const handleFileSelect = useCallback(
    (file: File | null) => {
      setImageFile(file);
      setResult(null);
      setError(null);
      if (file) {
        handleExtract(file);
      } else {
        setExtractedProblemText("");
        setExistingAnswerText("");
        setAmbiguousParts([]);
        setExtractionConfidence(null);
      }
    },
    [handleExtract]
  );

  // STAGE 2: Solve / Generate / Verify Execution
  const handleSolveOrGenerate = useCallback(async () => {
    const textToSolve = extractedProblemText.trim();
    if (!textToSolve && !imageFile) return;
    if (isBusy) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const currentRequestId = ++activeRequestIdRef.current;

    setIsSolving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("action", "solve");
      formData.append("solverMode", solverMode);
      if (solverMode === "generate") {
        formData.append("detailLevel", detailLevel);
      }
      formData.append("problemText", textToSolve);

      // Only attach student answer in verify mode or when present
      if (solverMode === "verify" && existingAnswerText.trim()) {
        formData.append("existingAnswer", existingAnswerText.trim());
      }
      formData.append(
        "includeVerification",
        solverMode === "verify" ? "true" : "false"
      );
      formData.append("outputLanguage", "khmer");

      if (imageFile) {
        formData.append("image", imageFile, imageFile.name);
      }

      const response = await fetch("/api/math-solver", {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      });

      if (activeRequestIdRef.current !== currentRequestId) return;

      let data: (MathSolverResponse & Partial<MathSolverError>) | null = null;
      try {
        data = await response.json();
      } catch {
        // Non-JSON response
      }

      if (!response.ok) {
        const errData = data as MathSolverError | null;
        setError({
          stage: "solve",
          message: errData?.error || "Processing failed.",
          messageKhmer:
            errData?.errorKhmer ||
            "ការដំណើរការជួបបញ្ហា។ សូមព្យាយាមម្ដងទៀត។",
          retryable: errData?.retryable ?? true,
          requestId: errData?.requestId,
        });
        return;
      }

      const successData = data as MathSolverResponse;
      setResult(successData);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (activeRequestIdRef.current !== currentRequestId) return;

      setError({
        stage: "solve",
        message: err instanceof Error ? err.message : "Network error",
        messageKhmer:
          "ការតភ្ជាប់មានបញ្ហា។ សូមពិនិត្យអ៊ីនធឺណិតរួចព្យាយាមម្ដងទៀត។",
        retryable: true,
      });
    } finally {
      if (activeRequestIdRef.current === currentRequestId) {
        setIsSolving(false);
      }
    }
  }, [extractedProblemText, imageFile, isBusy, solverMode, detailLevel, existingAnswerText]);

  // Retry based on current failure stage
  const handleRetry = useCallback(() => {
    if (!error) return;
    if (error.stage === "extract") {
      handleExtract();
    } else {
      handleSolveOrGenerate();
    }
  }, [error, handleExtract, handleSolveOrGenerate]);

  // Copy solution to clipboard
  const handleCopy = useCallback(async () => {
    if (!result || !result.problems || result.problems.length === 0) return;
    const p: MathSolverProblem = result.problems[0];
    const lines: string[] = [];

    if (result.solverMode === "generate") {
      lines.push(`===== ដំណោះស្រាយអប់រំពេញលេញ (FULL EDUCATIONAL SOLUTION) =====`);
      lines.push(`១. ប្រធានលំហាត់៖\n${p.extractedProblem}`);
      if (p.given) lines.push(`\n២. អ្វីដែលគេឱ្យ៖\n${p.given}`);
      if (p.toFind) lines.push(`\n៣. អ្វីដែលត្រូវរក៖\n${p.toFind}`);
      if (p.formulas) lines.push(`\n៤. រូបមន្តដែលត្រូវប្រើ៖\n${p.formulas}`);
      lines.push(`\n៥. ដំណោះស្រាយតាមជំហាន៖\n${p.solution}`);
      lines.push(`\n៦. ការពន្យល់ជាភាសាខ្មែរ៖\n${p.solutionKhmer}`);
      lines.push(`\n៧. ចម្លើយចុងក្រោយ៖\n${p.finalAnswer}`);
      if (p.verification) lines.push(`\n៨. ពិនិត្យចម្លើយឡើងវិញ៖\n${p.verification}`);
    } else if (result.solverMode === "verify") {
      lines.push(`===== ដោះស្រាយ + ផ្ទៀងផ្ទាត់ចម្លើយ (SOLVE & VERIFY) =====`);
      lines.push(`ប្រធានលំហាត់៖ ${p.extractedProblem}`);
      lines.push(`ចម្លើយសិស្ស៖ ${p.extractedAnswer || "មិនបានបញ្ជាក់"}`);
      lines.push(`លទ្ធផលផ្ទៀងផ្ទាត់៖ ${p.answerStatusKhmer || p.answerStatus || ""}`);
      if (p.incorrectStep) {
        lines.push(`ចំណុចខុស៖ ${p.incorrectStep}`);
        if (p.errorExplanationKhmer) lines.push(`ការពន្យល់កំហុស៖ ${p.errorExplanationKhmer}`);
        if (p.correctedStep) lines.push(`ការកែតម្រូវ៖ ${p.correctedStep}`);
      }
      lines.push(`\nដំណោះស្រាយកែតម្រូវពេញលេញ៖\n${p.solutionKhmer || p.solution}`);
      lines.push(`\nចម្លើយចុងក្រោយដែលត្រឹមត្រូវ៖ ${p.finalAnswer}`);
      if (p.verification) lines.push(`\nការផ្ទៀងផ្ទាត់៖ ${p.verification}`);
    } else {
      lines.push(`===== ដោះស្រាយលំហាត់គណិតវិទ្យា (MATH SOLUTION) =====`);
      lines.push(`ប្រធានលំហាត់៖ ${p.extractedProblem}`);
      lines.push(`\nវិធីដោះស្រាយមួយជំហានម្តងៗ៖\n${p.solutionKhmer || p.solution}`);
      lines.push(`\nចម្លើយចុងក្រោយ៖ ${p.finalAnswer}`);
      if (p.verification) lines.push(`\nការផ្ទៀងផ្ទាត់ឡើងវិញ៖ ${p.verification}`);
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn("Clipboard copy failed");
    }
  }, [result]);

  // Download solution as text file
  const handleDownload = useCallback(() => {
    if (!result || !result.problems || result.problems.length === 0) return;
    const p: MathSolverProblem = result.problems[0];

    const modeLabels: Record<SolverMode, string> = {
      solve: "SOLVE_PROBLEM",
      generate: "GENERATE_FULL_SOLUTION",
      verify: "SOLVE_AND_VERIFY",
    };

    const header = [
      `DYT ECOSYSTEM — MODULE 04: KHMER MATH SOLVER`,
      `MODE: ${modeLabels[result.solverMode]}`,
      `DATE: ${new Date().toLocaleString("km-KH")}`,
      `--------------------------------------------------`,
    ];

    const body: string[] = [];
    if (result.solverMode === "generate") {
      body.push(`១. ប្រធានលំហាត់៖\n${p.extractedProblem}`);
      if (p.given) body.push(`\n២. អ្វីដែលគេឱ្យ៖\n${p.given}`);
      if (p.toFind) body.push(`\n៣. អ្វីដែលត្រូវរក៖\n${p.toFind}`);
      if (p.formulas) body.push(`\n៤. រូបមន្តដែលត្រូវប្រើ៖\n${p.formulas}`);
      body.push(`\n៥. ដំណោះស្រាយតាមជំហាន៖\n${p.solution}`);
      body.push(`\n៦. ការពន្យល់ជាភាសាខ្មែរ៖\n${p.solutionKhmer}`);
      body.push(`\n៧. ចម្លើយចុងក្រោយ៖\n${p.finalAnswer}`);
      if (p.verification) body.push(`\n៨. ពិនិត្យចម្លើយឡើងវិញ៖\n${p.verification}`);
    } else if (result.solverMode === "verify") {
      body.push(`ប្រធានលំហាត់៖\n${p.extractedProblem}`);
      body.push(`\nចម្លើយសិស្ស៖ ${p.extractedAnswer || "N/A"}`);
      body.push(`ស្ថានភាពផ្ទៀងផ្ទាត់៖ ${p.answerStatusKhmer || p.answerStatus || ""}`);
      if (p.incorrectStep) body.push(`ចំណុចខុស៖ ${p.incorrectStep}`);
      if (p.errorExplanationKhmer) body.push(`ការពន្យល់កំហុស៖ ${p.errorExplanationKhmer}`);
      if (p.correctedStep) body.push(`ការកែតម្រូវ៖ ${p.correctedStep}`);
      body.push(`\nដំណោះស្រាយកែតម្រូវពេញលេញ៖\n${p.solutionKhmer || p.solution}`);
      body.push(`\nចម្លើយចុងក្រោយ៖ ${p.finalAnswer}`);
      if (p.verification) body.push(`\nការផ្ទៀងផ្ទាត់៖ ${p.verification}`);
    } else {
      body.push(`ប្រធានលំហាត់៖\n${p.extractedProblem}`);
      body.push(`\nវិធីដោះស្រាយមួយជំហានម្តងៗ៖\n${p.solutionKhmer || p.solution}`);
      body.push(`\nចម្លើយចុងក្រោយ៖ ${p.finalAnswer}`);
      if (p.verification) body.push(`\nការផ្ទៀងផ្ទាត់ឡើងវិញ៖ ${p.verification}`);
    }

    const footer = [
      `\n--------------------------------------------------`,
      `PROVIDER: ${result.inferenceProvider}`,
    ];

    const content = [...header, ...body, ...footer].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `khmer-math-${result.solverMode}-${Date.now()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [result]);

  const problemResult = result?.problems?.[0];

  return (
    <div className="space-y-6 min-w-0 max-w-5xl mx-auto w-full pb-12 font-sans">
      {/* Top Breadcrumb */}
      <Link
        href="/"
        aria-label="Back to Dashboard"
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-white focus:ring-2 focus:ring-violet-400 focus:outline-none min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>ត្រឡប់ទៅផ្ទាំងដើម (Back to Dashboard)</span>
      </Link>

      {/* Header Panel */}
      <div className="cyber-glass-panel relative overflow-hidden border border-violet-500/30 p-6 rounded-2xl bg-slate-950/80 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 border border-violet-500/40 bg-violet-950/70 px-2.5 py-0.5 text-[11px] text-violet-300 font-mono tracking-wider rounded-md">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span>MODULE 04 // KHMER MATH SOLVER</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white uppercase">
              ដោះស្រាយលំហាត់គណិតវិទ្យា
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              ដោះស្រាយលំហាត់ បង្កើតដំណោះស្រាយគរុកោសល្យ និងផ្ទៀងផ្ទាត់ចម្លើយសិស្សជាភាសាខ្មែរតាមស្ដង់ដារអប់រំ។
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-400/50 bg-violet-950/60 text-violet-300 shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <Brain className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>

        {/* ── Mode Selector Near Upload Area ── */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-2">
          <label className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase flex items-center gap-2">
            <span>មុខងារដំណើរការ // Select Function Mode</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Mode 1 */}
            <button
              type="button"
              onClick={() => setSolverMode("solve")}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                solverMode === "solve"
                  ? "border-violet-500 bg-violet-950/60 text-white shadow-[0_0_15px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/40"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Calculator className={`h-4 w-4 ${solverMode === "solve" ? "text-violet-400" : "text-slate-500"}`} />
              <div>
                <p className="text-xs font-bold">១. ដោះស្រាយលំហាត់</p>
                <p className="text-[10px] text-slate-400">Solve Problem</p>
              </div>
            </button>

            {/* Mode 2 */}
            <button
              type="button"
              onClick={() => setSolverMode("generate")}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                solverMode === "generate"
                  ? "border-violet-500 bg-violet-950/60 text-white shadow-[0_0_15px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/40"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <BookOpen className={`h-4 w-4 ${solverMode === "generate" ? "text-violet-400" : "text-slate-500"}`} />
              <div>
                <p className="text-xs font-bold">២. បង្កើតដំណោះស្រាយ</p>
                <p className="text-[10px] text-slate-400">Generate Full Solution (8 Sections)</p>
              </div>
            </button>

            {/* Mode 3 */}
            <button
              type="button"
              onClick={() => setSolverMode("verify")}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                solverMode === "verify"
                  ? "border-violet-500 bg-violet-950/60 text-white shadow-[0_0_15px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/40"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <ShieldCheck className={`h-4 w-4 ${solverMode === "verify" ? "text-violet-400" : "text-slate-500"}`} />
              <div>
                <p className="text-xs font-bold">៣. ដោះស្រាយ + ផ្ទៀងផ្ទាត់</p>
                <p className="text-[10px] text-slate-400">Solve &amp; Verify Student Work</p>
              </div>
            </button>
          </div>

          {/* Mode 2 Detail Level Selector */}
          {solverMode === "generate" && (
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-violet-400" />
                <span>កម្រិតលម្អិត (Detail Level):</span>
              </span>
              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900/80 p-0.5">
                {[
                  { id: "short" as DetailLevel, label: "ចម្លើយសង្ខេប (Short)" },
                  { id: "step_by_step" as DetailLevel, label: "លម្អិតតាមជំហាន (Step-by-step)" },
                  { id: "teacher" as DetailLevel, label: "បែបគ្រូបង្រៀន (Teacher Explanation)" },
                ].map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setDetailLevel(lvl.id)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                      detailLevel === lvl.id
                        ? "bg-violet-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Alert Box */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-rose-500/40 bg-rose-950/60 p-4 text-rose-200 shadow-lg space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-rose-300">
                {error.stage === "extract"
                  ? "កំហុសក្នុងការស្រង់អត្ថបទ (Extraction Error)"
                  : "កំហុសក្នុងការដំណើរការ (Execution Error)"}
              </p>
              <p className="text-sm text-rose-100 font-medium">
                {error.messageKhmer || error.message}
              </p>
              {error.message && error.messageKhmer && (
                <p className="text-xs text-rose-300/80 font-mono">
                  {error.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-rose-500/20">
            {error.retryable && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-rose-500 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>ព្យាយាមម្ដងទៀត (Retry)</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>សម្អាត (Clear)</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Workflow: Upload & Problem Input Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Image Upload */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-violet-400" />
              <span>១. បញ្ចូលរូបភាព // Upload Image</span>
            </h2>
            <span className="text-[10px] text-slate-400 font-mono">
              PNG, JPG, WEBP &lt; 4.5MB
            </span>
          </div>

          <SolverImageUpload
            onFileSelect={handleFileSelect}
            selectedFile={imageFile}
            disabled={isBusy}
          />

          {imageFile && !isExtracting && (
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => handleExtract()}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-950/40 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-900/40 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>ស្រង់អត្ថបទឡើងវិញ (Re-extract)</span>
              </button>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>រូបភាពបានជ្រើស</span>
              </span>
            </div>
          )}

          {isExtracting && (
            <div className="flex items-center gap-2.5 rounded-xl border border-violet-500/30 bg-violet-950/30 p-3 text-xs text-violet-300 animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              <span>កំពុងស្រង់អត្ថបទលំហាត់ពីរូបភាព... (Extracting text...)</span>
            </div>
          )}
        </div>

        {/* Right Column: Problem Text & Mode Controls */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-violet-400" />
                <span>២. ពិនិត្យ &amp; កែសម្រួលអត្ថបទ // Problem Input</span>
              </h2>
              {extractionConfidence && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    extractionConfidence === "high"
                      ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                      : extractionConfidence === "medium"
                      ? "border-amber-500/40 bg-amber-950/40 text-amber-300"
                      : "border-rose-500/40 bg-rose-950/40 text-rose-300"
                  }`}
                >
                  {extractionConfidence === "high"
                    ? "កម្រិតខ្ពស់ (High)"
                    : extractionConfidence === "medium"
                    ? "កម្រិតមធ្យម (Medium)"
                    : "កម្រិតទាប (Low)"}
                </span>
              )}
            </div>

            {/* Uncertainty Warning Notice (Anti-Guessing) */}
            {ambiguousParts.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-300">
                      ការរកឃើញមិនច្បាស់លាស់ (Uncertainty Notice)
                    </span>
                    <p className="text-[11px] text-amber-300/80 mt-0.5">
                      សញ្ញាឬតួអក្សរខាងក្រោមមិនសូវច្បាស់។ សូមពិនិត្យផ្ទៀងផ្ទាត់ឡើងវិញក្នុងប្រអប់អត្ថបទមុនចុចដំណើរការ៖
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ambiguousParts.map((item, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-amber-900/60 border border-amber-600/40 px-2 py-0.5 text-[11px] font-mono text-amber-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Editable Problem Statement */}
            <div className="space-y-1.5">
              <label
                htmlFor="extracted-problem"
                className="text-xs font-semibold text-slate-300 flex items-center justify-between"
              >
                <span>ប្រធានលំហាត់ (អាចកែសម្រួល ឬវាយបញ្ចូលដោយផ្ទាល់)</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Problem Statement
                </span>
              </label>
              <textarea
                id="extracted-problem"
                rows={4}
                value={extractedProblemText}
                onChange={(e) => setExtractedProblemText(e.target.value)}
                placeholder="អត្ថបទលំហាត់នឹងបង្ហាញនៅទីនេះបន្ទាប់ពីបញ្ចូលរូបភាព ឬអ្នកអាចវាយបញ្ចូលដោយផ្ទាល់..."
                disabled={isBusy}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Answer-Verification Controls (ONLY shown when Mode 3 is selected) */}
            {solverMode === "verify" && (
              <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
                <label
                  htmlFor="student-answer"
                  className="text-xs font-semibold text-amber-300 flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                    <span>ចម្លើយ/ស្នាដៃសិស្សដែលត្រូវផ្ទៀងផ្ទាត់ (Student Answer/Work)</span>
                  </span>
                  <span className="text-[10px] text-amber-400/80 font-mono">
                    Mode 3 Only
                  </span>
                </label>
                <input
                  id="student-answer"
                  type="text"
                  value={existingAnswerText}
                  onChange={(e) => setExistingAnswerText(e.target.value)}
                  placeholder="ស្រង់ចេញពីរូបភាពដោយស្វ័យប្រវត្តិ ឬវាយបញ្ចូល ឧ. x = 6..."
                  disabled={isBusy}
                  className="w-full rounded-xl border border-amber-600/40 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none transition-colors"
                />
              </div>
            )}
          </div>

          {/* Action Button Bar */}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {/* Primary Action Button */}
              <button
                type="button"
                onClick={handleSolveOrGenerate}
                disabled={(!extractedProblemText.trim() && !imageFile) || isBusy}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none min-h-[44px]"
              >
                {isSolving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>កំពុងដំណើរការ...</span>
                  </>
                ) : solverMode === "generate" ? (
                  <>
                    <BookOpen className="h-4 w-4" />
                    <span>បង្កើតដំណោះស្រាយ (Generate)</span>
                  </>
                ) : solverMode === "verify" ? (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>ផ្ទៀងផ្ទាត់ចម្លើយ (Verify)</span>
                  </>
                ) : (
                  <>
                    <Calculator className="h-4 w-4" />
                    <span>ដោះស្រាយ (Solve)</span>
                  </>
                )}
              </button>

              {/* Clear / Cancel Button */}
              {isBusy ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs font-semibold text-rose-300 hover:bg-rose-900/50 transition-colors min-h-[44px]"
                >
                  <XCircle className="h-4 w-4" />
                  <span>បោះបង់ (Cancel)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={!imageFile && !extractedProblemText && !result}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>សម្អាត (Clear)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STAGE 3: Solution Results Display */}
      {problemResult && (
        <div className="rounded-2xl border border-violet-500/30 bg-slate-950/90 p-6 space-y-6 shadow-2xl">
          {/* Result Card Header with Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 text-violet-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {result.solverMode === "generate"
                    ? "ដំណោះស្រាយអប់រំពេញលេញ (Full Educational Solution)"
                    : result.solverMode === "verify"
                    ? "លទ្ធផលផ្ទៀងផ្ទាត់ & ដំណោះស្រាយកែតម្រូវ (Verification & Correction)"
                    : "ដំណោះស្រាយលំហាត់ (Math Solution)"}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {result.inferenceProvider} · {result.solverMode.toUpperCase()} MODE
                </p>
              </div>
            </div>

            {/* Action Buttons: Copy, Download, Clear */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:border-violet-500/50 transition-colors min-h-[36px]"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-300">បានចម្លង! (Copied)</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-400" />
                    <span>ចម្លង (Copy)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:border-violet-500/50 transition-colors min-h-[36px]"
              >
                <Download className="h-3.5 w-3.5 text-slate-400" />
                <span>ទាញយក (Download)</span>
              </button>

              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors min-h-[36px]"
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                <span>សម្អាត (Clear)</span>
              </button>
            </div>
          </div>

          {/* MODE 3: ANSWER VERIFICATION BANNER */}
          {result.solverMode === "verify" && (
            <div
              className={`rounded-xl border p-4 space-y-3 ${
                problemResult.answerStatus === "correct"
                  ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                  : problemResult.answerStatus === "incorrect"
                  ? "border-rose-500/40 bg-rose-950/30 text-rose-200"
                  : "border-amber-500/40 bg-amber-950/30 text-amber-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider font-bold">
                  ការផ្ទៀងផ្ទាត់ចម្លើយសិស្ស (Answer Verification)
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    problemResult.answerStatus === "correct"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : problemResult.answerStatus === "incorrect"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}
                >
                  {problemResult.answerStatus === "correct" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                  {problemResult.answerStatus === "incorrect" && (
                    <XCircle className="h-4 w-4 text-rose-400" />
                  )}
                  {problemResult.answerStatus === "unverifiable" && (
                    <HelpCircle className="h-4 w-4 text-amber-400" />
                  )}
                  <span>
                    {problemResult.answerStatusKhmer ||
                      (problemResult.answerStatus === "correct"
                        ? "ត្រឹមត្រូវ ✓"
                        : problemResult.answerStatus === "incorrect"
                        ? "មិនទាន់ត្រឹមត្រូវ ✗"
                        : "មិនអាចផ្ទៀងផ្ទាត់បាន")}
                  </span>
                </span>
              </div>

              <div className="text-xs space-y-1.5 pt-1 border-t border-slate-800/60">
                {problemResult.extractedAnswer && (
                  <p>
                    <span className="text-slate-400">ចម្លើយសិស្សដែលមានស្រាប់៖</span>{" "}
                    <span className="font-mono font-bold text-white">
                      {problemResult.extractedAnswer}
                    </span>
                  </p>
                )}
                {problemResult.incorrectStep && (
                  <p className="text-rose-300 font-medium">
                    <span className="text-rose-400 font-bold">ចំណុចខុស៖</span>{" "}
                    {problemResult.incorrectStep}
                  </p>
                )}
                {problemResult.errorExplanationKhmer && (
                  <p className="text-rose-200">
                    <span className="text-rose-400 font-bold">ការពន្យល់កំហុស៖</span>{" "}
                    {problemResult.errorExplanationKhmer}
                  </p>
                )}
                {problemResult.correctedStep && (
                  <p className="text-emerald-300 font-medium">
                    <span className="text-emerald-400 font-bold">ការកែតម្រូវត្រឹមត្រូវ៖</span>{" "}
                    {problemResult.correctedStep}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* MODE 2: 8-SECTION POLISHED EDUCATIONAL SOLUTION */}
          {result.solverMode === "generate" ? (
            <div className="space-y-4">
              {/* 1. ប្រធានលំហាត់ */}
              <div className="space-y-1">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                  <span>១. ប្រធានលំហាត់ (Problem Statement)</span>
                </h4>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-sm font-semibold text-white">
                  {problemResult.extractedProblem}
                </div>
              </div>

              {/* 2 & 3: អ្វីដែលគេឱ្យ & អ្វីដែលត្រូវរក */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {problemResult.given && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                      ២. អ្វីដែលគេឱ្យ (Given)
                    </h4>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-200 leading-relaxed">
                      {problemResult.given}
                    </div>
                  </div>
                )}
                {problemResult.toFind && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                      ៣. អ្វីដែលត្រូវរក (To Find)
                    </h4>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-200 leading-relaxed">
                      {problemResult.toFind}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. រូបមន្តដែលត្រូវប្រើ */}
              {problemResult.formulas && (
                <div className="space-y-1">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                    ៤. រូបមន្តដែលត្រូវប្រើ (Formulas To Use)
                  </h4>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs font-mono text-cyan-300">
                    {problemResult.formulas}
                  </div>
                </div>
              )}

              {/* 5. ដំណោះស្រាយតាមជំហាន */}
              {problemResult.solution && (
                <div className="space-y-1">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                    ៥. ដំណោះស្រាយតាមជំហាន (Working)
                  </h4>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {problemResult.solution}
                  </div>
                </div>
              )}

              {/* 6. ការពន្យល់ជាភាសាខ្មែរ */}
              <div className="space-y-1">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                  ៦. ការពន្យល់ជាភាសាខ្មែរ (Khmer Pedagogical Explanation)
                </h4>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
                  {problemResult.solutionKhmer}
                </div>
              </div>

              {/* 7. ចម្លើយចុងក្រោយ */}
              <div className="rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-950/40 to-slate-950/80 p-4 space-y-1">
                <span className="text-xs font-mono uppercase tracking-wider text-violet-300 font-bold">
                  ៧. ចម្លើយចុងក្រោយ (Final Answer)
                </span>
                <div className="text-lg font-mono font-bold text-emerald-400">
                  {problemResult.finalAnswer}
                </div>
              </div>

              {/* 8. ពិនិត្យចម្លើយឡើងវិញ */}
              {problemResult.verification && (
                <div className="space-y-1">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                    ៨. ពិនិត្យចម្លើយឡើងវិញ (Verification / Check Work)
                  </h4>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-300 font-mono">
                    {problemResult.verification}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* MODE 1 & MODE 3 CORE DISPLAY */
            <div className="space-y-4">
              {/* Problem Statement Display */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  ប្រធានលំហាត់ (Problem)
                </h4>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm font-semibold text-white">
                  {problemResult.extractedProblem}
                </div>
              </div>

              {/* Step-by-Step Explanation */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  {result.solverMode === "verify"
                    ? "ដំណោះស្រាយកែតម្រូវពេញលេញ (Corrected Solution in Khmer)"
                    : "វិធីដោះស្រាយមួយជំហានម្តងៗជាភាសាខ្មែរ (Step-by-Step Explanation)"}
                </h4>
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap space-y-2">
                  {problemResult.solutionKhmer || problemResult.solution}
                </div>
              </div>

              {/* Final Answer Banner */}
              <div className="rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-950/40 to-slate-950/80 p-5 space-y-1">
                <span className="text-xs font-mono uppercase tracking-wider text-violet-300 font-bold">
                  {result.solverMode === "verify"
                    ? "ចម្លើយចុងក្រោយដែលត្រឹមត្រូវ (Final Verified Answer)"
                    : "ចម្លើយចុងក្រោយ (Final Answer)"}
                </span>
                <div className="text-lg sm:text-xl font-mono font-bold text-emerald-400">
                  {problemResult.finalAnswer}
                </div>
              </div>

              {/* Verification / Check Work */}
              {problemResult.verification && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    ការផ្ទៀងផ្ទាត់ឡើងវិញ (Verification / Check Work)
                  </h4>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-xs text-slate-300 font-mono">
                    {problemResult.verification}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
