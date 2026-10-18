"use client";

import React from "react";
import { Sparkles } from "lucide-react";

export function BgStudioHero() {
  return (
    <div className="relative overflow-hidden border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950 px-5 py-4 shadow-xl">
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

      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-sans uppercase">
              AI Background Studio
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/60 px-2 py-0.5 text-[10px] text-cyan-300 font-mono font-medium">
              <Sparkles className="h-3 w-3 text-cyan-400" />
              PRO WORKSTATION
            </span>
          </div>

          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            Professional background isolation, clean edge defringing, and complete Khmer typography preservation.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5 border border-slate-800 bg-slate-900/60 px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-bold">100% PRIVATE &amp; ON-DEVICE</span>
          </span>
        </div>
      </div>
    </div>
  );
}
