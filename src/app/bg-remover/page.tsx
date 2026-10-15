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
  const requestGenerationIdRef = useRef<number>(0);

  // Cleanup object URLs on unmount
  useEffect(() => {
    const registry = urlRegistryRef.current;
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
        console.log("[bg-remover] ABORT TRIGGER: useEffect cleanup");
        activeAbortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancel = () => {
    if (activeAbortControllerRef.current) {
      console.log("[bg-remover] ABORT TRIGGER: handleCancel");
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    cyberAudio.playClick();
    cyberAudio.stopScanningHum();
    isProcessingRef.current = false;
    setIsProcessing(false);
    setProgressInfo(null);
  };

  const handleOpenManualMode = async () => {
    if (!imageFile) return;
    setError(null);
    setIsProcessing(false);
    setProgressInfo(null);
    cyberAudio.playClick();

    let imgBitmap: ImageBitmap | null = null;
    try {
      imgBitmap = await createImageBitmap(imageFile);
      const maxDim = 1024;
      let w = imgBitmap.width;
      let h = imgBitmap.height;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(imgBitmap, 0, 0, w, h);
      const srcImageData = ctx.getImageData(0, 0, w, h);

      // Initial mask: full foreground (255) so user can carve away background with Remove brush
      const initialMask = new Uint8ClampedArray(w * h);
      initialMask.fill(255);

      const { createAlphaMaskDataUrl } = await import("@/lib/bg-removal-client");
      const maskUrl = createAlphaMaskDataUrl(initialMask, w, h);
      const { dataUrl: whiteUrl } = await compositeWithSolidColor(imageFile, "#FFFFFF");

      canvas.toBlob((blob) => {
        if (!blob) return;
        if (cachedResult?.transparentUrl) {
          try {
            URL.revokeObjectURL(cachedResult.transparentUrl);
          } catch {}
        }
        const transUrl = urlRegistryRef.current.create(blob);
        setCachedResult({
          transparentBlob: blob,
          transparentUrl: transUrl,
          alphaMaskUrl: maskUrl,
          alphaMaskBuffer: initialMask,
          sourceImageData: srcImageData,
          width: w,
          height: h,
          label: "Browser AI result",
          model: "Manual Edge Correction Studio",
          mode: "preview",
        });
        setInitialCompositeUrl(whiteUrl);
      }, "image/png");
    } catch (e) {
      console.error("Failed to open manual mode:", e);
    } finally {
      if (imgBitmap && typeof imgBitmap.close === "function") {
        imgBitmap.close();
      }
    }
  };

  const handleRunSegmentation = async (mode: "preview" | "final" | "worker") => {
    if (!imageFile) return;

    if (activeAbortControllerRef.current) {
      console.log(`[bg-remover] ABORT TRIGGER: handleRunSegmentation starting new mode=${mode}`);
      activeAbortControllerRef.current.abort();
    }
    const currentGenerationId = ++requestGenerationIdRef.current;
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    isProcessingRef.current = true;
    setIsProcessing(true);
    setError(null);
    setProgressInfo(null);
    setProcessingMode(mode);

    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    // Start 20-second timeout strictly after model loading begins
    let timeoutId: NodeJS.Timeout | null = null;
    let timeoutStarted = false;

    const startModelLoadingTimeout = () => {
      if (timeoutStarted) return;
      timeoutStarted = true;
      const duration = mode === "preview" ? 20000 : 45000;
      timeoutId = setTimeout(() => {
        if (activeAbortControllerRef.current === abortController) {
          console.log(`[bg-remover] ABORT TRIGGER: startModelLoadingTimeout reached ${duration}ms`);
          abortController.abort(new Error(mode === "preview" ? "TIMEOUT_20S" : "TIMEOUT_45S"));
        }
      }, duration);
    };

    // Safety timeout in case setup hangs before model loading begins
    const safetyTimeout = setTimeout(() => {
      if (!timeoutStarted && activeAbortControllerRef.current === abortController) {
        console.log(`[bg-remover] ABORT TRIGGER: safetyTimeout reached 30000ms`);
        abortController.abort(new Error(mode === "preview" ? "TIMEOUT_20S" : "TIMEOUT_45S"));
      }
    }, 30000);

    try {
      console.log(`[bg-remover] Starting segmentation for ${imageFile.name}, controllerId=${abortController.signal}`);
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
          onProgress: (p) => {
            setProgressInfo(p);
            if (p.stage === "Loading model" || p.stage === "Segmenting") {
              startModelLoadingTimeout();
            }
          },
        });
      }

      console.log(`[bg-remover] Segmentation finished for ${imageFile.name}, aborted=${abortController.signal.aborted}, isCurrent=${activeAbortControllerRef.current === abortController}`);

      if (
        requestGenerationIdRef.current !== currentGenerationId ||
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController
      ) {
        console.log(`[bg-remover] Discarding result for ${imageFile.name} because superseded/stale (gen=${currentGenerationId}, current=${requestGenerationIdRef.current})`);
        return;
      }

      // Composite initially onto White #FFFFFF
      const { dataUrl } = await compositeWithSolidColor(output.transparentBlob, "#FFFFFF");

      if (
        requestGenerationIdRef.current !== currentGenerationId ||
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController
      ) {
        console.log(`[bg-remover] Discarding composite for ${imageFile.name} because superseded/stale`);
        return;
      }

      setCachedResult(output);
      setInitialCompositeUrl(dataUrl);
      console.log(`[bg-remover] Set cachedResult successfully for ${imageFile.name}!`);

      cyberAudio.playSuccessChime();
    } catch (err: unknown) {
      console.log(`[bg-remover] Catch block for ${imageFile.name}:`, err, `aborted=${abortController.signal.aborted}, isCurrent=${activeAbortControllerRef.current === abortController}`);
      cyberAudio.stopScanningHum();

      const isTimeout =
        (abortController.signal.reason as Error)?.message?.includes("TIMEOUT") ||
        (err instanceof Error && (err.name.includes("TIMEOUT") || err.message.includes("TIMEOUT")));

      if (isTimeout) {
        console.log(`[bg-remover] TIMEOUT TRIGGERED for ${imageFile.name}`);
        setError(
          mode === "preview"
            ? "Fast Preview timed out after 20 seconds. You can retry or open Manual Mask Mode to refine edges directly."
            : "Processing timed out after 45 seconds. You can retry or open Manual Mask Mode."
        );
        return;
      }

      // If this execution was aborted by user or superseded by another operation, silently exit
      if (
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController ||
        (err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("abort")))
      ) {
        console.log(`[bg-remover] Exiting catch silently for ${imageFile.name}`);
        return;
      }

      console.error("[bg-remover] Error:", err);
      setError(
        err instanceof Error ? err.message : "Background removal segmentation failed."
      );
    } finally {
      clearTimeout(safetyTimeout);
      if (timeoutId) clearTimeout(timeoutId);
      console.log(`[bg-remover] Finally block for ${imageFile.name}, isCurrent=${activeAbortControllerRef.current === abortController}`);
      // Only tear down UI active state if THIS abortController is still the active one
      if (activeAbortControllerRef.current === abortController) {
        cyberAudio.stopScanningHum();
        activeAbortControllerRef.current = null;
        isProcessingRef.current = false;
        setIsProcessing(false);
        setProgressInfo(null);
      }
    }
  };

  const handleFileSelect = (file: File | null) => {
    console.log(`[bg-remover] handleFileSelect called for file=${file?.name}`);
    ++requestGenerationIdRef.current;
    if (activeAbortControllerRef.current) {
      console.log(`[bg-remover] ABORT TRIGGER: handleFileSelect aborting active controller for new file=${file?.name}`);
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
    ++requestGenerationIdRef.current;
    setImageFile(null);
    setOriginalUrl(null);
    setCachedResult(null);
    setInitialCompositeUrl(null);
    setError(null);
    setProgressInfo(null);
    urlRegistryRef.current.revokeAll();
  };

  const scannerSteps = [
    "[1/5] PREPARING IMAGE MATRIX (MAX 1024PX)...",
    "[2/5] LOADING MODEL WEIGHTS (ISNET_FP16 CACHE)...",
    progressInfo?.stage
      ? `[3/5] ${progressInfo.stage.toUpperCase()}...`
      : "[3/5] SEGMENTING FOREGROUND & BACKGROUND...",
    "[4/5] REFINING MASK EDGES & SUB-PIXEL MATTING (ZERO AGGRESSIVE EROSION)...",
    "[5/5] READY (COMPOSITING RGB CANVAS & ALPHA BUFFER)...",
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
                {/* 1. Fast Preview Mode (Default Browser AI) */}
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
                    ISNet FP16 · 1024px
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

                {/* 3. Experimental Worker Mode (Optional) */}
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
                    Remote Worker
                  </span>
                  <span className="text-[9.5px] text-purple-400/80">
                    Optional Worker
                  </span>
                </button>
              </div>

              {/* Informational note: Accurate labeling */}
              <p className="text-[10px] text-slate-500 pt-0.5 leading-relaxed">
                {processingMode === "preview"
                  ? "Fast Preview (Default): @imgly/isnet_fp16 resized to 1024px. Fast cached inference, zero erosion, sub-pixel matting."
                  : processingMode === "final"
                  ? "Clean Cut: @imgly/isnet_fp16 up to 2048px with edge refinement."
                  : "Remote Worker: Optional remote microservice if configured."}
              </p>
            </div>

            {/* Input Upload Area */}
            <div>
              <BgUploadZone
                onFileSelect={handleFileSelect}
                selectedFile={imageFile}
                disabled={false}
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

                {progressInfo && (
                  <div className="space-y-2 pt-1 font-mono">
                    {/* Model Loading Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-cyan-400">
                        <span>Model Loading</span>
                        <span>{progressInfo.modelLoadingPercent ?? (progressInfo.stage === "Loading model" ? progressInfo.percent : 100)}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-cyan-400 transition-all duration-300"
                          style={{
                            width: `${progressInfo.modelLoadingPercent ?? (progressInfo.stage === "Loading model" ? progressInfo.percent : 100)}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Processing / Segmentation Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-emerald-400">
                        <span>Inference &amp; Processing</span>
                        <span>{progressInfo.processingPercent ?? (progressInfo.stage === "Segmenting" ? progressInfo.percent : 0)}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-300"
                          style={{
                            width: `${progressInfo.processingPercent ?? (progressInfo.stage === "Segmenting" ? progressInfo.percent : 0)}%`,
                          }}
                        />
                      </div>
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
                          : "AUTOMATIC CUT // RUN FAST PREVIEW (1024PX)"}
                      </div>
                      <span className="text-[10px] text-slate-400 font-sans">
                        {processingMode === "worker"
                          ? "Remote microservice · optional"
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
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleRunSegmentation(processingMode)}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-900/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-900/70 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  RETRY
                </button>
                <button
                  type="button"
                  onClick={handleOpenManualMode}
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-500/50 bg-cyan-950/60 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-900/60 transition-colors shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                >
                  <span>OPEN MANUAL MASK MODE</span>
                </button>
              </div>
            </div>
          )}

          {/* High-Tech Robotic Scanner Telemetry */}
          {isProcessing && (
            <RoboticScanner
              active={true}
              moduleName={
                processingMode === "worker"
                  ? "REMOTE WORKER // [OPTIONAL SERVICE]"
                  : processingMode === "final"
                  ? "CLEAN CUT // [@IMGLY/ISNET_FP16 2048PX]"
                  : "FAST PREVIEW // [@IMGLY/ISNET_FP16 1024PX]"
              }
              steps={scannerSteps}
              subtext={
                processingMode === "worker"
                  ? "Remote background removal microservice if configured in settings"
                  : processingMode === "final"
                  ? "@imgly/isnet_fp16 browser AI with zero aggressive erosion and local color decontamination"
                  : "@imgly/isnet_fp16 high-speed preview segmentation with browser model caching"
              }
            />
          )}

          {/* Output Deck: ColorStudio with Interactive Mask Correction Studio */}
          {cachedResult && originalUrl && initialCompositeUrl && !isProcessing && (
            <div className="space-y-3">
              <ColorStudio
                originalUrl={originalUrl}
                originalFile={imageFile}
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
