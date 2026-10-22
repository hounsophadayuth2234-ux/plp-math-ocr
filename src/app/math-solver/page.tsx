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
  Code2,
  ChevronDown,
  ChevronUp,
  Settings,
  Eye,
  X,
  Printer,
  PlusCircle,
} from "lucide-react";
import { SolverImageUpload } from "@/components/math-solver/SolverImageUpload";
import { SolutionCard } from "@/components/math-solver/SolutionCard";
import type {
  MathSolverResponse,
  MathSolverProblem,
  MathSolverError,
  SolverMode,
  DetailLevel,
  GradeLevel,
  VisualInterpretation,
} from "@/app/api/math-solver/route";
import {
  copyCanonicalSolutionToClipboard,
  copyCanonicalSolutionPlainTextToClipboard,
  renderCanonicalSolutionHtml,
  renderCanonicalSolutionPlainText,
  copyTextFallback,
} from "@/lib/math-solution-html";

const GRADE_OPTIONS: { id: GradeLevel; label: string; sublabel: string }[] = [
  { id: "auto", label: "ស្វ័យប្រវត្តិ", sublabel: "Auto Detect" },
  { id: "grade_1", label: "ថ្នាក់ទី ១", sublabel: "Grade 1" },
  { id: "grade_2", label: "ថ្នាក់ទី ២", sublabel: "Grade 2" },
  { id: "grade_3", label: "ថ្នាក់ទី ៣", sublabel: "Grade 3" },
  { id: "grade_4", label: "ថ្នាក់ទី ៤", sublabel: "Grade 4" },
  { id: "grade_5", label: "ថ្នាក់ទី ៥", sublabel: "Grade 5" },
  { id: "grade_6", label: "ថ្នាក់ទី ៦", sublabel: "Grade 6" },
];

const GRADE_SAMPLES: { grade: GradeLevel; gradeLabel: string; sample: string }[] = [
  { grade: "grade_1", gradeLabel: "ថ្នាក់ទី ១", sample: "៥ + ៣ = ?" },
  { grade: "grade_2", gradeLabel: "ថ្នាក់ទី ២", sample: "២៥ + ៣៨ = ?" },
  { grade: "grade_3", gradeLabel: "ថ្នាក់ទី ៣", sample: "១២៥ × ៦ = ?" },
  { grade: "grade_4", gradeLabel: "ថ្នាក់ទី ៤", sample: "៤៥០ ÷ ៥ = ?" },
  { grade: "grade_5", gradeLabel: "ថ្នាក់ទី ៥", sample: "២/៣ + ៤/៥ = ?" },
  { grade: "grade_6", gradeLabel: "ថ្នាក់ទី ៦", sample: "៣ × (x + ៤) = ២៤" },
];

