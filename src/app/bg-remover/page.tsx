"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cpu,
  Loader2,
  AlertCircle,
  ImageOff,
  Zap,
  Lock,
} from "lucide-react";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { ColorStudio } from "@/components/bg-remover/ColorStudio";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import {
  requestReplicateBackgroundRemoval,
  compositeWithSolidColor,
} from "@/lib/bg-removal-client";
import { cyberAudio } from "@/lib/cyber-audio";

interface ProcessResult {
  transparentBlob: Blob;
  compositeUrl: string;
  width: number;
  height: number;
  provider: string;
}

export default function BgRemoverPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [activeFeature, setActiveFeature] = useState<"question" | "solution">("question");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  // STRICT SYNCHRONOUS MUTEX LOCK:
  // Prevents any duplicate/concurrent clicks in the exact same millisecond
  const isProcessingRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  // Trigger Python Rembg (HF Space) background removal & HTML5 canvas compositing
  const handleExecuteFeature = async (mode: "question" | "solution") => {
    // 1. STRICT LOCK: Immediately abort if already processing or missing file
    if (isProcessingRef.current) {
      console.warn("[bg-remover] Blocked duplicate trigger: already processing.");
      return;
    }
    if (!imageFile) return;

    // Engage atomic lock synchronously before any async boundary
    isProcessingRef.current = true;
    setIsProcessing(true);
    setActiveFeature(mode);
    setError(null);
    setResult(null);

    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    const targetBgColor = mode === "solution" ? "#FFF0F5" : "#FFFFFF";

    // Setup AbortController to guarantee single fetch request
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    try {
      // 1. Single strictly-controlled fetch to /api/remove-bg (Python Rembg HF Space)
      const { blob: transparentBlob, provider } =
        await requestReplicateBackgroundRemoval(imageFile, abortController.signal);

      // 2. Draw cutout onto HTML Canvas and fill background with White (#FFFFFF) or Pink (#FFF0F5)
      const { dataUrl, width, height } = await compositeWithSolidColor(
        transparentBlob,
        targetBgColor
      );

      setResult({
        transparentBlob,
        compositeUrl: dataUrl,
        width,
        height,
        provider,
      });

      cyberAudio.playSuccessChime();
    } catch (err: unknown) {
      cyberAudio.stopScanningHum();
      if (err instanceof Error && err.name === "AbortError") {
        console.log("[bg-remover] Request aborted by client.");
        return;
      }
      console.error("[bg-remover] Python Rembg error:", err);
      setError(
        err instanceof Error ? err.message : "Python Rembg segmentation failed."
      );
    } finally {
      cyberAudio.stopScanningHum();
      activeAbortControllerRef.current = null;
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    if (isProcessingRef.current) return;
    cyberAudio.playClick();
    setResult(null);
    setError(null);
    setImageFile(null);
  };

  const isQuestion = activeFeature === "question";

  // Telemetry steps for RoboticScanner
  const scannerSteps = [
    "[1/5] ATOMIC LOCK ENGAGED · CONNECTING TO REMBG MICROSERVICE...",
    "[2/5] STREAMING IMAGE BUFFER TO HUGGING FACE SPACE...",
    "[3/5] REMBG ENGINE EXECUTING U2NET SEGMENTATION & ALPHA MATTING...",
    "[4/5] RECEIVING PRISTINE TRANSPARENT PNG BLOB...",
    isQuestion
      ? "[5/5] COMPOSITING SOLID WHITE (#FFFFFF) ONTO HTML5 CANVAS..."
      : "[5/5] COMPOSITING SOLID PINK (#FFF0F5) ONTO HTML5 CANVAS...",
    "[READY] BAKING PIXELS & PREPARING OUTPUT BUFFER...",
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
            {isProcessing ? "PYTHON REMBG: PROCESSING STREAM" : "PYTHON REMBG CORE: ONLINE"}
          </span>
          <span className="rounded border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-cyan-300">
            U2Net / Free Space
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
                100% FREE · ZERO API FEES
              </span>
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
                hint="PNG · JPG · WEBP"
              />
            </div>

            {/* Prominent Loading Lock Banner when Processing */}
            {isProcessing && (
              <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 font-mono text-xs text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-pulse">
                <Lock className="h-4 w-4 shrink-0 text-amber-400" />
                <div className="space-y-0.5">
                  <p className="font-bold uppercase tracking-wider text-amber-200">
                    PROCESSING VIA PYTHON REMBG SPACE...
                  </p>
                  <p className="text-[10px] text-amber-400/80">
                    Input locked to prevent double-clicks. Please wait.
                  </p>
                </div>
              </div>
            )}

            {/* Heavy-Duty Mechanical Execution Switches */}
            <div className="space-y-3 pt-2">
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
                {/* Tech Corner Reticle */}
                <div className="absolute top-1.5 right-1.5 h-2 w-2 border-t border-r border-cyan-400/50" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Mechanical LED Switch Latch */}
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
                        WHITE BACKDROP · REMBG SEGMENTED
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
                {/* Tech Corner Reticle */}
                <div className="absolute top-1.5 right-1.5 h-2 w-2 border-t border-r border-pink-400/50" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Mechanical LED Switch Latch */}
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
                        PINK BACKDROP · REMBG SEGMENTED
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
          {/* Error Alert */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 font-mono text-xs text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div>
                <p className="font-bold uppercase tracking-wider text-rose-200">
                  EXECUTION ERROR
                </p>
                <p className="mt-0.5 opacity-90">{error}</p>
              </div>
            </div>
          )}

          {/* High-Tech Robotic Scanner Loading State */}
          {isProcessing && (
            <RoboticScanner
              active={true}
              moduleName={
                isQuestion
                  ? "PYTHON REMBG // [CH-01: WHITE]"
                  : "PYTHON REMBG // [CH-02: PINK]"
              }
              steps={scannerSteps}
              subtext="Processing via Python Rembg Space... 100% free open-source neural segmentation"
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
