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
              className="flex items-center gap-2 rounded-xl border border-purple-500/40 bg-purple-950/40 px-3 py-1.5 text-purple-300"
              title="ផ្ញើរូបភាពទៅកាត់នៅលើ Server សម្រាប់រូបស្មុគស្មាញ (Processed on remote server)"
            >
              <Cloud className="h-4 w-4 text-purple-400" />
              <div className="leading-tight">
                <div className="text-[10px] text-purple-400/80 font-mono">ACTIVE ENGINE</div>
                <div className="font-bold">ម៉ាស៊ីនមេកម្រិតខ្ពស់ (Cloud Server AI)</div>
                <div className="text-[9.5px] text-purple-300/80 font-mono mt-0.5">
                  ផ្ញើរូបភាពទៅកាត់នៅលើ Server (Processed on remote server)
                </div>
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
                <div className="font-bold">ម៉ាស៊ីនមេកម្រិតខ្ពស់ (Cloud Server AI) — ក្រៅបណ្តាញ</div>
                <div className="text-[9.5px] text-amber-200/80 font-mono mt-0.5">
                  Fallback: ដំណើរការលើ Browser AI ជំនួសវិញ (Processed locally)
                </div>
              </div>
            </div>
          ) : (
            <div
              data-testid="active-engine-badge"
              className="flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-cyan-300"
              title="រូបភាពត្រូវបានកាត់នៅក្នុង Browser របស់អ្នកផ្ទាល់ មិនផ្ញើទៅ Server ទេ (Processed locally in your browser)"
            >
              <Cpu className="h-4 w-4 text-cyan-400" />
              <div className="leading-tight">
                <div className="text-[10px] text-cyan-400/80 font-mono">ACTIVE ENGINE</div>
                <div className="font-bold flex items-center gap-1.5">
                  <span>ដំណើរការលើឧបករណ៍ផ្ទាល់ (Browser AI • 100% On-Device)</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {isModelCached ? "• Warm" : "• Local"}
                  </span>
                </div>
                <div className="text-[9.5px] text-cyan-200/70 font-mono mt-0.5">
                  រូបភាពត្រូវបានកាត់នៅក្នុង Browser ផ្ទាល់ (Processed locally in your browser)
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
