"use client";

import React from "react";
import { Loader2, XCircle, RefreshCw, Cpu, Zap, Activity } from "lucide-react";
import { BgRemovalProgress } from "@/lib/bg-removal-client";

interface BgProcessingCardProps {
  isProcessing: boolean;
  processingMode: "preview" | "final" | "worker";
  progressInfo: BgRemovalProgress | null;
  slowNotice: string | null;
  onCancel: () => void;
  onReset: () => void;
  originalUrl?: string | null;
}

export function BgProcessingCard({
  isProcessing,
  processingMode,
  progressInfo,
  slowNotice,
  onCancel,
  onReset,
  originalUrl,
}: BgProcessingCardProps) {
  if (!isProcessing) return null;

  const modelPct =
    progressInfo?.modelLoadingPercent ??
    (progressInfo?.stage === "Loading model" ? progressInfo.percent : 100);

  const inferencePct =
    progressInfo?.processingPercent ??
    (progressInfo?.stage === "Segmenting" ? progressInfo.percent : 0);

  return (
    <div
      data-testid="processing-scanner"
      className="relative overflow-hidden rounded-2xl border border-cyan-500/40 bg-slate-950/90 shadow-[0_0_35px_rgba(0,240,255,0.15)] font-mono"
    >
      {/* Corner target reticles */}
      <div className="pointer-events-none absolute top-2 left-2 h-3.5 w-3.5 border-t-2 border-l-2 border-cyan-400 z-30" />
      <div className="pointer-events-none absolute top-2 right-2 h-3.5 w-3.5 border-t-2 border-r-2 border-cyan-400 z-30" />
      <div className="pointer-events-none absolute bottom-2 left-2 h-3.5 w-3.5 border-b-2 border-l-2 border-cyan-400 z-30" />
      <div className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 border-b-2 border-r-2 border-cyan-400 z-30" />

      {/* Laser Scanning Beam & Scanlines */}
      <div className="animate-laser-scan opacity-80" />
      <div className="pointer-events-none absolute inset-0 cyber-scanlines opacity-25 z-20" />

      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-cyan-500/20 bg-slate-900/80 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
          </span>
          <span className="font-bold text-cyan-300 uppercase tracking-wider text-[11px]">
            {progressInfo?.message || progressInfo?.stage || "Processing Image Matrix..."}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="cancel-btn"
            onClick={onCancel}
            className="flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/60 px-2.5 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-900/80 transition-colors uppercase"
          >
            <XCircle className="h-3 w-3" />
            <span>Cancel</span>
          </button>
          <button
            type="button"
            data-testid="reset-btn"
            onClick={onReset}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:text-white transition-colors uppercase"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Live Preview / Scanner viewport */}
      {originalUrl && (
        <div className="relative flex items-center justify-center p-6 min-h-[260px] bg-slate-950/80">
          <img
            src={originalUrl}
            alt="Scanning input"
            className="max-h-[300px] max-w-full rounded-lg object-contain opacity-70 filter brightness-90 contrast-125 shadow-inner"
          />
        </div>
      )}

      {/* Dual Progress Telemetry */}
      <div className="p-4 bg-slate-900/90 border-t border-cyan-500/20 space-y-3">
        {/* Model Weight Cache Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-cyan-300">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-cyan-400" />
              <span>Model Cache Load (ISNet FP16)</span>
            </span>
            <span className="font-mono font-bold">{modelPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-600 to-sky-400 transition-all duration-300 rounded-full"
              style={{ width: `${modelPct}%` }}
            />
          </div>
        </div>

        {/* Inference Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-emerald-300">
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <span>Person &amp; Khmer Text Inference</span>
            </span>
            <span className="font-mono font-bold">{inferencePct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-300 rounded-full"
              style={{ width: `${inferencePct}%` }}
            />
          </div>
        </div>

        {slowNotice && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/40 p-2.5 text-[11px] text-amber-300 font-sans">
            {slowNotice}
          </div>
        )}
      </div>
    </div>
  );
}
