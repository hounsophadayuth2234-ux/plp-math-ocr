"use client";

import React from "react";
import { Sparkles, Shield, Cpu, Cloud, CloudOff } from "lucide-react";
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

  const isCloudActive = selectedEngine === "worker" && workerStatus === "ready";
  const isCloudOffline = selectedEngine === "worker" && workerStatus !== "ready";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 px-6 py-4 shadow-lg backdrop-blur-md">
      <div className="relative flex items-center justify-between gap-4 z-10">
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-sans">
            កាត់រូបភាព (Background Remover)
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-950/50 px-2.5 py-0.5 text-[11px] text-cyan-300 font-medium">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            <span>Module 02</span>
          </span>
        </div>
        {/* Keep data-testid for potential programmatic compatibility while keeping view completely clutter-free */}
        <div data-testid="active-engine-badge" className="sr-only" />
      </div>
    </div>
  );
}
