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
} from "lucide-react";
import { SolverImageUpload } from "@/components/math-solver/SolverImageUpload";
import type {
  MathSolverResponse,
  MathSolverProblem,
  MathSolverError,
} from "@/app/api/math-solver/route";

export default function MathSolverPage() {
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

  // STAGE 2: Solve Problem with Step-by-Step Khmer Explanation
  const handleSolve = useCallback(async () => {
    const textToSolve = extractedProblemText.trim();
    if (!textToSolve || isBusy) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const currentRequestId = ++activeRequestIdRef.current;

    setIsSolving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("action", "solve");
      formData.append("problemText", textToSolve);
      if (existingAnswerText.trim()) {
        formData.append("existingAnswer", existingAnswerText.trim());
      }
      formData.append("includeVerification", "true");
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
          message: errData?.error || "Failed to solve problem.",
          messageKhmer:
            errData?.errorKhmer ||
            "មិនអាចដោះស្រាយលំហាត់បានទេ។ សូមព្យាយាមម្ដងទៀត។",
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
  }, [extractedProblemText, existingAnswerText, imageFile, isBusy]);

  // Retry based on current failure stage
  const handleRetry = useCallback(() => {
    if (!error) return;
    if (error.stage === "extract") {
      handleExtract();
    } else {
      handleSolve();
    }
  }, [error, handleExtract, handleSolve]);

  // Copy solution to clipboard
  const handleCopy = useCallback(async () => {
    if (!result || !result.problems || result.problems.length === 0) return;
    const p: MathSolverProblem = result.problems[0];

    const lines: string[] = [
      `=== លំហាត់គណិតវិទ្យា (Math Problem) ===`,
      `បញ្ហា៖ ${p.extractedProblem}`,
    ];

    if (p.extractedAnswer) {
      lines.push(`ចម្លើយសិស្ស៖ ${p.extractedAnswer}`);
      lines.push(`លទ្ធផលផ្ទៀងផ្ទាត់៖ ${p.answerStatusKhmer || p.answerStatus || ""}`);
      if (p.incorrectStep) {
        lines.push(`ចំណុចខុស៖ ${p.incorrectStep}`);
        lines.push(`ការកែតម្រូវ៖ ${p.correctedStep || ""}`);
      }
    }

    lines.push(`\n=== វិធីដោះស្រាយមួយជំហានម្តងៗ (Step-by-step Solution) ===`);
    lines.push(p.solutionKhmer || p.solution);

    lines.push(`\n=== ចម្លើយចុងក្រោយ (Final Answer) ===`);
    lines.push(p.finalAnswer);

    if (p.verification) {
      lines.push(`\n=== ការផ្ទៀងផ្ទាត់ឡើងវិញ (Verification) ===`);
      lines.push(p.verification);
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

    const content: string = [
      `DYT ECOSYSTEM — MODULE 04: KHMER MATH SOLVER`,
      `កាលបរិច្ឆេទ៖ ${new Date().toLocaleString("km-KH")}`,
      `--------------------------------------------------`,
      `លំហាត់៖ ${p.extractedProblem}`,
      p.extractedAnswer ? `ចម្លើយសិស្ស៖ ${p.extractedAnswer}` : "",
      p.answerStatusKhmer ? `ស្ថានភាព៖ ${p.answerStatusKhmer}` : "",
      p.incorrectStep ? `ចំណុចខុស៖ ${p.incorrectStep}` : "",
      p.correctedStep ? `ការកែតម្រូវ៖ ${p.correctedStep}` : "",
      `--------------------------------------------------`,
      `វិធីដោះស្រាយជាភាសាខ្មែរ៖`,
      p.solutionKhmer || p.solution,
      `--------------------------------------------------`,
      `ចម្លើយចុងក្រោយ៖ ${p.finalAnswer}`,
      p.verification ? `ការផ្ទៀងផ្ទាត់៖ ${p.verification}` : "",
      `--------------------------------------------------`,
      `ម៉ាស៊ីន AI: ${result.inferenceProvider}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `khmer-math-solution-${Date.now()}.txt`;
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
              បញ្ចូលរូបភាពលំហាត់ ពិនិត្យឬកែសម្រួលអត្ថបទដែលបានស្រង់ រួចទទួលការពន្យល់មួយជំហានម្តងៗជាភាសាខ្មែរ និងផ្ទៀងផ្ទាត់ចម្លើយ។
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-400/50 bg-violet-950/60 text-violet-300 shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <Brain className="h-6 w-6" aria-hidden="true" />
          </div>
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
                  : "កំហុសក្នុងការដោះស្រាយ (Solving Error)"}
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

        {/* Right Column: Extracted Problem Text (Editable Before Solving) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-violet-400" />
                <span>២. ពិនិត្យ &amp; កែសម្រួលអត្ថបទ // Review Text</span>
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
                      សញ្ញាឬតួអក្សរខាងក្រោមមិនសូវច្បាស់។ សូមពិនិត្យផ្ទៀងផ្ទាត់ឡើងវិញក្នុងប្រអប់អត្ថបទមុនចុចដោះស្រាយ៖
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
                <span>អត្ថបទលំហាត់ (អាចកែសម្រួលបាន)</span>
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

            {/* Optional Existing Student Answer to Verify */}
            <div className="space-y-1.5">
              <label
                htmlFor="student-answer"
                className="text-xs font-semibold text-slate-300 flex items-center justify-between"
              >
                <span>ចម្លើយសិស្សដែលមានស្រាប់ (ប្រសិនបើចង់ផ្ទៀងផ្ទាត់)</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Student Answer (Optional)
                </span>
              </label>
              <input
                id="student-answer"
                type="text"
                value={existingAnswerText}
                onChange={(e) => setExistingAnswerText(e.target.value)}
                placeholder="ឧទាហរណ៍៖ x = 5 ឬ ចម្លើយគឺ 12..."
                disabled={isBusy}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Action Button Bar */}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {/* Solve Button */}
              <button
                type="button"
                onClick={handleSolve}
                disabled={!extractedProblemText.trim() || isBusy}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none min-h-[44px]"
              >
                {isSolving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>កំពុងដោះស្រាយ...</span>
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
                  <RotateCcw className="h-4 w-4" />
                  <span>សម្អាត (Clear)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STAGE 3: Solution & Verification Results */}
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
                  ដំណោះស្រាយលំហាត់ (Solution)
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {result.inferenceProvider}
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

          {/* Answer Verification Status Banner */}
          {problemResult.extractedAnswer && (
            <div
              className={`rounded-xl border p-4 space-y-2 ${
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    problemResult.answerStatus === "correct"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : problemResult.answerStatus === "incorrect"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}
                >
                  {problemResult.answerStatus === "correct" && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  {problemResult.answerStatus === "incorrect" && (
                    <XCircle className="h-3.5 w-3.5 text-rose-400" />
                  )}
                  {problemResult.answerStatus === "unverifiable" && (
                    <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span>
                    {problemResult.answerStatusKhmer ||
                      (problemResult.answerStatus === "correct"
                        ? "ត្រឹមត្រូវ ✓"
                        : problemResult.answerStatus === "incorrect"
                        ? "មិនទាន់ត្រឹមត្រូវ ✗"
                        : "មិនទាន់ច្បាស់")}
                  </span>
                </span>
              </div>

              <div className="text-xs space-y-1">
                <p>
                  <span className="text-slate-400">ចម្លើយដែលផ្ទៀងផ្ទាត់៖</span>{" "}
                  <span className="font-mono font-bold text-white">
                    {problemResult.extractedAnswer}
                  </span>
                </p>
                {problemResult.incorrectStep && (
                  <p className="text-rose-300 font-medium">
                    <span className="text-rose-400">ចំណុចខុស៖</span>{" "}
                    {problemResult.incorrectStep}
                  </p>
                )}
                {problemResult.correctedStep && (
                  <p className="text-emerald-300 font-medium">
                    <span className="text-emerald-400">ការកែតម្រូវ៖</span>{" "}
                    {problemResult.correctedStep}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Problem Statement Display */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
              ប្រធានលំហាត់ (Problem)
            </h4>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm font-semibold text-white">
              {problemResult.extractedProblem}
            </div>
          </div>

          {/* Step-by-Step Khmer Explanation */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
              វិធីដោះស្រាយមួយជំហានម្តងៗជាភាសាខ្មែរ (Step-by-Step Explanation)
            </h4>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans space-y-2">
              {problemResult.solutionKhmer || problemResult.solution}
            </div>
          </div>

          {/* Final Answer Banner */}
          <div className="rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-950/40 to-slate-950/80 p-5 space-y-1">
            <span className="text-xs font-mono uppercase tracking-wider text-violet-300 font-bold">
              ចម្លើយចុងក្រោយ (Final Answer)
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
  );
}
