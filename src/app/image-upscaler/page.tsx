"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  AlertCircle,
  Download,
  ImageIcon,
  Wand2,
  Cpu,
  Server,
  XCircle,
  CheckCircle2,
  HelpCircle,
  Settings,
} from "lucide-react";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { BeforeAfterSlider } from "@/components/image-upscaler/BeforeAfterSlider";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import { enhanceImageBrowser } from "@/lib/browser-enhancer";
import { cyberAudio } from "@/lib/cyber-audio";
import { ProcessingStatusLabel } from "@/lib/types";
import { ObjectUrlRegistry } from "@/lib/processing-utils";
import type { UpscaleSuccess, UpscaleError } from "@/app/api/upscale/route";

const SCALE_OPTIONS = [
  { value: 2, label: "2× Upscale", desc: "Fast · recommended for quick bumps" },
  { value: 4, label: "4× Upscale", desc: "HD/4K quality · maximum resolution" },
];

export default function ImageUpscalerPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [engineMode, setEngineMode] = useState<"browser" | "ai">("browser");
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; suggestedAction?: string } | null>(null);
  const [result, setResult] = useState<{
    outputUrl: string;
    model: string;
    scale: number;
    label: ProcessingStatusLabel;
  } | null>(null);

  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const urlRegistryRef = useRef<ObjectUrlRegistry>(new ObjectUrlRegistry());

  useEffect(() => {
    const registry = urlRegistryRef.current;
    return () => {
      registry.revokeAll();
    };
  }, []);

  const handleFileSelect = (file: File | null) => {
    urlRegistryRef.current.revokeAll();
    setImageFile(file);
    setResult(null);
    setError(null);
    if (file) {
      const url = urlRegistryRef.current.create(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleCancel = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    cyberAudio.stopScanningHum();
    cyberAudio.playClick();
    setIsLoading(false);
    setError({ message: "Upscaling cancelled by user." });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    try {
      if (engineMode === "browser") {
        // Mode 1: Client-Side Algorithmic Enhancement
        const res = await enhanceImageBrowser(imageFile, scale);
        if (abortController.signal.aborted) return;

        setResult({
          outputUrl: res.outputUrl,
          model: res.model,
          scale: res.scale,
          label: res.label,
        });
        cyberAudio.playSuccessChime();
      } else {
        // Mode 2: Real-ESRGAN (Worker or Cloud or Demo)
        const formData = new FormData();
        formData.append("image", imageFile);
        formData.append("scale", scale.toString());
        if (isDemoMode) formData.append("isDemo", "true");

        const response = await fetch("/api/upscale", {
          method: "POST",
          body: formData,
          signal: abortController.signal,
        });

        const data: UpscaleSuccess | UpscaleError = await response.json();
        if (abortController.signal.aborted) return;

        if (!response.ok || "error" in data) {
          const errData = data as UpscaleError;
          setError({
            message: errData.error,
            suggestedAction: errData.suggestedAction,
          });
          cyberAudio.stopScanningHum();
          return;
        }

        const successData = data as UpscaleSuccess;
        setResult({
          outputUrl: successData.outputUrl,
          model: successData.model,
          scale: successData.scale,
          label: successData.label,
        });
        cyberAudio.playSuccessChime();
      }
    } catch (err: unknown) {
      cyberAudio.stopScanningHum();
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError({
        message: err instanceof Error ? err.message : "Upscaling failed.",
      });
    } finally {
      cyberAudio.stopScanningHum();
      activeAbortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    cyberAudio.playClick();
    try {
      const response = await fetch(result.outputUrl);
      const blob = await response.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `upscaled-${result.scale}x-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (err) {
      console.error("Download error:", err);
    }
  };

  const getBadgeStyle = (label: ProcessingStatusLabel) => {
    switch (label) {
      case "Enhanced resize — not AI super-resolution":
        return "border-amber-500/40 bg-amber-950/60 text-amber-300 ring-1 ring-amber-500/30";
      case "Browser AI result":
        return "border-emerald-500/40 bg-emerald-950/60 text-emerald-300 ring-1 ring-emerald-500/30";
      case "Local worker result":
        return "border-cyan-500/40 bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-500/30";
      case "Cloud API result":
        return "border-indigo-500/40 bg-indigo-950/60 text-indigo-300 ring-1 ring-indigo-500/30";
      case "Demo preview":
        return "border-purple-500/40 bg-purple-950/60 text-purple-300 ring-1 ring-purple-500/30";
      default:
        return "border-slate-700 bg-slate-900 text-slate-300";
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/"
        onClick={() => cyberAudio.playClick()}
        className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> SYS://RETURN_DASHBOARD
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/60 p-6 sm:p-8 shadow-[0_0_35px_rgba(245,158,11,0.1)]">
        <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-25" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between relative z-10">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-400">
              <span className="rounded bg-amber-950/80 px-2 py-0.5 border border-amber-500/40">
                MODULE 03
              </span>
              <span>·</span>
              <span>Resolution Enhancement &amp; Real-ESRGAN</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              ធ្វើរូបឱ្យច្បាស់ // RESOLUTION MATRIX
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              បង្កើនកម្រិតភាពច្បាស់នៃរូបភាពតាមរយៈ{" "}
              <span className="font-semibold text-amber-400">
                Browser High-Pass Unsharp Enhancer (Zero Cost)
              </span>{" "}
              ឬ{" "}
              <span className="font-semibold text-orange-400">
                Real-ESRGAN Neural Super-Resolution
              </span>{" "}
              និងផ្ទៀងផ្ទាត់ដោយផ្ទាល់ជាមួយ Before/After Comparison Slider។
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
            <Sparkles className="h-7 w-7" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 relative z-10 font-mono">
          {[
            {
              label: "Browser 2× Enhancer",
              desc: "Zero-cost client-side unsharp masking",
            },
            {
              label: "Real-ESRGAN (AI)",
              desc: "Neural super-resolution via local worker or cloud",
            },
            {
              label: "Before/After Slider",
              desc: "Interactive split-screen comparison",
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-amber-500/20 bg-slate-950/70 p-3 text-xs shadow-[0_0_10px_rgba(0,0,0,0.5)]"
            >
              <span className="font-bold text-amber-300">{c.label}</span>
              <p className="mt-0.5 text-slate-400 font-sans">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Controls */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-400">
                  1
                </span>
                Enhancement Configuration
              </span>
              <span className="font-mono text-[10px] text-amber-400">
                CONTROL_HUD
              </span>
            </h3>

            {/* Engine Selection */}
            <div className="space-y-1.5 font-mono">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                SELECT PROCESSING ENGINE
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (isLoading) return;
                    cyberAudio.playClick();
                    setEngineMode("browser");
                  }}
                  disabled={isLoading}
                  className={`flex flex-col gap-1 rounded-xl border p-2.5 text-left transition-all ${
                    engineMode === "browser"
                      ? "border-amber-500 bg-amber-950/40 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                      : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold text-white text-[11px]">
                    <Cpu className="h-3.5 w-3.5 text-amber-400" />
                    Browser 2× Enhancer
                  </span>
                  <span className="text-[10px] text-amber-400/80">
                    Zero Cost · Client-Side
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isLoading) return;
                    cyberAudio.playClick();
                    setEngineMode("ai");
                  }}
                  disabled={isLoading}
                  className={`flex flex-col gap-1 rounded-xl border p-2.5 text-left transition-all ${
                    engineMode === "ai"
                      ? "border-orange-500 bg-orange-950/40 text-orange-200 shadow-[0_0_15px_rgba(249,115,22,0.2)]"
                      : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold text-white text-[11px]">
                    <Server className="h-3.5 w-3.5 text-orange-400" />
                    Real-ESRGAN (AI)
                  </span>
                  <span className="text-[10px] text-orange-400/80">
                    Worker / Cloud GPU
                  </span>
                </button>
              </div>
            </div>

            {/* Upload Zone */}
            <BgUploadZone
              onFileSelect={handleFileSelect}
              selectedFile={imageFile}
              disabled={isLoading}
              label="Source Input"
              hint="PNG, JPG, WEBP · max 15 MB"
            />

            {/* Scale Selector */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Enhancement Factor
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      cyberAudio.playClick();
                      setScale(opt.value);
                    }}
                    disabled={isLoading}
                    className={`rounded-xl border p-3 text-left text-xs transition-all ${
                      scale === opt.value
                        ? "border-amber-500/60 bg-amber-500/10 text-white ring-1 ring-amber-500/40"
                        : "border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className="text-slate-500 text-[11px]">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Engine Description Note */}
            {engineMode === "browser" ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/80">
                <p className="font-medium text-amber-300 mb-1 flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
                  Browser High-Pass Processing
                </p>
                Runs 100% in your browser using bicubic resampling and high-pass
                unsharp masking. Results will be explicitly tagged as{" "}
                <span className="font-mono text-amber-300 font-semibold">
                  &quot;Enhanced resize — not AI super-resolution&quot;
                </span>
                .
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 text-xs text-orange-200/80">
                  <p className="font-medium text-orange-300 mb-1 flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 text-orange-400" />
                    Deep Learning Super-Resolution
                  </p>
                  Requires a connected Local Worker (e.g. ComfyUI / Real-ESRGAN API) or
                  Replicate API token in Settings.
                </div>

                {/* Explicit Demo Mode Checkbox */}
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1 font-mono">
                  <input
                    type="checkbox"
                    checked={isDemoMode}
                    onChange={(e) => setIsDemoMode(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/50"
                  />
                  <span>Enable Demo Preview Mode (Simulate UI flow)</span>
                </label>
              </div>
            )}

            {/* Submit & Cancel Buttons */}
            <div className="space-y-2">
              <button
                type="submit"
                disabled={!imageFile || isLoading}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-900/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Enhancing…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> Enhance Image ({scale}×)
                  </>
                )}
              </button>

              {isLoading && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 py-2 text-xs font-mono text-rose-300 hover:bg-rose-900/50 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel Processing
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Right: Output */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* Error Message with Suggested Action */}
          {error && (
            <div className="flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300 font-mono">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                <div>
                  <p className="font-semibold text-rose-200">Execution Error</p>
                  <p className="mt-1 text-xs opacity-90 leading-relaxed">
                    {error.message}
                  </p>
                </div>
              </div>

              {error.suggestedAction === "SWITCH_TO_BROWSER" && (
                <div className="flex items-center gap-2 pt-2 border-t border-rose-500/20">
                  <button
                    type="button"
                    onClick={() => {
                      setEngineMode("browser");
                      setError(null);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/60 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/60 transition-colors"
                  >
                    <Cpu className="h-3.5 w-3.5 text-amber-400" />
                    Switch to Browser 2× Enhancer (Free)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* High-Tech Robotic Scanner */}
          {isLoading && (
            <RoboticScanner
              active={true}
              moduleName={
                engineMode === "browser"
                  ? "BROWSER ENHANCER // [HIGH-PASS FILTER]"
                  : "REAL-ESRGAN // [NEURAL SUPER-RESOLUTION]"
              }
              steps={[
                engineMode === "browser"
                  ? "INITIALIZING OFFSCREEN CANVAS BUFFERS..."
                  : "DISPATCHING INFERENCE TO NEURAL WORKER...",
                engineMode === "browser"
                  ? "EXECUTING MULTI-PASS BICUBIC RESAMPLING..."
                  : "LOADING REAL-ESRGAN 4X WEIGHT TENSORS...",
                engineMode === "browser"
                  ? "APPLYING HIGH-PASS UNSHARP EDGE FILTER..."
                  : "SUPER-RESOLUTION SUB-PIXEL SAMPLING PASS...",
                "SYNTHESIZING FINAL HIGH-RESOLUTION OUTPUT...",
              ]}
              subtext={
                engineMode === "browser"
                  ? "Client-side algorithmic unsharp filter enhancing image edges without deep learning"
                  : "Real-ESRGAN neural model reconstructing high-frequency details"
              }
            />
          )}

          {/* Result Output with Transparency Badge & Slider */}
          {result && previewUrl && !isLoading && (
            <div className="space-y-4">
              {/* Transparency Status Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${getBadgeStyle(
                      result.label
                    )}`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {result.label}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    {result.model}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md hover:brightness-110 transition-all"
                >
                  <Download className="h-3.5 w-3.5" /> Download {result.scale}× PNG
                </button>
              </div>

              {/* Before / After Comparison Slider */}
              <BeforeAfterSlider
                beforeSrc={previewUrl}
                afterSrc={result.outputUrl}
                beforeLabel="Original"
                afterLabel={`${result.scale}× Enhanced`}
              />
            </div>
          )}

          {!result && !isLoading && !error && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                <ImageIcon className="h-7 w-7 text-amber-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white font-mono">
                BEFORE / AFTER COMPARISON STANDBY
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-400">
                Upload an image and select{" "}
                <span className="font-semibold text-amber-400">
                  &quot;Browser 2× Enhancer&quot;
                </span>{" "}
                for instant zero-cost results, or Real-ESRGAN for neural super-resolution.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
