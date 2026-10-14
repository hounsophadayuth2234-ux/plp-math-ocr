"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  Download,
  RefreshCw,
  Layers,
  CheckCircle2,
  Eye,
  SlidersHorizontal,
  Sparkles,
  Grid,
} from "lucide-react";
import { compositeWithSolidColor } from "@/lib/bg-removal-client";
import { cyberAudio } from "@/lib/cyber-audio";
import { ProcessingStatusLabel } from "@/lib/types";
import { BeforeAfterSlider } from "@/components/image-upscaler/BeforeAfterSlider";

export type ViewChannel =
  | "white"
  | "pink"
  | "transparent"
  | "mask"
  | "original"
  | "split";

interface ColorStudioProps {
  originalUrl: string;
  transparentBlob: Blob;
  transparentUrl: string;
  alphaMaskUrl?: string;
  initialCompositeUrl: string;
  width: number;
  height: number;
  mode: "preview" | "final";
  provider?: string;
  processingLabel?: ProcessingStatusLabel;
  onReset: () => void;
  onRerunFinal?: () => void;
}

export function ColorStudio({
  originalUrl,
  transparentBlob,
  transparentUrl,
  alphaMaskUrl,
  initialCompositeUrl,
  width,
  height,
  mode,
  provider = "@imgly/isnet",
  processingLabel = "Browser AI result",
  onReset,
  onRerunFinal,
}: ColorStudioProps) {
  const [activeChannel, setActiveChannel] = useState<ViewChannel>("white");
  const [whiteCompositeUrl, setWhiteCompositeUrl] = useState<string>(initialCompositeUrl);
  const [pinkCompositeUrl, setPinkCompositeUrl] = useState<string>("");
  const [isCompositing, setIsCompositing] = useState(false);

  // Pre-generate pink composite lazily or on mount
  useEffect(() => {
    let cancelled = false;
    compositeWithSolidColor(transparentBlob, "#FFF0F5").then(({ dataUrl }) => {
      if (!cancelled) setPinkCompositeUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [transparentBlob]);

  // Current active display URL
  const activeDisplayUrl = useMemo(() => {
    switch (activeChannel) {
      case "white":
        return whiteCompositeUrl || initialCompositeUrl;
      case "pink":
        return pinkCompositeUrl || initialCompositeUrl;
      case "transparent":
        return transparentUrl;
      case "mask":
        return alphaMaskUrl || transparentUrl;
      case "original":
        return originalUrl;
      default:
        return whiteCompositeUrl || initialCompositeUrl;
    }
  }, [
    activeChannel,
    whiteCompositeUrl,
    pinkCompositeUrl,
    initialCompositeUrl,
    transparentUrl,
    alphaMaskUrl,
    originalUrl,
  ]);

  // Instant Channel Selection (< 5ms, zero re-segmentation!)
  const handleSelectChannel = (channel: ViewChannel) => {
    cyberAudio.playClick();
    setActiveChannel(channel);
  };

  // Direct 1-Click Download of the active view
  const handleDownload = useCallback(() => {
    cyberAudio.playClick();
    const a = document.createElement("a");
    const timestamp = Date.now();

    if (activeChannel === "transparent") {
      a.href = transparentUrl;
      a.download = `PLP-Cutout-Transparent-${mode}-${timestamp}.png`;
    } else if (activeChannel === "pink") {
      a.href = pinkCompositeUrl || activeDisplayUrl;
      a.download = `PLP-Solution-Pink-FFF0F5-${mode}-${timestamp}.png`;
    } else if (activeChannel === "mask") {
      a.href = alphaMaskUrl || transparentUrl;
      a.download = `PLP-AlphaMask-Debug-${mode}-${timestamp}.png`;
    } else {
      a.href = whiteCompositeUrl || activeDisplayUrl;
      a.download = `PLP-Question-White-FFFFFF-${mode}-${timestamp}.png`;
    }
    a.click();
  }, [
    activeChannel,
    transparentUrl,
    pinkCompositeUrl,
    whiteCompositeUrl,
    activeDisplayUrl,
    alphaMaskUrl,
    mode,
  ]);

  // High-Res HD Transparent Export
  const handleDownloadTransparent = () => {
    cyberAudio.playClick();
    const a = document.createElement("a");
    a.href = transparentUrl;
    a.download = `PLP-Cutout-Transparent-HD-${Date.now()}.png`;
    a.click();
  };

  const getBadgeStyle = (label: ProcessingStatusLabel) => {
    if (mode === "final") {
      return "border-emerald-400 bg-emerald-950/70 text-emerald-300 ring-1 ring-emerald-400/40";
    }
    return "border-cyan-500/40 bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-500/30";
  };

  return (
    <div className="flex flex-col gap-4 font-mono">
      {/* ── Status & Provenance Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${getBadgeStyle(
              processingLabel
            )}`}
          >
            <CheckCircle2 className="h-3 w-3" />
            {mode === "final" ? "Final Clean Cut (2048px)" : "Fast Preview (768px)"}
          </span>
          <span className="hidden sm:inline text-slate-400 text-[11px]">
            Model: {provider}
          </span>
        </div>

        {mode === "preview" && onRerunFinal && (
          <button
            type="button"
            onClick={() => {
              cyberAudio.playClick();
              onRerunFinal();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-900/60 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.2)]"
          >
            <Sparkles className="h-3 w-3 text-emerald-400" />
            <span>RENDER FINAL CLEAN CUT (2048PX)</span>
          </button>
        )}
      </div>

      {/* ── Channel & Quality View Controls (Instant Switching) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 rounded-xl border border-cyan-500/20 bg-slate-950 p-1.5 text-xs">
        {/* 1. White Background */}
        <button
          type="button"
          onClick={() => handleSelectChannel("white")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 transition-all ${
            activeChannel === "white"
              ? "bg-slate-900 border border-cyan-400 text-white shadow-[0_0_12px_rgba(0,240,255,0.25)] font-bold"
              : "text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <span className="h-2 w-2 rounded-full border border-slate-300 bg-white" />
          <span>WHITE</span>
        </button>

        {/* 2. Pink Background */}
        <button
          type="button"
          onClick={() => handleSelectChannel("pink")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 transition-all ${
            activeChannel === "pink"
              ? "bg-slate-900 border border-pink-400 text-white shadow-[0_0_12px_rgba(255,105,180,0.25)] font-bold"
              : "text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <span
            className="h-2 w-2 rounded-full border border-pink-300"
            style={{ backgroundColor: "#FFF0F5" }}
          />
          <span>PINK</span>
        </button>

        {/* 3. Transparent Checkerboard */}
        <button
          type="button"
          onClick={() => handleSelectChannel("transparent")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 transition-all ${
            activeChannel === "transparent"
              ? "bg-slate-900 border border-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.25)] font-bold"
              : "text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <Grid className="h-3 w-3 text-indigo-400" />
          <span>TRANSPARENT</span>
        </button>

        {/* 4. Alpha Mask Debug View */}
        <button
          type="button"
          onClick={() => handleSelectChannel("mask")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 transition-all ${
            activeChannel === "mask"
              ? "bg-slate-900 border border-amber-400 text-white shadow-[0_0_12px_rgba(245,158,11,0.25)] font-bold"
              : "text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
          title="Inspect edge alpha & halo boundary"
        >
          <Eye className="h-3 w-3 text-amber-400" />
          <span>MASK DEBUG</span>
        </button>

        {/* 5. Original Photo */}
        <button
          type="button"
          onClick={() => handleSelectChannel("original")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 transition-all ${
            activeChannel === "original"
              ? "bg-slate-900 border border-slate-400 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)] font-bold"
              : "text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <span>ORIGINAL</span>
        </button>

        {/* 6. Split Comparison Slider */}
        <button
          type="button"
          onClick={() => handleSelectChannel("split")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 transition-all ${
            activeChannel === "split"
              ? "bg-slate-900 border border-cyan-400 text-white shadow-[0_0_12px_rgba(0,240,255,0.25)] font-bold"
              : "text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <SlidersHorizontal className="h-3 w-3 text-cyan-400" />
          <span>SPLIT SLIDER</span>
        </button>
      </div>

      {/* ── Holographic Preview Deck with Transparent Checkerboard ── */}
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-2xl border p-4 transition-all duration-300 ${
          activeChannel === "pink"
            ? "border-pink-500/40 shadow-[0_0_35px_rgba(255,105,180,0.12)] bg-slate-950"
            : activeChannel === "transparent"
            ? "border-indigo-500/40 shadow-[0_0_35px_rgba(99,102,241,0.12)] bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] bg-slate-950"
            : activeChannel === "mask"
            ? "border-amber-500/40 shadow-[0_0_35px_rgba(245,158,11,0.12)] bg-black"
            : "border-cyan-500/40 shadow-[0_0_35px_rgba(0,240,255,0.12)] bg-slate-950"
        }`}
        style={{ minHeight: 380 }}
      >
        {/* Reticles */}
        <div className="absolute top-2 left-2 h-3 w-3 border-t-2 border-l-2 border-cyan-400" />
        <div className="absolute top-2 right-2 h-3 w-3 border-t-2 border-r-2 border-cyan-400" />
        <div className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 border-cyan-400" />
        <div className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 border-cyan-400" />

        {/* View Mode: Split Comparison Slider vs Single Image */}
        {activeChannel === "split" ? (
          <div className="w-full max-w-2xl">
            <BeforeAfterSlider
              beforeSrc={originalUrl}
              afterSrc={whiteCompositeUrl || transparentUrl}
              beforeLabel="Original Image"
              afterLabel="Clean Cutout"
            />
          </div>
        ) : (
          <div className="relative z-10 flex items-center justify-center">
            {/* If transparent mode, add subtle checkerboard underneath */}
            {activeChannel === "transparent" && (
              <div
                className="absolute inset-0 rounded-xl opacity-40 pointer-events-none"
                style={{
                  backgroundImage: `linear-gradient(45deg, #334155 25%, transparent 25%), 
                                    linear-gradient(-45deg, #334155 25%, transparent 25%), 
                                    linear-gradient(45deg, transparent 75%, #334155 75%), 
                                    linear-gradient(-45deg, transparent 75%, #334155 75%)`,
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                }}
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeDisplayUrl}
              alt="Composite Render"
              className="max-h-[460px] max-w-full object-contain rounded-xl shadow-2xl transition-all"
            />
          </div>
        )}
      </div>

      {/* ── Telemetry HUD & Download Actions ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activeChannel === "pink"
                  ? "bg-pink-400"
                  : activeChannel === "mask"
                  ? "bg-amber-400"
                  : "bg-cyan-400"
              }`}
            />
            <span className="uppercase">
              VIEW: {activeChannel} (
              {activeChannel === "white"
                ? "#FFFFFF"
                : activeChannel === "pink"
                ? "#FFF0F5"
                : activeChannel === "mask"
                ? "ALPHA CHANNEL"
                : "COMPOSITE"}
              )
            </span>
          </span>
          <span>
            {width} × {height} PX · {mode === "final" ? "HD BUFFER" : "PREVIEW BUFFER"}
          </span>
        </div>

        {/* Primary Download Button for Current View */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={isCompositing}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-xs font-black tracking-wider uppercase text-white shadow-lg transition-all duration-200 active:scale-[0.98] ${
            activeChannel === "pink"
              ? "bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 shadow-pink-900/40 hover:shadow-pink-500/25 ring-1 ring-pink-400/40"
              : activeChannel === "transparent"
              ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 shadow-indigo-900/40 hover:shadow-indigo-500/25 ring-1 ring-indigo-400/40"
              : "bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 shadow-cyan-900/40 hover:shadow-cyan-500/25 ring-1 ring-cyan-400/40"
          }`}
        >
          <Download className="h-4 w-4" />
          <span>
            {activeChannel === "transparent"
              ? "DOWNLOAD // TRANSPARENT PNG (ALPHA CHANNEL)"
              : activeChannel === "pink"
              ? "DOWNLOAD // SOLID PINK (#FFF0F5)"
              : activeChannel === "mask"
              ? "DOWNLOAD // ALPHA MASK (DEBUG)"
              : "DOWNLOAD // SOLID WHITE (#FFFFFF)"}
          </span>
        </button>

        {/* Secondary Download Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
          <button
            type="button"
            onClick={handleDownloadTransparent}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <Layers className="h-3 w-3" />
            <span>EXPORT HD TRANSPARENT PNG</span>
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
