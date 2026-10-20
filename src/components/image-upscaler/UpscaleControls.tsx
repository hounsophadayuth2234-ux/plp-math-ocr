"use client";

import React from "react";
import {
  Sparkles,
  User,
  FileText,
  History,
  SlidersHorizontal,
  Check,
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

const PRESET_CONFIGS: {
  id: UpscalePreset;
  titleKh: string;
  titleEn: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "ultra",
    titleKh: "ស្ថាបនាគែម & រូបតូច",
    titleEn: "Ultra Edge-Reconstruct",
    desc: "PDE Shock + Gradient Push បង្រួមគែមព្រិលឱ្យមុតស្រួច (រូបតូច <300px)",
    icon: Sparkles,
  },
  {
    id: "portrait",
    titleKh: "រូបមនុស្ស & ផ្ទៃមុខ",
    titleEn: "Portrait & Face HD",
    desc: "សម្រួលសម្បុរស្បែក បង្កើនពន្លឺភ្នែក និងសរសៃសក់",
    icon: User,
  },
  {
    id: "text",
    titleKh: "អក្សរខ្មែរ & ឯកសារ",
    titleEn: "Khmer Text & Doc Crisp",
    desc: "បង្កើនភាពដិតច្បាស់នៃតួអក្សរ ជើង និងរូបមន្ត",
    icon: FileText,
  },
  {
    id: "restore",
    titleKh: "រូបចាស់ & បែកគ្រាប់",
    titleEn: "Denoise & Restore",
    desc: "លុបគ្រាប់អុជ JPEG grain និងស្តារព័ត៌មានលម្អិត",
    icon: History,
  },
  {
    id: "custom",
    titleKh: "កំណត់ដោយខ្លួនឯង",
    titleEn: "Custom Pro",
    desc: "កែសម្រួលកម្រិតច្បាស់ គ្រាប់អុជ និងពន្លឺតាមចិត្ត",
    icon: SlidersHorizontal,
  },
];

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
  is8xEligible = false,
  isTinyImage = false,
  isLoading,
  progress,
  elapsedSeconds,
  onEnhance,
  onCancel,
  disabled = false,
}: UpscaleControlsProps) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-cyan-500/25 bg-slate-950/80 p-5 shadow-[0_0_20px_rgba(0,240,255,0.06)] backdrop-blur-md">
      {/* Tiny Image / Ultra Reconstruction Notification Banner */}
      {isTinyImage && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-xs font-mono text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
          <Zap className="h-4 w-4 text-amber-400 shrink-0 animate-pulse" />
          <div className="min-w-0 flex-1">
            <span className="font-bold text-amber-200 uppercase tracking-wide">
              ⚡ ULTRA RECONSTRUCTION ACTIVE:
            </span>{" "}
            <span>
              បានរកឃើញរូបភាពតូច (&lt;300px)។ ប្រព័ន្ធនឹងប្រើ PDE Shock Filtering & Stepped Pyramid ដើម្បីស្ថាបនាគែមឱ្យមុតស្រួច ជំនួសឱ្យការពង្រីកព្រិល Lanczos ធម្មតា។
            </span>
          </div>
        </div>
      )}

      {/* 1. Resize Factor (Default View: 2x / 4x) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
            1. Scale Factor / កម្រិតពង្រីក
          </label>
          {is8xEligible && (
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-mono font-bold text-rose-300 border border-rose-500/30">
              8X UNLOCKED (&le;250px)
            </span>
          )}
        </div>
        <div className={`grid ${is8xEligible ? "grid-cols-4" : "grid-cols-3"} gap-2`}>
          {[
            { val: 1 as UpscaleScale, labelKh: "1x ដើម", labelEn: "1x Sharpen" },
            { val: 2 as UpscaleScale, labelKh: "2x HD", labelEn: "2x HD (Balanced)" },
            { val: 4 as UpscaleScale, labelKh: "4x HD", labelEn: "4x HD (Ultra)" },
            ...(is8xEligible
              ? [{ val: 8 as UpscaleScale, labelKh: "8x Micro", labelEn: "Micro-HD" }]
              : []),
          ].map((opt) => (
            <button
              key={opt.val}
              type="button"
              data-testid={`scale-btn-${opt.val}x`}
              onClick={() => onChangeScale(opt.val)}
              disabled={isLoading || disabled}
              className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl border p-2.5 transition-all cursor-pointer ${
                scale === opt.val
                  ? "border-amber-400 bg-amber-950/50 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.3)] font-bold ring-1 ring-amber-400/50"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              } ${disabled || isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span className="font-mono text-sm font-bold">{opt.val}X</span>
              <span className="font-mono text-[10px] opacity-75">{opt.labelEn}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Collapsible Advanced Settings Panel (Presets, Face Filter, Tuning Sliders) */}
      <details className="group rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 transition-all">
        <summary className="cursor-pointer text-xs font-mono font-bold text-slate-300 hover:text-cyan-300 select-none flex items-center justify-between min-h-[36px]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
            <span className="uppercase tracking-wider">Advanced Settings &amp; Tuning</span>
          </div>
          <span className="text-[10px] text-cyan-400 group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>

        <div className="mt-3.5 pt-3.5 border-t border-slate-800 space-y-4">
          {/* Mode Presets inside Advanced Panel */}
          <div>
            <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-wider text-slate-300">
              Enhancement Mode Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRESET_CONFIGS.map((item) => {
                const Icon = item.icon;
                const isSelected = preset === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangePreset(item.id)}
                    disabled={isLoading || disabled}
                    className={`flex items-start gap-3 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-cyan-400 bg-cyan-950/40 text-white shadow-[0_0_15px_rgba(0,240,255,0.2)]"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    } ${disabled || isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div
                      className={`mt-0.5 rounded-lg p-1.5 ${
                        isSelected
                          ? "bg-cyan-500 text-slate-950 shadow-sm"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-xs font-bold text-slate-100">
                          {item.titleKh}
                        </p>
                        {isSelected && (
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-500 text-slate-950">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-cyan-400/80">
                        {item.titleEn}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Face Enhancement Mode Toggle */}
          <div>
            <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-wider text-slate-300">
              Face Enhancement / កែសម្រួលផ្ទៃមុខ
            </label>
            <button
              type="button"
              onClick={() => onToggleFaceEnhance(!faceEnhance)}
              disabled={isLoading || disabled}
              className={`min-h-[44px] flex w-full items-center justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                faceEnhance
                  ? "border-indigo-400 bg-indigo-950/40 text-white shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              } ${disabled || isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
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
                    {faceEnhance ? "បើកដំណើរការ (FACE ON)" : "បិទ (FACE OFF)"}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    សម្រួលសម្បុរស្បែក & ភ្នែក (YCbCr Skin Tone)
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
                កម្រិតភាពច្បាស់ (Sharpness / USM)
              </span>
              <span className="font-bold text-cyan-400">{sharpness}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={sharpness}
              onChange={(e) => onChangeSharpness(Number(e.target.value))}
              disabled={isLoading || disabled}
              className="mt-1.5 h-1.5 w-full appearance-none rounded-lg bg-slate-800 accent-cyan-400 cursor-pointer disabled:opacity-50"
            />
          </div>

          {/* Denoise Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                កាត់បន្ថយគ្រាប់អុជ (Denoise / Kuwahara)
              </span>
              <span className="font-bold text-emerald-400">{denoise}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={denoise}
              onChange={(e) => onChangeDenoise(Number(e.target.value))}
              disabled={isLoading || disabled}
              className="mt-1.5 h-1.5 w-full appearance-none rounded-lg bg-slate-800 accent-emerald-400 cursor-pointer disabled:opacity-50"
            />
          </div>

          {/* Clarity & Contrast Boost Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                ពន្លឺ និងកម្រិតពណ៌ (Clarity & Contrast)
              </span>
              <span className="font-bold text-amber-400">{clarity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={clarity}
              onChange={(e) => onChangeClarity(Number(e.target.value))}
              disabled={isLoading || disabled}
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
                Stage {progress.stage} of {progress.totalStages} · Lanczos-3 & Shock Sharpening
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
            className={`min-h-[50px] w-full flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 px-6 py-4 font-mono text-sm font-bold text-white shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:shadow-[0_0_35px_rgba(245,158,11,0.5)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Sparkles className="h-5 w-5" />
            <span>HD Resize & Sharpen ({scale}x)</span>
          </button>
        )}
      </div>
    </div>
  );
}
