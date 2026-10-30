"use client";

import React from "react";
import {
  Sparkles,
  User,
  FileText,
  SlidersHorizontal,
  XCircle,
  Loader2,
  Zap,
} from "lucide-react";
import type { UpscalePreset, UpscaleProgress, UpscaleScale } from "@/lib/image-upscale-client";

interface UpscaleControlsProps {
  scale: UpscaleScale;
  onChangeScale: (scale: UpscaleScale) => void;
  preset: UpscalePreset;
  onChangePreset: (preset: UpscalePreset) => void;
  faceEnhance: boolean;
  onToggleFaceEnhance: (val: boolean) => void;
  sharpness: number;
  onChangeSharpness: (val: number) => void;
  denoise: number;
  onChangeDenoise: (val: number) => void;
  clarity: number;
  onChangeClarity: (val: number) => void;
  is8xEligible?: boolean;
  isTinyImage?: boolean;
  isLoading: boolean;
  progress: UpscaleProgress | null;
  elapsedSeconds: number;
  onEnhance: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function UpscaleControls({
  scale,
  onChangeScale,
  preset,
  onChangePreset,
  faceEnhance,
  onToggleFaceEnhance,
  sharpness,
  onChangeSharpness,
  denoise,
  onChangeDenoise,
  clarity,
  onChangeClarity,
  isLoading,
  progress,
  elapsedSeconds,
  onEnhance,
  onCancel,
  disabled = false,
}: UpscaleControlsProps) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-cyan-500/25 bg-slate-950/80 p-5 shadow-[0_0_20px_rgba(0,240,255,0.06)] backdrop-blur-md">
      {/* 1. Streamlined Advanced Settings (Fine Tuning Panel - Closed by default) */}
      <details
        data-testid="upscale-advanced-settings-accordion"
        className="group rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 transition-all"
      >
        <summary className="cursor-pointer text-xs font-mono font-bold text-slate-300 hover:text-cyan-300 select-none flex items-center justify-between min-h-[36px]">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚙️</span>
            <span className="uppercase tracking-wider">Advanced Settings (ការកំណត់កម្រិតខ្ពស់)</span>
          </div>
          <span className="text-[10px] text-cyan-400 group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>

