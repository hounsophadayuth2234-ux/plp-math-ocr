"use client";

import React from "react";
import { Sparkles, ShieldCheck, Zap, Type, Layers, CheckCircle2 } from "lucide-react";

export function BgStudioHero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900/90 via-slate-950/80 to-slate-950/90 p-5 sm:p-6 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-48 w-72 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Title & Core Proposition */}
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/50 px-3 py-1 text-xs text-cyan-300 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span>Next-Gen Segmentation Engine</span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] text-cyan-400/90 font-mono">v2.4 Pro</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-sans">
            AI Background Studio
          </h1>

          <p className="text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
            Keep people. Preserve Khmer text. Remove the background.
            <span className="block text-xs sm:text-sm text-slate-400 mt-0.5">
              រក្សារូបមនុស្ស និងអក្សរខ្មែរគ្រប់ទម្រង់ (ជើង ស្រៈ វណ្ណយុត្តិ) ដោយដកផ្ទៃខាងក្រោយចេញស្អាតឥតខ្ចោះ
            </span>
          </p>
        </div>

        {/* Feature Badges Grid */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 text-xs shrink-0 font-sans">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-slate-200 shadow-sm">
            <Type className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="leading-tight">
              <div className="font-semibold text-[11px]">Khmer Ligature Guard</div>
              <div className="text-[9px] text-slate-400">12–18px Diacritics Safe</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-slate-200 shadow-sm">
            <Layers className="h-4 w-4 text-sky-400 shrink-0" />
            <div className="leading-tight">
              <div className="font-semibold text-[11px]">Dual-Channel Matting</div>
              <div className="text-[9px] text-slate-400">Person + Stroke Union</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-slate-200 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <div className="leading-tight">
              <div className="font-semibold text-[11px]">100% On-Device AI</div>
              <div className="text-[9px] text-slate-400">Zero Server Uploads</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-slate-200 shadow-sm">
            <Zap className="h-4 w-4 text-cyan-400 shrink-0" />
            <div className="leading-tight">
              <div className="font-semibold text-[11px]">Ultra-Fast Preview</div>
              <div className="text-[9px] text-slate-400">WASM Multi-Threaded</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
