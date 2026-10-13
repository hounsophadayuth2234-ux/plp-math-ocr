"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ImagePlus, Wand2, Loader2, AlertCircle, Download,
  Trash2, ChevronDown, ChevronUp, ImageIcon,
} from "lucide-react";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import type { GenerateSuccess, GenerateError } from "@/app/api/generate-image/route";

// -----------------------------------------------------------
// Config
// -----------------------------------------------------------
const ASPECT_RATIOS = [
  { value: "1:1",  label: "Square 1:1",    desc: "1024×1024" },
  { value: "16:9", label: "Landscape 16:9", desc: "1360×768" },
  { value: "9:16", label: "Portrait 9:16",  desc: "768×1360" },
  { value: "4:3",  label: "Classic 4:3",    desc: "1024×768"  },
  { value: "3:4",  label: "Portrait 3:4",   desc: "768×1024"  },
];

const NUM_OUTPUT_OPTIONS = [1, 2, 4];

const EXAMPLE_PROMPTS = [
  "A detailed scientific diagram of a human cell with labeled organelles, textbook illustration style",
  "An enchanted forest at golden hour, volumetric rays of light through ancient trees, 4K hyperrealistic",
  "A minimalist flat-design icon set of school subjects on a white background",
  "Futuristic cyberpunk city at night with neon reflections on rain-soaked streets, ultra-detailed",
  "Watercolor painting of geometric shapes: triangles, circles, and squares in pastel colors",
];

// -----------------------------------------------------------
// Gallery Item
// -----------------------------------------------------------
interface GalleryItemProps {
  url: string;
  index: number;
  prompt: string;
  aspectRatio: string;
}

