"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ImagePlus,
  Wand2,
  Loader2,
  AlertCircle,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  XCircle,
  CheckCircle2,
  Settings,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import { cyberAudio } from "@/lib/cyber-audio";
import { ProcessingStatusLabel } from "@/lib/types";
import { ObjectUrlRegistry } from "@/lib/processing-utils";
import type { GenerateSuccess, GenerateError } from "@/app/api/generate-image/route";

const ASPECT_RATIOS = [
  { value: "1:1", label: "Square 1:1", desc: "1024×1024" },
  { value: "16:9", label: "Landscape 16:9", desc: "1360×768" },
  { value: "9:16", label: "Portrait 9:16", desc: "768×1360" },
  { value: "4:3", label: "Classic 4:3", desc: "1024×768" },
  { value: "3:4", label: "Portrait 3:4", desc: "768×1024" },
];

const NUM_OUTPUT_OPTIONS = [1, 2, 4];

const EXAMPLE_PROMPTS = [
  "A detailed scientific diagram of a plant cell with labeled chloroplasts, textbook illustration style",
  "Futuristic robotic laboratory with neon holographic displays, cyberpunk aesthetic, 4K hyperrealistic",
  "A minimalist flat-design icon set of education subjects on a clean white background",
  "Geometric fractal patterns in pastel pink and cyan colors, vector art style",
  "An ancient library with floating glowing mathematical formulas and scrolls, magical realism",
];

interface GalleryEntry {
  url: string;
  prompt: string;
  aspectRatio: string;
  model: string;
  label: ProcessingStatusLabel;
  generatedAt: string;
}

interface GalleryItemProps {
  item: GalleryEntry;
  index: number;
}

