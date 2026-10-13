"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cpu,
  Loader2,
  AlertCircle,
  ImageOff,
  Zap,
} from "lucide-react";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { ColorStudio } from "@/components/bg-remover/ColorStudio";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import {
  removeBackgroundClient,
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  // Trigger client-side background removal with max-800px downscale & canvas compositing
  const handleExecuteFeature = async (mode: "question" | "solution") => {
    if (!imageFile || isLoading) return;

    cyberAudio.playClick();
    setActiveFeature(mode);
    setIsLoading(true);
    setError(null);
    setResult(null);

    // Engage sci-fi robotic scanner sound
    cyberAudio.startScanningHum();
    const targetBgColor = mode === "solution" ? "#FFF0F5" : "#FFFFFF";

    try {
      // Yield execution to allow React state to render the RoboticScanner and loading UI
      await new Promise((resolve) => setTimeout(resolve, 80));

      // 1. Safe Client-Side Execution (Downscaled to max 800px + @imgly Web Worker + Edge Refinement)
      const { blob: transparentBlob, width, height, provider } =
        await removeBackgroundClient(imageFile);

      // 2. Draw cutout onto HTML Canvas and fill background with White (#FFFFFF) or Pink (#FFF0F5)
      const { dataUrl } = await compositeWithSolidColor(
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

      // Play success chime upon completion
      cyberAudio.playSuccessChime();
    } catch (err) {
      cyberAudio.stopScanningHum();
      console.error("[bg-remover] Local processing error:", err);
      setError(
        err instanceof Error ? err.message : "Local neural segmentation failed."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    cyberAudio.playClick();
    setResult(null);
    setError(null);
    setImageFile(null);
  };

  const isQuestion = activeFeature === "question";

  // Non-blocking telemetry steps for local downscaled processing
  const scannerSteps = [
    "DOWNSCALING IMAGE BUFFER TO SAFE DIMENSION (MAX 800PX)...",
    "DISPATCHING BUFFER TO LOCAL NEURAL WORKER (@imgly/isnet)...",
    "SEGMENTING FOREGROUND SUBJECT & EXTRACTING ALPHA MASK...",
    "APPLYING 2PX MASK EROSION & COLOR DECONTAMINATION...",
    isQuestion
      ? "COMPOSITING SOLID WHITE (#FFFFFF) ONTO HTML5 CANVAS..."
      : "COMPOSITING SOLID PINK (#FFF0F5) ONTO HTML5 CANVAS...",
    "FINALIZING HIGH-RES RENDER & PREPARING OUTPUT BUFFER...",
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
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LOCAL ENGINE: READY
          </span>
          <span className="rounded border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-cyan-300">
            @imgly/isnet_quint8
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
                MAX 800PX OPTIMIZED
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
                disabled={isLoading || !!result}
                label="SOURCE INPUT"
                hint="PNG · JPG · WEBP"
              />
            </div>

            {/* Heavy-Duty Mechanical Execution Switches */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase text-slate-400">
                <span>SELECT EXECUTION CHANNEL</span>
                <span className="text-cyan-400">TACTILE SWITCH</span>
              </div>

              {/* Switch A: White / Question (#FFFFFF) */}
              <button
                type="button"
                onClick={() => handleExecuteFeature("question")}
                disabled={!imageFile || isLoading}
                className={`group relative w-full overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98] ${
                  isQuestion
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
                        WHITE BACKDROP · LOCAL SEGMENTED
                      </span>
                    </div>
                  </div>

                  {isLoading && isQuestion ? (
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
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
                disabled={!imageFile || isLoading}
                className={`group relative w-full overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98] ${
                  !isQuestion
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
                        PINK BACKDROP · LOCAL SEGMENTED
                      </span>
                    </div>
                  </div>

                  {isLoading && !isQuestion ? (
                    <Loader2 className="h-5 w-5 animate-spin text-pink-400" />
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

          {/* Non-Blocking "Processing..." Robotic Scanner */}
          {isLoading && (
            <RoboticScanner
              active={true}
              moduleName={
                isQuestion
                  ? "LOCAL NEURAL ENGINE // [CH-01: WHITE]"
                  : "LOCAL NEURAL ENGINE // [CH-02: PINK]"
              }
              steps={scannerSteps}
              subtext="Safe client-side execution active · Zero browser freeze"
            />
          )}

          {/* Color Studio Output Deck */}
          {result && !isLoading && (
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
          {!result && !isLoading && !error && (
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
