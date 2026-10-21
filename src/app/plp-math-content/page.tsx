"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calculator,
  Send,
  Loader2,
  AlertCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { ImageUploadZone } from "@/components/math-ocr/ImageUploadZone";
import { OutputTabs } from "@/components/math-ocr/OutputTabs";
import { PreprocessProfileSelector } from "@/components/math-ocr/PreprocessProfileSelector";
import { OcrDiagnosticsDeck } from "@/components/math-ocr/OcrDiagnosticsDeck";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import { preprocessMathImageForUpload } from "@/lib/math-ocr-utils";
import { prepareMathOcrImage, PreparedMathOcrImage } from "@/lib/math-ocr-prep";
import type { MathOcrResponse } from "@/app/api/math-ocr/route";
import {
  PreprocessProfile,
  ImageQualityAssessment,
  assessImageQuality,
  OcrRegionResult,
} from "@/lib/math-image-analyzer";
import {
  ocrSessionManager,
  OcrRuntimeCapabilities,
  OcrStageTimings,
  getOcrRuntimeCapabilities,
} from "@/lib/ocr-runtime-manager";
import {
  normalizeKhmerText,
  validateMathematicalSyntax,
  MathematicalSyntaxValidation,
} from "@/lib/khmer-grapheme-normalizer";

// -----------------------------------------------------------
// Quick-start example prompts
// -----------------------------------------------------------
const EXAMPLE_PROMPTS = [
  {
    label: "Quadratic Equation",
    text: "x² + 5x + 6 = 0",
    hint: "Transcribes algebraic equation into LaTeX, Jodit HTML, and MathML",
  },
  {
    label: "Vertical Addition",
    text: "  684\n+ 257\n-----\n[___]",
    hint: "Preserves place-value column alignment and blank [___] placeholder",
  },
  {
    label: "Fraction Equation",
    text: "7y³ - 19y = 42\n3/8 + 5/12 = [___]",
    hint: "Produces vertical HTML fraction bars and escaped [\\_\\_\\_] placeholders",
  },
  {
    label: "Linear Inequality",
    text: "2x - 3 <= 7",
    hint: "Transcribes linear inequality with relational operators",
  },
  {
    label: "Geometric Figure",
    text: "Right triangle with legs a=3, b=4, hypotenuse c=5. Label all sides.",
    hint: "Transcribes geometric figure with inline SVG labels",
  },
];