function GalleryItem({ item, index }: GalleryItemProps) {
  const handleDownload = async () => {
    cyberAudio.playClick();
    try {
      const response = await fetch(item.url);
      const blob = await response.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `generated-${item.aspectRatio.replace(":", "x")}-${index + 1}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const aspectClass: Record<string, string> = {
    "1:1": "aspect-square",
    "16:9": "aspect-video",
    "9:16": "aspect-[9/16]",
    "4:3": "aspect-[4/3]",
    "3:4": "aspect-[3/4]",
  };

  const getBadgeStyle = (label: ProcessingStatusLabel) => {
    switch (label) {
      case "Local worker result":
        return "border-cyan-500/40 bg-cyan-950/60 text-cyan-300";
      case "Cloud API result":
        return "border-indigo-500/40 bg-indigo-950/60 text-indigo-300";
      case "Demo preview":
        return "border-purple-500/40 bg-purple-950/60 text-purple-300";
      default:
        return "border-slate-700 bg-slate-900 text-slate-300";
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-md">
      <div
        className={`relative w-full overflow-hidden ${
          aspectClass[item.aspectRatio] ?? "aspect-square"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={`Generated image ${index + 1}: ${item.prompt.slice(0, 60)}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        {/* Status Tag Overlay */}
        <div className="absolute top-2 left-2 z-10">
          <span
            className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider backdrop-blur-sm ${getBadgeStyle(
              item.label
            )}`}
          >
            {item.label}
          </span>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-pink-500 transition-colors"
          >
            <Download className="h-4 w-4" /> Download PNG
          </button>
        </div>
      </div>

      <div className="border-t border-slate-800 p-3 space-y-1 font-mono">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>
            #{index + 1} · {item.aspectRatio}
          </span>
          <button
            type="button"
            onClick={handleDownload}
            className="text-slate-500 hover:text-pink-400 transition-colors"
            title="Download PNG"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[11px] text-slate-300 truncate" title={item.prompt}>
          {item.prompt}
        </p>
      </div>
    </div>
  );
}

interface SessionGalleryProps {
  items: GalleryEntry[];
  onClear: () => void;
}

function SessionGallery({ items, onClear }: SessionGalleryProps) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3 font-mono">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <span>SESSION GALLERY</span>
          <span className="rounded-md bg-pink-500/15 border border-pink-500/30 px-2 py-0.5 text-xs font-medium text-pink-300">
            {items.length} {items.length === 1 ? "ASSET" : "ASSETS"}
          </span>
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 hover:bg-rose-950/50 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear Gallery
        </button>
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        {items.map((item, i) => (
          <GalleryItem key={`${item.generatedAt}-${i}`} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}

export default function ImageGeneratorPage() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [numOutputs, setNumOutputs] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; suggestedAction?: string } | null>(
    null
  );
  const [gallery, setGallery] = useState<GalleryEntry[]>([]);

  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const urlRegistryRef = useRef<ObjectUrlRegistry>(new ObjectUrlRegistry());

  useEffect(() => {
    const registry = urlRegistryRef.current;
    return () => {
      registry.revokeAll();
    };
  }, []);

  const handleCancel = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    cyberAudio.stopScanningHum();
    cyberAudio.playClick();
    setIsLoading(false);
    setError({ message: "Image generation cancelled by user." });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negativePrompt: negativePrompt.trim() || undefined,
          aspectRatio,
          numOutputs,
          allowDemo: isDemoMode,
        }),
        signal: abortController.signal,
      });

      const data: GenerateSuccess | GenerateError = await response.json();
      if (abortController.signal.aborted) return;

      if (!response.ok || "error" in data) {
        const errData = data as GenerateError;
        setError({
          message: errData.error,
          suggestedAction: errData.suggestedAction,
        });
        cyberAudio.stopScanningHum();
        return;
      }

      const success = data as GenerateSuccess;
      const newEntries: GalleryEntry[] = success.images.map((url) => ({
        url,
        prompt: success.prompt,
        aspectRatio: success.aspectRatio,
        model: success.model,
        label: success.label,
        generatedAt: new Date().toISOString(),
      }));

      setGallery((prev) => [...newEntries, ...prev]);
      cyberAudio.playSuccessChime();
    } catch (err: unknown) {
      cyberAudio.stopScanningHum();
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError({
        message: err instanceof Error ? err.message : "Generation failed.",
      });
    } finally {
      cyberAudio.stopScanningHum();
      activeAbortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleClearGallery = () => {
    cyberAudio.playClick();
    urlRegistryRef.current.revokeAll();
    setGallery([]);
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
      <div className="relative overflow-hidden rounded-2xl border border-pink-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950/60 p-6 sm:p-8 shadow-[0_0_35px_rgba(236,72,153,0.1)]">
        <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-25" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between relative z-10">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-pink-400">
              <span className="rounded bg-pink-950/80 px-2 py-0.5 border border-pink-500/40">
                MODULE 04
              </span>
              <span>·</span>
              <span>Text-to-Image Neural Synthesis</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              បង្កើតរូបភាព // NEURAL SYNTHESIS
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              បង្កើតរូបភាព និងគំនូរតាមរយៈការសរសេរ Prompt ជាមួយម៉ូដែល{" "}
              <span className="font-semibold text-pink-400">Flux Schnell</span> ឬ{" "}
              <span className="font-semibold text-purple-400">
                Local Diffusion Worker (ComfyUI / SD)
              </span>
              ។ អាចកំណត់ Aspect Ratio, ចំនួនរូប, និង Negative Prompt។
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/20">
            <ImagePlus className="h-7 w-7" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 relative z-10 font-mono">
          {[
            {
              label: "Flux Schnell / Local SD",
              desc: "High-speed rectified flow & diffusion generation",
            },
            {
              label: "5 Aspect Ratios",
              desc: "Square, landscape, portrait, and classic proportions",
            },
            {
              label: "Transparent Provenance",
              desc: "Strictly labeled worker, cloud, or demo results",
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-pink-500/20 bg-slate-950/70 p-3 text-xs shadow-[0_0_10px_rgba(0,0,0,0.5)]"
            >
              <span className="font-bold text-pink-300">{c.label}</span>
              <p className="mt-0.5 text-slate-400 font-sans">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Form */}
        <form onSubmit={handleGenerate} className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-500/20 text-[11px] font-bold text-pink-400">
                  1
                </span>
                Synthesis Parameters
              </span>
              <span className="font-mono text-[10px] text-pink-400">
                PROMPT_MATRIX
              </span>
            </h3>

            {/* Prompt */}
            <div className="space-y-2">
              <label
                htmlFor="prompt"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Prompt <span className="text-rose-400">*</span>
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                rows={4}
                placeholder="A detailed scientific diagram of a plant cell with labeled organelles…"
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/50 disabled:opacity-50"
              />
              {/* Example Prompts */}
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.slice(0, 3).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      cyberAudio.playClick();
                      setPrompt(ex);
                    }}
                    disabled={isLoading}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 hover:border-pink-500/50 hover:text-pink-300 transition-colors disabled:opacity-50 text-left truncate max-w-full font-mono"
                    title={ex}
                  >
                    {ex.slice(0, 42)}…
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Aspect Ratio
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {ASPECT_RATIOS.map((ar) => (
                  <button
                    key={ar.value}
                    type="button"
                    onClick={() => {
                      cyberAudio.playClick();
                      setAspectRatio(ar.value);
                    }}
                    disabled={isLoading}
                    className={`rounded-xl border p-2 text-center text-xs transition-all ${
                      aspectRatio === ar.value
                        ? "border-pink-500/60 bg-pink-500/10 text-white ring-1 ring-pink-500/40"
                        : "border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    <div className="font-semibold">{ar.value}</div>
                    <div className="text-[10px] text-slate-500">{ar.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Num Outputs */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Number of Assets
              </p>
              <div className="flex gap-2 font-mono">
                {NUM_OUTPUT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      cyberAudio.playClick();
                      setNumOutputs(n);
                    }}
                    disabled={isLoading}
                    className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition-all ${
                      numOutputs === n
                        ? "border-pink-500/60 bg-pink-500/10 text-white ring-1 ring-pink-500/40"
                        : "border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced: Negative Prompt */}
            <div className="rounded-xl border border-slate-800 overflow-hidden font-mono">
              <button
                type="button"
                onClick={() => setShowAdvanced((p) => !p)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-slate-300 hover:bg-slate-800/50 transition-colors"
              >
                <span>Advanced Parameters (Negative Prompt)</span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {showAdvanced && (
                <div className="border-t border-slate-800 p-4">
                  <label
                    htmlFor="negativePrompt"
                    className="block mb-1.5 text-xs font-medium text-slate-400"
                  >
                    Negative Prompt
                  </label>
                  <textarea
                    id="negativePrompt"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    disabled={isLoading}
                    rows={2}
                    placeholder="blurry, low quality, distorted, watermark, deformed…"
                    className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-pink-500 focus:outline-none disabled:opacity-50 font-sans"
                  />
                </div>
              )}
            </div>

            {/* Demo Preview Checkbox */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={isDemoMode}
                  onChange={(e) => setIsDemoMode(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-pink-500 focus:ring-pink-500/50"
                />
                <div>
                  <span className="font-semibold text-white">
                    Enable Demo Preview Mode
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Tests UI with simulated placeholders without requiring a worker or cloud token.
                  </p>
                </div>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                type="submit"
                disabled={!prompt.trim() || isLoading}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-mono"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Synthesizing…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> Synthesize {numOutputs} Asset
                    {numOutputs > 1 ? "s" : ""}
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
                  Cancel Generation
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Right: Gallery & Status */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* Error Card */}
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

              {error.suggestedAction === "ENABLE_DEMO" && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rose-500/20">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDemoMode(true);
                      setError(null);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-pink-500/40 bg-pink-950/60 px-3 py-1.5 text-xs text-pink-200 hover:bg-pink-900/60 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                    Enable Demo Preview Mode
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
                isDemoMode
                  ? "DEMO SIMULATOR // [SYNTHESIS PREVIEW]"
                  : "FLUX / LOCAL WORKER // [DIFFUSION MATRIX]"
              }
              steps={[
                "DISPATCHING TEXT PROMPT EMBEDDINGS...",
                "INITIALIZING DIFFUSION NOISE TENSORS...",
                "RUNNING MULTI-STEP RECTIFIED FLOW INFERENCE...",
                "DECODING LATENTS TO HIGH-RESOLUTION RGB...",
                "COMPILING ASSET TO SESSION GALLERY...",
              ]}
              subtext={`Generating ${numOutputs} asset(s) at aspect ratio ${aspectRatio}`}
            />
          )}

          {/* Gallery Output */}
          {gallery.length > 0 ? (
            <SessionGallery items={gallery} onClear={handleClearGallery} />
          ) : !isLoading && !error ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                <ImageIcon className="h-7 w-7 text-pink-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white font-mono">
                SESSION GALLERY STANDBY
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-400">
                Enter a prompt and click{" "}
                <span className="font-semibold text-pink-400">&quot;Synthesize&quot;</span>.
                Generated images accumulate here with instant PNG download.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
