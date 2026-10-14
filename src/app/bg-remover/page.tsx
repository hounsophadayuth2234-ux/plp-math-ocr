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
  Lock,
  XCircle,
  RefreshCw,
  Server,
  Layers,
} from "lucide-react";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { ColorStudio } from "@/components/bg-remover/ColorStudio";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import {
  removeBackgroundBrowser,
  removeBackgroundRemote,
  compositeWithSolidColor,
  BgRemovalProgress,
} from "@/lib/bg-removal-client";
import { cyberAudio } from "@/lib/cyber-audio";
import { ProcessingStatusLabel } from "@/lib/types";
import { ObjectUrlRegistry } from "@/lib/processing-utils";

interface ProcessResult {
  transparentBlob: Blob;
  compositeUrl: string;
  width: number;
  height: number;
  provider: string;
  label: ProcessingStatusLabel;
}

export default function BgRemoverPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [activeFeature, setActiveFeature] = useState<"question" | "solution">("question");
  const [engineMode, setEngineMode] = useState<"browser" | "remote">("browser");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressInfo, setProgressInfo] = useState<BgRemovalProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  // Synchronous mutex lock & cancellation
  const isProcessingRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const urlRegistryRef = useRef<ObjectUrlRegistry>(new ObjectUrlRegistry());

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
    setError("Operation cancelled by user.");
  };

  const handleExecuteFeature = async (mode: "question" | "solution") => {
    if (isProcessingRef.current) {
      console.warn("[bg-remover] Blocked duplicate trigger: already processing.");
      return;
    }
    if (!imageFile) return;

    isProcessingRef.current = true;
    setIsProcessing(true);
    setActiveFeature(mode);
    setError(null);
    setResult(null);
    setProgressInfo(null);

    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    const targetBgColor = mode === "solution" ? "#FFF0F5" : "#FFFFFF";

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    try {
      let removalOutput;

      if (engineMode === "browser") {
        removalOutput = await removeBackgroundBrowser(imageFile, {
          signal: abortController.signal,
          onProgress: (p) => setProgressInfo(p),
        });
      } else {
        removalOutput = await removeBackgroundRemote(
          imageFile,
          abortController.signal
        );
      }

      const { transparentBlob, width, height, label, model } = removalOutput;

      // Draw cutout onto HTML Canvas with background color
      const { dataUrl } = await compositeWithSolidColor(
        transparentBlob,
        targetBgColor
      );

      setResult({
        transparentBlob,
        compositeUrl: dataUrl,
        width,
        height,
        provider: model,
        label,
      });

      cyberAudio.playSuccessChime();
    } catch (err: unknown) {
      cyberAudio.stopScanningHum();
      if (err instanceof Error && err.name === "AbortError") {
        console.log("[bg-remover] Request aborted by client.");
        return;
      }
      console.error("[bg-remover] Background removal error:", err);
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

  const handleReset = () => {
    if (isProcessingRef.current) return;
    cyberAudio.playClick();
    setResult(null);
    setError(null);
    setImageFile(null);
    setProgressInfo(null);
    urlRegistryRef.current.revokeAll();
  };

  const isQuestion = activeFeature === "question";

  const scannerSteps = [
    engineMode === "browser"
      ? "[1/4] INITIALIZING IN-BROWSER WEBGPU/WASM RUNTIME..."
      : "[1/4] CONNECTING TO REMOTE WORKER ENDPOINT...",
    engineMode === "browser"
      ? progressInfo
        ? `[2/4] ${progressInfo.stage}`
        : "[2/4] EXECUTING IN-BROWSER ISNET SEGMENTATION..."
      : "[2/4] STREAMING IMAGE BUFFER TO WORKER...",
    "[3/4] REFINING ALPHA MATTING & COLOR DECONTAMINATION...",
    isQuestion
      ? "[4/4] COMPOSITING SOLID WHITE (#FFFFFF) ONTO HTML5 CANVAS..."
      : "[4/4] COMPOSITING SOLID PINK (#FFF0F5) ONTO HTML5 CANVAS...",
  ];

  return (
    <div className="space-y-5">
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
        <Link
          href="/"
          onClick={() => cyberAudio.playClick()}
          className="inline-flex items-center gap-2 font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>SYS://RETURN_DASHBOARD</span>
        </Link>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isProcessing ? "bg-amber-400 animate-ping" : "bg-emerald-400 animate-pulse"
              }`}
            />
            {isProcessing
              ? engineMode === "browser"
                ? "BROWSER AI: RUNNING"
                : "WORKER: STREAMING"
              : engineMode === "browser"
              ? "BROWSER AI CORE: READY"
              : "REMOTE WORKER: READY"}
          </span>
          <span className="rounded border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-cyan-300">
            {engineMode === "browser" ? "Zero Cost · Client-Side" : "Worker / HF Space"}
          </span>
        </div>
      </div>

      {/* Main High-Tech Control Console */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── LEFT: Control Deck & Mechanical Switches ── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-5 space-y-5 shadow-[0_0_30px_rgba(0,0,0,0.7)] backdrop-blur-md">
            {/* Terminal Title */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-400" />
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                  SEGMENTATION CONTROL PANEL
                </h2>
              </div>
              <span className="font-mono text-[10px] text-cyan-400/90 font-semibold">
                MODULE 02
              </span>
            </div>

            {/* Engine Selection Mode */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase text-slate-400">
                <span>EXECUTION ENGINE</span>
                <span className="text-cyan-400">ENGINE_SELECT</span>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (isProcessing) return;
                    cyberAudio.playClick();
                    setEngineMode("browser");
                  }}
                  disabled={isProcessing}
                  className={`flex flex-col gap-0.5 rounded-xl border p-2.5 text-left transition-all ${
                    engineMode === "browser"
                      ? "border-emerald-500 bg-emerald-950/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold text-white text-[11px]">
                    <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                    Browser AI
                  </span>
                  <span className="text-[10px] text-emerald-400/80">
                    100% Free · Client-Side
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isProcessing) return;
                    cyberAudio.playClick();
                    setEngineMode("remote");
                  }}
                  disabled={isProcessing}
                  className={`flex flex-col gap-0.5 rounded-xl border p-2.5 text-left transition-all ${
                    engineMode === "remote"
                      ? "border-cyan-500 bg-cyan-950/40 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)]"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold text-white text-[11px]">
                    <Server className="h-3.5 w-3.5 text-cyan-400" />
                    Remote Worker
                  </span>
                  <span className="text-[10px] text-cyan-400/80">
                    HF Space / Local API
                  </span>
                </button>
              </div>
            </div>

            {/* Input Upload Area */}
            <div>
              <BgUploadZone
                onFileSelect={(f) => {
                  if (f) cyberAudio.playClick();
                  setImageFile(f);
                }}
                selectedFile={imageFile}
                disabled={isProcessing || !!result}
                label="SOURCE INPUT"
                hint="PNG · JPG · WEBP · max 15MB"
              />
            </div>

            {/* Progress & Cancel Banner when Processing */}
            {isProcessing && (
              <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 font-mono text-xs shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                    <span className="font-bold uppercase tracking-wider">
                      {progressInfo?.stage || "PROCESSING SEGMENTATION..."}
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
                        className="h-full bg-gradient-to-r from-amber-500 to-cyan-400 transition-all duration-200"
                        style={{ width: `${progressInfo.percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-amber-400/80">
                      <span>Progress</span>
                      <span>{progressInfo.percent}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Heavy-Duty Mechanical Execution Switches */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase text-slate-400">
                <span>SELECT EXECUTION CHANNEL</span>
                <span className="text-cyan-400">
                  {isProcessing ? "INPUT LOCKED" : "TACTILE SWITCH"}
                </span>
              </div>

              {/* Switch A: White / Question (#FFFFFF) */}
              <button
                type="button"
                onClick={() => handleExecuteFeature("question")}
                disabled={!imageFile || isProcessing}
                className={`group relative w-full overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.98] ${
                  isProcessing
                    ? "pointer-events-none opacity-60 cursor-not-allowed border-slate-800 bg-slate-900/50"
                    : !imageFile
                    ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50"
                    : isQuestion
                    ? "border-cyan-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 shadow-[0_0_25px_rgba(0,240,255,0.25)] ring-1 ring-cyan-400/40"
                    : "border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="absolute top-1.5 right-1.5 h-2 w-2 border-t border-r border-cyan-400/50" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-all ${
                        isQuestion
                          ? "border-cyan-400 bg-slate-950 shadow-[0_0_12px_rgba(0,240,255,0.4)]"
                          : "border-slate-700 bg-slate-950"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full border border-slate-300 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
                      {isQuestion && (
                        <span className="absolute -inset-0.5 rounded-lg border border-cyan-400/50 animate-pulse" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black uppercase tracking-wide text-white">
                          CH-01 // កាត់រូបដាក់សំណួរ
                        </span>
                        <span className="rounded bg-white/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-white">
                          #FFFFFF
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-cyan-300/80">
                        WHITE BACKDROP · ZERO ARTIFACTS
                      </span>
                    </div>
                  </div>

                  {isProcessing && isQuestion ? (
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-cyan-400 font-bold">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                      <span>[PROCESSING...]</span>
                    </div>
                  ) : isProcessing ? (
                    <span className="font-mono text-[10px] text-slate-600 font-bold">
                      [LOCKED]
                    </span>
                  ) : (
                    <span
                      className={`font-mono text-[10px] font-bold transition-colors ${
                        isQuestion ? "text-cyan-400" : "text-slate-600"
                      }`}
                    >
                      {isQuestion ? "[ACTIVE]" : "[ENGAGE]"}
                    </span>
                  )}
                </div>
              </button>

              {/* Switch B: Pink / Solution (#FFF0F5) */}
              <button
                type="button"
                onClick={() => handleExecuteFeature("solution")}
                disabled={!imageFile || isProcessing}
                className={`group relative w-full overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.98] ${
                  isProcessing
                    ? "pointer-events-none opacity-60 cursor-not-allowed border-slate-800 bg-slate-900/50"
                    : !imageFile
                    ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50"
                    : !isQuestion
                    ? "border-pink-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-pink-950/40 shadow-[0_0_25px_rgba(255,105,180,0.25)] ring-1 ring-pink-400/40"
                    : "border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="absolute top-1.5 right-1.5 h-2 w-2 border-t border-r border-pink-400/50" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-all ${
                        !isQuestion
                          ? "border-pink-400 bg-slate-950 shadow-[0_0_12px_rgba(255,105,180,0.4)]"
                          : "border-slate-700 bg-slate-950"
                      }`}
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-pink-300 shadow-[0_0_10px_rgba(255,182,193,0.9)]"
                        style={{ backgroundColor: "#FFF0F5" }}
                      />
                      {!isQuestion && (
                        <span className="absolute -inset-0.5 rounded-lg border border-pink-400/50 animate-pulse" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black uppercase tracking-wide text-white">
                          CH-02 // កាត់រូបដាក់ដំណោះស្រាយ
                        </span>
                        <span className="rounded bg-pink-500/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-pink-300">
                          #FFF0F5
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-pink-300/80">
                        PINK BACKDROP · ZERO ARTIFACTS
                      </span>
                    </div>
                  </div>

                  {isProcessing && !isQuestion ? (
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-pink-400 font-bold">
                      <Loader2 className="h-4 w-4 animate-spin text-pink-400" />
                      <span>[PROCESSING...]</span>
                    </div>
                  ) : isProcessing ? (
                    <span className="font-mono text-[10px] text-slate-600 font-bold">
                      [LOCKED]
                    </span>
                  ) : (
                    <span
                      className={`font-mono text-[10px] font-bold transition-colors ${
                        !isQuestion ? "text-pink-400" : "text-slate-600"
                      }`}
                    >
                      {!isQuestion ? "[ACTIVE]" : "[ENGAGE]"}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: High-Tech Processing Scanner & Output Deck ── */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* Error Alert with Retry / Engine switch */}
          {error && (
            <div className="flex flex-col gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 font-mono text-xs text-rose-300">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div>
                  <p className="font-bold uppercase tracking-wider text-rose-200">
                    EXECUTION ERROR
                  </p>
                  <p className="mt-0.5 opacity-90">{error}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleExecuteFeature(activeFeature)}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-900/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-900/70 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  RETRY
                </button>
                {engineMode === "browser" && (
                  <button
                    type="button"
                    onClick={() => {
                      setEngineMode("remote");
                      setError(null);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/50 bg-cyan-950/40 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-900/60 transition-colors"
                  >
                    <Server className="h-3 w-3" />
                    SWITCH TO REMOTE WORKER
                  </button>
                )}
              </div>
            </div>
          )}

          {/* High-Tech Robotic Scanner Loading State */}
          {isProcessing && (
            <RoboticScanner
              active={true}
              moduleName={
                engineMode === "browser"
                  ? "BROWSER AI // [CLIENT-SIDE WEBGPU]"
                  : "REMOTE WORKER // [REMBG SPACE]"
              }
              steps={scannerSteps}
              subtext={
                engineMode === "browser"
                  ? "Running client-side @imgly background removal with zero API fees"
                  : "Streaming image to configured remote segmentation worker"
              }
            />
          )}

          {/* Color Studio Output Deck */}
          {result && !isProcessing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 font-mono text-xs">
                <span className="flex items-center gap-2 text-white font-bold">
                  <Zap className="h-3.5 w-3.5 text-cyan-400" />
                  <span>COMPOSITE RENDER DECK</span>
                </span>
                <span className="text-emerald-400 text-[10px] font-semibold">
                  [READY]
                </span>
              </div>

              <ColorStudio
                transparentBlob={result.transparentBlob}
                initialCompositeUrl={result.compositeUrl}
                width={result.width || 800}
                height={result.height || 600}
                initialMode={activeFeature}
                initialBgColor={activeFeature === "solution" ? "#FFF0F5" : "#FFFFFF"}
                provider={result.provider}
                processingLabel={result.label}
                onReset={handleReset}
              />
            </div>
          )}

          {/* Minimalist Empty State */}
          {!result && !isProcessing && !error && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-500/20 bg-slate-950/40 p-12 text-center shadow-[0_0_30px_rgba(0,0,0,0.6)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 shadow-inner">
                <ImageOff className="h-5 w-5 text-cyan-400" />
              </div>
              <h3 className="mt-3 font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                DISPLAY HUD STANDBY
              </h3>
              <p className="mt-1 font-mono text-[11px] text-slate-500">
                AWAITING SOURCE IMAGE SELECTION &amp; EXECUTION
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