export default function MathSolverPage() {
  // Mode & Grade selection state
  const [solverMode, setSolverMode] = useState<SolverMode>("solve");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("step_by_step");
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>("auto");
  const [inferredGradeDisplay, setInferredGradeDisplay] = useState<string | null>(null);
  const [selectedProblemIndex, setSelectedProblemIndex] = useState<number>(0);

  // Input State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [extractedProblemText, setExtractedProblemText] = useState<string>("");
  const [existingAnswerText, setExistingAnswerText] = useState<string>("");
  const [ambiguousParts, setAmbiguousParts] = useState<string[]>([]);
  const [extractedVisual, setExtractedVisual] = useState<VisualInterpretation | null>(null);
  const [extractionConfidence, setExtractionConfidence] = useState<
    "high" | "medium" | "low" | null
  >(null);

  // Advanced settings accordion
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

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
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [copiedHtml, setCopiedHtml] = useState<boolean>(false);
  const [showTopHtmlModal, setShowTopHtmlModal] = useState<boolean>(false);
  const [copiedTopModalHtml, setCopiedTopModalHtml] = useState<boolean>(false);

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
        new CustomEvent("math-solver-busy", { detail: { isBusy } })
      );
    }
  }, [isBusy]);

  // Mode Change Handler: Immediately clears stale results, verification, copies, and resets state
  const handleModeChange = useCallback(
    (newMode: SolverMode) => {
      if (newMode === solverMode) return;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setSolverMode(newMode);
      setResult(null);
      setError(null);
      setCopiedText(false);
      setCopiedHtml(false);
      setShowTopHtmlModal(false);
      setInferredGradeDisplay(null);
      setSelectedProblemIndex(0);
    },
    [solverMode]
  );

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
    setExtractedVisual(null);
    setExtractionConfidence(null);
    setResult(null);
    setError(null);
    setInferredGradeDisplay(null);
    setSelectedProblemIndex(0);
  }, [handleCancel]);

  // STAGE 1: Extract Problem Text & Visual Structure from Image
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
        formData.append("gradeLevel", gradeLevel);
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
        if (firstProblem?.visualInterpretation) {
          setExtractedVisual(firstProblem.visualInterpretation);
        } else {
          setExtractedVisual(null);
        }
        if (firstProblem?.ambiguousParts && firstProblem.ambiguousParts.length > 0) {
          setAmbiguousParts(firstProblem.ambiguousParts);
        } else {
          setAmbiguousParts([]);
        }
        if (successData.inferredGradeKhmer) {
          setInferredGradeDisplay(successData.inferredGradeKhmer);
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
    [imageFile, isBusy, gradeLevel]
  );

  // When image is selected, automatically initiate text/visual extraction
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
        setExtractedVisual(null);
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
      formData.append("gradeLevel", gradeLevel);
      if (solverMode === "generate") {
        formData.append("detailLevel", detailLevel);
      }
      formData.append("problemText", textToSolve);

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
        setError({
          stage: "solve",
          message: "Generation failed.",
          messageKhmer:
            "ការបង្កើតដំណោះស្រាយមិនបានសម្រេច។ សូមពិនិត្យបញ្ហា ហើយសាកល្បងម្ដងទៀត។",
          retryable: true,
        });
        return;
      }

      const successData = data as MathSolverResponse;
      setResult(successData);
      if (successData.inferredGradeKhmer) {
        setInferredGradeDisplay(successData.inferredGradeKhmer);
      }
      setError(null);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (activeRequestIdRef.current !== currentRequestId) return;

      setError({
        stage: "solve",
        message: err instanceof Error ? err.message : "Network error",
        messageKhmer:
          "ការបង្កើតដំណោះស្រាយមិនបានសម្រេច។ សូមពិនិត្យបញ្ហា ហើយសាកល្បងម្ដងទៀត។",
        retryable: true,
      });
    } finally {
      if (activeRequestIdRef.current === currentRequestId) {
        setIsSolving(false);
      }
    }
  }, [
    extractedProblemText,
    imageFile,
    isBusy,
    solverMode,
    gradeLevel,
    detailLevel,
    existingAnswerText,
  ]);

  // Retry based on current failure stage
  const handleRetry = useCallback(() => {
    if (!error) return;
    if (error.stage === "extract") {
      handleExtract();
    } else {
      handleSolveOrGenerate();
    }
  }, [error, handleExtract, handleSolveOrGenerate]);

  // Copy solution to clipboard as Plain Text ("ចម្លងអត្ថបទ")
  const handleCopyText = useCallback(async () => {
    if (!result || !result.problems || result.problems.length === 0) return;
    const p: MathSolverProblem = result.problems[0];
    const gradeTitle =
      GRADE_OPTIONS.find((g) => g.id === gradeLevel)?.label || "ថ្នាក់បឋមសិក្សា";
    const success = await copyCanonicalSolutionPlainTextToClipboard(p, {
      gradeTitle,
      solverModeTitle: result.solverMode.toUpperCase(),
      solverMode: result.solverMode,
    });
    if (success) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  }, [result, gradeLevel]);

  // Copy solution to clipboard as HTML Source ("ចម្លងកូដ HTML")
  const handleCopyHtml = useCallback(async () => {
    if (!result || !result.problems || result.problems.length === 0) return;
    const p: MathSolverProblem = result.problems[0];
    const gradeTitle =
      GRADE_OPTIONS.find((g) => g.id === gradeLevel)?.label || "ថ្នាក់បឋមសិក្សា";

    try {
      const success = await copyCanonicalSolutionToClipboard(p, {
        gradeTitle,
        solverModeTitle: result.solverMode.toUpperCase(),
        solverMode: result.solverMode,
      });
      if (success) {
        setCopiedHtml(true);
        setTimeout(() => setCopiedHtml(false), 2500);
      }
    } catch (err) {
      console.error("Failed to copy HTML:", err);
    }
  }, [result, gradeLevel]);

  // Download solution as HTML file ("ទាញយកឯកសារ HTML" - matching Copy HTML exactly)
  const handleDownloadHtml = useCallback(() => {
    if (!result || !result.problems || result.problems.length === 0) return;
    const p: MathSolverProblem = result.problems[0];
    const gradeTitle =
      GRADE_OPTIONS.find((g) => g.id === gradeLevel)?.label || "ថ្នាក់បឋមសិក្សា";

    const htmlContent = renderCanonicalSolutionHtml(p, {
      gradeTitle,
      solverModeTitle: result.solverMode.toUpperCase(),
      solverMode: result.solverMode,
    });

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `khmer-math-solution-${result.solverMode}-${Date.now()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [result, gradeLevel]);

  const problemResult = result?.problems?.[selectedProblemIndex] || result?.problems?.[0];

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
              <span>MODULE 04 // KHMER MATH SOLVER (GRADES 1–6)</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white uppercase">
              ដោះស្រាយលំហាត់គណិតវិទ្យា
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              ដោះស្រាយលំហាត់ពីអក្សរ និងរូបភាព visual (វត្ថុរាប់, ប្រភាគ, ជួរដេកជួរឈរ, ធរណីមាត្រ) សម្រាប់សិស្សថ្នាក់ទី ១ ដល់ទី ៦។
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-400/50 bg-violet-950/60 text-violet-300 shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <Brain className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>

        {/* ── Grade Selector Bar ── */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-violet-400" />
              <span>ជ្រើសរើសកម្រិតថ្នាក់ // Grade Level:</span>
            </label>
            {gradeLevel === "auto" && inferredGradeDisplay && (
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-500/40 px-2.5 py-0.5 rounded-full animate-fade-in">
                កម្រិតដែលបានប៉ាន់ស្មាន៖ {inferredGradeDisplay}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
            {GRADE_OPTIONS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGradeLevel(g.id)}
                className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl border text-center transition-all ${
                  gradeLevel === g.id
                    ? "border-violet-500 bg-violet-600/30 text-white shadow-[0_0_12px_rgba(139,92,246,0.25)] ring-1 ring-violet-400"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <span className="text-xs font-bold">{g.label}</span>
                <span className="text-[10px] text-slate-400/80">{g.sublabel}</span>
              </button>
            ))}
          </div>

          {/* 1-Click Sample Problems */}
          <div className="pt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-violet-400" />
              <span>លំហាត់គំរូ (1-Click Samples):</span>
            </span>
            {GRADE_SAMPLES.map((s) => (
              <button
                key={s.grade}
                type="button"
                onClick={() => {
                  setGradeLevel(s.grade);
                  setExtractedProblemText(s.sample);
                }}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:border-violet-500 hover:text-white transition-colors cursor-pointer"
                title={`ដាក់លំហាត់គំរូ ${s.gradeLabel}: ${s.sample}`}
              >
                <span className="text-violet-400 mr-1">{s.gradeLabel}:</span>
                <span>{s.sample}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Mode Selector ── */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
          <label className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase flex items-center gap-2">
            <span>មុខងារដំណើរការ // Select Function Mode</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Mode 1 */}
            <button
              type="button"
              onClick={() => handleModeChange("solve")}
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                solverMode === "solve"
                  ? "border-violet-500 bg-violet-950/60 text-white shadow-[0_0_15px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/40"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Calculator
                className={`h-4 w-4 mt-0.5 shrink-0 ${
                  solverMode === "solve" ? "text-violet-400" : "text-slate-500"
                }`}
              />
              <div>
                <p className="text-xs font-bold">១. ដោះស្រាយលំហាត់ (Solve Problem)</p>
                <p className="text-[10.5px] text-slate-400 mt-0.5 leading-relaxed">
                  គណនារកចម្លើយចុងក្រោយ និងបង្ហាញតារាងប្រមាណវិធីបញ្ឈរត្រឹមត្រូវ។
                </p>
              </div>
            </button>

            {/* Mode 2 */}
            <button
              type="button"
              onClick={() => handleModeChange("generate")}
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                solverMode === "generate"
                  ? "border-violet-500 bg-violet-950/60 text-white shadow-[0_0_15px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/40"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <BookOpen
                className={`h-4 w-4 mt-0.5 shrink-0 ${
                  solverMode === "generate" ? "text-violet-400" : "text-slate-500"
                }`}
              />
              <div>
                <p className="text-xs font-bold">២. បង្កើតដំណោះស្រាយ (Generate Full Solution)</p>
                <p className="text-[10.5px] text-slate-400 mt-0.5 leading-relaxed">
                  បង្កើតការពន្យល់ជំហានម្តងៗពេញលេញសម្រាប់បង្រៀន ឬរៀបចំកិច្ចការផ្ទះ។
                </p>
              </div>
            </button>

            {/* Mode 3 */}
            <button
              type="button"
              onClick={() => handleModeChange("verify")}
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                solverMode === "verify"
                  ? "border-violet-500 bg-violet-950/60 text-white shadow-[0_0_15px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/40"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <ShieldCheck
                className={`h-4 w-4 mt-0.5 shrink-0 ${
                  solverMode === "verify" ? "text-violet-400" : "text-slate-500"
                }`}
              />
              <div>
                <p className="text-xs font-bold">៣. ដោះស្រាយ + ផ្ទៀងផ្ទាត់ (Solve &amp; Verify)</p>
                <p className="text-[10.5px] text-slate-400 mt-0.5 leading-relaxed">
                  ផ្ទៀងផ្ទាត់ចម្លើយ ឬស្នាដៃរបស់សិស្ស រួមទាំងចង្អុលបង្ហាញកំហុស។
                </p>
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
          data-testid="math-solver-error-alert"
          className="rounded-2xl border border-amber-500/40 bg-amber-950/40 p-4 sm:p-5 text-amber-200 shadow-xl space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300 font-sans">
                {error.stage === "extract"
                  ? "កំហុសក្នុងការស្រង់អត្ថបទ"
                  : "ការបង្កើតដំណោះស្រាយមិនបានសម្រេច"}
              </p>
              <p className="text-sm text-slate-100 font-medium font-sans leading-relaxed">
                {error.messageKhmer || "ការបង្កើតដំណោះស្រាយមិនបានសម្រេច។ សូមពិនិត្យបញ្ហា ហើយសាកល្បងម្ដងទៀត។"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-amber-500/20">
            {error.retryable && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-500 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>ព្យាយាមម្ដងទៀត (Retry)</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
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
                <span>ស្រង់អត្ថបទ/រូបភាពឡើងវិញ (Re-extract)</span>
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
              <span>កំពុងវិភាគរូបភាព និងស្វែងយល់ពីលំហាត់... (Analyzing visual elements...)</span>
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

            {/* Visual Interpretation Card (Before Solving) */}
            {extractedVisual && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3 text-xs text-cyan-200 space-y-1.5">
                <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  ការបកស្រាយពីទម្រង់រូបភាព (Visual Interpretation):
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1 text-slate-300">
                  <div>វត្ថុ៖ <span className="font-semibold text-white">{extractedVisual.recognizedObjects}</span></div>
                  <div>ចំនួន៖ <span className="font-semibold font-mono text-white">{extractedVisual.objectCount}</span></div>
                  {extractedVisual.arrangement && (
                    <div>រៀបចំ៖ <span className="font-semibold text-white">{extractedVisual.arrangement}</span></div>
                  )}
                  <div>ប្រមាណវិធី៖ <span className="font-semibold text-violet-300 font-mono">{extractedVisual.interpretedOperation}</span></div>
                </div>
              </div>
            )}

            {/* Uncertainty Warning Notice (Anti-Guessing / Low Confidence Safeguard) */}
            {(ambiguousParts.length > 0 || extractionConfidence === "low") && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-300">
                      សូមពិនិត្យនិងកែសម្រួលអក្សរដែលបានស្កេនមុននឹងគណនា (Please review the highlighted text before solving)
                    </span>
                    <p className="text-[11px] text-amber-300/80 mt-0.5">
                      សញ្ញាឬតួអក្សរមួយចំនួនមិនសូវច្បាស់។ សូមពិនិត្យផ្ទៀងផ្ទាត់ឡើងវិញក្នុងប្រអប់អត្ថបទមុនចុចដំណើរការ៖
                    </p>
                  </div>
                </div>
                {ambiguousParts.length > 0 && (
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
                )}
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
                placeholder="អត្ថបទលំហាត់នឹងបង្ហាញនៅទីនេះបន្ទាប់ពីបញ្ចូលរូបភាព ឬអ្នកអាចវាយបញ្ចូលដោយផ្ទាល់ (ឧ. ៤ × ៦ = ?)..."
                disabled={isBusy}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Answer-Verification Controls (Mode 3) */}
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
                id="solve-submit-btn"
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

      {/* Fresh Empty State when no result is present */}
      {!problemResult && !isBusy && !error && (
        <div
          data-testid="math-solver-empty-state"
          className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center space-y-3"
        >
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400">
            <BookOpen className="w-5 h-5 text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-slate-300 font-sans">
            សូមចុច ដោះស្រាយ ឬ បង្កើតដំណោះស្រាយ
          </p>
        </div>
      )}

      {/* STAGE 3: Solution Results Display */}
      {problemResult && (
        <div className="space-y-6">
          {/* Multiple Math Problems Selector */}
          {result?.problems && result.problems.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 p-3.5 rounded-2xl border border-violet-500/40 bg-slate-950/90 shadow-lg">
              <span className="text-xs font-bold text-violet-300 font-mono">
                បញ្ហាគណិតវិទ្យាដែលបានរកឃើញ ({result.problems.length}):
              </span>
              <div className="flex flex-wrap gap-2">
                {result.problems.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedProblemIndex(idx)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      selectedProblemIndex === idx
                        ? "bg-violet-600 text-white shadow-md ring-1 ring-violet-400"
                        : "bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    <span>លំហាត់ទី {idx + 1}</span>
                    <span className="text-[10px] opacity-75 font-mono truncate max-w-[120px]">
                      ({p.extractedProblem.slice(0, 15)}...)
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Top Result Action Bar */}
          <div className="rounded-2xl border border-indigo-500/30 bg-slate-950/90 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-sans">
                  {result.solverMode === "generate"
                    ? "ដំណោះស្រាយអប់រំ (Educational Solution Worksheet)"
                    : result.solverMode === "verify"
                    ? "លទ្ធផលផ្ទៀងផ្ទាត់ & ដំណោះស្រាយកែតម្រូវ"
                    : "ដំណោះស្រាយលំហាត់ (Math Solution)"}
                </h3>
                <p className="text-xs text-slate-400 font-sans">
                  {result.inferredGradeKhmer || "ថ្នាក់បឋមសិក្សា"} · {
                    result.solverMode === "solve"
                      ? "ដោះស្រាយលំហាត់ (ចម្លើយ)"
                      : result.solverMode === "generate"
                      ? "បង្កើតដំណោះស្រាយ (វិធីដោះស្រាយ)"
                      : "ដោះស្រាយ + ផ្ទៀងផ្ទាត់ (ពេញលេញ)"
                  }
                </p>
              </div>
            </div>

            {/* Universal Solution Actions: ចម្លងអត្ថបទ, ចម្លងកូដ HTML, ទាញយកឯកសារ HTML, មើល HTML Source, បោះពុម្ព, ចាប់ផ្តើមលំហាត់ថ្មី */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 1. Copy plain text */}
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:border-violet-500/50 transition-colors min-h-[36px]"
              >
                {copiedText ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-300">បានចម្លង!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-400" />
                    <span>Copy Clean Text (ចម្លងអត្ថបទ)</span>
                  </>
                )}
              </button>

              {/* 2. Copy as HTML Source */}
              <button
                type="button"
                onClick={handleCopyHtml}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-indigo-600/25 px-3.5 py-1.5 text-xs font-bold text-indigo-200 hover:bg-indigo-600/40 hover:text-white transition-colors min-h-[36px] shadow-sm"
              >
                {copiedHtml ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-300">បានចម្លងកូដ HTML រួចរាល់!</span>
                  </>
                ) : (
                  <>
                    <Code2 className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Copy Styled HTML (ចម្លងកូដ HTML)</span>
                  </>
                )}
              </button>

              {/* 3. Download as HTML */}
              <button
                type="button"
                onClick={handleDownloadHtml}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:border-violet-500/50 transition-colors min-h-[36px]"
              >
                <Download className="h-3.5 w-3.5 text-slate-400" />
                <span>Download (ទាញយក)</span>
              </button>

              {/* 4. Print */}
              <button
                type="button"
                onClick={() => typeof window !== "undefined" && window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:border-violet-500/50 transition-colors min-h-[36px]"
              >
                <Printer className="h-3.5 w-3.5 text-slate-400" />
                <span>Print (បោះពុម្ព)</span>
              </button>

              {/* 5. Start New Problem */}
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-950/40 px-3.5 py-1.5 text-xs font-bold text-violet-300 hover:bg-violet-900/60 hover:text-white transition-colors min-h-[36px]"
              >
                <PlusCircle className="h-3.5 w-3.5 text-violet-400" />
                <span>Start New Problem (លំហាត់ថ្មី)</span>
              </button>

              {/* 6. View HTML Source */}
              <button
                type="button"
                onClick={() => setShowTopHtmlModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors min-h-[36px]"
              >
                <Eye className="h-3.5 w-3.5 text-slate-400" />
                <span>HTML Source</span>
              </button>
            </div>
          </div>

          {/* HTML Source Preview Modal (Top Bar) */}
          {showTopHtmlModal && problemResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
              <div className="w-full max-w-3xl rounded-2xl border border-violet-500/40 bg-slate-950 p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">
                      កូដ HTML Source (HTML Document Source Code)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTopHtmlModal(false)}
                    className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  កូដ HTML ខាងក្រោមជាឯកសារពេញលេញ (Standalone Document) រួមមាន CSS, ភាសាខ្មែរ, និងគណនាតាមជួរឈរ។
                </p>

                <div className="flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                  <textarea
                    readOnly
                    value={renderCanonicalSolutionHtml(problemResult, {
                      gradeTitle: GRADE_OPTIONS.find((g) => g.id === gradeLevel)?.label || "ថ្នាក់បឋមសិក្សា",
                      solverModeTitle: result.solverMode.toUpperCase(),
                      solverMode: result.solverMode,
                    })}
                    rows={16}
                    className="w-full h-full p-4 font-mono text-xs text-emerald-300 bg-transparent resize-none focus:outline-none overflow-auto whitespace-pre"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      const src = renderCanonicalSolutionHtml(problemResult, {
                        gradeTitle: GRADE_OPTIONS.find((g) => g.id === gradeLevel)?.label || "ថ្នាក់បឋមសិក្សា",
                        solverModeTitle: result.solverMode.toUpperCase(),
                        solverMode: result.solverMode,
                      });
                      copyTextFallback(src);
                      setCopiedTopModalHtml(true);
                      setTimeout(() => setCopiedTopModalHtml(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                  >
                    {copiedTopModalHtml ? (
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
                    onClick={() => setShowTopHtmlModal(false)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    បិទ
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Canonical Solution Cards */}
          <div className="space-y-6">
            {result.problems.map((prob, idx) => (
              <SolutionCard
                key={prob.id || idx}
                problem={prob}
                index={idx}
                totalProblems={result.problems.length}
                gradeTitle={
                  GRADE_OPTIONS.find((g) => g.id === gradeLevel)?.label || "ថ្នាក់បឋមសិក្សា"
                }
                solverModeTitle={result.solverMode.toUpperCase()}
                solverMode={result.solverMode}
              />
            ))}
          </div>

          {/* Advanced Technical Diagnostics Accordion */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedSettings((prev) => !prev)}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Settings className="h-3.5 w-3.5 text-slate-500" />
                <span>ការកំណត់កម្រិតខ្ពស់ &amp; ពត៌មានបច្ចេកទេស (Advanced Settings &amp; Diagnostics)</span>
              </span>
              {showAdvancedSettings ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showAdvancedSettings && (
              <div className="border-t border-slate-800 p-4 space-y-2 text-xs font-mono text-slate-400 bg-slate-950/90">
                <div>ម៉ាស៊ីនដំណើរការ (Provider): {result.inferenceProvider}</div>
                <div>ទម្រង់ដំណោះស្រាយ (Mode): {result.solverMode}</div>
                <div>កម្រិតថ្នាក់ដែលបានជ្រើស (Selected Grade): {result.gradeLevel}</div>
                {result.inferredGrade && (
                  <div>កម្រិតថ្នាក់ដែលបានប៉ាន់ស្មាន (Inferred Grade): {result.inferredGrade} ({result.inferredGradeKhmer})</div>
                )}
                <div>រយៈពេលវិភាគ (Reasoning Time): {result.timings.reasoningMs} ms</div>
                <div>រយៈពេលសរុប (Total Time): {result.timings.totalMs} ms</div>
                {result.imageQualityNote && (
                  <div>ចំណាំគុណភាពរូបភាព៖ {result.imageQualityNote}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
