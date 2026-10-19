"use client";

import React from "react";
import {
  Activity,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ImageDiagnostics, UpscalePreset } from "@/lib/image-upscale-client";

interface ImageDiagnosticsCardProps {
  diagnostics: ImageDiagnostics;
  fileSize?: number;
  selectedPreset: UpscalePreset;
  onApplyPreset: (preset: UpscalePreset) => void;
}

export function ImageDiagnosticsCard({
  diagnostics,
  fileSize,
  selectedPreset,
  onApplyPreset,
}: ImageDiagnosticsCardProps) {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isRecommendedApplied = selectedPreset === diagnostics.recommendedPreset;

  return (
    <div className="rounded-2xl border border-cyan-500/25 bg-slate-950/80 p-5 shadow-[0_0_20px_rgba(0,240,255,0.08)] backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400 animate-pulse" />
          <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
            Smart Image Diagnostics (វិភាគគុណភាពស្វ័យប្រវត្តិ)
          </h3>
        </div>
        <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-400 border border-cyan-500/30">
          STAGE 1 / 5 PASSED
        </span>
      </div>

      {/* Grid of Metrics */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Resolution */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase">
            ទំហំរូបភាព (Resolution)
          </span>
          <p className="mt-1 font-mono text-sm font-bold text-white">
            {diagnostics.width} × {diagnostics.height}
          </p>
          <span className="text-[10px] font-mono text-cyan-400">
            {diagnostics.megapixels} MP · {formatFileSize(fileSize)}
          </span>
        </div>

        {/* Sharpness Score */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase">
              ភាពច្បាស់ (Sharpness)
            </span>
            <span className="text-[10px] font-mono font-bold text-cyan-400">
              {diagnostics.sharpnessScore}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-cyan-400 transition-all duration-500"
              style={{ width: `${Math.max(5, diagnostics.sharpnessScore)}%` }}
            />
          </div>
          <span className="mt-1 block text-[10px] font-mono text-slate-500">
            Laplacian: {diagnostics.laplacianVariance}
          </span>
        </div>

        {/* Noise Level */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase">
              គ្រាប់អុជ (Noise Level)
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                diagnostics.noiseCategory === "High"
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  : diagnostics.noiseCategory === "Moderate"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              }`}
            >
              {diagnostics.noiseCategoryKh} ({diagnostics.noiseLevelScore}%)
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full transition-all duration-500 ${
                diagnostics.noiseCategory === "High"
                  ? "bg-rose-500"
                  : diagnostics.noiseCategory === "Moderate"
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              }`}
              style={{ width: `${Math.max(5, diagnostics.noiseLevelScore)}%` }}
            />
          </div>
          <span className="mt-1 block text-[10px] font-mono text-slate-500">
            Immerkær: {diagnostics.noiseCategory}
          </span>
        </div>

        {/* Dynamic Range & Features */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase">
            ពន្លឺ និងផ្ទៃ (Features)
          </span>
          <p className="mt-1 font-mono text-sm font-bold text-white">
            {diagnostics.dynamicRange}% Range
          </p>
          <span className="text-[10px] font-mono text-slate-400">
            {diagnostics.skinToneRatio > 0.05
              ? `Face: ${(diagnostics.skinToneRatio * 100).toFixed(0)}%`
              : diagnostics.isDocumentLikely
              ? "Doc / Text Edge"
              : "Photo Balance"}
          </span>
        </div>
      </div>

      {/* Preset Recommendation Alert */}
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-950/30 p-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 rounded-lg bg-indigo-500/20 p-1.5 text-indigo-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-indigo-300 uppercase">
                ការណែនាំស្វ័យប្រវត្តិ (AI Recommendation):
              </span>
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-xs font-bold text-indigo-200 border border-indigo-400/40">
                {diagnostics.recommendedPreset === "ultra" && "ស្ថាបនាគែម & រូបតូច (Ultra Reconstruct)"}
                {diagnostics.recommendedPreset === "portrait" && "រូបមនុស្ស & ផ្ទៃមុខ (Portrait)"}
                {diagnostics.recommendedPreset === "text" && "អក្សរខ្មែរ & ឯកសារ (Khmer Text)"}
                {diagnostics.recommendedPreset === "restore" && "រូបចាស់ & បែកគ្រាប់ (Restore)"}
                {diagnostics.recommendedPreset === "general" && "រូបទូទៅ (General HD)"}
                {diagnostics.isTinyImage && (
                  <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-mono font-bold text-amber-300 border border-amber-500/30">
                    TINY &lt;300px
                  </span>
                )}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-300">
              {diagnostics.recommendationReasonKh}
            </p>
          </div>
        </div>

        {!isRecommendedApplied && (
          <button
            type="button"
            onClick={() => onApplyPreset(diagnostics.recommendedPreset)}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-3 py-1.5 text-xs font-mono font-bold text-white shadow-sm hover:from-indigo-600 hover:to-cyan-600 transition-all cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>ជ្រើសយកការណែនាំនេះ (Apply)</span>
          </button>
        )}
      </div>
    </div>
  );
}