        <div className="mt-3.5 pt-3.5 border-t border-slate-800 space-y-4">
          {/* Enhancement Mode: Fast, Balanced, Quality */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                Enhancement Mode / របៀបកែសម្រួល
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: "general" as UpscalePreset,
                  titleKh: "ល្បឿនលឿន",
                  titleEn: "Fast",
                  desc: "Instant (<1s)",
                  icon: Zap,
                },
                {
                  id: "text" as UpscalePreset,
                  titleKh: "តុល្យភាព",
                  titleEn: "Balanced",
                  desc: "Khmer text crisp",
                  icon: FileText,
                },
                {
                  id: "ultra" as UpscalePreset,
                  titleKh: "គុណភាពខ្ពស់",
                  titleEn: "Quality",
                  desc: "Multi-pass restore",
                  icon: Sparkles,
                },
              ].map((mode) => {
                const Icon = mode.icon;
                const isSelected = preset === mode.id || (mode.id === "general" && preset === "custom");
                return (
                  <button
                    key={mode.id}
                    type="button"
                    data-testid={`mode-btn-${mode.id}`}
                    onClick={() => onChangePreset(mode.id)}
                    disabled={isLoading}
                    className={`min-h-[58px] flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border-cyan-400 bg-cyan-950/60 text-cyan-300 font-bold ring-1 ring-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.25)]"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-cyan-400" />
                      <span className="font-mono text-xs font-bold text-slate-100">{mode.titleKh}</span>
                    </div>
                    <span className="text-[10px] text-cyan-400/80 font-mono mt-0.5">{mode.titleEn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Output Size Option: 1x, 2x, 4x */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                Output Size / ទំហំរូបភាពលទ្ធផល
              </label>
              <span className="text-[10px] font-mono text-slate-400">
                {scale === 1 ? "100% original px" : scale === 2 ? "200% HD dimensions" : "400% Ultra HD dimensions"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 1 as UpscaleScale, labelKh: "1x ដើម", labelEn: "1x Sharpen" },
                { val: 2 as UpscaleScale, labelKh: "2x HD", labelEn: "2x HD (Balanced)" },
                { val: 4 as UpscaleScale, labelKh: "4x HD", labelEn: "4x HD (Ultra Size)" },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  data-testid={`scale-btn-${opt.val}x`}
                  onClick={() => onChangeScale(opt.val)}
                  disabled={isLoading}
                  className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl border p-2.5 transition-all cursor-pointer ${
                    scale === opt.val
                      ? "border-amber-400 bg-amber-950/50 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.3)] font-bold ring-1 ring-amber-400/50"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="font-mono text-sm font-bold">{opt.val}X</span>
                  <span className="font-mono text-[10px] opacity-75">{opt.labelEn}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Face Enhancement Mode Toggle */}
          <div>
            <button
              type="button"
              onClick={() => onToggleFaceEnhance(!faceEnhance)}
              disabled={isLoading}
              className={`min-h-[44px] flex w-full items-center justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                faceEnhance
                  ? "border-indigo-400 bg-indigo-950/40 text-white shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`rounded-lg p-2 ${
                    faceEnhance
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  <User className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="font-mono text-xs font-bold text-slate-100">
                    {faceEnhance ? "បើកកែសម្រួលផ្ទៃមុខ (Face On)" : "បិទកែសម្រួលផ្ទៃមុខ (Face Off)"}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    សម្រួលសម្បុរស្បែក &amp; គ្រាប់ភ្នែក
                  </p>
                </div>
              </div>

              <div
                className={`h-6 w-11 rounded-full p-1 transition-colors ${
                  faceEnhance ? "bg-indigo-500" : "bg-slate-800"
                }`}
              >
                <div
                  className={`h-4 w-4 rounded-full bg-white transition-transform ${
                    faceEnhance ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Sharpness Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                កម្រិតភាពច្បាស់ (Sharpness)
              </span>
              <span className="font-bold text-cyan-400">{sharpness}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={sharpness}
              onChange={(e) => onChangeSharpness(Number(e.target.value))}
              disabled={isLoading}
              className="mt-1.5 h-1.5 w-full appearance-none rounded-lg bg-slate-800 accent-cyan-400 cursor-pointer disabled:opacity-50"
            />
          </div>

          {/* Denoise Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                កាត់បន្ថយគ្រាប់អុជ (Noise Reduction)
              </span>
              <span className="font-bold text-emerald-400">{denoise}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={denoise}
              onChange={(e) => onChangeDenoise(Number(e.target.value))}
              disabled={isLoading}
              className="mt-1.5 h-1.5 w-full appearance-none rounded-lg bg-slate-800 accent-emerald-400 cursor-pointer disabled:opacity-50"
            />
          </div>

          {/* Clarity Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                កម្រិតពន្លឺ និងពណ៌ (Clarity)
              </span>
              <span className="font-bold text-amber-400">{clarity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={clarity}
              onChange={(e) => onChangeClarity(Number(e.target.value))}
              disabled={isLoading}
              className="mt-1.5 h-1.5 w-full appearance-none rounded-lg bg-slate-800 accent-amber-400 cursor-pointer disabled:opacity-50"
            />
          </div>
        </div>
      </details>

      {/* 4. Action & Progress Deck */}
      <div>
        {isLoading && progress ? (
          <div className="flex flex-col gap-2 rounded-xl border border-cyan-500/40 bg-cyan-950/30 p-4 shadow-[0_0_20px_rgba(0,240,255,0.15)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
                <span className="font-mono text-xs font-bold text-cyan-300">
                  {progress.stageNameKh} ({progress.stageName})
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-cyan-400">
                {progress.percent}% · {elapsedSeconds.toFixed(1)}s
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.max(5, progress.percent)}%` }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[10px] text-slate-400">
                Stage {progress.stage} of {progress.totalStages} · HD Processing in Web Worker
              </span>
              <button
                type="button"
                data-testid="upscale-cancel-btn"
                onClick={onCancel}
                className="min-h-[36px] flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2.5 py-1 text-xs font-mono font-bold text-rose-300 hover:bg-rose-900/60 transition-all cursor-pointer"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>បោះបង់ (Cancel)</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-testid="upscale-enhance-btn"
            onClick={onEnhance}
            disabled={disabled || isLoading}
            className="min-h-[50px] w-full flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 px-6 py-4 font-mono text-sm font-bold text-white shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:shadow-[0_0_35px_rgba(245,158,11,0.5)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-white" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                <span>HD Resize &amp; Sharpen ({scale}x)</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
