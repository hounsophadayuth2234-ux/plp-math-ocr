"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Download, RefreshCw, Layers, CheckCircle2, Cpu } from "lucide-react";
import { compositeWithSolidColor } from "@/lib/bg-removal-client";
import { cyberAudio } from "@/lib/cyber-audio";
import { ProcessingStatusLabel } from "@/lib/types";

interface ColorStudioProps {
  transparentBlob: Blob;
  initialCompositeUrl: string;
  width: number;
  height: number;
  initialMode?: "question" | "solution";
  initialBgColor?: string;
  provider?: string;
  processingLabel?: ProcessingStatusLabel;
  onReset: () => void;
}

/**
 * Ultra-Clean Robotics Composite Deck:
 * Displays the baked composite image and allows instant 1-click toggling
 * between Question (#FFFFFF) and Solution (#FFF0F5) channels.
 */
export function ColorStudio({
  transparentBlob,
  initialCompositeUrl,
  width,
  height,
  initialMode = "question",
  initialBgColor = "#FFFFFF",
  provider = "@imgly/isnet_quint8 (Browser WebGPU/WASM)",
  processingLabel = "Browser AI result",
  onReset,
}: ColorStudioProps) {
  const [activeMode, setActiveMode] = useState<"question" | "solution">(initialMode);
  const [currentCompositeUrl, setCurrentCompositeUrl] = useState<string>(initialCompositeUrl);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    setCurrentCompositeUrl(initialCompositeUrl);
    setActiveMode(initialMode);
  }, [initialCompositeUrl, initialMode]);

  // Switch to Feature 1: Question (#FFFFFF)
  const handleSelectQuestionMode = async () => {
    if (activeMode === "question" || isSwitching) return;
    cyberAudio.playClick();
    setIsSwitching(true);
    setActiveMode("question");

    try {
      const { dataUrl } = await compositeWithSolidColor(transparentBlob, "#FFFFFF");
      setCurrentCompositeUrl(dataUrl);
    } catch (err) {
      console.error("Failed to re-composite with #FFFFFF:", err);
    } finally {
      setIsSwitching(false);
    }
  };

  // Switch to Feature 2: Solution (#FFF0F5)
  const handleSelectSolutionMode = async () => {
    if (activeMode === "solution" || isSwitching) return;
    cyberAudio.playClick();
    setIsSwitching(true);
    setActiveMode("solution");

    try {
      const { dataUrl } = await compositeWithSolidColor(transparentBlob, "#FFF0F5");
      setCurrentCompositeUrl(dataUrl);
    } catch (err) {
      console.error("Failed to re-composite with #FFF0F5:", err);
    } finally {
      setIsSwitching(false);
    }
  };

  // Direct 1-Click Download of the composite image
  const handleDownload = useCallback(() => {
    if (!currentCompositeUrl) return;
    cyberAudio.playClick();
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
    cyberAudio.playClick();
    const url = URL.createObjectURL(transparentBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PLP-Subject-Transparent-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const isQuestion = activeMode === "question";

  // Status badge styling
  const getBadgeStyle = (label: ProcessingStatusLabel) => {
    switch (label) {
      case "Browser AI result":
        return "border-emerald-500/40 bg-emerald-950/60 text-emerald-300 ring-1 ring-emerald-500/30";
      case "Local worker result":
        return "border-cyan-500/40 bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-500/30";
      case "Cloud API result":
        return "border-indigo-500/40 bg-indigo-950/60 text-indigo-300 ring-1 ring-indigo-500/30";
      default:
        return "border-slate-700 bg-slate-900 text-slate-300";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Result Transparency Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${getBadgeStyle(
              processingLabel
            )}`}
          >
            <CheckCircle2 className="h-3 w-3" />
            {processingLabel}
          </span>
          <span className="hidden sm:inline text-slate-400 text-[11px]">
            Model: {provider}
          </span>
        </div>
        <span className="text-[11px] text-slate-500">
          Zero re-run cost to toggle colors
        </span>
      </div>

      {/* ── Channel Switcher Tabs ── */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-cyan-500/20 bg-slate-950 p-1.5 font-mono">
        <button
          type="button"
          onClick={handleSelectQuestionMode}
          disabled={isSwitching}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all ${
            isQuestion
              ? "bg-slate-900 border border-cyan-400 text-white shadow-[0_0_15px_rgba(0,240,255,0.2)]"
              : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <span className="flex items-center gap-2 font-bold">
            <span className="h-2.5 w-2.5 rounded-full border border-slate-300 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
            <span>CH-01: សំណួរ</span>
          </span>
          <span className="text-[10px] text-cyan-300 font-semibold">#FFFFFF</span>
        </button>

        <button
          type="button"
          onClick={handleSelectSolutionMode}
          disabled={isSwitching}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all ${
            !isQuestion
              ? "bg-slate-900 border border-pink-400 text-white shadow-[0_0_15px_rgba(255,105,180,0.2)]"
              : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <span className="flex items-center gap-2 font-bold">
            <span
              className="h-2.5 w-2.5 rounded-full border border-pink-300 shadow-[0_0_8px_rgba(255,182,193,0.9)]"
              style={{ backgroundColor: "#FFF0F5" }}
            />
            <span>CH-02: ដំណោះស្រាយ</span>
          </span>
          <span className="text-[10px] text-pink-300 font-semibold">#FFF0F5</span>
        </button>
      </div>

      {/* ── Holographic Preview Deck with Chamfered Tech Corners ── */}
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-2xl border bg-slate-950 p-4 transition-all duration-300 ${
          isQuestion
            ? "border-cyan-500/40 shadow-[0_0_35px_rgba(0,240,255,0.12)]"
            : "border-pink-500/40 shadow-[0_0_35px_rgba(255,105,180,0.12)]"
        }`}
        style={{ minHeight: 300 }}
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

        {/* Live Baked Output Image */}
        <div className="relative z-10 flex items-center justify-center">
          <img
            src={currentCompositeUrl}
            alt="Composite Render"
            className="max-h-[440px] max-w-full object-contain rounded-xl shadow-2xl transition-all"
          />
        </div>
      </div>

      {/* ── Telemetry HUD & Execution Actions ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3 font-mono">
        <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isQuestion ? "bg-cyan-400" : "bg-pink-400"
              }`}
            />
            <span>
              STATUS: {isQuestion ? "CH-01 (WHITE #FFFFFF)" : "CH-02 (PINK #FFF0F5)"}
            </span>
          </span>
          <span>
            {width} × {height} PX
          </span>
        </div>

        {/* Heavy-Duty Download Action */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={isSwitching}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-xs font-black tracking-wider uppercase text-white shadow-lg transition-all duration-200 active:scale-[0.98] ${
            isQuestion
              ? "bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 shadow-cyan-900/40 hover:shadow-cyan-500/25 ring-1 ring-cyan-400/40"
              : "bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 shadow-pink-900/40 hover:shadow-pink-500/25 ring-1 ring-pink-400/40"
          }`}
        >
          <Download className="h-4 w-4" />
          <span>
            {isQuestion
              ? "DOWNLOAD // PNG WHITE (#FFFFFF)"
              : "DOWNLOAD // PNG PINK (#FFF0F5)"}
          </span>
        </button>

        {/* Secondary Sub-Controls */}
        <div className="flex items-center justify-between text-xs pt-1">
          <button
            type="button"
            onClick={handleDownloadTransparent}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <Layers className="h-3 w-3" />
            <span>TRANSPARENT PNG</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-slate-400 hover:text-rose-300 hover:border-rose-500/30 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>RESET HUD</span>
          </button>
        </div>
      </div>
    </div>
  );
}