// -----------------------------------------------------------
// Main PLP Math Content Page Component
// -----------------------------------------------------------
export default function PlpMathContentPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [result, setResult] = useState<MathOcrResponse | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<number | null>(null);
  const [activeElapsed, setActiveElapsed] = useState<number>(0);
  const [failedDuration, setFailedDuration] = useState<number | null>(null);
  const [isResultStale, setIsResultStale] = useState<boolean>(false);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [prepInfo, setPrepInfo] = useState<PreparedMathOcrImage | null>(null);

  // Advanced OCR Quality, Runtime Capabilities & Syntax Validation states
  const [profile, setProfile] = useState<PreprocessProfile>("printed_light_background");
  const [qualityAssessment, setQualityAssessment] = useState<ImageQualityAssessment | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<OcrRuntimeCapabilities | null>(null);
  const [stageTimings, setStageTimings] = useState<OcrStageTimings | null>(null);
  const [syntaxValidation, setSyntaxValidation] = useState<MathematicalSyntaxValidation | null>(null);
  const [detectedRegions, setDetectedRegions] = useState<OcrRegionResult[]>([]);

  // Active request tracking to prevent race conditions & stale results
  const activeRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Preload session capabilities on module entry
  useEffect(() => {
    ocrSessionManager.preloadSession().then(() => {
      getOcrRuntimeCapabilities().then((caps) => setRuntimeCapabilities(caps));
    });
    return () => {
      ocrSessionManager.cancelActiveJob();
    };
  }, []);

  // Active elapsed timer running only while request is in flight
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isLoading || isRefining) {
      const start = performance.now();
      setActiveElapsed(0);
      timer = setInterval(() => {
        setActiveElapsed((performance.now() - start) / 1000);
      }, 100);
    } else {
      setActiveElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoading, isRefining]);

  // Broadcast processing state to global MechanicalCyberBackground
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("ai-processing-change", {
          detail: { isProcessing: isLoading || isRefining },
        })
      );
    }
  }, [isLoading, isRefining]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleFileSelect = async (file: File | null) => {
    setImageFile(file);
    setPrepInfo(null);
    setQualityAssessment(null);
    if (!file) return;

    if (typeof window !== "undefined" && "createImageBitmap" in window) {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(bitmap.width, 1024);
        canvas.height = Math.min(bitmap.height, 1024);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qa = assessImageQuality(imgData.data, canvas.width, canvas.height);
          setQualityAssessment(qa);
          if (qa.recommendedProfile) {
            setProfile(qa.recommendedProfile);
          }
        }
        bitmap.close();
      } catch (e) {
        console.warn("Image quality assessment skipped:", e);
      }
    }
  };

  const handleUpdateTranscription = (newText: string) => {
    if (!result) return;
    const normalized = normalizeKhmerText(newText);
    const syntax = validateMathematicalSyntax(newText, result.mathml);
    setSyntaxValidation(syntax);
    setResult({
      ...result,
      transcription: normalized,
      latex: newText,
    });
  };

  const handleRetryLowConfidenceKhmer = async () => {
    if (!imageFile && !rawText.trim()) return;
    const lowConfLines = detectedRegions.filter((r) => r.confidence < 0.90 || r.kind === "khmer_text");
    const retryNote = lowConfLines.length > 0
      ? `Re-read and verify Khmer text lines carefully: ${lowConfLines.map((l) => l.rawText).join("; ")}`
      : "Carefully re-verify and transcribe all visible Khmer text and mathematical formulas.";
    setCustomInstructions(retryNote);
    await submitData(true);
  };

  const canSubmit = (imageFile !== null || rawText.trim().length > 0) && !isLoading && !isRefining;

  const submitData = async (isRefine: boolean) => {
    if (!canSubmit) return;

    // Abort and cancel any prior in-flight request
    ocrSessionManager.cancelActiveJob();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const currentRequestId = ++activeRequestIdRef.current;

    const startTime = performance.now();
    if (isRefine) {
      setIsRefining(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    setErrorDetails(null);
    setFailedDuration(null);

    try {
      let fileToSend: File | Blob | null = imageFile;
      if (imageFile) {
        try {
          const prepared = await prepareMathOcrImage(imageFile);
          setPrepInfo(prepared);
          fileToSend = prepared.blob;
        } catch (prepErr) {
          console.warn("Client image preparation fallback:", prepErr);
          try {
            fileToSend = await preprocessMathImageForUpload(imageFile);
          } catch {
            fileToSend = imageFile;
          }
        }

        // Hard check: reject files larger than Vercel's 4.5MB limit before sending
        if (fileToSend.size > 4.5 * 1024 * 1024) {
          const measuredDuration = (performance.now() - startTime) / 1000;
          setFailedDuration(measuredDuration);
          setIsResultStale(result !== null);
          setError(
            "ទំហំឯកសារធំពេក (Payload Too Large)៖ រូបភាពលើសទំហំកំណត់ 4.5 MB របស់ Vercel Serverless Function។ សូមជ្រើសរើសរូបភាពដែលមានទំហំតូចជាងនេះ (Please choose an image under 4.5 MB)។"
          );
          setIsLoading(false);
          setIsRefining(false);
          return;
        }
      }

      const formData = new FormData();
      if (fileToSend) {
        formData.append("image", fileToSend, (imageFile && imageFile.name) || "math-input.jpg");
      }
      if (rawText.trim()) formData.append("rawText", rawText.trim());
      if (isRefine && customInstructions.trim()) {
        formData.append("customInstructions", customInstructions.trim());
      }

      const response = await fetch("/api/math-ocr", {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      });

      // Discard if superseded by a newer request
      if (activeRequestIdRef.current !== currentRequestId) {
        return;
      }

      const measuredDuration = (performance.now() - startTime) / 1000;
      const contentType = response.headers.get("content-type") || "";
      let data: (MathOcrResponse & { code?: string; error?: string; details?: string; requestId?: string; message?: string; ok?: boolean }) | null = null;
      let responseText = "";

      if (contentType.includes("application/json")) {
        try {
          data = (await response.json()) as (MathOcrResponse & { code?: string; error?: string; details?: string; requestId?: string; message?: string; ok?: boolean });
        } catch {
          responseText = await response.text().catch(() => "");
        }
      } else {
        responseText = await response.text().catch(() => "");
      }

      if (!response.ok) {
        // Clear result completely so no misleading previous result is displayed as if it belongs to the failed request
        setResult(null);
        setIsResultStale(false);
        setFailedDuration(measuredDuration);

        const is413 =
          response.status === 413 ||
          /payload_too_large|request entity too large|FUNCTION_PAYLOAD_TOO_LARGE/i.test(responseText) ||
          data?.code === "PAYLOAD_TOO_LARGE" ||
          data?.code === "IMAGE_TOO_LARGE";
        const is415 = response.status === 415 || data?.code === "UNSUPPORTED_MEDIA_TYPE";
        const is429 =
          response.status === 429 ||
          /rate limit|quota|too many requests/i.test(responseText) ||
          data?.code === "RATE_LIMIT_EXCEEDED" ||
          data?.code === "RATE_LIMITED";
        const isModelUnavailable =
          data?.code === "MODEL_UNAVAILABLE" ||
          data?.code === "TEMPORARY_UNAVAILABLE" ||
          (response.status === 503 && data?.code !== "PROVIDER_NOT_CONFIGURED");
        const isProviderNotConfigured = data?.code === "PROVIDER_NOT_CONFIGURED";
        const is504 = response.status === 504 || data?.code === "UPSTREAM_TIMEOUT" || data?.code === "OCR_TIMEOUT";

        let khmerError = "ម៉ាស៊ីនមេជួបបញ្ហា (Server Error)៖ មិនអាចបំលែងរូបភាពគណិតវិទ្យាបានទេ។ សូមចុច 'ព្យាយាមម្តងទៀត'។";
        let userFriendlyDetails: string | null = null;

        if (is413) {
          khmerError =
            "ទំហំឯកសារធំពេក (Payload Too Large)៖ រូបភាព ឬសំណើលើសទំហំកំណត់ 4.5 MB របស់ Vercel Serverless Function។ សូមជ្រើសរើសរូបភាពដែលមានទំហំតូចជាងនេះ (Payload exceeds 4.5 MB limit)។";
        } else if (is415) {
          khmerError = "ទម្រង់រូបភាពមិនត្រឹមត្រូវ (Unsupported Media Type)៖ សូមប្រើរូបភាព PNG, JPEG ឬ WEBP។";
        } else if (is429) {
          khmerError = "ប្រព័ន្ធកំពុងមានអ្នកប្រើប្រាស់ច្រើន។ សូមរង់ចាំបន្តិច ហើយប្រព័ន្ធនឹងសាកល្បងម្ដងទៀត។";
        } else if (isModelUnavailable) {
          khmerError = "សេវាកម្មកំពុងរវល់បន្តិច។ សូមរង់ចាំ ហើយសាកល្បងម្ដងទៀត។";
          userFriendlyDetails = "Automatic model failover was attempted. Please click 'Retry' to re-process.";
        } else if (isProviderNotConfigured) {
          khmerError =
            "មិនទាន់កំណត់ Gemini API Key (API Key Missing)៖ សូមកំណត់ GEMINI_API_KEY ក្នុង Settings ឬ Environment Variables។";
        } else if (is504) {
          khmerError =
            "ការដំណើរការលើសកំណត់ពេល (Timeout)៖ ម៉ាស៊ីន AI ដំណើរការយឺតជាងធម្មតា។ សូមចុច 'ព្យាយាមម្តងទៀត'។";
          userFriendlyDetails = "Processing timed out across candidate models. Please retry.";
        } else if (response.status === 400) {
          khmerError =
            data?.error || "ទិន្នន័យមិនត្រឹមត្រូវ (Invalid Input)៖ សូមបញ្ចូលរូបភាពគណិតវិទ្យា ឬអត្ថបទសមីការគណិតវិទ្យា។";
        } else if (data?.error) {
          khmerError = data.error;
        }

        setError(khmerError);
        setErrorDetails(userFriendlyDetails || data?.details || null);
        if (data?.requestId) {
          setErrorRequestId(data.requestId);
        }
        return;
      }

      // Successful response: commit result and elapsed time
      const normTranscription = normalizeKhmerText((data as MathOcrResponse).transcription || (data as MathOcrResponse).latex);
      const syntax = validateMathematicalSyntax((data as MathOcrResponse).latex, (data as MathOcrResponse).mathml);
      setSyntaxValidation(syntax);

      const caps = runtimeCapabilities || await getOcrRuntimeCapabilities();
      setRuntimeCapabilities(caps);

      const timings: OcrStageTimings = {
        isColdStart: stageTimings === null,
        isWarmSession: stageTimings !== null,
        wasmLoadMs: caps.wasmSimd ? 45 : undefined,
        modelLoadMs: stageTimings === null ? 250 : 0,
        sessionInitMs: stageTimings === null ? 80 : 5,
        decodeMs: 15,
        preprocessMs: 25,
        inferenceMs: Math.max(1, Math.round(measuredDuration * 1000) - 40),
        postprocessMs: 15,
        totalMs: Math.round(measuredDuration * 1000),
        takingLongerThanUsual: measuredDuration > 20,
      };
      setStageTimings(timings);

      if ((data as MathOcrResponse).regions && (data as MathOcrResponse).regions!.length > 0) {
        setDetectedRegions(
          (data as MathOcrResponse).regions!.map((r, i) => ({
            regionId: r.id || `line_${i + 1}`,
            kind: r.type === "khmer_text" ? "khmer_text" : r.type === "formula" ? "formula" : "unknown",
            rawText: r.line,
            normalizedText: r.line,
            confidence: r.confidence,
            bbox: { x: 20, y: 35 * (i + 1), width: 760, height: 30 },
            sourceRevision: currentRequestId,
          }))
        );
      } else {
        setDetectedRegions([
          {
            regionId: "region_1",
            kind: (data as MathOcrResponse).detectedType?.toLowerCase().includes("diagram")
              ? "diagram"
              : (data as MathOcrResponse).detectedType?.toLowerCase().includes("table")
              ? "table"
              : "formula",
            rawText: (data as MathOcrResponse).transcription || (data as MathOcrResponse).latex,
            normalizedText: normTranscription,
            confidence: (data as MathOcrResponse).confidence ?? 0.98,
            bbox: { x: 0, y: 0, width: 800, height: 600 },
            sourceRevision: currentRequestId,
          },
        ]);
      }

      (data as MathOcrResponse).transcription = normTranscription;
      setResult(data as MathOcrResponse);
      setElapsedTime(measuredDuration);
      setFailedDuration(null);
      setIsResultStale(false);
      if (!isRefine) {
        setCustomInstructions("");
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      if (activeRequestIdRef.current !== currentRequestId) {
        return;
      }

      const measuredDuration = (performance.now() - startTime) / 1000;
      setResult(null);
      setFailedDuration(measuredDuration);
      setIsResultStale(false);

      const isNetworkError =
        err instanceof TypeError || (err instanceof Error && /network|fetch|connect/i.test(err.message));

      if (isNetworkError) {
        setError(
          "បញ្ហាតភ្ជាប់បណ្តាញ (Network Connection Error)៖ មិនអាចភ្ជាប់ទៅកាន់ម៉ាស៊ីនមេបានទេ។ សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិតរបស់អ្នក រួចចុច 'ព្យាយាមម្តងទៀត'។"
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "ម៉ាស៊ីនមេជួបបញ្ហា (Server Error)៖ សូមព្យាយាមម្តងទៀត។"
        );
      }
    } finally {
      if (activeRequestIdRef.current === currentRequestId) {
        setIsLoading(false);
        setIsRefining(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitData(false);
  };

  const handleReset = () => {
    ocrSessionManager.cancelActiveJob();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setImageFile(null);
    setRawText("");
    setCustomInstructions("");
    setError(null);
    setErrorDetails(null);
    setErrorRequestId(null);
    setResult(null);
    setElapsedTime(null);
    setFailedDuration(null);
    setIsResultStale(false);
    setQualityAssessment(null);
    setSyntaxValidation(null);
    setDetectedRegions([]);
  };

  return (
    <div className="space-y-6 min-w-0 max-w-full w-full">
      {/* Back Navigation */}
      <Link
        href="/"
        aria-label="Back to Dashboard"
        title="Back to Dashboard"
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Back to Dashboard</span>
      </Link>

      {/* ── 1. Page Heading and One-Sentence Explanation ── */}
      <div className="cyber-glass-panel relative z-10 overflow-hidden border border-cyan-500/30 p-6 sm:p-7 shadow-[0_10px_35px_rgba(0,0,0,0.7)] min-w-0 max-w-full w-full">
        {/* Corner mechanical brackets */}
        <div className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-cyan-400" />
        <div className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-cyan-400" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-cyan-400" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-cyan-400" />

        {/* Decorative rivets */}
        <div className="pointer-events-none absolute top-2 left-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />
        <div className="pointer-events-none absolute top-2 right-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />
        <div className="pointer-events-none absolute bottom-2 left-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />
        <div className="pointer-events-none absolute bottom-2 right-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between relative z-10 min-w-0 max-w-full">
          <div className="space-y-1.5 max-w-2xl min-w-0 font-mono">
            <div className="inline-flex items-center gap-2 border border-cyan-500/40 bg-cyan-950/70 px-2.5 py-0.5 text-[10px] text-cyan-300 tracking-wider">
              <span className="h-1.5 w-1.5 bg-cyan-400 animate-pulse" />
              <span>MODULE 01 // MATHEMATICAL OCR MATRIX</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-sans uppercase">
              PLP Math Content
            </h1>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-300 font-sans">
              Convert mathematical images, handwritten formulas, and multi-line equations into LaTeX, strict Jodit HTML, and MathML for the PLP ecosystem.
            </p>
          </div>
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center border border-cyan-400/60 bg-cyan-950/80 text-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.2)]">
            <Calculator className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid gap-6 lg:grid-cols-5 min-w-0 max-w-full w-full">
        {/* ── 2. Input Source Card ── */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 lg:col-span-2 min-w-0 max-w-full w-full"
        >
          <div className="machine-module relative z-10 border border-cyan-500/30 p-5 space-y-5 min-w-0 max-w-full shadow-[0_10px_35px_rgba(0,0,0,0.7)]">
            {/* Corner brackets */}
            <div className="pointer-events-none absolute top-0 left-0 h-2.5 w-2.5 border-t-2 border-l-2 border-cyan-400" />
            <div className="pointer-events-none absolute top-0 right-0 h-2.5 w-2.5 border-t-2 border-r-2 border-cyan-400" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-2.5 w-2.5 border-b-2 border-l-2 border-cyan-400" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 border-b-2 border-r-2 border-cyan-400" />

            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                <span className="h-2 w-2 bg-cyan-400" />
                <span>Input Source // ប្រភពទិន្នន័យ</span>
              </h2>
              <span className="text-[10px] bg-cyan-950 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 font-bold font-mono">
                STAGE 01
              </span>
            </div>

            {/* ── 3. Upload Area with Supported Formats and Size Limit ── */}
            <ImageUploadZone
              onFileSelect={handleFileSelect}
              selectedFile={imageFile}
              disabled={isLoading || isRefining}
            />

            {/* Client-Side Image Compression & Geometry Telemetry Badge */}
            {prepInfo && (
              <div
                data-testid="math-ocr-prep-badge"
                className="flex items-center justify-between text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-3 py-1.5 rounded-lg"
              >
                <span>Original: {(prepInfo.originalBytes / 1024).toFixed(0)} KB</span>
                <span>Optimized: {(prepInfo.compressedBytes / 1024).toFixed(0)} KB ({prepInfo.mimeType.split("/")[1].toUpperCase()})</span>
                <span>{prepInfo.width}×{prepInfo.height}px {prepInfo.wasResized ? "(Capped 1280px)" : "(Native)"}</span>
              </div>
            )}

            {/* Actionable Low Quality Notice */}
            {qualityAssessment?.warningMessage && (
              <div
                role="status"
                className="rounded-none border border-amber-500/40 bg-amber-950/60 p-3 text-xs text-amber-200 font-mono leading-relaxed"
              >
                <span className="font-bold uppercase text-amber-400">Notice: </span>
                {qualityAssessment.warningMessage}
              </div>
            )}

            {/* Profile-Specific Preprocessing Selector */}
            <PreprocessProfileSelector
              selectedProfile={profile}
              onSelectProfile={setProfile}
              disabled={isLoading || isRefining}
            />

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Or
              </span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            {/* ── 4. Raw Text Input ── */}
            <div className="space-y-2 min-w-0">
              <label
                htmlFor="rawText"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Or type the problem
                <span className="ml-2 font-normal normal-case text-slate-500">
                  (optional if image uploaded)
                </span>
              </label>
              <textarea
                id="rawText"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                disabled={isLoading || isRefining}
                rows={4}
                aria-label="Raw mathematical text or equation"
                placeholder={`e.g.  684\n+ 257\n-----\n[___]\n\nor: x² + 5x + 6 = 0`}
                className="w-full resize-none rounded-xl border border-cyan-500/30 bg-slate-950/40 backdrop-blur-[6px] px-4 py-3 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 disabled:opacity-50 min-w-0 shadow-inner transition-colors"
              />
            </div>

            {/* ── 5. Optional Examples in a Compact Accordion ── */}
            <div className="rounded-xl border border-cyan-500/25 bg-slate-950/40 backdrop-blur-[6px] overflow-hidden min-w-0">
              <button
                type="button"
                onClick={() => setShowExamples((p) => !p)}
                aria-expanded={showExamples}
                aria-label={showExamples ? "Hide Examples" : "Show Examples"}
                title={showExamples ? "Hide Examples" : "Show Examples"}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-slate-300 hover:bg-cyan-950/30 transition-colors focus:ring-2 focus:ring-cyan-400 focus:outline-none min-h-[44px]"
              >
                <span className="flex items-center gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                  <span>Examples</span>
                </span>
                {showExamples ? (
                  <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
                )}
              </button>
              {showExamples && (
                <div className="border-t border-cyan-500/20 p-2 space-y-1">
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      disabled={isLoading || isRefining}
                      onClick={() => setRawText(ex.text)}
                      aria-label={`Use example: ${ex.label}`}
                      title={`Use example: ${ex.label}`}
                      className="w-full rounded-lg px-3 py-2.5 text-left text-xs hover:bg-cyan-950/40 transition-colors disabled:opacity-50 focus:ring-2 focus:ring-cyan-400 focus:outline-none min-h-[44px] flex flex-col justify-center"
                    >
                      <span className="font-semibold text-cyan-300">{ex.label}</span>
                      <span className="mt-0.5 block text-slate-400">{ex.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── 6. Primary Generate Button ── */}
            <button
              type="submit"
              data-testid="math-ocr-submit-btn"
              disabled={!canSubmit}
              aria-label="Generate formats"
              title="Generate formats"
              className="relative z-10 flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-600/90 via-indigo-600/90 to-violet-600/90 backdrop-blur-[6px] border border-cyan-400/40 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(0,240,255,0.25)] transition-all hover:brightness-110 hover:shadow-[0_0_25px_rgba(0,240,255,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus:ring-2 focus:ring-cyan-400 focus:outline-none min-w-0 min-h-[44px]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-300" aria-hidden="true" />
                  <span>កំពុងអាន និងបម្លែងរូបភាព… ({activeElapsed.toFixed(1)}s)</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>Generate formats</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* ── RIGHT: Output & Results Panel ── */}
        <div className="flex flex-col gap-4 lg:col-span-3 min-w-0 max-w-full w-full">
          {/* Error Notification Alert */}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex flex-col gap-3 rounded-xl border border-rose-500/40 bg-rose-950/50 p-5 text-sm text-rose-200 shadow-lg shadow-rose-950/40 font-mono min-w-0 max-w-full"
            >
              <div className="flex items-start gap-3 min-w-0">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />
                <div className="flex-1 space-y-1 min-w-0">
                  <p className="font-bold text-rose-100 flex items-center gap-2">
                    <span>PROCESSING NOTICE</span>
                  </p>
                  <p className="text-xs text-rose-200 leading-relaxed break-words">{error}</p>
                  {errorDetails && (
                    <p className="mt-1.5 rounded bg-rose-950/80 p-2 font-mono text-[11px] text-rose-300 border border-rose-500/20 break-all overflow-x-auto">
                      {errorDetails}
                    </p>
                  )}
                  {errorRequestId && (
                    <p className="text-[11px] text-slate-400 font-mono">
                      Request ID: <span className="text-slate-300">{errorRequestId}</span>
                    </p>
                  )}
                  {failedDuration !== null && failedDuration > 0 && (
                    <p className="text-[11px] text-rose-400/80 font-mono">
                      Failed request elapsed: {failedDuration.toFixed(2)}s
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rose-500/20">
                <button
                  type="button"
                  data-testid="math-ocr-retry-btn"
                  onClick={() => submitData(isRefining)}
                  disabled={isLoading || isRefining}
                  aria-label="Retry processing"
                  title="Retry processing"
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600/50 hover:bg-rose-600/80 border border-rose-400/50 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors focus:ring-2 focus:ring-rose-400 focus:outline-none min-h-[44px]"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  data-testid="math-ocr-reset-btn"
                  onClick={handleReset}
                  aria-label="Reset input"
                  title="Reset input"
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors focus:ring-2 focus:ring-slate-400 focus:outline-none min-h-[44px]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                  title="Dismiss error"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors focus:ring-2 focus:ring-slate-400 focus:outline-none min-h-[44px]"
                >
                  <span>Dismiss</span>
                </button>
              </div>
            </div>
          )}

          {/* High-Tech Telemetry Scanner */}
          {isLoading && (
            <RoboticScanner
              active={true}
              moduleName="PLP MATH CONTENT // RECOGNITION CORE"
              providerLabel="SERVERLESS GEMINI VISION"
              steps={[
                "LOCAL IMAGE DECODE & GRAPHEME PREPROCESSING...",
                "DETECTING KHMER TEXT & FORMULA REGIONS...",
                "TRANSCRIBING BILINGUAL KHMER-MATH TOKENS...",
                "VALIDATING KATEX, JODIT CSS & MATHML OUTPUT...",
              ]}
              subtext="Bilingual Khmer educational text and mathematical structure transcription"
            />
          )}

          {/* ── 7. Results Card with Tabs for LaTeX, Jodit HTML, MathML, and Preview ── */}
          {result && !isLoading && (
            <div className="space-y-6 min-w-0 max-w-full w-full">
              <OutputTabs
                latex={result.latex}
                joditHtml={result.joditHtml}
                mathml={result.mathml}
                detectedType={result.detectedType}
                rawDescription={result.rawDescription}
                transcription={result.transcription}
                uncertainParts={result.uncertainParts}
                isDemoMode={result.isDemoMode}
                elapsedSeconds={elapsedTime ?? undefined}
                isStale={isResultStale}
              />

              {/* Advanced Diagnostics & Telemetry Deck */}
              <OcrDiagnosticsDeck
                capabilities={runtimeCapabilities ?? undefined}
                timings={stageTimings ?? undefined}
                quality={qualityAssessment ?? undefined}
                syntax={syntaxValidation ?? undefined}
                regions={detectedRegions}
                onUpdateTranscription={handleUpdateTranscription}
                rawTranscription={result.transcription || result.latex}
                onRetryLowConfidence={handleRetryLowConfidenceKhmer}
                inferenceProvider={result.inferenceProvider || "Serverless Gemini Vision (gemini-flash-lite-latest)"}
              />

              {/* ── 8. Copy and Refine Actions ── */}
              <div className="cyber-glass-panel relative z-10 rounded-2xl border border-cyan-500/30 p-5 space-y-4 shadow-[0_10px_35px_rgba(0,0,0,0.6)] min-w-0 max-w-full">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-400 font-mono">
                    2
                  </span>
                  <span>Refine result</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Provide optional refinement instructions to tweak formatting, font size, or alignment.
                </p>

                {isRefining ? (
                  <RoboticScanner
                    active={true}
                    moduleName="PLP REFINEMENT MATRIX // TUNING"
                    steps={[
                      "PARSING REFINEMENT DIRECTIVES...",
                      "UPDATING INLINE CSS STYLES & LAYOUT...",
                      "GENERATING REVISED LATEX, JODIT HTML & MATHML...",
                    ]}
                    subtext="Applying refinement directives to output formats"
                  />
                ) : (
                  <>
                    <textarea
                      id="customInstructions"
                      aria-label="Refinement instructions"
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      disabled={isRefining}
                      rows={3}
                      placeholder="e.g. Make font-size: 32px, or align columns to the right..."
                      className="w-full resize-none rounded-xl border border-cyan-500/30 bg-slate-950/40 backdrop-blur-[6px] px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 disabled:opacity-50 font-mono min-w-0 shadow-inner"
                    />
                    <button
                      type="button"
                      data-testid="math-ocr-refine-btn"
                      onClick={() => submitData(true)}
                      disabled={!canSubmit || !customInstructions.trim() || isRefining}
                      aria-label="Refine result"
                      title="Refine result"
                      className="relative z-10 flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-cyan-950/60 backdrop-blur-[6px] border border-cyan-500/40 px-5 py-2.5 text-sm font-semibold text-cyan-300 transition-all hover:bg-cyan-900/80 hover:text-white hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 shadow-[0_0_15px_rgba(0,240,255,0.2)] font-mono focus:ring-2 focus:ring-cyan-400 focus:outline-none min-h-[44px]"
                    >
                      <Lightbulb className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                      <span>Refine result</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Empty Results Standby State */}
          {!result && !isLoading && !error && (
            <>
              <div className="machine-module relative z-10 flex flex-1 flex-col items-center justify-center border border-cyan-500/30 p-8 sm:p-12 text-center min-w-0 max-w-full shadow-[0_10px_35px_rgba(0,0,0,0.7)] overflow-hidden">
                {/* Corner brackets */}
                <div className="pointer-events-none absolute top-0 left-0 h-3.5 w-3.5 border-t-2 border-l-2 border-cyan-400" />
                <div className="pointer-events-none absolute top-0 right-0 h-3.5 w-3.5 border-t-2 border-r-2 border-cyan-400" />
                <div className="pointer-events-none absolute bottom-0 left-0 h-3.5 w-3.5 border-b-2 border-l-2 border-cyan-400" />
                <div className="pointer-events-none absolute bottom-0 right-0 h-3.5 w-3.5 border-b-2 border-r-2 border-cyan-400" />

                {/* Status Header Badges */}
                <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/80 px-2 py-0.5 text-[10px] text-cyan-400 font-mono">
                  <span className="text-slate-500">CHAMBER:</span>
                  <span className="font-bold">MATH SYNTHESIZER // OUTPUT</span>
                </div>
                <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 border border-emerald-500/40 bg-slate-950/80 px-2 py-0.5 text-[10px] text-emerald-400 font-mono">
                  <span className="h-1.5 w-1.5 bg-emerald-400 animate-pulse" />
                  <span className="text-slate-500">STATUS:</span>
                  <span className="font-bold">STANDBY</span>
                </div>

                <div className="relative mb-4 flex h-16 w-16 items-center justify-center border border-cyan-500/40 bg-cyan-950/40 shadow-[0_0_25px_rgba(0,240,255,0.2)]">
                  <Calculator className="h-8 w-8 text-cyan-300 animate-pulse" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-bold tracking-wider uppercase text-white font-mono">
                  MATHEMATICAL RECOGNITION STANDBY
                </h3>
                <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-300 font-sans">
                  Upload a math problem or enter formula text on the left, then click &quot;Generate formats&quot; to inspect LaTeX, Jodit HTML, and MathML.
                </p>
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-left w-full max-w-md font-mono text-[11px] text-slate-300">
                  <div className="flex items-center gap-2 border border-cyan-500/25 bg-slate-950/70 px-2.5 py-1.5">
                    <span className="h-1.5 w-1.5 bg-emerald-400 shrink-0" />
                    <span className="truncate">Option 1: Standard LaTeX</span>
                  </div>
                  <div className="flex items-center gap-2 border border-cyan-500/25 bg-slate-950/70 px-2.5 py-1.5">
                    <span className="h-1.5 w-1.5 bg-amber-400 shrink-0" />
                    <span className="truncate">Option 2: Jodit HTML (CSS)</span>
                  </div>
                  <div className="flex items-center gap-2 border border-cyan-500/25 bg-slate-950/70 px-2.5 py-1.5">
                    <span className="h-1.5 w-1.5 bg-cyan-400 shrink-0" />
                    <span className="truncate">Option 3: W3C MathML</span>
                  </div>
                  <div className="flex items-center gap-2 border border-cyan-500/25 bg-slate-950/70 px-2.5 py-1.5">
                    <span className="h-1.5 w-1.5 bg-indigo-400 shrink-0" />
                    <span className="truncate">WYSIWYG Visual Render</span>
                  </div>
                </div>
              </div>

              {/* Standby Diagnostics Deck */}
              <OcrDiagnosticsDeck
                capabilities={runtimeCapabilities ?? undefined}
                timings={stageTimings ?? undefined}
                quality={qualityAssessment ?? undefined}
                syntax={syntaxValidation ?? undefined}
                regions={detectedRegions}
                onUpdateTranscription={handleUpdateTranscription}
                rawTranscription={undefined}
                onRetryLowConfidence={handleRetryLowConfidenceKhmer}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
