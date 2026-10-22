"use client";

import React, { useEffect, useState } from "react";
import { Loader2, XCircle, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { BgRemovalProgress, ProcessingStage, STAGE_DEFINITIONS } from "@/lib/bg-removal-client";

interface BgProcessingCardProps {
  isProcessing: boolean;
  processingMode: "preview" | "final" | "worker";
  progressInfo: BgRemovalProgress | null;
  slowNotice: string | null;
  onCancel: () => void;
  onReset: () => void;
  originalUrl?: string | null;
}

const STAGES: { key: ProcessingStage; labelEn: string; labelKm: string }[] = [
  { key: "preparing", labelEn: "Preparing", labelKm: "រៀបចំ" },
  { key: "loading_model", labelEn: "Loading Model", labelKm: "ផ្ទុកម៉ូដែល" },
  { key: "segmenting", labelEn: "Segmenting", labelKm: "កាត់ផ្ទៃ" },
  { key: "refining", labelEn: "Refining", labelKm: "សម្រួលគែម" },
  { key: "complete", labelEn: "Complete", labelKm: "រួចរាល់" },
];

export function BgProcessingCard({
  isProcessing,
  processingMode,
  progressInfo,
  slowNotice,
  onCancel,
  onReset,
  originalUrl,
}: BgProcessingCardProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isProcessing) {
      setElapsedSec(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [isProcessing]);

  if (!isProcessing) return null;

  // Determine current active stage index (0 to 4)
  const currentStageKey = progressInfo?.stageKey || "preparing";
  let activeIndex = 0;
  if (currentStageKey === "loading_model") activeIndex = 1;
  else if (currentStageKey === "segmenting") activeIndex = 2;
  else if (currentStageKey === "refining") activeIndex = 3;
  else if (currentStageKey === "compositing" || currentStageKey === "exporting" || currentStageKey === "complete") activeIndex = 4;

  const stageDef = STAGE_DEFINITIONS[currentStageKey] || STAGE_DEFINITIONS.preparing;

  return (
    <div
      data-testid="processing-scanner"
      className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-5 shadow-xl backdrop-blur-md"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
          <div>
            <h4 className="font-bold text-white text-xs sm:text-sm font-sans flex items-center gap-1.5">
              <span>{stageDef.labelKm}</span>
              <span className="text-slate-400 font-normal">({stageDef.labelEn})</span>
            </h4>
            <p className="text-[11px] text-slate-400 font-mono">
              {stageDef.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800/80 text-[11px] font-mono text-slate-300">
            <Clock className="h-3 w-3 text-slate-400" />
            <span>{elapsedSec}s</span>
          </div>

          <button
            type="button"
            data-testid="cancel-btn"
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/80 transition-colors"
          >
            <XCircle className="h-3.5 w-3.5" />
            <span>បោះបង់ (Cancel)</span>
          </button>
        </div>
      </div>

      {/* Stage-based progress pills */}
      <div className="py-4">
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {STAGES.map((st, idx) => {
            const isDone = idx < activeIndex;
            const isCurrent = idx === activeIndex;

            return (
              <div
                key={st.key}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[11px] transition-all ${
                  isCurrent
                    ? "border-cyan-500/60 bg-cyan-950/60 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)] font-bold"
                    : isDone
                    ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-400"
                    : "border-slate-800/70 bg-slate-950/50 text-slate-500"
                }`}
              >
                <div className="flex items-center justify-center h-5 w-5 rounded-full border text-[10px]">
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : isCurrent ? (
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span className="truncate max-w-full text-[10px] sm:text-[11px] font-sans">
                  {st.labelKm}
                </span>
                <span className="text-[9px] text-slate-400 hidden md:inline font-mono">
                  {st.labelEn}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Preview / Scanner viewport */}
      {originalUrl && (
        <div className="relative flex items-center justify-center p-4 rounded-xl bg-slate-950/70 border border-slate-800/60 min-h-[200px] max-h-[320px] overflow-hidden">
          <img
            src={originalUrl}
            alt="Processing input"
            className="max-h-[280px] max-w-full rounded-lg object-contain opacity-75 filter brightness-95"
          />
        </div>
      )}

      {/* Realistic Expected Duration Notice */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-400 font-sans">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          <span>
            {processingMode === "final"
              ? "គុណភាពខ្ពស់ — ជាទូទៅក្រោម ២៥ វិនាទី (High Quality: Usually under 25s)"
              : "ល្បឿនលឿន — ជាធម្មតា ១០–២០ វិនាទី (Fast Mode: Usually 10–20s • On-Device AI)"}
          </span>
        </div>

        {slowNotice && (
          <div className="text-amber-300 font-medium text-[11px]">
            {slowNotice}
          </div>
        )}
      </div>
    </div>
  );
}
