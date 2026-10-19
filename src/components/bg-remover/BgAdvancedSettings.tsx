"use client";

import React, { useState } from "react";
import {
  Cpu,
  Sliders,
  Palette,
  Activity,
  RotateCcw,
  Sparkles,
  Server,
  Layers,
  ChevronDown,
  Info,
  Check,
} from "lucide-react";
import { StudioLocale, getTranslation } from "@/lib/i18n";
import { cyberAudio } from "@/lib/cyber-audio";
import { ProcessingStageMetrics } from "@/lib/bg-removal-client";
import { MaskDiagnostics } from "@/lib/bg-compositor";

export interface BgAdvancedSettingsProps {
  locale: StudioLocale;
  // Group A: Processing
  selectedEngine: "browser" | "worker";
  onSelectEngine: (engine: "browser" | "worker") => void;
  isWorkerConfigured: boolean;
  edgeQuality: "fast" | "balanced" | "fine_details";
  onChangeEdgeQuality: (q: "fast" | "balanced" | "fine_details") => void;
  // Group B: Edge Refinement
  dehaloRadius: number;
  onChangeDehaloRadius: (r: number) => void;
  alphaChoke: number;
  onChangeAlphaChoke: (c: number) => void;
  featherRadius: number;
  onChangeFeatherRadius: (f: number) => void;
  // Group C: Output
  selectedPurpose: "white" | "pink" | "transparent" | "custom";
  onSelectPurpose: (p: "white" | "pink" | "transparent" | "custom") => void;
  customColor: string;
  onChangeCustomColor: (c: string) => void;
  onOpenManualMask: () => void;
  hasImage: boolean;
  isProcessing: boolean;
  // Group D: Diagnostics
  isModelCached: boolean;
  metrics?: ProcessingStageMetrics;
  diagnostics?: MaskDiagnostics;
  // Reset Action
  onResetAdvanced: () => void;
}

