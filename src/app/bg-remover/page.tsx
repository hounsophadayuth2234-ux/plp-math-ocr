"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Eraser,
  Loader2,
  AlertCircle,
  ImageOff,
  CheckCircle2,
  FileQuestion,
  Lightbulb,
  ArrowRight,
  Sparkles,
  Zap,
} from "lucide-react";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { ColorStudio } from "@/components/bg-remover/ColorStudio";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import type { BgRemoveSuccess, BgRemoveError } from "@/app/api/bg-remove/route";

export default function BgRemoverPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [activeFeature, setActiveFeature] = useState<"question" | "solution">("question");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BgRemoveSuccess | null>(null);

  // Dynamic status steps for high-tech telemetry
  const steps =
    activeFeature === "question"
      ? [
          "UPLOADING IMAGE TO SEGMENTATION GATEWAY...",
          "NEURAL NETWORK SEGMENTING FOREGROUND SUBJECT...",
          "EXTRACTING LOSSLESS ALPHA TRANSPARENCY MASK...",
          "AUTO-APPLYING SOLID WHITE (#FFFFFF) BACKGROUND FOR QUESTION...",
          "GENERATING HIGH-PRECISION QUESTION COMPOSITE...",
        ]
      : [
          "UPLOADING IMAGE TO SEGMENTATION GATEWAY...",
          "NEURAL NETWORK SEGMENTING FOREGROUND SUBJECT...",
          "EXTRACTING LOSSLESS ALPHA TRANSPARENCY MASK...",
          "AUTO-APPLYING SOLID PALE PINK (#FFF0F5) BACKGROUND FOR SOLUTION...",
          "GENERATING HIGH-PRECISION SOLUTION COMPOSITE...",
        ];

  // Progress animation
  const startStepAnimation = () => {
    setLoadingStep(0);
    const interval = setInterval(() => {
      setLoadingStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return interval;
  };

  // Trigger processing for specific feature mode
  const handleExecuteFeature = async (mode: "question" | "solution") => {
    if (!imageFile || isLoading) return;

    setActiveFeature(mode);
    setIsLoading(true);
    setError(null);
    setResult(null);

    const interval = startStepAnimation();
    const targetBgColor = mode === "solution" ? "#FFF0F5" : "#FFFFFF";

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("mode", mode);
      formData.append("bgColor", targetBgColor);

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

  const isQuestion = activeFeature === "question";

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        &lt;&lt; ត្រឡប់ទៅ ផ្ទាំងគ្រប់គ្រង
      </Link>

      {/* Module Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950/60 p-6 sm:p-8 shadow-[0_0_35px_rgba(16,185,129,0.12)]">
        <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-30" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between relative z-10">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-400">
              <span className="rounded bg-emerald-950/80 px-2 py-0.5 border border-emerald-500/40">
                MODULE 02
              </span>
              <span>·</span>
              <span>PLP SPECIALIZED CROP & AUTO BACKGROUND PIPELINE</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              កាត់រូបភាព៖ កាត់រូបដាក់សំណួរ &amp; កាត់រូបដាក់ដំណោះស្រាយ
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              ប្រព័ន្ធ AI កាត់ផ្ដាច់ផ្ទៃខាងក្រោយ និងជំនួសពណ៌ស្វ័យប្រវត្តិតាមមុខងារពិសេសទាំងពីរ៖{" "}
              <span className="font-semibold text-white">
                "កាត់រូបដាក់សំណួរ" (ផ្ទៃពណ៌ស #FFFFFF)
              </span>{" "}
              និង{" "}
              <span className="font-semibold text-pink-300">
                "កាត់រូបដាក់ដំណោះស្រាយ" (ផ្ទៃផ្កាឈូក #FFF0F5)
              </span>{" "}
              សម្រាប់រៀបចំឯកសារគណិតវិទ្យា PLP បានលឿន និងស្អាតឥតខ្ចោះ។
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-600 text-white shadow-lg shadow-emerald-500/25 ring-1 ring-cyan-400/30">
            <Eraser className="h-7 w-7" />
          </div>
        </div>

        {/* Feature Cards Showcase */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Feature 1 Card */}
          <div className="group rounded-xl border border-cyan-500/30 bg-slate-950/70 p-3.5 text-xs transition-all hover:border-cyan-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold text-white">
                <FileQuestion className="h-4 w-4 text-cyan-400" />
                <span>មុខងារទី១: កាត់រូបដាក់សំណួរ</span>
              </span>
              <span className="rounded bg-white/20 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                #FFFFFF
              </span>
            </div>
            <p className="mt-1.5 text-slate-300">
              កាត់ផ្ដាច់ផ្ទៃខាងក្រោយ និងដាក់ផ្ទៃពណ៌សសុទ្ធ (#FFFFFF) ស្វ័យប្រវត្តិ សម្រាប់ផ្នែកសំណួរ។
            </p>
          </div>

          {/* Feature 2 Card */}
          <div className="group rounded-xl border border-pink-500/30 bg-slate-950/70 p-3.5 text-xs transition-all hover:border-pink-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold text-white">
                <Lightbulb className="h-4 w-4 text-pink-400" />
                <span>មុខងារទី២: កាត់រូបដាក់ដំណោះស្រាយ</span>
              </span>
              <span className="rounded bg-pink-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-pink-300">
                #FFF0F5
              </span>
            </div>
            <p className="mt-1.5 text-slate-300">
              កាត់ផ្ដាច់ផ្ទៃខាងក្រោយ និងដាក់ផ្ទៃពណ៌ផ្កាឈូកស្រាល (#FFF0F5) ស្វ័យប្រវត្តិ សម្រាប់ផ្នែកដំណោះស្រាយ។
            </p>
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── LEFT: Upload + Distinct Dual Feature Actions ── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-5 space-y-5 shadow-[0_0_25px_rgba(0,0,0,0.5)]">
            {/* Step 1: Feature Selector Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 font-mono text-[11px] font-bold text-cyan-400">
                    1
                  </span>
                  ជ្រើសរើសមុខងារកាត់រូប (Select Feature)
                </h3>
              </div>

              {/* Distinct Tabs */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950/80 p-1.5 border border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setActiveFeature("question")}
                  disabled={isLoading}
                  className={`flex flex-col items-center justify-center rounded-lg py-2.5 px-2 text-center transition-all ${
                    isQuestion
                      ? "bg-slate-900 border border-cyan-400/60 text-white shadow-[0_0_15px_rgba(0,240,255,0.2)]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                  }`}
                >
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                    កាត់រូបដាក់សំណួរ
                  </span>
                  <span className="font-mono text-[10px] text-cyan-400">
                    #FFFFFF (White)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFeature("solution")}
                  disabled={isLoading}
                  className={`flex flex-col items-center justify-center rounded-lg py-2.5 px-2 text-center transition-all ${
                    !isQuestion
                      ? "bg-slate-900 border border-pink-400/60 text-white shadow-[0_0_15px_rgba(255,105,180,0.2)]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                  }`}
                >
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full shadow-[0_0_6px_rgba(255,182,193,0.8)]"
                      style={{ backgroundColor: "#FFF0F5" }}
                    />
                    កាត់រូបដាក់ដំណោះស្រាយ
                  </span>
                  <span className="font-mono text-[10px] text-pink-300">
                    #FFF0F5 (Pink)
                  </span>
                </button>
              </div>
            </div>

            {/* Step 2: Upload Zone */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 font-mono text-[11px] font-bold text-cyan-400">
                  2
                </span>
                បញ្ចូលរូបភាព (Upload Image)
              </h3>

              <BgUploadZone
                onFileSelect={setImageFile}
                selectedFile={imageFile}
                disabled={isLoading || !!result}
              />
            </div>

            {/* Step 3: Distinct Action Buttons (Replaces single BG Remover button) */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                ចុចដំណើរការតាមមុខងារនីមួយៗ (Execute Feature)
              </p>

              {/* Feature 1 Button: កាត់រូបដាក់សំណួរ */}
              <button
                type="button"
                onClick={() => handleExecuteFeature("question")}
                disabled={!imageFile || isLoading}
                className={`group relative flex w-full items-center justify-between overflow-hidden rounded-xl border p-3 font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
                  isQuestion
                    ? "border-cyan-400/60 bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 shadow-[0_0_20px_rgba(0,240,255,0.18)]"
                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/30">
                    <span className="h-4 w-4 rounded-full border border-slate-300 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <span>កាត់រូបដាក់សំណួរ</span>
                      <span className="rounded bg-white/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-slate-200">
                        #FFFFFF
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      កាត់ &amp; ជំនួសផ្ទៃពណ៌សស្វ័យប្រវត្តិ (សំណួរ)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {isLoading && isQuestion ? (
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-cyan-400 group-hover:translate-x-1 transition-transform" />
                  )}
                </div>
              </button>

              {/* Feature 2 Button: កាត់រូបដាក់ដំណោះស្រាយ */}
              <button
                type="button"
                onClick={() => handleExecuteFeature("solution")}
                disabled={!imageFile || isLoading}
                className={`group relative flex w-full items-center justify-between overflow-hidden rounded-xl border p-3 font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
                  !isQuestion
                    ? "border-pink-400/60 bg-gradient-to-r from-slate-900 via-pink-950/40 to-slate-900 shadow-[0_0_20px_rgba(255,105,180,0.18)]"
                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pink-500/10 ring-1 ring-pink-400/40">
                    <span
                      className="h-4 w-4 rounded-full border border-pink-300 shadow-[0_0_8px_rgba(255,182,193,0.8)]"
                      style={{ backgroundColor: "#FFF0F5" }}
                    />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <span>កាត់រូបដាក់ដំណោះស្រាយ</span>
                      <span className="rounded bg-pink-500/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-pink-300">
                        #FFF0F5
                      </span>
                    </div>
                    <p className="text-[11px] text-pink-200/80">
                      កាត់ &amp; ជំនួសផ្ទៃពណ៌ផ្កាឈូកស្វ័យប្រវត្តិ (ដំណោះស្រាយ)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {isLoading && !isQuestion ? (
                    <Loader2 className="h-4 w-4 animate-spin text-pink-400" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-pink-400 group-hover:translate-x-1 transition-transform" />
                  )}
                </div>
              </button>
            </div>

            {/* Pipeline Info Note */}
            <div className="rounded-xl border border-cyan-500/20 bg-slate-950/60 p-3 text-xs space-y-1.5 text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-slate-300 font-semibold">
                  PLP Neural Auto-Composite Engine
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                // ដំណើរការកាត់រូប និងបញ្ចូលពណ៌ផ្ទៃខាងក្រោយ (#FFFFFF ឬ #FFF0F5) ដោយស្វ័យប្រវត្តិភ្លាមៗ
                ដូច្នេះអ្នកអាចទាញយកឯកសារដែលមានផ្ទៃពណ៌រួចជាស្រេច។
              </p>
            </div>
          </div>
        </div>

        {/* ── RIGHT: High-Tech Processing & Result Deck ── */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* Error Alert */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">Error processing image</p>
                <p className="mt-0.5 text-xs opacity-80">{error}</p>
              </div>
            </div>
          )}

          {/* Futuristic Robotic Processing Scanner */}
          {isLoading && (
            <RoboticScanner
              active={true}
              moduleName={
                isQuestion
                  ? "PLP QUESTION CROP // AUTO #FFFFFF WHITE"
                  : "PLP SOLUTION CROP // AUTO #FFF0F5 PALE PINK"
              }
              steps={steps}
              subtext={
                isQuestion
                  ? "AI is segmenting subject and automatically applying solid white (#FFFFFF) background for Question Section"
                  : "AI is segmenting subject and automatically applying solid pale pink (#FFF0F5) background for Solution Section"
              }
            />
          )}

          {/* Color Studio with Automatic Background Replacement (Result State) */}
          {result && !isLoading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                      isQuestion
                        ? "bg-cyan-500/20 text-cyan-400"
                        : "bg-pink-500/20 text-pink-400"
                    }`}
                  >
                    ✓
                  </span>
                  <span>
                    លទ្ធផលកាត់រូបស្វ័យប្រវត្តិ (
                    {isQuestion ? "កាត់រូបដាក់សំណួរ" : "កាត់រូបដាក់ដំណោះស្រាយ"})
                  </span>
                </h3>
                <span className="font-mono text-xs text-emerald-400 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  AUTO-COMPOSITED
                </span>
              </div>

              <ColorStudio
                transparentPngBase64={result.imageBase64}
                width={result.originalWidth || 800}
                height={result.originalHeight || 600}
                initialMode={activeFeature}
                initialBgColor={activeFeature === "solution" ? "#FFF0F5" : "#FFFFFF"}
                onReset={handleReset}
              />
            </div>
          )}

          {/* Empty State */}
          {!result && !isLoading && !error && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-500/20 bg-slate-900/30 p-12 text-center shadow-[0_0_20px_rgba(0,0,0,0.4)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 ring-1 ring-cyan-500/30 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
                <ImageOff className="h-7 w-7 text-cyan-400" />
              </div>
              <h3 className="mt-4 text-base font-bold text-white">
                កន្លែងបង្ហាញលទ្ធផលកាត់រូប (Preview Deck)
              </h3>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
                សូមជ្រើសរើសរូបភាព រួចចុចលើប៊ូតុង{" "}
                <span className="font-bold text-white">"កាត់រូបដាក់សំណួរ (#FFFFFF)"</span> ឬ{" "}
                <span className="font-bold text-pink-300">"កាត់រូបដាក់ដំណោះស្រាយ (#FFF0F5)"</span>{" "}
                ដើម្បីកាត់រូប និងបញ្ចូលផ្ទៃពណ៌ស្វ័យប្រវត្តិភ្លាមៗ។
              </p>

              {/* Color previews */}
              <div className="mt-6 flex items-center justify-center gap-6 font-mono text-xs">
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2">
                  <span className="h-4 w-4 rounded-full border border-slate-300 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                  <span className="font-bold text-white">សំណួរ: #FFFFFF</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2">
                  <span
                    className="h-4 w-4 rounded-full border border-pink-300 shadow-[0_0_8px_rgba(255,182,193,0.9)]"
                    style={{ backgroundColor: "#FFF0F5" }}
                  />
                  <span className="font-bold text-pink-300">ដំណោះស្រាយ: #FFF0F5</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
