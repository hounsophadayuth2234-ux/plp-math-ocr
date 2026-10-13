"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Sparkles, Send, Loader2, AlertCircle, Download,
  CheckCircle2, ImageIcon, Wand2,
} from "lucide-react";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { BeforeAfterSlider } from "@/components/image-upscaler/BeforeAfterSlider";
import type { UpscaleSuccess, UpscaleError } from "@/app/api/upscale/route";

const SCALE_OPTIONS = [
  { value: 2, label: "2× Upscale", desc: "Fast · good for small bumps" },
  { value: 4, label: "4× Upscale", desc: "HD/4K quality · recommended" },
];

const STEPS = [
  "Uploading image to Replicate…",
  "Real-ESRGAN model loading & warming up…",
  "Super-resolution inference running (4× pass)…",
  "Generating high-resolution output image…",
];

export default function ImageUpscalerPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(4);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UpscaleSuccess | null>(null);

  const handleFileSelect = (file: File | null) => {
    setImageFile(file);
    setResult(null);
    setError(null);
    if (file) setPreviewUrl(URL.createObjectURL(file));
    else setPreviewUrl(null);
  };

  const startStepAnimation = () => {
    setLoadingStep(0);
    const interval = setInterval(() => {
      setLoadingStep((p) => {
        if (p >= STEPS.length - 1) { clearInterval(interval); return p; }
        return p + 1;
      });
    }, 5000); // Real-ESRGAN can take 20-30s
    return interval;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    const interval = startStepAnimation();

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("scale", scale.toString());

      const response = await fetch("/api/upscale", { method: "POST", body: formData });
      const data: UpscaleSuccess | UpscaleError = await response.json();
      clearInterval(interval);

      if (!response.ok || "error" in data) {
        setError((data as UpscaleError).error);
        return;
      }
      setResult(data as UpscaleSuccess);
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    const response = await fetch(result.outputUrl);
    const blob = await response.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `upscaled-${scale}x-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard Overview
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400">
              <span>Module 03</span><span>·</span>
              <span>Replicate Real-ESRGAN 4× Super-Resolution</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Image Upscaling & Enhancement
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Upload a low-resolution or blurry image and enhance it to{" "}
              <span className="font-semibold text-amber-400">HD/4K quality</span> using
              Real-ESRGAN. Inspect results with the interactive{" "}
              <span className="font-semibold text-orange-400">Before/After slider</span>.
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
            <Sparkles className="h-7 w-7" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { label: "Real-ESRGAN 4×", desc: "State-of-the-art super-resolution model" },
            { label: "Before/After Slider", desc: "Drag to compare original vs enhanced" },
            { label: "HD Download", desc: "Full-resolution PNG export" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs">
              <span className="font-semibold text-amber-300">{c.label}</span>
              <p className="mt-0.5 text-slate-400">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Controls */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-400">1</span>
              Upload Image
            </h3>
            <BgUploadZone
              onFileSelect={handleFileSelect}
              selectedFile={imageFile}
              disabled={isLoading}
              label="Upload Low-Res Image"
              hint="PNG, JPG, WEBP · max 10 MB"
            />

            {/* Scale selector */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Upscale Factor
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScale(opt.value)}
                    className={`rounded-xl border p-3 text-left text-xs transition-all ${
                      scale === opt.value
                        ? "border-amber-500/60 bg-amber-500/10 text-white ring-1 ring-amber-500/40"
                        : "border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className="text-slate-500">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/80">
              <p className="font-medium text-amber-300 mb-1">⏱ Processing time</p>
              Real-ESRGAN on Replicate typically takes 20–60 seconds depending on image
              size and model cold-start. Please be patient.
            </div>

            <button
              type="submit"
              disabled={!imageFile || isLoading}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-900/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Upscaling…</>
              ) : (
                <><Wand2 className="h-4 w-4" /> Enhance to {scale}× HD</>
              )}
            </button>
          </div>
        </form>

        {/* Right: Output */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">Upscaling failed</p>
                <p className="mt-0.5 text-xs opacity-80">{error}</p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-white">Real-ESRGAN is processing…</p>
                  <p className="mt-0.5 text-xs text-slate-400">This may take 20–60 seconds</p>
                </div>
              </div>
              <div className="space-y-2">
                {STEPS.map((step, i) => (
                  <div key={step} className={`flex items-center gap-2.5 text-xs transition-all ${i <= loadingStep ? "text-slate-200" : "text-slate-600"}`}>
                    {i < loadingStep ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
                    ) : i === loadingStep ? (
                      <Loader2 className="h-4 w-4 shrink-0 text-amber-400 animate-spin" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-slate-700" />
                    )}
                    {step}
                  </div>
                ))}
              </div>
              {/* Pulsing progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="h-full animate-pulse rounded-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${((loadingStep + 1) / STEPS.length) * 100}%`, transition: "width 0.5s ease" }} />
              </div>
            </div>
          )}

          {result && previewUrl && !isLoading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Result — {result.model}</p>
                  <p className="text-xs text-slate-400">Drag the handle to compare</p>
                </div>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:brightness-110 transition-all"
                >
                  <Download className="h-3.5 w-3.5" /> Download {scale}× PNG
                </button>
              </div>
              <BeforeAfterSlider
                beforeSrc={previewUrl}
                afterSrc={result.outputUrl}
                beforeLabel="Original"
                afterLabel={`${scale}× Upscaled`}
              />
            </div>
          )}

          {!result && !isLoading && !error && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                <ImageIcon className="h-7 w-7 text-amber-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">Before/After slider will appear here</h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-400">
                Upload an image, select upscale factor, and click{" "}
                <span className="font-semibold text-amber-400">"Enhance to HD"</span>{" "}
                to compare results side by side.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