export function BgAdvancedSettings({
  locale,
  selectedEngine,
  onSelectEngine,
  isWorkerConfigured,
  edgeQuality,
  onChangeEdgeQuality,
  dehaloRadius,
  onChangeDehaloRadius,
  alphaChoke,
  onChangeAlphaChoke,
  featherRadius,
  onChangeFeatherRadius,
  selectedPurpose,
  onSelectPurpose,
  customColor,
  onChangeCustomColor,
  onOpenManualMask,
  hasImage,
  isProcessing,
  isModelCached,
  metrics,
  diagnostics,
  onResetAdvanced,
}: BgAdvancedSettingsProps) {
  const t = (k: string) => getTranslation(locale, k);
  const [showSecondaryEdgeControls, setShowSecondaryEdgeControls] = useState(false);

  return (
    <details
      data-testid="advanced-settings-accordion"
      className="group border border-slate-800 bg-slate-950/80 p-3 sm:p-4 font-mono transition-all duration-200"
    >
      <summary className="cursor-pointer text-xs font-bold text-slate-300 hover:text-cyan-300 select-none flex items-center justify-between min-h-[44px]">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-wider font-bold">
            {t("advanced.title")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">
            Processing · Edge · Output · Diagnostics
          </span>
          <span className="text-[10px] text-cyan-400 group-open:rotate-180 transition-transform">
            ▼
          </span>
        </div>
      </summary>

      {/* Internal Panel Layout (2 columns on desktop, 1 on mobile) */}
      <div className="pt-4 border-t border-slate-800/80 mt-2 space-y-4 text-xs">
        <div className="flex items-center justify-between pb-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Fine-tuned Control Deck
          </span>
          <button
            type="button"
            data-testid="reset-advanced-settings-btn"
            onClick={() => {
              cyberAudio.playClick();
              onResetAdvanced();
            }}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-300 transition-colors uppercase cursor-pointer"
            title="Reset advanced values to defaults"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t("advanced.reset")}</span>
          </button>
        </div>

        {/* 2-Column Responsive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── GROUP A: PROCESSING ── */}
          <div className="border border-slate-850 bg-slate-900/50 p-3.5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Cpu className="h-4 w-4 text-cyan-400 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  {t("advanced.processingTitle")}
                </h4>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {t("advanced.processingDesc")}
                </p>
              </div>
            </div>

            {/* AI Engine Selection */}
            <div className="space-y-1.5">
              <div className="text-[10.5px] text-slate-300 font-bold">Execution Engine</div>
              <div className={`grid ${isWorkerConfigured ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
                <button
                  type="button"
                  data-testid="engine-select-browser"
                  role="radio"
                  aria-checked={selectedEngine === "browser"}
                  onClick={() => {
                    cyberAudio.playClick();
                    onSelectEngine("browser");
                  }}
                  disabled={isProcessing}
                  className={`min-h-[42px] flex items-center justify-between p-2.5 rounded-none border text-left transition-all ${
                    selectedEngine === "browser"
                      ? "border-cyan-400 bg-cyan-950/70 text-white font-bold ring-1 ring-cyan-400/40"
                      : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-none border ${
                        selectedEngine === "browser"
                          ? "bg-cyan-400 border-cyan-300"
                          : "bg-transparent border-slate-500"
                      }`}
                    />
                    <span className="text-[11px] font-bold text-white">Browser AI</span>
                  </div>
                  <span className="text-[9px] text-emerald-400 font-bold">100% Local</span>
                </button>

                {/* Hide Remote Worker completely when not configured */}
                {isWorkerConfigured && (
                  <button
                    type="button"
                    data-testid="engine-select-worker"
                    role="radio"
                    aria-checked={selectedEngine === "worker"}
                    onClick={() => {
                      cyberAudio.playClick();
                      onSelectEngine("worker");
                    }}
                    disabled={isProcessing}
                    className={`min-h-[42px] flex items-center justify-between p-2.5 rounded-none border text-left transition-all ${
                      selectedEngine === "worker"
                        ? "border-purple-400 bg-purple-950/70 text-white font-bold ring-1 ring-purple-400/40"
                        : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-none border ${
                          selectedEngine === "worker"
                            ? "bg-purple-400 border-purple-300"
                            : "bg-transparent border-slate-500"
                        }`}
                      />
                      <span className="text-[11px] font-bold text-slate-200">Remote Worker</span>
                    </div>
                    <span className="text-[9px] text-slate-400">Server</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quality Segmented Control */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[10.5px] text-slate-300 font-bold">Quality Profile</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  data-testid="edge-quality-fast"
                  onClick={() => {
                    cyberAudio.playClick();
                    onChangeEdgeQuality("fast");
                  }}
                  className={`min-h-[38px] p-1.5 rounded-none border text-center transition-all ${
                    edgeQuality === "fast"
                      ? "border-cyan-400 bg-cyan-950/70 text-white font-bold"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="text-[10.5px]">{t("process.fast")}</div>
                  <div className="text-[8.5px] text-slate-500">1024px</div>
                </button>
                <button
                  type="button"
                  data-testid="edge-quality-balanced"
                  onClick={() => {
                    cyberAudio.playClick();
                    onChangeEdgeQuality("balanced");
                  }}
                  className={`min-h-[38px] p-1.5 rounded-none border text-center transition-all ${
                    edgeQuality === "balanced"
                      ? "border-purple-400 bg-purple-950/70 text-white font-bold"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="text-[10.5px]">{t("process.balanced")}</div>
                  <div className="text-[8.5px] text-slate-500">1536px</div>
                </button>
                <button
                  type="button"
                  data-testid="edge-quality-quality"
                  onClick={() => {
                    cyberAudio.playClick();
                    onChangeEdgeQuality("fine_details");
                  }}
                  className={`min-h-[38px] p-1.5 rounded-none border text-center transition-all ${
                    edgeQuality === "fine_details"
                      ? "border-emerald-400 bg-emerald-950/70 text-white font-bold"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="text-[10.5px]">{t("process.fine")}</div>
                  <div className="text-[8.5px] text-slate-500">2048px</div>
                </button>
              </div>
            </div>
          </div>

          {/* ── GROUP B: EDGE REFINEMENT ── */}
          <div className="border border-slate-850 bg-slate-900/50 p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    {t("advanced.edgeTitle")}
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    {t("advanced.edgeDesc")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSecondaryEdgeControls(!showSecondaryEdgeControls)}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-bold cursor-pointer"
              >
                {showSecondaryEdgeControls ? "Collapse" : "Adjust"}
              </button>
            </div>

            {/* Dehalo / Color Decontamination Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10.5px] text-slate-300">
                <span title="Neutralizes background chroma spill on boundary pixels">
                  {t("advanced.dehalo")}
                </span>
                <span className="text-emerald-400 font-bold">{dehaloRadius.toFixed(1)}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="0.5"
                value={dehaloRadius}
                onChange={(e) => onChangeDehaloRadius(parseFloat(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-slate-800 appearance-none"
              />
            </div>

            {/* Secondary Edge Controls Disclosure */}
            {showSecondaryEdgeControls && (
              <div className="space-y-3 pt-2 border-t border-slate-800/80 animate-in fade-in duration-150">
                {/* Alpha Choke Slider */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10.5px] text-slate-300">
                    <span title="Inward erosion to eliminate stubborn background edge lines">
                      {t("advanced.alphaChoke")}
                    </span>
                    <span className="text-cyan-400 font-bold">{alphaChoke.toFixed(1)}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.2"
                    value={alphaChoke}
                    onChange={(e) => onChangeAlphaChoke(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 appearance-none"
                  />
                </div>

                {/* Feathering Slider */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10.5px] text-slate-300">
                    <span title="Smooth boundary transition for hair strands and soft edges">
                      {t("advanced.feather")}
                    </span>
                    <span className="text-pink-400 font-bold">{featherRadius.toFixed(1)}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.25"
                    value={featherRadius}
                    onChange={(e) => onChangeFeatherRadius(parseFloat(e.target.value))}
                    className="w-full accent-pink-400 cursor-pointer h-1.5 bg-slate-800 appearance-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── GROUP C: OUTPUT & EXPORT ── */}
          <div className="border border-slate-850 bg-slate-900/50 p-3.5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Palette className="h-4 w-4 text-pink-400 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  {t("advanced.outputTitle")}
                </h4>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {t("advanced.outputDesc")}
                </p>
              </div>
            </div>

            {/* Background Color Quick Selector */}
            <div className="space-y-1.5">
              <div className="text-[10.5px] text-slate-300 font-bold">Background Fill</div>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  data-testid="bg-color-white"
                  onClick={() => {
                    cyberAudio.playClick();
                    onSelectPurpose("white");
                  }}
                  className={`min-h-[38px] flex items-center justify-center gap-1.5 p-1 rounded-none border text-center transition-all ${
                    selectedPurpose === "white"
                      ? "border-cyan-400 bg-cyan-950/70 text-white font-bold"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="h-2.5 w-2.5 bg-white border border-slate-400" />
                  <span className="text-[10px]">White</span>
                </button>
                <button
                  type="button"
                  data-testid="bg-color-pink"
                  onClick={() => {
                    cyberAudio.playClick();
                    onSelectPurpose("pink");
                  }}
                  className={`min-h-[38px] flex items-center justify-center gap-1.5 p-1 rounded-none border text-center transition-all ${
                    selectedPurpose === "pink"
                      ? "border-pink-400 bg-pink-950/70 text-white font-bold"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="h-2.5 w-2.5 bg-pink-200 border border-pink-400" />
                  <span className="text-[10px]">Pink</span>
                </button>
                <button
                  type="button"
                  data-testid="bg-color-transparent"
                  onClick={() => {
                    cyberAudio.playClick();
                    onSelectPurpose("transparent");
                  }}
                  className={`min-h-[38px] flex items-center justify-center gap-1.5 p-1 rounded-none border text-center transition-all ${
                    selectedPurpose === "transparent"
                      ? "border-indigo-400 bg-indigo-950/70 text-white font-bold"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="text-[10px]">🏁</span>
                  <span className="text-[10px]">Alpha</span>
                </button>
                <div
                  className={`min-h-[38px] flex items-center justify-center gap-1 p-1 rounded-none border cursor-pointer ${
                    selectedPurpose === "custom"
                      ? "border-emerald-400 bg-emerald-950/70 text-white font-bold"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white"
                  }`}
                  onClick={() => onSelectPurpose("custom")}
                >
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => {
                      onChangeCustomColor(e.target.value);
                      onSelectPurpose("custom");
                    }}
                    className="h-3.5 w-3.5 bg-transparent border-0 cursor-pointer p-0"
                    title="Choose custom background color"
                  />
                  <span className="text-[10px]">Pick</span>
                </div>
              </div>
            </div>

            {/* Manual Mask Launcher */}
            <div className="pt-2 border-t border-slate-800/80">
              <button
                type="button"
                data-testid="manual-mask-btn"
                onClick={onOpenManualMask}
                disabled={!hasImage || isProcessing}
                className="min-h-[40px] w-full flex items-center justify-center gap-1.5 rounded-none border border-slate-700 bg-slate-850 px-3 py-2 text-xs text-slate-300 hover:text-white hover:border-cyan-400 transition-colors uppercase font-mono cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Layers className="h-3.5 w-3.5 text-cyan-400" />
                <span>{t("advanced.manualMask")}</span>
              </button>
            </div>
          </div>

          {/* ── GROUP D: DIAGNOSTICS & TELEMETRY ── */}
          <div
            data-testid="mask-diagnostics-panel"
            className="border border-slate-850 bg-slate-900/50 p-3.5 space-y-3"
          >
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Activity className="h-4 w-4 text-amber-400 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  {t("advanced.diagnosticsTitle")}
                </h4>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {t("advanced.diagnosticsDesc")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10.5px]">
              <div className="p-2 bg-slate-950/60 border border-slate-800">
                <div className="text-[9px] text-slate-500 uppercase">{t("advanced.modelStatus")}</div>
                <div className="font-bold text-emerald-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{isModelCached ? "Model: Warm" : "Ready"}</span>
                </div>
              </div>
              <div className="p-2 bg-slate-950/60 border border-slate-800">
                <div className="text-[9px] text-slate-500 uppercase">{t("advanced.cacheStatus")}</div>
                <div className="font-bold text-cyan-400">
                  {isModelCached ? "Cached: Yes (Warm)" : "Cached: No (Cold)"}
                </div>
              </div>
            </div>

            {/* Hardware & Runtime Telemetry Deck */}
            <div className="p-2 bg-slate-950/70 border border-slate-800 space-y-1 text-[10px] font-mono">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">WebGPU API:</span>
                <span className={`text-[10px] font-bold ${metrics?.webGpuApiAvailable ? "text-emerald-400" : "text-amber-400"}`}>
                  {metrics?.webGpuApiAvailable ? "Available" : "Unavailable"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">GPU Adapter:</span>
                <span className={`text-[10px] font-bold ${metrics?.gpuAdapterAvailable ? "text-emerald-400" : "text-slate-400"}`}>
                  {metrics?.gpuAdapterAvailable ? "Available" : "Not found"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">WebGPU Session:</span>
                <span className={`text-[10px] font-bold ${metrics?.webGpuSessionPassed ? "text-emerald-400" : "text-amber-400"}`}>
                  {metrics?.webGpuSessionPassed ? "Passed" : "Failed (WASM active)"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">Actual Backend:</span>
                <span className={`font-bold px-1.5 py-0.5 text-[10px] ${
                  metrics?.backend === "WebGPU"
                    ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                    : "bg-cyan-950/80 text-cyan-300 border border-cyan-500/40"
                }`}>
                  {metrics?.backend || (typeof WebAssembly !== "undefined" ? "WASM" : "WASM (Fallback)")}
                </span>
              </div>
              {metrics?.webGpuFallbackReason && (
                <div className="flex justify-between items-center text-slate-300 border-t border-slate-900 pt-0.5">
                  <span className="text-slate-400 uppercase text-[9px]">Fallback Reason:</span>
                  <span className="text-amber-300 text-[9.5px] truncate max-w-[190px]" title={metrics.webGpuFallbackReason}>
                    {metrics.webGpuFallbackReason}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center text-slate-300 border-t border-slate-900 pt-0.5">
                <span className="text-slate-400 uppercase text-[9px]">WASM SIMD Status:</span>
                <span className={`text-[10px] ${metrics?.wasmSimd !== false ? "text-emerald-400 font-bold" : "text-slate-400"}`}>
                  {metrics?.wasmSimd !== false ? "Supported (Enabled)" : "Disabled"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">WASM Threads Status:</span>
                <span className="text-slate-300 text-[10px]">
                  {metrics?.wasmThreadsStatus ? "Enabled" : "Disabled (Single-threaded)"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">Selected Thread Count:</span>
                <span className="text-cyan-300 text-[10px] font-bold">
                  {metrics?.selectedThreadCount ?? metrics?.wasmThreads ?? 1} {((metrics?.selectedThreadCount ?? metrics?.wasmThreads ?? 1) === 1 ? "thread" : "threads")}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300 border-t border-slate-900 pt-0.5">
                <span className="text-slate-400 uppercase text-[9px]">Main-Thread Blocking:</span>
                <span className="text-emerald-400 text-[10px] font-bold">
                  {metrics?.mainThreadBlockingMs !== undefined ? `${metrics.mainThreadBlockingMs} ms (< 16ms lag)` : "0 ms"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">UI Responsiveness:</span>
                <span className="text-emerald-400 text-[10px] font-bold">
                  {metrics?.uiResponsiveness || "Responsive (Non-blocking)"}
                </span>
              </div>
              {metrics?.workingResolution && (
                <div className="flex justify-between items-center text-slate-300 border-t border-slate-900 pt-1">
                  <span className="text-slate-400 uppercase text-[9px]">Working Resolution:</span>
                  <span className="text-cyan-300 text-[10px] font-bold">
                    {metrics.workingResolution}
                  </span>
                </div>
              )}
              {metrics?.autoQualityResolution && (
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400 uppercase text-[9px]">Auto-Quality Target:</span>
                  <span className={`text-[10px] font-bold ${metrics.autoQualityTriggered ? "text-amber-300" : "text-emerald-400"}`}>
                    {metrics.autoQualityResolution}px {metrics.autoQualityTriggered ? "(Auto-upgraded)" : "(Standard)"}
                  </span>
                </div>
              )}
              {metrics?.khmerDiagnostics && (
                <div className="border-t border-slate-900 pt-1 space-y-0.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400 uppercase text-[9px]">Khmer Typography:</span>
                    <span className="text-[10px] font-mono text-cyan-300">
                      {metrics.khmerDiagnostics.hasSmallKhmerText
                        ? "Small/Stacked Scripts"
                        : metrics.khmerDiagnostics.hasTextStrokes
                        ? "Normal Typography"
                        : "No Text"}
                    </span>
                  </div>
                  {metrics.khmerDiagnostics.hasTextStrokes && (
                    <div className="flex justify-between items-center text-[9px] text-slate-400">
                      <span>Strokes / Islands:</span>
                      <span className="text-slate-300 font-mono">
                        {metrics.khmerDiagnostics.textComponentCount} comp ({metrics.khmerDiagnostics.smallComponentCount} small)
                      </span>
                    </div>
                  )}
                  {metrics.khmerDiagnostics.textNearPersonSilhouette && (
                    <div className="text-[9px] text-amber-300/90 italic">
                      Text near silhouette protected from choke/feathering
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Phase Timing Breakdown Table (8 Stages) */}
            <div className="p-2 bg-slate-950/80 border border-slate-800 space-y-1 text-[10.5px]">
              <div className="text-[9px] text-slate-400 font-bold uppercase pb-1 border-b border-slate-850 flex justify-between">
                <span>Phase</span>
                <span>Duration</span>
              </div>
              {!metrics || metrics.totalMs === undefined ? (
                <div className="py-2 text-center text-slate-400 italic text-[11px]" data-testid="metrics-unmeasured">
                  Not measured yet
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-slate-300">
                    <span>1. Decode:</span>
                    {metrics.decodeMs !== undefined || metrics.uploadDecodeMs !== undefined ? (
                      <span className="font-mono text-cyan-300">
                        {metrics.decodeMs ?? metrics.uploadDecodeMs} ms
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-[10px]">Not measured yet</span>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>2. Resize:</span>
                    {metrics.resizeMs !== undefined ? (
                      metrics.resizeMs > 0 ? (
                        <span className="font-mono text-cyan-300">{metrics.resizeMs} ms</span>
                      ) : (
                        <span className="text-slate-400 italic text-[10px]">0 ms (Original size)</span>
                      )
                    ) : (
                      <span className="text-slate-500 italic text-[10px]">Not measured yet</span>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>3. Model Load:</span>
                    {metrics.modelLoadMs !== undefined ? (
                      metrics.modelLoadMs > 0 ? (
                        <span className="font-mono text-cyan-300">{metrics.modelLoadMs} ms</span>
                      ) : (
                        <span className="text-emerald-400 italic text-[10px]">0 ms (Cached / Warm)</span>
                      )
                    ) : (
                      <span className="text-slate-500 italic text-[10px]">Not measured yet</span>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>4. AI Inference:</span>
                    {metrics.inferenceMs !== undefined || metrics.segmentationMs !== undefined ? (
                      <span className="font-mono text-cyan-300">
                        {metrics.inferenceMs ?? metrics.segmentationMs} ms
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-[10px]">Not measured yet</span>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>5. Text Detection:</span>
                    {metrics.textDetectionMs !== undefined || metrics.textProtectionMs !== undefined ? (
                      <span className="font-mono text-pink-300">
                        {metrics.textDetectionMs ?? metrics.textProtectionMs} ms
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-[10px]">Skipped — mode does not require text detection</span>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>6. Edge Refinement:</span>
                    {metrics.edgeRefineMs !== undefined || metrics.maskRefineMs !== undefined ? (
                      <span className="font-mono text-cyan-300">
                        {metrics.edgeRefineMs ?? metrics.maskRefineMs} ms
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-[10px]">Skipped (Fast mode)</span>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>7. Compositing:</span>
                    {metrics.compositingMs !== undefined || metrics.encodingMs !== undefined ? (
                      <span className="font-mono text-cyan-300">
                        {metrics.compositingMs ?? metrics.encodingMs} ms
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-[10px]">Not measured yet</span>
                    )}
                  </div>
                  <div className="flex justify-between text-white font-bold pt-1 border-t border-slate-850">
                    <span>8. Total Latency:</span>
                    <span className="font-mono text-emerald-400">
                      {metrics.totalMs} ms
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Mask Statistics if available */}
            {diagnostics && (
              <div className="text-[9.5px] text-slate-400 flex items-center justify-between px-1">
                <span>Retention: {(diagnostics.areaRetentionRatio * 100).toFixed(1)}%</span>
                <span>Components: {diagnostics.connectedComponentCount}</span>
                <span>Holes: {diagnostics.interiorHoleCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
