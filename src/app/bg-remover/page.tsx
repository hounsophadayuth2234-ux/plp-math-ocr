"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cpu,
  Loader2,
  AlertCircle,
  ImageOff,
  Zap,
  XCircle,
  RefreshCw,
  Server,
  Sparkles,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { ColorStudio } from "@/components/bg-remover/ColorStudio";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import {
  removeBackgroundBrowser,
  removeBackgroundRemote,
  compositeWithSolidColor,
  BgRemovalProgress,
  BgRemovalOutput,
} from "@/lib/bg-removal-client";
import { cyberAudio } from "@/lib/cyber-audio";
import { ObjectUrlRegistry } from "@/lib/processing-utils";

export default function BgRemoverPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  // Mode: "preview" (Fast Preview, 768px) vs "final" (Final Clean Cut, 2048px)
  const [processingMode, setProcessingMode] = useState<"preview" | "final">("preview");
  const [engineSource, setEngineSource] = useState<"browser" | "remote">("browser");

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressInfo, setProgressInfo] = useState<BgRemovalProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cached in-memory result
  const [cachedResult, setCachedResult] = useState<BgRemovalOutput | null>(null);
  const [initialCompositeUrl, setInitialCompositeUrl] = useState<string | null>(null);

  // AbortController and Object URL memory tracking
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const isProcessingRef = useRef(false);
  const urlRegistryRef = useRef<ObjectUrlRegistry>(new ObjectUrlRegistry());

  // Cleanup on unmount
  useEffect(() => {
    const registry = urlRegistryRef.current;
    return () => {
      registry.revokeAll();
    };
  }, []);

  const handleCancel = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    cyberAudio.stopScanningHum();
    cyberAudio.playClick();
    isProcessingRef.current = false;
    setIsProcessing(false);
    setProgressInfo(null);
    setError("Segmentation cancelled by user.");
  };

  // Main background removal executor
  const handleRunSegmentation = async (mode: "preview" | "final" = processingMode) => {
    if (isProcessingRef.current) {
      console.warn("[bg-remover] Blocked duplicate trigger: already processing.");
      return;
    }
    if (!imageFile) return;

    // Abort any prior in-flight job
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    isProcessingRef.current = true;
    setIsProcessing(true);
    setError(null);
    setProgressInfo(null);
    setProcessingMode(mode);

    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    try {
      let output: BgRemovalOutput;

      if (engineSource === "browser") {
        output = await removeBackgroundBrowser(imageFile, {
          mode,
          erosionRadius: 0, // Preserves thin hair strands and dark suit lapels
          featherRadius: 0.75, // Sub-pixel edge anti-aliasing
          decontaminationRadius: mode === "preview" ? 1 : 2, // Color decontamination
          alphaMatting: true,
          signal: abortController.signal,
          onProgress: (p) => setProgressInfo(p),
        });
      } else {
        output = await removeBackgroundRemote(imageFile, abortController.signal);
      }

      if (abortController.signal.aborted) return;

      // Composite initially onto White #FFFFFF
      const { dataUrl } = await compositeWithSolidColor(output.transparentBlob, "#FFFFFF");

      setCachedResult(output);
      setInitialCompositeUrl(dataUrl);

      cyberAudio.playSuccessChime();
    } catch (err: unknown) {
      cyberAudio.stopScanningHum();
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("[bg-remover] Error:", err);
      setError(
        err instanceof Error ? err.message : "Background removal segmentation failed."
      );
    } finally {
      cyberAudio.stopScanningHum();
      activeAbortControllerRef.current = null;
      isProcessingRef.current = false;
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  const handleFileSelect = (file: File | null) => {
    // Abort ongoing job if new image is uploaded
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
      isProcessingRef.current = false;
      setIsProcessing(false);
    }

    urlRegistryRef.current.revokeAll();
    setImageFile(file);
    setCachedResult(null);
    setInitialCompositeUrl(null);
    setError(null);
    setProgressInfo(null);

    if (file) {
      cyberAudio.playClick();
      const url = urlRegistryRef.current.create(file);
      setOriginalUrl(url);
    } else {
      setOriginalUrl(null);
    }
  };

  const handleReset = () => {
    if (isProcessingRef.current) return;
    cyberAudio.playClick();
    setImageFile(null);
    setOriginalUrl(null);
    setCachedResult(null);
    setInitialCompositeUrl(null);
    setError(null);
    setProgressInfo(null);
    urlRegistryRef.current.revokeAll();
  };

  const scannerSteps = [
    "[1/6] INITIALIZING NEURAL MODEL WEIGHTS & CACHE API...",
    "[2/6] PREPARING IMAGE MATRIX & BOUNDING ASPECT RATIO...",
    progressInfo?.stage
      ? `[3/6] ${progressInfo.stage.toUpperCase()}...`
      : "[3/6] EXECUTING ISNET HIGH-PRECISION SEGMENTATION...",
    "[4/6] REFINING MASK EDGES & RUNNING ALPHA MATTING...",
    "[5/6] LOCAL FOREGROUND DECONTAMINATION (REMOVING HALOS)...",
    "[6/6] COMPOSITING TRANSPARENT RGBA BUFFER ONTO CANVAS...",
  ];

  return (
    <div className="space-y-5 font-mono">
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
        <Link
          href="/"
          onClick={() => cyberAudio.playClick()}
          className="inline-flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>SYS://RETURN_DASHBOARD</span>
        </Link>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isProcessing ? "bg-amber-400 animate-ping" : "bg-emerald-400 animate-pulse"
              }`}
            />
            {isProcessing ? "SEGMENTATION: ACTIVE" : "BROWSER AI: ONLINE"}
          </span>
          <span className="rounded border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-cyan-300">
            {processingMode === "preview" ? "Fast Preview (768px)" : "Final Clean Cut (2048px)"}
          </span>
        </div>
      </div>

      {/* Main Control Console */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── LEFT: Control Deck & Tactical Switches ── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-5 space-y-5 shadow-[0_0_30px_rgba(0,0,0,0.7)] backdrop-blur-md">
            {/* Console Title */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                  SEGMENTATION CONTROL PANEL
                </h2>
              </div>
              <span className="text-[10px] text-cyan-400 font-semibold">MODULE 02</span>
            </div>

            {/* Mode Selector: Fast Preview vs Final Clean Cut */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] uppercase text-slate-400">
                <span>PROCESSING RESOLUTION MODE</span>
                <span className="text-cyan-400">PIPELINE_SELECT</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Fast Preview Mode */}
                <button
                  type="button"
                  onClick={() => {
                    if (isProcessing) return;
                    cyberAudio.playClick();
                    setProcessingMode("preview");
                  }}
                  disabled={isProcessing}
                  className={`flex flex-col gap-0.5 rounded-xl border p-2.5 text-left transition-all ${
                    processingMode === "preview"
                      ? "border-cyan-400 bg-cyan-950/50 text-white shadow-[0_0_15px_rgba(0,240,255,0.2)] ring-1 ring-cyan-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold text-white text-[11px]">
                    <Zap className="h-3.5 w-3.5 text-cyan-400" />
                    Fast Preview
                  </span>
                  <span className="text-[10px] text-cyan-400/80">
                    Max 768px · Cached
                  </span>
                </button>

                {/* Final Clean Cut Mode */}
                <button
                  type="button"
                  onClick={() => {
                    if (isProcessing) return;
                    cyberAudio.playClick();
                    setProcessingMode("final");
                  }}
                  disabled={isProcessing}
                  className={`flex flex-col gap-0.5 rounded-xl border p-2.5 text-left transition-all ${
                    processingMode === "final"
                      ? "border-emerald-400 bg-emerald-950/50 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold text-white text-[11px]">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    Final Clean Cut
                  </span>
                  <span className="text-[10px] text-emerald-400/80">
                    Max 2048px · Matting
                  </span>
                </button>
              </div>
            </div>

            {/* Input Upload Area */}
            <div>
              <BgUploadZone
                onFileSelect={handleFileSelect}
                selectedFile={imageFile}
                disabled={isProcessing}
                label="SOURCE INPUT"
                hint="PNG · JPG · WEBP"
              />
            </div>

            {/* Multi-Stage Loading Telemetry Banner */}
            {isProcessing && (
              <div className="space-y-2.5 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-300">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                    <span className="font-bold uppercase tracking-wider">
                      {progressInfo?.stage || "SEGMENTING FOREGROUND..."}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex items-center gap-1 rounded border border-rose-500/40 bg-rose-950/60 px-2 py-0.5 text-[10px] text-rose-300 hover:bg-rose-900/60 transition-colors"
                  >
                    <XCircle className="h-3 w-3" />
                    CANCEL
                  </button>
                </div>

                {progressInfo && progressInfo.percent > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400 transition-all duration-300"
                        style={{ width: `${progressInfo.percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-amber-400/80">
                      <span>Stage: {progressInfo.stage}</span>
                      <span>{progressInfo.percent}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Execution Buttons */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleRunSegmentation(processingMode)}
                disabled={!imageFile || isProcessing}
                className={`group relative w-full overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.98] ${
                  isProcessing
                    ? "pointer-events-none opacity-60 cursor-not-allowed border-slate-800 bg-slate-900/50"
                    : !imageFile
                    ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50"
                    : processingMode === "final"
                    ? "border-emerald-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 shadow-[0_0_25px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400/40"
                    : "border-cyan-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 shadow-[0_0_25px_rgba(0,240,255,0.25)] ring-1 ring-cyan-400/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                        processingMode === "final"
                          ? "border-emerald-400 bg-slate-950 text-emerald-400"
                          : "border-cyan-400 bg-slate-950 text-cyan-400"
                      }`}
                    >
                      {processingMode === "final" ? (
                        <Sparkles className="h-5 w-5" />
                      ) : (
                        <Zap className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-white">
                        {processingMode === "final"
                          ? "RUN FINAL CLEAN CUT (2048PX)"
                          : "RUN FAST PREVIEW (768PX)"}
                      </div>
                      <span className="text-[10px] text-slate-400 font-sans">
                        {processingMode === "final"
                          ? "Zero erosion · alpha matting · hair preserved"
                          : "High-speed preview · model caching"}
                      </span>
                    </div>
                  </div>

                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  ) : (
                    <span className="text-[10px] font-bold text-cyan-400">[ENGAGE]</span>
                  )}
                </div>
              </button>

              {/* Engine Toggle (Browser vs Remote Worker) */}
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                <span>Engine Source:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEngineSource("browser")}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      engineSource === "browser"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Browser AI (Free)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEngineSource("remote")}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      engineSource === "remote"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Remote Worker
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Processing Telemetry & Comprehensive Color Studio ── */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* Error Message */}
          {error && (
            <div className="flex flex-col gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs text-rose-300">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div>
                  <p className="font-bold uppercase tracking-wider text-rose-200">
                    EXECUTION ERROR
                  </p>
                  <p className="mt-0.5 opacity-90">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRunSegmentation(processingMode)}
                className="self-start mt-2 flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-900/40 px-3 py-1 text-xs text-rose-200 hover:bg-rose-900/70 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                RETRY
              </button>
            </div>
          )}

          {/* High-Tech Robotic Scanner Telemetry */}
          {isProcessing && (
            <RoboticScanner
              active={true}
              moduleName={
                processingMode === "final"
                  ? "FINAL CLEAN CUT // [ISNET FP16 + MATTING]"
                  : "FAST PREVIEW // [ISNET QUINT8]"
              }
              steps={scannerSteps}
              subtext={
                processingMode === "final"
                  ? "High-resolution segmentation preserving thin hair strands and tailoring borders"
                  : "High-speed preview segmentation with browser model caching"
              }
            />
          )}

          {/* Output Deck: ColorStudio */}
          {cachedResult && originalUrl && initialCompositeUrl && !isProcessing && (
            <div className="space-y-3">
              <ColorStudio
                originalUrl={originalUrl}
                transparentBlob={cachedResult.transparentBlob}
                transparentUrl={cachedResult.transparentUrl}
                alphaMaskUrl={cachedResult.alphaMaskUrl}
                initialCompositeUrl={initialCompositeUrl}
                width={cachedResult.width}
                height={cachedResult.height}
                mode={cachedResult.mode}
                provider={cachedResult.model}
                processingLabel={cachedResult.label}
                onReset={handleReset}
                onRerunFinal={() => handleRunSegmentation("final")}
              />
            </div>
          )}

          {/* Standby Empty State */}
          {!cachedResult && !isProcessing && !error && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-500/20 bg-slate-950/40 p-12 text-center shadow-[0_0_30px_rgba(0,0,0,0.6)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 shadow-inner">
                <ImageOff className="h-5 w-5 text-cyan-400" />
              </div>
              <h3 className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-300">
                DISPLAY HUD STANDBY
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">
                AWAITING SOURCE IMAGE UPLOAD &amp; MODE SELECTION
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
