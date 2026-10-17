"use client";

import React from "react";
import { Sparkles, ShieldCheck, Zap, Type, Layers } from "lucide-react";

export function BgStudioHero() {
  return (
    <div className="relative overflow-hidden border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950 p-5 shadow-2xl">
      {/* Mechanical Corner Brackets */}
      <div className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-cyan-400 z-20" />
      <div className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-cyan-400 z-20" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-cyan-400 z-20" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-cyan-400 z-20" />

      {/* Decorative Mechanical Rivets */}
      <div className="pointer-events-none absolute top-2 left-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />
      <div className="pointer-events-none absolute top-2 right-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />
      <div className="pointer-events-none absolute bottom-2 left-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />
      <div className="pointer-events-none absolute bottom-2 right-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />

      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4 z-10">
        {/* Title & Core Proposition */}
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-2 border border-cyan-500/40 bg-cyan-950/60 px-2.5 py-0.5 text-[10px] text-cyan-300 font-mono">
            <span className="h-1.5 w-1.5 bg-cyan-400 animate-pulse" />
            <span>AI BACKGROUND WORKSTATION // SPEC-v2.4</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-sans uppercase">
            AI Background Studio
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
            Keep people. Preserve Khmer text. Remove the background.
            <span className="block text-[11px] text-slate-400 mt-0.5 font-sans">
              រក្សារូបមនុស្ស និងអក្សរខ្មែរគ្រប់ទម្រង់ (ជើង ស្រៈ វណ្ណយុត្តិ) ដោយដកផ្ទៃខាងក្រោយចេញស្អាតឥតខ្ចោះ
            </span>
          </p>
        </div>

        {/* Technical Specification Badges */}
        <div className="grid grid-cols-2 gap-2 text-xs shrink-0 font-mono">
          <div className="flex items-center gap-2 border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-slate-200 shadow-sm">
            <Type className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <div className="leading-tight">
              <div className="font-bold text-[10px] text-amber-300">KHMER LIGATURE GUARD</div>
              <div className="text-[9px] text-slate-400 font-sans">12–18px Diacritics Safe</div>
            </div>
          </div>

          <div className="flex items-center gap-2 border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-slate-200 shadow-sm">
            <Layers className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <div className="leading-tight">
              <div className="font-bold text-[10px] text-sky-300">DUAL-CHANNEL MATTING</div>
              <div className="text-[9px] text-slate-400 font-sans">Person + Stroke Union</div>
            </div>
          </div>

          <div className="flex items-center gap-2 border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-slate-200 shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <div className="leading-tight">
              <div className="font-bold text-[10px] text-emerald-300">100% ON-DEVICE AI</div>
              <div className="text-[9px] text-slate-400 font-sans">Zero Server Uploads</div>
            </div>
          </div>

          <div className="flex items-center gap-2 border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-slate-200 shadow-sm">
            <Zap className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <div className="leading-tight">
              <div className="font-bold text-[10px] text-cyan-300">ULTRA-FAST PREVIEW</div>
              <div className="text-[9px] text-slate-400 font-sans">WASM Multi-Threaded</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