function GalleryItem({ url, index, prompt, aspectRatio }: GalleryItemProps) {
  const handleDownload = async () => {
    const response = await fetch(url);
    const blob = await response.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `generated-${aspectRatio.replace(":", "x")}-${index + 1}-${Date.now()}.png`;
    a.click();
  };

  // Map aspect ratio to Tailwind aspect class
  const aspectClass: Record<string, string> = {
    "1:1": "aspect-square",
    "16:9": "aspect-video",
    "9:16": "aspect-[9/16]",
    "4:3": "aspect-[4/3]",
    "3:4": "aspect-[3/4]",
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className={`relative w-full overflow-hidden ${aspectClass[aspectRatio] ?? "aspect-square"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Generated image ${index + 1}: ${prompt.slice(0, 60)}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
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
      <div className="border-t border-slate-800 px-3 py-2 flex items-center justify-between">
        <p className="text-[11px] text-slate-400 truncate max-w-[80%]">
          #{index + 1} · {aspectRatio}
        </p>
        <button type="button" onClick={handleDownload} className="text-slate-500 hover:text-rose-400 transition-colors">
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Session Gallery strip
// -----------------------------------------------------------
interface SessionGalleryProps {
  items: Array<{ url: string; prompt: string; aspectRatio: string; generatedAt: string }>;
  onClear: () => void;
}

function SessionGallery({ items, onClear }: SessionGalleryProps) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          Session Gallery
          <span className="ml-2 rounded-md bg-pink-500/15 px-2 py-0.5 text-xs font-medium text-pink-300">
            {items.length} image{items.length !== 1 ? "s" : ""}
          </span>
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-rose-950/50 hover:text-rose-300 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear Gallery
        </button>
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {items.map((item, i) => (
          <GalleryItem
            key={`${item.generatedAt}-${i}`}
            url={item.url}
            index={i}
            prompt={item.prompt}
            aspectRatio={item.aspectRatio}
          />
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Main Page
// -----------------------------------------------------------
interface GalleryEntry {
  url: string;
  prompt: string;
  aspectRatio: string;
  generatedAt: string;
}

export default function ImageGeneratorPage() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [numOutputs, setNumOutputs] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryEntry[]>([]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, negativePrompt, aspectRatio, numOutputs }),
      });

      const data: GenerateSuccess | GenerateError = await response.json();

      if (!response.ok || "error" in data) {
        setError((data as GenerateError).error);
        return;
      }

      const success = data as GenerateSuccess;
      const newEntries: GalleryEntry[] = success.images.map((url) => ({
        url,
        prompt: success.prompt,
        aspectRatio: success.aspectRatio,
        generatedAt: new Date().toISOString(),
      }));
      setGallery((prev) => [...newEntries, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard Overview
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-pink-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950/60 p-6 sm:p-8 shadow-[0_0_35px_rgba(236,72,153,0.1)]">
        <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-25" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between relative z-10">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-pink-400">
              <span className="rounded bg-pink-950/80 px-2 py-0.5 border border-pink-500/40">MODULE 04</span><span>·</span>
              <span>Flux Schnell Neural Synthesis</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              បង្កើតរូបភាព
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              បង្កើតរូបភាព និងគំនូរប្លែកៗតាមរយៈការសរសេរ Prompt ជាមួយម៉ូដែល{" "}
              <span className="font-semibold text-pink-400">Flux Schnell</span> — លឿនរហ័ស គុណភាពខ្ពស់។ អាចកំណត់ Aspect Ratio និងទាញយករូបភាពបានភ្លាមៗ។
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/20">
            <ImagePlus className="h-7 w-7" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 relative z-10 font-mono">
          {[
            { label: "Flux Schnell", desc: "Fast 4-step generation engine" },
            { label: "5 Aspect Ratios", desc: "Square, landscape, portrait, and classic" },
            { label: "Session Gallery", desc: "Persistent grid with one-click download" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-pink-500/20 bg-slate-950/70 p-3 text-xs shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              <span className="font-bold text-pink-300">{c.label}</span>
              <p className="mt-0.5 text-slate-400 font-sans">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Controls + Gallery */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Form */}
        <form onSubmit={handleGenerate} className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
            {/* Prompt */}
            <div className="space-y-2">
              <label htmlFor="prompt" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Prompt <span className="text-rose-400">*</span>
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                rows={4}
                placeholder="A detailed scientific diagram of a human cell…"
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/50 disabled:opacity-50"
              />
              {/* Example prompts */}
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.slice(0, 3).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    disabled={isLoading}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 hover:border-pink-500/50 hover:text-pink-300 transition-colors disabled:opacity-50 text-left truncate max-w-full"
                    title={ex}
                  >
                    {ex.slice(0, 45)}{ex.length > 45 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Aspect Ratio</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {ASPECT_RATIOS.map((ar) => (
                  <button
                    key={ar.value}
                    type="button"
                    onClick={() => setAspectRatio(ar.value)}
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

            {/* Num outputs */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Number of Images</p>
              <div className="flex gap-2">
                {NUM_OUTPUT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNumOutputs(n)}
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

            {/* Advanced (negative prompt) */}
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced((p) => !p)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-slate-300 hover:bg-slate-800/50 transition-colors"
              >
                <span>Advanced Settings (Negative Prompt)</span>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showAdvanced && (
                <div className="border-t border-slate-800 p-4">
                  <label htmlFor="negativePrompt" className="block mb-1.5 text-xs font-medium text-slate-400">
                    Negative Prompt
                  </label>
                  <textarea
                    id="negativePrompt"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    disabled={isLoading}
                    rows={2}
                    placeholder="blurry, low quality, distorted, watermark…"
                    className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-pink-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!prompt.trim() || isLoading}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              ) : (
                <><Wand2 className="h-4 w-4" /> Generate {numOutputs} Image{numOutputs > 1 ? "s" : ""}</>
              )}
            </button>
          </div>
        </form>

        {/* Right: Gallery */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">Generation failed</p>
                <p className="mt-0.5 text-xs opacity-80">{error}</p>
              </div>
            </div>
          )}

          {/* High-Tech Robotic Processing Scanner */}
          {isLoading && (
            <RoboticScanner
              active={true}
              moduleName="PLP SYNTHESIS // FLUX SCHNELL"
              steps={[
                "DISPATCHING TEXT PROMPT EMBEDDINGS...",
                "INITIALIZING LATENT DIFFUSION NOISE TENSORS...",
                "RUNNING 4-STEP RECTIFIED FLOW INFERENCE...",
                "DECODING VAE LATENTS TO HIGH-RESOLUTION RGB...",
                "COMPILING ASSET TO SESSION GALLERY...",
              ]}
              subtext={`Flux Schnell generating ${numOutputs} asset(s) at aspect ratio ${aspectRatio}`}
            />
          )}

          {gallery.length > 0 ? (
            <SessionGallery items={gallery} onClear={() => setGallery([])} />
          ) : !isLoading && !error ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                <ImageIcon className="h-7 w-7 text-pink-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">Gallery will appear here</h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-400">
                Enter a prompt and click{" "}
                <span className="font-semibold text-pink-400">"Generate"</span>. Images accumulate
                in this session gallery with hover-to-download.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
