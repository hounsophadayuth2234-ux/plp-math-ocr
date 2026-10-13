"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calculator,
  Send,
  Loader2,
  AlertCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ImageUploadZone } from "@/components/math-ocr/ImageUploadZone";
import { OutputTabs } from "@/components/math-ocr/OutputTabs";
import type { MathOcrResponse } from "@/app/api/math-ocr/route";

// -----------------------------------------------------------
// Quick-start example prompts to guide the user
// -----------------------------------------------------------
const EXAMPLE_PROMPTS = [
  {
    label: "Vertical Addition",
    text: "  347\n+ 285\n------",
    hint: "Generates school-style column table with border-top separator",
  },
  {
    label: "Vertical Subtraction",
    text: "  902\n- 476\n------",
    hint: "Generates aligned column table with borrow notation",
  },
  {
    label: "Algebraic Equation",
    text: "Solve: 3x² + 5x - 2 = 0 using the quadratic formula",
    hint: "Produces fraction bars and superscripts inline",
  },
  {
    label: "Geometric Shape",
    text: "Right triangle with legs a=3, b=4, hypotenuse c=5. Label all sides.",
    hint: "Generates inline SVG with vertex labels",
  },
  {
    label: "Fraction Arithmetic",
    text: "(3/4) + (2/3) = ?",
    hint: "Produces HTML fraction bars with Jodit-compatible inline CSS",
  },
];

// -----------------------------------------------------------
// Main Math OCR Page Component
// -----------------------------------------------------------
export default function MathOcrPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MathOcrResponse | null>(null);
  const [showExamples, setShowExamples] = useState(false);

  const canSubmit = (imageFile !== null || rawText.trim().length > 0) && !isLoading && !isRefining;

  const submitData = async (isRefine: boolean) => {
    if (!canSubmit) return;

    if (isRefine) {
      setIsRefining(true);
    } else {
      setIsLoading(true);
      setResult(null);
      setCustomInstructions(""); // Clear old refinement text on fresh gen
    }
    setError(null);

    try {
      const formData = new FormData();
      if (imageFile) formData.append("image", imageFile);
      if (rawText.trim()) formData.append("rawText", rawText.trim());
      if (isRefine && customInstructions.trim()) {
        formData.append("customInstructions", customInstructions.trim());
      }

      const response = await fetch("/api/math-ocr", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        // The API returned an error object
        setError(data.error ?? "Unknown error from server.");
        if (data.details) {
          console.error("API Error Details:", data.details);
        }
        return;
      }

      setResult(data as MathOcrResponse);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "A network error occurred. Please check your connection."
      );
    } finally {
      setIsLoading(false);
      setIsRefining(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitData(false);
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
              <span>Module 01</span>
              <span>·</span>
              <span>Google Gemini 2.5 Flash Vision API</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Advanced Math OCR & Code Generator
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Upload a math problem image or type raw text/numbers. The AI will return{" "}
              <span className="font-semibold text-emerald-400">standard LaTeX</span> and{" "}
              <span className="font-semibold text-amber-400">
                Jodit Editor–ready HTML with strict Inline CSS
              </span>
              , including vertical arithmetic tables and inline SVG geometry.
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
            <Calculator className="h-7 w-7" />
          </div>
        </div>

        {/* Key capabilities strip - 3 distinct output formats */}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { label: "Option 1: LaTeX", desc: "Standard math typesetting code" },
            { label: "Option 2: Jodit HTML", desc: "Strict inline CSS for vertical math" },
            { label: "Option 3: MathML", desc: "Standard W3C mathematical markup" },
          ].map((cap) => (
            <div
              key={cap.label}
              className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs"
            >
              <span className="font-semibold text-indigo-300">{cap.label}</span>
              <p className="mt-0.5 text-slate-400">{cap.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main two-column layout: Input panel | Output panel */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── LEFT: Input Panel ── */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 lg:col-span-2"
        >
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-bold text-indigo-400">
                1
              </span>
              Input Source
            </h3>

            {/* Image Upload */}
            <ImageUploadZone
              onFileSelect={setImageFile}
              selectedFile={imageFile}
              disabled={isLoading}
            />

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" />
              <span className="text-xs font-medium text-slate-500">OR</span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            {/* Raw Text Input */}
            <div className="space-y-2">
              <label
                htmlFor="rawText"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Raw Text / Numbers
                <span className="ml-2 font-normal normal-case text-slate-500">
                  (optional if image uploaded)
                </span>
              </label>
              <textarea
                id="rawText"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                disabled={isLoading}
                rows={5}
                placeholder={`e.g.  347\n    + 285\n    ———\n\nor: Solve x² + 5x + 6 = 0`}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-50"
              />
            </div>

            {/* Example Prompts Accordion */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowExamples((p) => !p)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-slate-300 hover:bg-slate-900 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                  Quick Example Prompts
                </span>
                {showExamples ? (
                  <ChevronUp className="h-4 w-4 text-slate-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                )}
              </button>
              {showExamples && (
                <div className="border-t border-slate-800 p-2 space-y-1">
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      disabled={isLoading}
                      onClick={() => setRawText(ex.text)}
                      className="w-full rounded-lg px-3 py-2.5 text-left text-xs hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      <span className="font-semibold text-indigo-300">{ex.label}</span>
                      <span className="mt-0.5 block text-slate-500">{ex.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing with Gemini Vision…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Generate 3 Math Formats (LaTeX, Jodit HTML, MathML)
                </>
              )}
            </button>
          </div>
        </form>

        {/* ── RIGHT: Output Panel ── */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* Error state */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">Error processing request</p>
                <p className="mt-0.5 text-xs opacity-80">{error}</p>
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading && !result && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                <div>
                  <p className="text-sm font-medium text-white">
                    Gemini Vision is analyzing your input…
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Generating LaTeX, Jodit HTML/Inline CSS, and SVG (if applicable)
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {[80, 65, 90, 50].map((w, i) => (
                  <div
                    key={i}
                    className="h-3 animate-pulse rounded-full bg-slate-800"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Results & Refinement */}
          {result && !isLoading && (
            <div className="space-y-6">
              <OutputTabs
                latex={result.latex}
                joditHtml={result.joditHtml}
                mathml={result.mathml}
                detectedType={result.detectedType}
                rawDescription={result.rawDescription}
                isDemoMode={result.isDemoMode}
              />
              
              {/* Refinement UI */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-400">
                    2
                  </span>
                  Refine Results
                </h3>
                <p className="text-xs text-slate-400">
                  Not quite right? Provide custom instructions and ask the AI to try again.
                </p>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  disabled={isRefining}
                  rows={3}
                  placeholder="e.g. Please make the SVG triangle larger, or use different colors..."
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => submitData(true)}
                  disabled={!canSubmit || !customInstructions.trim() || isRefining}
                  className="flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-slate-800 border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRefining ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                      Refining...
                    </>
                  ) : (
                    <>
                      <Lightbulb className="h-4 w-4 text-amber-400" />
                      Refine Result
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!result && !isLoading && !error && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                <Calculator className="h-7 w-7 text-indigo-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">
                Results will appear here
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-400">
                Upload an image or type a math problem on the left, then click{" "}
                <span className="font-semibold text-indigo-400">
                  "Generate 3 Math Formats"
                </span>
                .
              </p>
              <div className="mt-5 space-y-1.5 text-left w-full max-w-sm">
                {[
                  "Option 1: Standard LaTeX Code",
                  "Option 2: Jodit HTML + Strict Inline CSS (Vertical Tables)",
                  "Option 3: Standard MathML Markup",
                  "WYSIWYG Sandboxed Visual Preview",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
