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
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 px-6 py-5 shadow-lg backdrop-blur-md">
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 z-10">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-sans">
              កាត់រូបភាព (Background Remover)
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-950/50 px-2.5 py-0.5 text-[11px] text-cyan-300 font-medium">
              <Sparkles className="h-3 w-3 text-cyan-400" />
              <span>Module 02</span>
            </span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
            កាត់ផ្ដាច់ផ្ទៃខាងក្រោយស្វ័យប្រវត្តិតាម Canvas និងប្ដូរពណ៌ផ្ទៃភ្លាមៗ (Transparent, Off-White, Soft Pink)
          </p>
        </div>

        {/* Single Truthful Active Engine Badge */}
        <div className="flex items-center gap-2 text-xs shrink-0 font-sans">
          {isCloudActive ? (
            <div
              data-testid="active-engine-badge"
              className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-emerald-300"
              title="Processing running via remote cloud worker"
            >
              <Cloud className="h-4 w-4 text-emerald-400" />
              <div className="leading-tight">
                <div className="text-[10px] text-emerald-400/80 font-mono">ACTIVE ENGINE</div>
                <div className="font-bold">Cloud Worker (HF Space API)</div>
              </div>
            </div>
          ) : isCloudOffline ? (
            <div
              data-testid="active-engine-badge"
              className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-amber-300"
              title="Remote Worker Offline — Automatically fallback to Browser AI"
            >
              <CloudOff className="h-4 w-4 text-amber-400" />
              <div className="leading-tight">
                <div className="text-[10px] text-amber-400/80 font-mono">ACTIVE ENGINE</div>
                <div className="font-bold">Remote Worker Offline — Using Browser AI</div>
              </div>
            </div>
          ) : (
            <div
              data-testid="active-engine-badge"
              className="flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-cyan-300"
              title="Processing locally on your device via WebAssembly/WebGPU"
            >
              <Cpu className="h-4 w-4 text-cyan-400" />
              <div className="leading-tight">
                <div className="text-[10px] text-cyan-400/80 font-mono">ACTIVE ENGINE</div>
                <div className="font-bold flex items-center gap-1.5">
                  <span>On-Device (Browser AI)</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {isModelCached ? "• Warm" : "• WebAssembly"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
