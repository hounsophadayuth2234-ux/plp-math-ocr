"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { StudioLocale, getTranslation } from "@/lib/i18n";

export function BgStudioHero({
  locale = "km",
  selectedEngine = "browser",
  workerStatus = "not_configured",
  isModelCached = false,
}: {
  locale?: StudioLocale;
  selectedEngine?: "browser" | "worker";
  workerStatus?: "not_configured" | "checking" | "ready" | "unavailable" | "configured";
  isModelCached?: boolean;
}) {
  const t = (k: string) => getTranslation(locale, k);

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
              {t("hero.title")}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/60 px-2 py-0.5 text-[10px] text-cyan-300 font-mono font-medium">
              <Sparkles className="h-3 w-3 text-cyan-400" />
              {t("hero.badge")}
            </span>
          </div>

          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            {t("hero.desc")}
          </p>
        </div>

        {/* Engine Status Indicators (Requirement 3) */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          {/* Browser AI Status */}
          <span
            data-testid="browser-ai-status-indicator"
            className="flex items-center gap-1.5 border border-cyan-500/40 bg-slate-900/80 px-2.5 py-1 rounded"
          >
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-cyan-300 font-bold">Browser AI:</span>
            <span className="text-slate-300">{isModelCached ? "Warm (Cached)" : "Ready (WebGPU/WASM)"}</span>
          </span>

          {/* Remote Worker Status */}
          <span
            data-testid="remote-worker-status-indicator"
            className={`flex items-center gap-1.5 border px-2.5 py-1 rounded ${
              workerStatus === "ready"
                ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                : workerStatus === "unavailable"
                ? "border-rose-500/40 bg-rose-950/40 text-rose-300"
                : "border-slate-800 bg-slate-900/60 text-slate-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                workerStatus === "ready"
                  ? "bg-emerald-400"
                  : workerStatus === "unavailable"
                  ? "bg-rose-400"
                  : "bg-slate-500"
              }`}
            />
            <span className="font-bold">Worker API:</span>
            <span>
              {workerStatus === "ready"
                ? "Online"
                : workerStatus === "unavailable"
                ? "Offline (Retry / Browser AI)"
                : "Not Configured"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
