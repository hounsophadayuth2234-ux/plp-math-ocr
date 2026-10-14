"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Zap,
  Sparkles,
  Server,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ImageOff,
  XCircle,
} from "lucide-react";
import {
  removeBackgroundBrowser,
  removeBackgroundRemote,
  compositeWithSolidColor,
  BgRemovalOutput,
  BgRemovalProgress,
} from "@/lib/bg-removal-client";
import { cyberAudio } from "@/lib/cyber-audio";
import { ObjectUrlRegistry } from "@/lib/processing-utils";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { ColorStudio } from "@/components/bg-remover/ColorStudio";
import { RoboticScanner } from "@/components/ui/RoboticScanner";

export default function BgRemoverPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cachedResult, setCachedResult] = useState<BgRemovalOutput | null>(null);
  const [initialCompositeUrl, setInitialCompositeUrl] = useState<string | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMode, setProcessingMode] = useState<"preview" | "final" | "worker">("preview");
  const [progressInfo, setProgressInfo] = useState<BgRemovalProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Worker availability state
  const [workerConfigured, setWorkerConfigured] = useState<boolean>(false);

  // Concurrency & lifecycle refs
  const isProcessingRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const urlRegistryRef = useRef<ObjectUrlRegistry>(new ObjectUrlRegistry());

  // Cleanup object URLs on unmount
  useEffect(() => {
    const registry = urlRegistryRef.current;
    // Check if remote worker is configured in /api/settings
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.backgroundRemovalWorkerConfigured) {
          setWorkerConfigured(true);
        }
      })
      .catch(() => {});

    return () => {
      registry.revokeAll();
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancel = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    cyberAudio.playClick();
    cyberAudio.stopScanningHum();
    isProcessingRef.current = false;
    setIsProcessing(false);
    setProgressInfo(null);
  };

  const handleRunSegmentation = async (mode: "preview" | "final" | "worker") => {
    if (isProcessingRef.current) return;
    if (!imageFile) return;

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

      if (mode === "worker") {
        output = await removeBackgroundRemote(imageFile, abortController.signal);
      } else {
        output = await removeBackgroundBrowser(imageFile, {
          mode,
          erosionRadius: 0, // Zero aggressive erosion: preserves thin legs, hair flyaways & lapels
          featherRadius: 0.75, // Sub-pixel boundary feathering
          decontaminationRadius: mode === "preview" ? 1 : 1.5, // Color decontamination
          alphaMatting: true,
          signal: abortController.signal,
          onProgress: (p) => setProgressInfo(p),
        });
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
      : "[3/6] EXECUTING NEURAL SEGMENTATION...",
    "[4/6] REFINING MASK EDGES (ZERO AGGRESSIVE EROSION, SUB-PIXEL MATTING)...",
    "[5/6] LOCAL FOREGROUND COLOR DECONTAMINATION (REMOVING HALOS)...",
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
            {processingMode === "preview"
              ? "Fast Preview (768px)"
              : processingMode === "final"
              ? "Final Clean Cut (2048px)"
              : "High-Quality Worker"}
          </span>
        </div>
      </div>

      {/* Main Control Console */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── LEFT: Control Deck & Tactical Switches ── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xs font-bold tracking-wider text-slate-200">
                // SEGMENTATION_CONFIG
              </h2>
              <span className="text-[10px] text-cyan-400 font-semibold">MODULE 02</span>
            </div>

            {/* Model Selection Layer: Fast Preview vs Clean Cut vs High-Quality Worker */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] uppercase text-slate-400">
                <span>MODEL SELECTION LAYER</span>
                <span className="text-cyan-400">SELECT_ENGINE</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {/* 1. Fast Preview Mode */}
                <button
                  type="button"
                  onClick={() => {
                    if (isProcessing) return;
                    cyberAudio.playClick();
                    setProcessingMode("preview");
                  }}
                  disabled={isProcessing}
                  className={`flex flex-col gap-0.5 rounded-xl border p-2 text-left transition-all ${
                    processingMode === "preview"
                      ? "border-cyan-400 bg-cyan-950/50 text-white shadow-[0_0_15px_rgba(0,240,255,0.2)] ring-1 ring-cyan-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1 font-bold text-white text-[10.5px]">
                    <Zap className="h-3 w-3 text-cyan-400 shrink-0" />
                    Fast Preview
                  </span>
                  <span className="text-[9.5px] text-cyan-400/80">
                    ISNet 768px · Cached
                  </span>
                </button>

                {/* 2. Clean Cut Mode (Standard Browser AI) */}
                <button
                  type="button"
                  onClick={() => {
                    if (isProcessing) return;
                    cyberAudio.playClick();
                    setProcessingMode("final");
                  }}
                  disabled={isProcessing}
                  className={`flex flex-col gap-0.5 rounded-xl border p-2 text-left transition-all ${
                    processingMode === "final"
                      ? "border-emerald-400 bg-emerald-950/50 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1 font-bold text-white text-[10.5px]">
                    <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
                    Clean Cut
                  </span>
                  <span className="text-[9.5px] text-emerald-400/80">
                    ISNet FP16 · 2048px
                  </span>
                </button>

                {/* 3. High-Quality Worker Mode (BiRefNet / RMBG) */}
                <button
                  type="button"
                  onClick={() => {
                    if (isProcessing) return;
                    cyberAudio.playClick();
                    setProcessingMode("worker");
                  }}
                  disabled={isProcessing}
                  className={`flex flex-col gap-0.5 rounded-xl border p-2 text-left transition-all ${
                    processingMode === "worker"
                      ? "border-purple-400 bg-purple-950/50 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)] ring-1 ring-purple-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1 font-bold text-white text-[10.5px]">
                    <Server className="h-3 w-3 text-purple-400 shrink-0" />
                    HQ Worker
                  </span>
                  <span className="text-[9.5px] text-purple-400/80">
                    BiRefNet / RMBG
                  </span>
                </button>
              </div>

              {/* Informational note: Accurate labeling */}
              <p className="text-[10px] text-slate-500 pt-0.5 leading-relaxed">
                {processingMode === "preview"
                  ? "ISNet Quantized: Fastest browser turnaround. Perfect for quick alignment."
                  : processingMode === "final"
                  ? "ISNet FP16 (Standard Browser AI): Non-destructive edge refinement, zero erosion, sub-pixel feathering."
                  : "BiRefNet / RMBG Worker: High-fidelity dichotomous matting for complex animal limbs, flyaways & gaps."}
              </p>
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

            {/* Execution Button */}
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
                    : processingMode === "worker"
                    ? "border-purple-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-purple-950/40 shadow-[0_0_25px_rgba(168,85,247,0.25)] ring-1 ring-purple-400/40"
                    : processingMode === "final"
                    ? "border-emerald-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 shadow-[0_0_25px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400/40"
                    : "border-cyan-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 shadow-[0_0_25px_rgba(0,240,255,0.25)] ring-1 ring-cyan-400/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                        processingMode === "worker"
                          ? "border-purple-400 bg-slate-950 text-purple-400"
                          : processingMode === "final"
                          ? "border-emerald-400 bg-slate-950 text-emerald-400"
                          : "border-cyan-400 bg-slate-950 text-cyan-400"
                      }`}
                    >
                      {processingMode === "worker" ? (
                        <Server className="h-5 w-5" />
                      ) : processingMode === "final" ? (
                        <Sparkles className="h-5 w-5" />
                      ) : (
                        <Zap className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-white">
                        {processingMode === "worker"
                          ? "RUN HIGH QUALITY WORKER (2048PX)"
                          : processingMode === "final"
                          ? "RUN FINAL CLEAN CUT (2048PX)"
                          : "RUN FAST PREVIEW (768PX)"}
                      </div>
                      <span className="text-[10px] text-slate-400 font-sans">
                        {processingMode === "worker"
                          ? "BiRefNet / RMBG microservice · high precision"
                          : processingMode === "final"
                          ? "Zero erosion · sub-pixel matting · hair preserved"
                          : "High-speed preview · browser model caching"}
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
            </div>
          </div>
        </div>

        {/* ── RIGHT: Preview & Interactive Mask Studio Deck ── */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* Error Banner with Retry */}
          {error && (
            <div className="flex flex-col gap-2 rounded-2xl border border-rose-500/50 bg-rose-950/40 p-4 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                    SEGMENTATION ERROR
                  </h4>
                  <p className="text-[11px] text-rose-200/80 leading-relaxed font-sans">{error}</p>
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
                processingMode === "worker"
                  ? "HIGH-QUALITY WORKER // [BIREFNET / RMBG]"
                  : processingMode === "final"
                  ? "CLEAN CUT // [ISNET FP16 + MATTING]"
                  : "FAST PREVIEW // [ISNET QUINT8]"
              }
              steps={scannerSteps}
              subtext={
                processingMode === "worker"
                  ? "BiRefNet dichotomous image segmentation preserving fine animal limbs and narrow gaps"
                  : processingMode === "final"
                  ? "Standard browser AI with zero aggressive erosion and local color decontamination"
                  : "High-speed preview segmentation with browser model caching"
              }
            />
          )}

          {/* Output Deck: ColorStudio with Interactive Mask Correction Studio */}
          {cachedResult && originalUrl && initialCompositeUrl && !isProcessing && (
            <div className="space-y-3">
              <ColorStudio
                originalUrl={originalUrl}
                transparentBlob={cachedResult.transparentBlob}
                transparentUrl={cachedResult.transparentUrl}
                alphaMaskUrl={cachedResult.alphaMaskUrl}
                alphaMaskBuffer={cachedResult.alphaMaskBuffer}
                sourceImageData={cachedResult.sourceImageData}
                initialCompositeUrl={initialCompositeUrl}
                width={cachedResult.width}
                height={cachedResult.height}
                mode={cachedResult.mode}
                provider={cachedResult.model}
                processingLabel={cachedResult.label}
                metrics={cachedResult.metrics}
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
