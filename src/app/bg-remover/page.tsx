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
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  removeBackgroundBrowser,
  removeBackgroundRemote,
  compositeWithSolidColor,
  BgRemovalOutput,
  BgRemovalProgress,
  STAGE_DEADLINES,
} from "@/lib/bg-removal-client";
import { bgWorkerManager } from "@/lib/bg-removal-worker-manager";
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
  const [slowNotice, setSlowNotice] = useState<string | null>(null);
  const [isModelCached, setIsModelCached] = useState(false);
  const [isWorkerConfigured, setIsWorkerConfigured] = useState(false);
  const [remoteNoticeOpen, setRemoteNoticeOpen] = useState(false);

  // Audio settings state
  const [audioMuted, setAudioMuted] = useState(() => cyberAudio.isMuted());
  const [audioVolume, setAudioVolume] = useState(() => cyberAudio.getVolume());

  // Concurrency & lifecycle refs
  const isProcessingRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const urlRegistryRef = useRef<ObjectUrlRegistry>(new ObjectUrlRegistry());
  const requestGenerationIdRef = useRef<number>(0);

  // Subscribe to audio changes
  useEffect(() => {
    return cyberAudio.subscribe(() => {
      setAudioMuted(cyberAudio.isMuted());
      setAudioVolume(cyberAudio.getVolume());
    });
  }, []);

  // Check settings for remote worker configuration on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.rembgSpaceUrlSet) {
          setIsWorkerConfigured(true);
        }
      })
      .catch(() => {});
  }, []);

  // Cleanup object URLs and active abort controller on unmount
  useEffect(() => {
    const registry = urlRegistryRef.current;
    return () => {
      registry.revokeAll();
      cyberAudio.stopScanningHum();
      bgWorkerManager.terminateActiveWorker();
      if (activeAbortControllerRef.current) {
        console.log("[bg-remover] ABORT TRIGGER: useEffect cleanup");
        activeAbortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancel = () => {
    bgWorkerManager.terminateActiveWorker();
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
    setSlowNotice(null);
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
          label: "Manual mask result",
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

    if (mode === "worker" && !isWorkerConfigured) {
      setRemoteNoticeOpen(true);
      return;
    }

    bgWorkerManager.terminateActiveWorker();
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
    setSlowNotice(null);
    setProgressInfo(null);
    setProcessingMode(mode);

    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    // ── Stage Deadlines & Stall Detection ──
    // 1. Soft slow notice at 20 seconds: Informational only, does NOT fail or abort
    const slowTimer = setTimeout(() => {
      if (activeAbortControllerRef.current === abortController) {
        setSlowNotice(
          `SYS_NOTICE: Model processing taking longer than usual on this device (elapsed: ${STAGE_DEADLINES.SLOW_NOTICE_SEC}s)...`
        );
      }
    }, STAGE_DEADLINES.SLOW_NOTICE_SEC * 1000);

    // 2. Cold asset download deadline: 120 seconds
    let assetLoadTimer: NodeJS.Timeout | null = setTimeout(() => {
      if (activeAbortControllerRef.current === abortController) {
        console.log(`[bg-remover] Asset download deadline reached (${STAGE_DEADLINES.COLD_ASSET_LOAD_SEC}s)`);
        abortController.abort(
          new Error(
            `ASSET_LOAD_TIMEOUT: Model asset loading timed out after ${STAGE_DEADLINES.COLD_ASSET_LOAD_SEC}s. Please check network connection and retry.`
          )
        );
      }
    }, STAGE_DEADLINES.COLD_ASSET_LOAD_SEC * 1000);

    // 3. Inference deadline: 60s for preview, 90s for final
    let inferenceTimer: NodeJS.Timeout | null = null;
    const startInferenceDeadline = () => {
      if (assetLoadTimer) {
        clearTimeout(assetLoadTimer);
        assetLoadTimer = null;
      }
      if (!inferenceTimer) {
        const infDuration =
          mode === "preview"
            ? STAGE_DEADLINES.INFERENCE_PREVIEW_SEC
            : STAGE_DEADLINES.INFERENCE_FINAL_SEC;
        inferenceTimer = setTimeout(() => {
          if (activeAbortControllerRef.current === abortController) {
            console.log(`[bg-remover] Inference deadline reached (${infDuration}s)`);
            abortController.abort(
              new Error(
                `INFERENCE_TIMEOUT: Model inference timed out after ${infDuration}s on this device. You can retry or open Manual Mask Mode.`
              )
            );
          }
        }, infDuration * 1000);
      }
    };

    try {
      console.log(`[bg-remover] Starting segmentation for ${imageFile.name}, mode=${mode}`);
      let output: BgRemovalOutput;

      if (mode === "worker") {
        output = await removeBackgroundRemote(imageFile, abortController.signal);
      } else {
        output = await removeBackgroundBrowser(imageFile, {
          mode,
          erosionRadius: 0,
          featherRadius: 0.75,
          decontaminationRadius: mode === "preview" ? 1 : 1.5,
          alphaMatting: true,
          signal: abortController.signal,
          onProgress: (p) => {
            setProgressInfo(p);
            if (p.stage === "Segmenting" || p.stage === "Refining mask") {
              startInferenceDeadline();
            }
          },
        });
      }

      console.log(`[bg-remover] Segmentation finished for ${imageFile.name}`);

      if (
        requestGenerationIdRef.current !== currentGenerationId ||
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController
      ) {
        console.log(`[bg-remover] Discarding result for ${imageFile.name} because superseded/stale`);
        return;
      }

      // Composite initially onto White #FFFFFF
      const { dataUrl } = await compositeWithSolidColor(output.transparentBlob, "#FFFFFF");

      if (
        requestGenerationIdRef.current !== currentGenerationId ||
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController
      ) {
        return;
      }

      setCachedResult(output);
      setInitialCompositeUrl(dataUrl);
      setIsModelCached(true);

      cyberAudio.playShutter();
      cyberAudio.playMetallicDing();
    } catch (err: unknown) {
      cyberAudio.stopScanningHum();

      const errMessage = err instanceof Error ? err.message : String(err);
      const isTimeout =
        errMessage.includes("TIMEOUT") ||
        (abortController.signal.reason instanceof Error &&
          abortController.signal.reason.message.includes("TIMEOUT"));

      if (isTimeout) {
        const rawReason =
          abortController.signal.reason instanceof Error
            ? abortController.signal.reason.message
            : errMessage;
        const cleanMsg = rawReason
          .replace("ASSET_LOAD_TIMEOUT: ", "")
          .replace("INFERENCE_TIMEOUT: ", "");
        setError(cleanMsg);
        return;
      }

      if (
        err instanceof Error &&
        (err.name === "NOT_CONFIGURED" || errMessage.includes("NOT_CONFIGURED"))
      ) {
        setError(
          "Remote Worker microservice is not configured in settings. Switched to Browser AI mode (runs locally with complete privacy and zero cost)."
        );
        setProcessingMode("preview");
        return;
      }

      if (
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController ||
        (err instanceof Error &&
          (err.name === "AbortError" || errMessage.toLowerCase().includes("abort")))
      ) {
        console.log(`[bg-remover] Exiting catch silently for ${imageFile.name} (aborted/superseded)`);
        return;
      }

      console.error("[bg-remover] Error:", err);
      setError(
        err instanceof Error ? err.message : "Background removal segmentation failed."
      );
    } finally {
      clearTimeout(slowTimer);
      if (assetLoadTimer) clearTimeout(assetLoadTimer);
      if (inferenceTimer) clearTimeout(inferenceTimer);
      setSlowNotice(null);

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
    bgWorkerManager.terminateActiveWorker();
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
      cyberAudio.playHydraulicHiss();
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
      {/* ── Top Telemetry Header with Robotic Audio Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/30 pb-3">
        <Link
          href="/"
          onClick={() => cyberAudio.playClick()}
          className="inline-flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-200 transition-colors uppercase tracking-wider"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>SYS://RETURN_DASHBOARD</span>
        </Link>

        {/* Audio Effects Control Deck & Engine Status */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Audio Mute/Unmute & Volume Slider */}
          <div className="flex items-center gap-2 rounded-none border border-cyan-500/30 bg-slate-950/80 px-2.5 py-1 text-xs shadow-[0_0_10px_rgba(0,240,255,0.08)]">
            <button
              type="button"
              onClick={() => cyberAudio.setMuted(!audioMuted)}
              className="flex items-center gap-1.5 text-cyan-300 hover:text-cyan-100 transition-colors active:scale-[0.98]"
              title={audioMuted ? "Unmute audio effects" : "Mute audio effects"}
            >
              {audioMuted ? (
                <VolumeX className="h-3.5 w-3.5 text-rose-400" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
              )}
              <span className="font-mono text-[10px] tracking-wider uppercase font-bold">
                {audioMuted ? "MUTED" : "AUDIO"}
              </span>
            </button>
            <span className="text-slate-700">|</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioMuted ? 0 : audioVolume}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (audioMuted) cyberAudio.setMuted(false);
                cyberAudio.setVolume(val);
              }}
              className="h-1 w-16 cursor-pointer appearance-none rounded-none bg-slate-800 accent-cyan-400"
              title={`Audio Volume: ${Math.round(audioVolume * 100)}%`}
            />
            <span className="font-mono text-[9px] text-slate-400 min-w-[24px]">
              {audioMuted ? "0%" : `${Math.round(audioVolume * 100)}%`}
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span
                className={`h-1.5 w-1.5 rounded-none ${
                  isProcessing
                    ? "bg-amber-400 animate-ping"
                    : isModelCached
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-cyan-400"
                }`}
              />
              {isProcessing
                ? progressInfo?.stage === "Loading model"
                  ? "LOADING ASSETS (WASM / WEIGHTS)"
                  : progressInfo?.stage === "Refining mask"
                  ? "REFINING MASK"
                  : "INFERENCE ACTIVE"
                : isModelCached
                ? "BROWSER AI: ONLINE (CACHED)"
                : "BROWSER AI: STANDBY (READY)"}
            </span>
            <span className="rounded-none border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-cyan-300 uppercase tracking-wider text-[10px] font-bold">
              {processingMode === "preview"
                ? "Fast Preview (1024px)"
                : processingMode === "final"
                ? "Clean Cut (2048px)"
                : "Remote Worker"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Control Console ── */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── LEFT: Control Deck & Tactical Switches ── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-none border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xs font-bold tracking-wider text-slate-200">
                {"// SEGMENTATION_CONFIG"}
              </h2>
              <span className="text-[10px] text-cyan-400 font-semibold font-mono">MODULE 02</span>
            </div>

            {/* Model Selection Layer: Fast Preview vs Clean Cut vs High-Quality Worker */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] uppercase text-slate-400 font-mono tracking-wider">
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
                  className={`flex flex-col gap-0.5 rounded-none border p-2 text-left transition-all ${
                    processingMode === "preview"
                      ? "border-cyan-400 bg-cyan-950/50 text-white shadow-[0_0_15px_rgba(0,240,255,0.2)] ring-1 ring-cyan-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1 font-bold text-white text-[10.5px] uppercase font-mono">
                    <Zap className="h-3 w-3 text-cyan-400 shrink-0" />
                    Fast Preview
                  </span>
                  <span className="text-[9.5px] text-cyan-400/80 font-mono">
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
                  className={`flex flex-col gap-0.5 rounded-none border p-2 text-left transition-all ${
                    processingMode === "final"
                      ? "border-emerald-400 bg-emerald-950/50 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1 font-bold text-white text-[10.5px] uppercase font-mono">
                    <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
                    Clean Cut
                  </span>
                  <span className="text-[9.5px] text-emerald-400/80 font-mono">
                    ISNet FP16 · 2048px
                  </span>
                </button>

                {/* 3. Experimental Worker Mode (Optional) */}
                <button
                  type="button"
                  onClick={() => {
                    if (isProcessing) return;
                    cyberAudio.playClick();
                    if (!isWorkerConfigured) {
                      setRemoteNoticeOpen(true);
                    }
                    setProcessingMode("worker");
                  }}
                  disabled={isProcessing}
                  className={`flex flex-col gap-0.5 rounded-none border p-2 text-left transition-all ${
                    processingMode === "worker"
                      ? "border-purple-400 bg-purple-950/50 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)] ring-1 ring-purple-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-bold text-white text-[10.5px] uppercase font-mono">
                      <Server className="h-3 w-3 text-purple-400 shrink-0" />
                      Remote Worker
                    </span>
                    {!isWorkerConfigured && (
                      <span className="text-[8px] bg-rose-950/80 text-rose-300 border border-rose-500/40 px-1 py-0.5">
                        NOT CONFIGURED
                      </span>
                    )}
                  </div>
                  <span className="text-[9.5px] text-purple-400/80 font-mono">
                    {isWorkerConfigured ? "Configured Service" : "Requires Setting"}
                  </span>
                </button>
              </div>

              {/* Informational note: Accurate labeling */}
              <p className="text-[10px] text-slate-500 pt-0.5 leading-relaxed font-mono">
                {processingMode === "preview"
                  ? "FAST PREVIEW (DEFAULT): @IMGLY/ISNET_FP16 (1024PX WORKING MASK). LOCAL CACHED INFERENCE, ZERO EROSION, SUB-PIXEL MATTING."
                  : processingMode === "final"
                  ? "CLEAN CUT: @IMGLY/ISNET_FP16 UP TO 2048PX INPUT LIMIT WITH REFINED MATTING."
                  : isWorkerConfigured
                  ? "REMOTE WORKER: EXTERNAL MICROSERVICE CONFIGURED (IMAGE WILL BE UPLOADED TO WORKER)."
                  : "REMOTE WORKER: NOT CONFIGURED IN SETTINGS. PLEASE SWITCH TO BROWSER AI MODE (ZERO COST, LOCAL PRIVACY)."}
              </p>
            </div>

            {/* Remote notice banner if clicked when unconfigured */}
            {remoteNoticeOpen && !isWorkerConfigured && (
              <div className="rounded-none border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span>REMOTE WORKER NOT CONFIGURED</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoteNoticeOpen(false)}
                    className="text-amber-400 hover:text-white"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10.5px] leading-relaxed text-amber-200/90 font-mono">
                  No remote background removal worker URL is configured. Browser AI mode is active and recommended (runs 100% locally on your machine with zero cloud cost and full privacy). To enable a remote worker, set BACKGROUND_REMOVAL_WORKER_URL in Settings.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setProcessingMode("preview");
                    setRemoteNoticeOpen(false);
                  }}
                  className="rounded-none border border-cyan-500/50 bg-cyan-950/60 px-2.5 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-900/60"
                >
                  SWITCH TO BROWSER AI (RECOMMENDED)
                </button>
              </div>
            )}

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
              <div className="space-y-2.5 rounded-none border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs shadow-[0_0_15px_rgba(245,158,11,0.15)] font-mono">
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
                    className="flex items-center gap-1 rounded-none border border-rose-500/40 bg-rose-950/60 px-2.5 py-1 text-[10px] font-mono text-rose-300 hover:bg-rose-900/60 transition-colors uppercase"
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
                        <span>
                          {progressInfo.modelLoadingPercent ??
                            (progressInfo.stage === "Loading model" ? progressInfo.percent : 100)}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-none bg-slate-800">
                        <div
                          className="h-full bg-cyan-400 transition-all duration-300"
                          style={{
                            width: `${
                              progressInfo.modelLoadingPercent ??
                              (progressInfo.stage === "Loading model" ? progressInfo.percent : 100)
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Processing / Segmentation Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-emerald-400">
                        <span>Inference &amp; Processing</span>
                        <span>
                          {progressInfo.processingPercent ??
                            (progressInfo.stage === "Segmenting" ? progressInfo.percent : 0)}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-none bg-slate-800">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-300"
                          style={{
                            width: `${
                              progressInfo.processingPercent ??
                              (progressInfo.stage === "Segmenting" ? progressInfo.percent : 0)
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {slowNotice && (
                  <div className="rounded-none border border-amber-500/30 bg-amber-950/40 p-2 text-[10px] text-amber-300 font-mono">
                    {slowNotice}
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
                className={`group relative w-full overflow-hidden rounded-none border p-4 text-left transition-all duration-200 active:scale-[0.98] font-mono ${
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
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-none border ${
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
                      <div className="text-xs font-black uppercase tracking-wider text-white font-mono">
                        {processingMode === "worker"
                          ? "RUN HIGH QUALITY WORKER (2048PX)"
                          : processingMode === "final"
                          ? "RUN FINAL CLEAN CUT (2048PX)"
                          : "AUTOMATIC CUT // RUN FAST PREVIEW (1024PX)"}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
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
                    <span className="text-[10px] font-bold text-cyan-400 font-mono">[ENGAGE]</span>
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
            <div className="flex flex-col gap-2 rounded-none border border-rose-500/50 bg-rose-950/40 p-4 shadow-[0_0_20px_rgba(244,63,94,0.2)] font-mono">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                    SEGMENTATION ERROR
                  </h4>
                  <p className="text-[11px] text-rose-200/80 leading-relaxed font-mono">{error}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleRunSegmentation(processingMode)}
                  className="flex items-center gap-1.5 rounded-none border border-rose-500/50 bg-rose-900/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-900/70 transition-colors uppercase"
                >
                  <RefreshCw className="h-3 w-3" />
                  RETRY
                </button>
                <button
                  type="button"
                  onClick={handleOpenManualMode}
                  className="flex items-center gap-1.5 rounded-none border border-cyan-500/50 bg-cyan-950/60 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-900/60 transition-colors shadow-[0_0_12px_rgba(0,240,255,0.2)] uppercase"
                >
                  <span>OPEN MANUAL MASK MODE</span>
                </button>
              </div>
            </div>
          )}

          {/* High-Tech Robotic Scanner Telemetry with Scanning Animation & Corner HUD */}
          {isProcessing && (
            <div className="relative overflow-hidden rounded-none border border-cyan-500/40 bg-slate-950/95 shadow-[0_0_35px_rgba(0,240,255,0.15)] font-mono">
              {/* Corner target reticles */}
              <div className="pointer-events-none absolute top-1.5 left-1.5 h-3 w-3 border-t-2 border-l-2 border-cyan-400 z-30" />
              <div className="pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 border-t-2 border-r-2 border-cyan-400 z-30" />
              <div className="pointer-events-none absolute bottom-1.5 left-1.5 h-3 w-3 border-b-2 border-l-2 border-cyan-400 z-30" />
              <div className="pointer-events-none absolute bottom-1.5 right-1.5 h-3 w-3 border-b-2 border-r-2 border-cyan-400 z-30" />

              {/* Corner HUD Telemetry Badges */}
              <div className="pointer-events-none absolute top-2 left-2 z-20 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/80 px-2 py-0.5 text-[10px] text-cyan-400">
                <span className="text-slate-500">SYS:</span> ONLINE
              </div>
              <div className="pointer-events-none absolute top-2 right-2 z-20 flex items-center gap-1.5 border border-amber-500/40 bg-slate-950/80 px-2 py-0.5 text-[10px] text-amber-300">
                <span className="h-1.5 w-1.5 bg-amber-400 animate-ping" />
                <span>STATUS: SEGMENTING</span>
              </div>
              <div className="pointer-events-none absolute bottom-2 left-2 z-20 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/80 px-2 py-0.5 text-[10px] text-cyan-400">
                <span className="text-slate-500">ENGINE:</span> @IMGLY/ISNET_FP16
              </div>
              <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/80 px-2 py-0.5 text-[10px] text-cyan-400">
                <span className="text-slate-500">MODE:</span> {processingMode.toUpperCase()}
              </div>

              {/* Laser Scanning Beam & Scanlines */}
              <div className="animate-laser-scan opacity-90" />
              <div className="pointer-events-none absolute inset-0 cyber-scanlines opacity-30 z-20" />

              {/* Live Image Preview Under Active Scan */}
              {originalUrl && (
                <div className="relative flex items-center justify-center p-6 min-h-[300px] bg-slate-950/60">
                  <img
                    src={originalUrl}
                    alt="Scanning in progress"
                    className="max-h-[360px] max-w-full object-contain opacity-70 filter brightness-90 contrast-125"
                  />
                </div>
              )}

              {/* Robotic Scanner telemetry console */}
              <div className="p-4 border-t border-cyan-500/30 bg-slate-900/90">
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
              </div>
            </div>
          )}

          {/* Output Deck: ColorStudio with Interactive Mask Correction Studio */}
          {cachedResult && originalUrl && initialCompositeUrl && !isProcessing && (
            <div className="space-y-3 font-mono">
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
            <div className="relative flex flex-1 flex-col items-center justify-center rounded-none border border-cyan-500/20 bg-slate-950/40 p-12 text-center shadow-[0_0_30px_rgba(0,0,0,0.6)] font-mono">
              {/* Corner reticles */}
              <div className="pointer-events-none absolute top-1.5 left-1.5 h-3 w-3 border-t border-l border-cyan-400/50" />
              <div className="pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 border-t border-r border-cyan-400/50" />
              <div className="pointer-events-none absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-cyan-400/50" />
              <div className="pointer-events-none absolute bottom-1.5 right-1.5 h-3 w-3 border-b border-r border-cyan-400/50" />

              <div className="flex h-12 w-12 items-center justify-center rounded-none border border-slate-800 bg-slate-900 shadow-inner">
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
