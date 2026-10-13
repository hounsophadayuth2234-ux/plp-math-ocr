"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Eraser,
  Send,
  Loader2,
  AlertCircle,
  ImageOff,
  CheckCircle2,
  Download,
} from "lucide-react";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { ColorStudio } from "@/components/bg-remover/ColorStudio";
import type { BgRemoveSuccess, BgRemoveError } from "@/app/api/bg-remove/route";

// -----------------------------------------------------------
// Processing steps shown during the async operation
// -----------------------------------------------------------
const STEPS = [
  "Uploading image to API gateway…",
  "AI model segmenting subject from background…",
  "Extracting alpha transparency mask…",
  "Returning high-quality transparent PNG…",
];

export default function BgRemoverPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BgRemoveSuccess | null>(null);

  // Progress step animation
  const startStepAnimation = () => {
    setLoadingStep(0);
    const interval = setInterval(() => {
      setLoadingStep((prev) => {
        if (prev >= STEPS.length - 1) { clearInterval(interval); return prev; }
        return prev + 1;
      });
    }, 1800);
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

      const response = await fetch("/api/bg-remove", {
        method: "POST",
        body: formData,
      });

      const data: BgRemoveSuccess | BgRemoveError = await response.json();
      clearInterval(interval);

      if (!response.ok || "error" in data) {
        const errData = data as BgRemoveError;
        setError(errData.error ?? "Background removal failed.");
        return;
      }

      setResult(data as BgRemoveSuccess);
    } catch (err) {
      clearInterval(interval);
      setError(
        err instanceof Error ? err.message : "A network error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setImageFile(null);
  };

  // Transparent PNG download (no background)
  const handleDownloadTransparent = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${result.imageBase64}`;
    a.download = `transparent-bg-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Dashboard Overview
      </Link>

      {/* Module Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400">
              <span>Module 02</span>
              <span>·</span>
              <span>Remove.bg API / Hugging Face RMBG-1.4 (Free Fallback)</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              AI Background Removal & Replacement
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Upload any image to instantly isolate the subject into a{" "}
              <span className="font-semibold text-emerald-400">transparent PNG</span>. Then
              use the{" "}
              <span className="font-semibold text-teal-400">
                Color Studio (HTML5 Canvas)
              </span>{" "}
              to apply any solid background color and download the final composite.
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
            <Eraser className="h-7 w-7" />
          </div>
        </div>

        {/* Capabilities */}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { label: "Auto Segmentation", desc: "AI isolates foreground subject" },
            { label: "Transparent PNG", desc: "Lossless alpha channel output" },
            { label: "Canvas Color Studio", desc: "Real-time background replacement" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs">
              <span className="font-semibold text-emerald-300">{c.label}</span>
              <p className="mt-0.5 text-slate-400">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── LEFT: Upload + Process Panel ── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-5"
          >
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400">
                1
              </span>
              Upload Your Image
            </h3>

            <BgUploadZone
              onFileSelect={setImageFile}
              selectedFile={imageFile}
              disabled={isLoading || !!result}
            />

            {/* Provider info */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 text-xs space-y-1.5 text-slate-400">
              <p className="font-medium text-slate-300">Processing Pipeline</p>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>
                  <strong className="text-slate-200">Primary:</strong> Remove.bg API
                  (50 free calls/month — set{" "}
                  <code className="text-amber-300">REMOVE_BG_API_KEY</code> in{" "}
                  <code>.env.local</code>)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                <span>
                  <strong className="text-slate-200">Fallback:</strong> Hugging Face
                  RMBG-1.4 (free, open-source, no key required)
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={!imageFile || isLoading || !!result}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none transition-all"
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Removing Background…</>
              ) : result ? (
                <><CheckCircle2 className="h-4 w-4 text-white" /> Background Removed</>
              ) : (
                <><Send className="h-4 w-4" /> Remove Background</>
              )}
            </button>
          </form>

          {/* Transparent PNG quick download (after success) */}
          {result && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400">
                  2
                </span>
                Transparent PNG Output
              </h3>
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
                <div className="text-xs text-slate-300 space-y-0.5">
                  <p className="font-medium text-white">Background removed ✓</p>
                  <p className="text-slate-400">
                    {result.originalWidth} × {result.originalHeight} px ·{" "}
                    <span className="text-emerald-400">
                      via {result.provider === "removebg" ? "Remove.bg" : "HF RMBG-1.4"}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTransparent}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Transparent PNG
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Output Panel ── */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">Error removing background</p>
                <p className="mt-0.5 text-xs opacity-80">{error}</p>
              </div>
            </div>
          )}

          {/* Loading progress steps */}
          {isLoading && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-white">Processing your image…</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    AI is segmenting the subject and generating an alpha mask
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {STEPS.map((step, i) => (
                  <div
                    key={step}
                    className={`flex items-center gap-2.5 text-xs transition-all ${
                      i <= loadingStep ? "text-slate-200" : "text-slate-600"
                    }`}
                  >
                    {i < loadingStep ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : i === loadingStep ? (
                      <Loader2 className="h-4 w-4 shrink-0 text-emerald-400 animate-spin" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-slate-700" />
                    )}
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Color Studio (result state) */}
          {result && !isLoading && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 px-1">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/20 text-[11px] font-bold text-teal-400">
                  3
                </span>
                Color Studio — Apply New Background
              </h3>
              <ColorStudio
                transparentPngBase64={result.imageBase64}
                width={result.originalWidth || 600}
                height={result.originalHeight || 400}
                onReset={handleReset}
              />
            </div>
          )}

          {/* Empty state */}
          {!result && !isLoading && !error && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                <ImageOff className="h-7 w-7 text-emerald-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">
                Color Studio will appear here
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-400">
                Upload an image and click{" "}
                <span className="font-semibold text-emerald-400">
                  "Remove Background"
                </span>{" "}
                to isolate the subject. Then pick any color to apply as the new backdrop.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {["#ffffff", "#000000", "#0ea5e9", "#10b981", "#f43f5e", "#7c3aed", "#f59e0b"].map(
                  (c) => (
                    <span
                      key={c}
                      className="h-6 w-6 rounded-lg border border-slate-700"
                      style={{ backgroundColor: c }}
                    />
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
