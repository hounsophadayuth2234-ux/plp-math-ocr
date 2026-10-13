"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Download, RefreshCw, Check, Layers, Sparkles } from "lucide-react";
import { compositeWithSolidColor } from "@/lib/bg-removal-client";

interface ColorStudioProps {
  transparentBlob: Blob;
  initialCompositeUrl: string;
  width: number;
  height: number;
  initialMode?: "question" | "solution";
  initialBgColor?: string;
  provider?: string;
  onReset: () => void;
}

/**
 * Specialized Auto-Background Studio for PLP Math:
 * Feature 1: "កាត់រូបដាក់សំណួរ" (Solid White #FFFFFF)
 * Feature 2: "កាត់រូបដាក់ដំណោះស្រាយ" (Solid Pale Pink #FFF0F5)
 * Displays the baked composite image directly in the preview deck and enables 1-click download.
 */
export function ColorStudio({
  transparentBlob,
  initialCompositeUrl,
  width,
  height,
  initialMode = "question",
  initialBgColor = "#FFFFFF",
  provider,
  onReset,
}: ColorStudioProps) {
  const [activeMode, setActiveMode] = useState<"question" | "solution">(initialMode);
  const [bgColor, setBgColor] = useState<string>(initialBgColor);
  const [currentCompositeUrl, setCurrentCompositeUrl] = useState<string>(initialCompositeUrl);
  const [isSwitching, setIsSwitching] = useState(false);

  // Sync if initialCompositeUrl changes
  useEffect(() => {
    setCurrentCompositeUrl(initialCompositeUrl);
    setActiveMode(initialMode);
    setBgColor(initialBgColor);
  }, [initialCompositeUrl, initialMode, initialBgColor]);

  // Switch to Feature 1: កាត់រូបដាក់សំណួរ (Solid White #FFFFFF)
  const handleSelectQuestionMode = async () => {
    if (activeMode === "question") return;
    setIsSwitching(true);
    setActiveMode("question");
    setBgColor("#FFFFFF");

    try {
      const { dataUrl } = await compositeWithSolidColor(transparentBlob, "#FFFFFF");
      setCurrentCompositeUrl(dataUrl);
    } catch (err) {
      console.error("Failed to re-composite with #FFFFFF:", err);
    } finally {
      setIsSwitching(false);
    }
  };

  // Switch to Feature 2: កាត់រូបដាក់ដំណោះស្រាយ (Solid Pale Pink #FFF0F5)
  const handleSelectSolutionMode = async () => {
    if (activeMode === "solution") return;
    setIsSwitching(true);
    setActiveMode("solution");
    setBgColor("#FFF0F5");

    try {
      const { dataUrl } = await compositeWithSolidColor(transparentBlob, "#FFF0F5");
      setCurrentCompositeUrl(dataUrl);
    } catch (err) {
      console.error("Failed to re-composite with #FFF0F5:", err);
    } finally {
      setIsSwitching(false);
    }
  };

  // 1-Click Download of the final image with respective solid color baked in
  const handleDownload = useCallback(() => {
    if (!currentCompositeUrl) return;
    const a = document.createElement("a");
    a.href = currentCompositeUrl;
    const timestamp = Date.now();
    if (activeMode === "solution") {
      a.download = `PLP-Solution-Pink-FFF0F5-${timestamp}.png`;
    } else {
      a.download = `PLP-Question-White-FFFFFF-${timestamp}.png`;
    }
    a.click();
  }, [currentCompositeUrl, activeMode]);

  // Transparent PNG download
  const handleDownloadTransparent = () => {
    const url = URL.createObjectURL(transparentBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PLP-Transparent-Subject-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const isQuestion = activeMode === "question";

  return (
    <div className="flex flex-col gap-5">
      {/* ── Feature Switcher Tabs (Question vs Solution) ── */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-cyan-500/20 bg-slate-950/80 p-2 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
        {/* Feature 1 Tab */}
        <button
          type="button"
          onClick={handleSelectQuestionMode}
          disabled={isSwitching}
          className={`group relative flex items-center gap-3 rounded-xl p-3.5 text-left transition-all ${
            isQuestion
              ? "bg-slate-900 border border-cyan-400/50 shadow-[0_0_20px_rgba(0,240,255,0.18)]"
              : "border border-transparent hover:bg-slate-900/60 opacity-75 hover:opacity-100"
          }`}
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/30">
            <span className="h-5 w-5 rounded-full border border-slate-300 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
            {isQuestion && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] text-slate-950 font-bold">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white tracking-wide truncate">
                កាត់រូបដាក់សំណួរ
              </span>
              <span className="rounded bg-white/15 px-1.5 py-0.2 font-mono text-[9px] font-bold text-slate-200">
                #FFFFFF
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-cyan-300/80 truncate">
              ផ្ទៃពណ៌សសុទ្ធ (Question Section)
            </p>
          </div>
        </button>

        {/* Feature 2 Tab */}
        <button
          type="button"
          onClick={handleSelectSolutionMode}
          disabled={isSwitching}
          className={`group relative flex items-center gap-3 rounded-xl p-3.5 text-left transition-all ${
            !isQuestion
              ? "bg-slate-900 border border-pink-400/50 shadow-[0_0_20px_rgba(255,105,180,0.18)]"
              : "border border-transparent hover:bg-slate-900/60 opacity-75 hover:opacity-100"
          }`}
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-500/10 ring-1 ring-pink-400/40">
            <span
              className="h-5 w-5 rounded-full border border-pink-300 shadow-[0_0_10px_rgba(255,182,193,0.9)]"
              style={{ backgroundColor: "#FFF0F5" }}
            />
            {!isQuestion && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-[10px] text-slate-950 font-bold">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white tracking-wide truncate">
                កាត់រូបដាក់ដំណោះស្រាយ
              </span>
              <span className="rounded bg-pink-500/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-pink-300">
                #FFF0F5
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-pink-300/80 truncate">
              ផ្ទៃពណ៌ផ្កាឈូក (Solution Section)
            </p>
          </div>
        </button>
      </div>

      {/* ── Status HUD Banner ── */}
      <div className="flex items-center justify-between rounded-xl border border-cyan-500/20 bg-slate-950/70 px-4 py-2.5 font-mono text-xs shadow-inner">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full animate-pulse ${
              isQuestion ? "bg-cyan-400" : "bg-pink-400"
            }`}
          />
          <span className="text-slate-300">
            {isQuestion ? (
              <>
                <strong className="text-white">កាត់រូបដាក់សំណួរ:</strong> ផ្ទៃពណ៌ស{" "}
                <span className="text-cyan-400 font-bold">#FFFFFF</span> បានអនុវត្តស្វ័យប្រវត្តិ ✓
              </>
            ) : (
              <>
                <strong className="text-white">កាត់រូបដាក់ដំណោះស្រាយ:</strong> ផ្ទៃផ្កាឈូក{" "}
                <span className="text-pink-400 font-bold">#FFF0F5</span> បានអនុវត្តស្វ័យប្រវត្តិ ✓
              </>
            )}
          </span>
        </div>
        <span className="hidden sm:inline-block text-[11px] text-slate-400">
          {width} × {height} px · PNG {provider === "canvas_chroma" ? "(Chroma Core)" : "(IS-Net AI)"}
        </span>
      </div>

      {/* ── Baked Composite Preview Deck ── */}
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-2xl border bg-slate-950 p-4 transition-all duration-300 ${
          isQuestion
            ? "border-cyan-500/40 shadow-[0_0_35px_rgba(0,240,255,0.12)]"
            : "border-pink-500/40 shadow-[0_0_35px_rgba(255,105,180,0.12)]"
        }`}
        style={{ minHeight: 280 }}
      >
        {/* Tech Corner Reticles */}
        <div
          className={`absolute top-2 left-2 h-3 w-3 border-t-2 border-l-2 ${
            isQuestion ? "border-cyan-400" : "border-pink-400"
          }`}
        />
        <div
          className={`absolute top-2 right-2 h-3 w-3 border-t-2 border-r-2 ${
            isQuestion ? "border-cyan-400" : "border-pink-400"
          }`}
        />
        <div
          className={`absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 ${
            isQuestion ? "border-cyan-400" : "border-pink-400"
          }`}
        />
        <div
          className={`absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 ${
            isQuestion ? "border-cyan-400" : "border-pink-400"
          }`}
        />

        {/* Live Processed Output Image (Baked with the respective solid color background) */}
        <div className="relative z-10 flex items-center justify-center">
          <img
            src={currentCompositeUrl}
            alt={isQuestion ? "Processed Image with White Background" : "Processed Image with Pale Pink Background"}
            className="max-h-[460px] max-w-full object-contain rounded-xl shadow-2xl transition-all"
          />
        </div>
      </div>

      {/* ── Action Control Deck ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4 shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
        {/* Primary Download Button with respective solid color already applied */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={isSwitching}
          className={`flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 ${
            isQuestion
              ? "bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 shadow-cyan-900/40 hover:shadow-cyan-500/25 ring-1 ring-cyan-400/40"
              : "bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 shadow-pink-900/40 hover:shadow-pink-500/25 ring-1 ring-pink-400/40"
          }`}
        >
          <Download className="h-4 w-4" />
          <span>
            {isQuestion
              ? "ទាញយករូបភាពសំណួរ (PNG ផ្ទៃពណ៌ស #FFFFFF)"
              : "ទាញយករូបភាពដំណោះស្រាយ (PNG ផ្ទៃផ្កាឈូក #FFF0F5)"}
          </span>
        </button>

        {/* Secondary Utility Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800 text-xs">
          <button
            type="button"
            onClick={handleDownloadTransparent}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <span>ទាញយក Transparent PNG</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 font-medium text-slate-300 hover:bg-rose-950/60 hover:border-rose-500/40 hover:text-rose-300 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>ដំណើរការរូបភាពថ្មី (Reset)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
