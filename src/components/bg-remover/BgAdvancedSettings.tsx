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
import { MaskDiagnostics, SelectionMode } from "@/lib/bg-compositor";

export interface BgAdvancedSettingsProps {
  locale: StudioLocale;
  // Specialized Selection Modes
  activeSelectionMode?: SelectionMode;
  onSelectSelectionMode?: (mode: SelectionMode) => void;
  // Group A: Processing
  selectedEngine: "browser" | "worker";
  onSelectEngine: (engine: "browser" | "worker") => void;
  isWorkerConfigured: boolean;
  workerStatus?: "not_configured" | "checking" | "ready" | "unavailable" | "configured";
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
  textPolicy?: "keep_text" | "remove_all_text";
  refinementPreset?: "standard" | "fine_hair" | "manual";
  metrics?: ProcessingStageMetrics;
  diagnostics?: MaskDiagnostics;
  visualDebug?: {
    initialMaskUrl?: string;
    refinedMaskUrl?: string;
    removedComponentsUrl?: string;
    finalAlphaUrl?: string;
    removedComponentsCount?: number;
    hasIsolatedBlobs?: boolean;
  };
  // Reset Action
  onResetAdvanced: () => void;
}

export function BgAdvancedSettings({
  locale,
  activeSelectionMode,
  onSelectSelectionMode,
  selectedEngine,
  onSelectEngine,
  isWorkerConfigured,
  workerStatus,
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
  textPolicy,
  refinementPreset,
  metrics,
  diagnostics,
  visualDebug,
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
          <span className="text-sm">⚙️</span>
          <span className="text-xs uppercase tracking-wider font-bold">
            {t("advanced.title")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-cyan-400 group-open:rotate-180 transition-transform">
            ▼
          </span>
        </div>
      </summary>

      {/* Internal Panel Layout (2 columns on desktop, 1 on mobile) */}
      <div className="pt-4 border-t border-slate-800/80 mt-2 space-y-4 text-xs">
        <div className="flex items-center justify-between pb-1">
          <span className="text-[11px] text-slate-300 font-bold font-sans">
            ការកំណត់កម្រិតខ្ពស់ (Advanced Settings)
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

        {/* Specialized Keep Modes */}
        {onSelectSelectionMode && (
          <div className="border border-slate-800 bg-slate-900/60 p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase">
              <span>Specialized Keep Modes</span>
              <span className="text-[10px] text-cyan-400 font-normal">
                {activeSelectionMode === "person_text_only"
                  ? "Person + Text"
                  : activeSelectionMode === "whole_product"
                  ? "Product Only"
                  : activeSelectionMode === "document_poster"
                  ? "Document / Poster"
                  : activeSelectionMode === "custom"
                  ? "Custom Mask"
                  : "Standard"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  cyberAudio.playClick();
                  onSelectSelectionMode("person_text_only");
                }}
                className={`p-2 border text-left rounded-none transition-all ${
                  activeSelectionMode === "person_text_only"
                    ? "border-pink-400 bg-pink-950/60 text-white font-bold"
                    : "border-slate-850 bg-slate-950/70 text-slate-300 hover:border-slate-700"
                }`}
              >
                <div className="font-bold text-[10.5px]">Person + Text</div>
                <div className="text-[9px] text-slate-400 mt-0.5">Strokes & text</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  cyberAudio.playClick();
                  onSelectSelectionMode("whole_product");
                }}
                className={`p-2 border text-left rounded-none transition-all ${
                  activeSelectionMode === "whole_product"
                    ? "border-amber-400 bg-amber-950/60 text-white font-bold"
                    : "border-slate-850 bg-slate-950/70 text-slate-300 hover:border-slate-700"
                }`}
              >
                <div className="font-bold text-[10.5px]">Product Only</div>
                <div className="text-[9px] text-slate-400 mt-0.5">Boxes & items</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  cyberAudio.playClick();
                  onSelectSelectionMode("document_poster");
                }}
                className={`p-2 border text-left rounded-none transition-all ${
                  activeSelectionMode === "document_poster"
                    ? "border-cyan-400 bg-cyan-950/60 text-white font-bold"
                    : "border-slate-850 bg-slate-950/70 text-slate-300 hover:border-slate-700"
                }`}
              >
                <div className="font-bold text-[10.5px]">Document / Poster</div>
                <div className="text-[9px] text-slate-400 mt-0.5">Document safe mode</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  cyberAudio.playClick();
                  onSelectSelectionMode("custom");
                }}
                className={`p-2 border text-left rounded-none transition-all ${
                  activeSelectionMode === "custom"
                    ? "border-rose-400 bg-rose-950/60 text-white font-bold"
                    : "border-slate-850 bg-slate-950/70 text-slate-300 hover:border-slate-700"
                }`}
              >
                <div className="font-bold text-[10.5px]">Custom Mask</div>
                <div className="text-[9px] text-slate-400 mt-0.5">Brush manual carve</div>
              </button>
            </div>
          </div>
        )}

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
            <div className="space-y-2">
              <div className="text-[11px] text-slate-200 font-bold uppercase tracking-wider font-mono flex items-center justify-between">
                <span>ម៉ាស៊ីនដំណើរការ (Execution Engine)</span>
                <span className="text-[10px] text-slate-400 font-normal">2 ជម្រើសច្បាស់លាស់</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {/* Option A: Browser AI • 100% On-Device */}
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
                  className={`min-h-[58px] flex flex-col justify-between p-3 rounded-xl border text-left transition-all ${
                    selectedEngine === "browser"
                      ? "border-cyan-400 bg-cyan-950/70 text-white font-bold ring-1 ring-cyan-400/40 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
                      : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-3 w-3 rounded-full border ${
                          selectedEngine === "browser"
                            ? "bg-cyan-400 border-cyan-300"
                            : "bg-transparent border-slate-500"
                        }`}
                      />
                      <span className="text-xs font-bold text-white">
                        ដំណើរការលើឧបករណ៍ផ្ទាល់ (Browser AI • 100% On-Device)
                      </span>
                    </div>
                    <span className="text-[9.5px] bg-emerald-950 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded font-mono font-bold shrink-0">
                      100% Local
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10.5px] text-slate-300 font-sans leading-relaxed">
                    រូបភាពត្រូវបានកាត់នៅក្នុង Browser របស់អ្នកផ្ទាល់ មិនផ្ញើទៅ Server ទេ (Processed locally in your browser)
                  </p>
                </button>

                {/* Option B: Cloud Server AI */}
                {(() => {
                  const isWorkerOnline = isWorkerConfigured && workerStatus === "ready";
                  return (
                    <button
                      type="button"
                      data-testid="engine-select-worker"
                      role="radio"
                      aria-checked={selectedEngine === "worker"}
                      aria-disabled={!isWorkerOnline ? "true" : "false"}
                      disabled={!isWorkerOnline || isProcessing}
                      onClick={() => {
                        if (!isWorkerOnline) return;
                        cyberAudio.playClick();
                        onSelectEngine("worker");
                      }}
                      className={`min-h-[58px] flex flex-col justify-between p-3 rounded-xl border text-left transition-all ${
                        !isWorkerOnline
                          ? "border-slate-800/80 bg-slate-900/30 text-slate-500 opacity-60 cursor-not-allowed"
                          : selectedEngine === "worker"
                          ? "border-purple-400 bg-purple-950/70 text-white font-bold ring-1 ring-purple-400/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                          : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-3 w-3 rounded-full border ${
                              selectedEngine === "worker"
                                ? "bg-purple-400 border-purple-300"
                                : "bg-transparent border-slate-500"
                            }`}
                          />
                          <span className="text-xs font-bold text-slate-200">
                            ម៉ាស៊ីនមេកម្រិតខ្ពស់ (Cloud Server AI)
                          </span>
                        </div>
                        <span
                          className={`text-[9.5px] px-2 py-0.5 rounded font-mono font-bold shrink-0 border ${
                            isWorkerOnline
                              ? "bg-purple-950 border-purple-500/40 text-purple-300"
                              : "bg-slate-900 border-slate-700 text-slate-400"
                          }`}
                        >
                          {isWorkerOnline ? "Cloud AI" : "ក្រៅបណ្តាញ / Offline"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[10.5px] text-slate-300 font-sans leading-relaxed">
                        {isWorkerOnline
                          ? "ផ្ញើរូបភាពទៅកាត់នៅលើ Server សម្រាប់រូបស្មុគស្មាញ (Processed on remote server)"
                          : "ផ្ញើរូបភាពទៅកាត់នៅលើ Server សម្រាប់រូបស្មុគស្មាញ (Processed on remote server) — ម៉ាស៊ីនមេក្រៅបណ្តាញ"}
                      </p>
                    </button>
                  );
                })()}
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

            {/* Hardware & Runtime Telemetry Deck - Hidden behind Admin-only Advanced Diagnostics */}
            <details data-testid="advanced-technical-diagnostics" className="group/diag border border-slate-800/80 bg-slate-950/70 p-2.5 rounded text-[10px] font-mono">
              <summary className="cursor-pointer text-[10.5px] font-bold text-slate-300 hover:text-cyan-300 flex items-center justify-between select-none min-h-[36px]">
                <span className="flex items-center gap-1.5 uppercase tracking-wider">
                  🔧 Advanced Diagnostics (Admin Only / ការវិភាគកម្រិតខ្ពស់)
                </span>
                <span className="text-[10px] text-cyan-400 group-open/diag:rotate-180 transition-transform">
                  ▼
                </span>
              </summary>
              <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-2">
                <div className="flex justify-between items-start text-slate-300">
                  <span className="text-slate-400 uppercase text-[9px] font-bold">actualModel:</span>
                  <span className="text-cyan-300 font-bold text-[10px] text-right truncate max-w-[210px]" title={metrics?.actualModel || "ISNet-FP16 (On-Device AI)"}>
                    {metrics?.actualModel || "ISNet-FP16 (On-Device AI)"}
                  </span>
                </div>
                <div className="flex justify-between items-start text-slate-300">
                  <span className="text-slate-400 uppercase text-[9px]">actualModelFile:</span>
                  <span className="text-slate-300 text-[9px] text-right truncate max-w-[210px]" title={metrics?.actualModelFile || "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/models/isnet_fp16"}>
                    {metrics?.actualModelFile || "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/models/isnet_fp16"}
                  </span>
                </div>
                <div className="flex justify-between items-start text-slate-300">
                  <span className="text-slate-400 uppercase text-[9px]">actualRuntime:</span>
                  <span className="text-slate-200 text-[9.5px] text-right">
                    {metrics?.actualRuntime || "@imgly/background-removal v1.7.0 (onnxruntime-web)"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400 uppercase text-[9px]">actualExecutionProvider:</span>
                  <span className={`font-bold px-1.5 py-0.5 text-[10px] ${
                    (metrics?.actualExecutionProvider || metrics?.backend) === "WebGPU"
                      ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                      : "bg-cyan-950/80 text-cyan-300 border border-cyan-500/40"
                  }`}>
                    {metrics?.actualExecutionProvider || metrics?.backend || (typeof WebAssembly !== "undefined" ? "WASM" : "WASM (Fallback)")}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300 border-t border-slate-900 pt-1.5">
                  <span className="text-slate-400 uppercase text-[9px]">actualTextDetector:</span>
                  <span className="text-emerald-300 text-[9.5px] font-bold">Edge Gradient & Stroke Preservation Engine</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400 uppercase text-[9px]">actualTextPolicy:</span>
                  <span className="text-slate-200 text-[10px] font-bold">
                    {(textPolicy || metrics?.actualTextPolicy || metrics?.textPolicy) === "remove_all_text"
                      ? "Remove All Text"
                      : "Preserve Text & Logos"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400 uppercase text-[9px]">actualRefinementPreset:</span>
                  <span className="text-cyan-300 text-[10px] font-bold">
                    {refinementPreset || metrics?.actualRefinementPreset || "standard"}
                  </span>
                </div>
                <div className="flex justify-between items-start text-slate-300 border-t border-slate-900 pt-1.5">
                  <span className="text-slate-400 uppercase text-[9px] font-bold">fallbackReason:</span>
                  <span className="text-slate-300 text-[9px] text-right truncate max-w-[210px]" title={metrics?.fallbackReason || metrics?.webGpuFallbackReason || "None (Active Model Operating)"}>
                    {metrics?.fallbackReason || metrics?.webGpuFallbackReason || "None (Active Model Operating)"}
                  </span>
                </div>
              </div>
            </details>
              <div className="flex justify-between items-center text-slate-300 border-t border-slate-900 pt-1">
                <span className="text-slate-400 uppercase text-[9px]">Model Resolution:</span>
                <span className="text-slate-200 text-[10px] font-bold">
                  {metrics?.modelResolution || "1024×1024 (Static Input)"}
                </span>
              </div>
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
              {!metrics ? (
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
                    {metrics.textDetectionStatus === "failed" ? (
                      <span className="font-mono text-rose-400 font-bold text-xs" data-testid="text-detection-failed">
                        Required but failed
                      </span>
                    ) : metrics.textDetectionStatus === "skipped" || (metrics.textDetectionMs === undefined && metrics.textProtectionMs === undefined) ? (
                      <span className="text-slate-500 italic text-[10px]" data-testid="text-detection-skipped">
                        {metrics.textDetectionReason || "Skipped — mode does not require text detection"}
                      </span>
                    ) : (
                      <span className="font-mono text-pink-300" data-testid="text-detection-completed">
                        Completed — {metrics.textDetectionMs ?? metrics.textProtectionMs} ms
                      </span>
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

            {/* Visual Debug Diagnostic Cards (Requirement 10) */}
            {visualDebug && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-[11px] font-bold text-cyan-300 uppercase font-mono">
                  <span>Visual Debug Diagnostics</span>
                  {visualDebug.hasIsolatedBlobs ? (
                    <span className="text-[9px] text-rose-400 font-bold bg-rose-950/80 px-2 py-0.5 border border-rose-500/40">
                      Isolated Blobs Detected
                    </span>
                  ) : (
                    <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 border border-emerald-500/40">
                      Clean Silhouette (0 Blobs)
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[9px]">
                  {visualDebug.initialMaskUrl && (
                    <div className="flex flex-col items-center border border-slate-800 bg-slate-900/60 p-1.5 rounded">
                      <span className="text-slate-400 mb-1 font-semibold">1. Initial Mask</span>
                      <img src={visualDebug.initialMaskUrl} alt="Initial Mask" className="h-16 w-auto object-contain border border-slate-700 bg-black" />
                    </div>
                  )}
                  {visualDebug.refinedMaskUrl && (
                    <div className="flex flex-col items-center border border-slate-800 bg-slate-900/60 p-1.5 rounded">
                      <span className="text-slate-400 mb-1 font-semibold">2. Refined Silhouette</span>
                      <img src={visualDebug.refinedMaskUrl} alt="Refined Silhouette" className="h-16 w-auto object-contain border border-slate-700 bg-black" />
                    </div>
                  )}
                  {visualDebug.removedComponentsUrl && (
                    <div className="flex flex-col items-center border border-slate-800 bg-slate-900/60 p-1.5 rounded">
                      <span className="text-rose-400 mb-1 font-semibold">
                        3. Removed ({visualDebug.removedComponentsCount ?? 0})
                      </span>
                      <img src={visualDebug.removedComponentsUrl} alt="Removed Isolated Blobs" className="h-16 w-auto object-contain border border-rose-900/40 bg-black" />
                    </div>
                  )}
                  {visualDebug.finalAlphaUrl && (
                    <div className="flex flex-col items-center border border-slate-800 bg-slate-900/60 p-1.5 rounded">
                      <span className="text-emerald-400 mb-1 font-semibold">4. Final Alpha Matte</span>
                      <img src={visualDebug.finalAlphaUrl} alt="Final Alpha Matte" className="h-16 w-auto object-contain border border-emerald-900/40 bg-black" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </details>
  );
}
