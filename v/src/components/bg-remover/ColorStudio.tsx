"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Download, RefreshCw } from "lucide-react";

export interface CanvasCompositorHandle {
  /** Returns a data-URL PNG of the current canvas composite */
  exportPng: () => string | null;
}

interface CanvasCompositorProps {
  /** Base64-encoded transparent PNG (no data URI prefix) */
  transparentPngBase64: string;
  /** Current background color hex e.g. "#ffffff" */
  bgColor: string;
  width: number;
  height: number;
}

/**
 * HTML5 Canvas compositor that draws a solid color background
 * beneath the transparent-PNG subject in real time.
 * Exposed via forwardRef so the parent can call exportPng().
 */
export const CanvasCompositor = forwardRef<CanvasCompositorHandle, CanvasCompositorProps>(
  function CanvasCompositor({ transparentPngBase64, bgColor, width, height }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [isReady, setIsReady] = useState(false);

    // Load the transparent PNG once
    useEffect(() => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        setIsReady(true);
      };
      img.src = `data:image/png;base64,${transparentPngBase64}`;
    }, [transparentPngBase64]);

    // Redraw whenever bgColor changes or image becomes ready
    useEffect(() => {
      if (!isReady || !imgRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Fill solid color first
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // Draw the subject (transparent PNG) on top
      ctx.drawImage(imgRef.current, 0, 0, width, height);
    }, [isReady, bgColor, width, height]);

    // Expose exportPng() to parent
    useImperativeHandle(ref, () => ({
      exportPng: () => {
        return canvasRef.current?.toDataURL("image/png") ?? null;
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="max-h-full max-w-full object-contain rounded-xl"
        style={{ background: isReady ? undefined : bgColor }}
        aria-label="Canvas preview with new background color"
      />
    );
  }
);

// -----------------------------------------------------------
// Preset color swatches for quick selection
// -----------------------------------------------------------
const PRESETS = [
  { label: "White", value: "#ffffff" },
  { label: "Light Gray", value: "#f3f4f6" },
  { label: "Slate", value: "#64748b" },
  { label: "Black", value: "#000000" },
  { label: "Navy", value: "#1e3a5f" },
  { label: "Sky Blue", value: "#0ea5e9" },
  { label: "Emerald", value: "#10b981" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Teal", value: "#0d9488" },
  { label: "Crimson", value: "#be123c" },
];

interface ColorStudioProps {
  transparentPngBase64: string;
  width: number;
  height: number;
  onReset: () => void;
}

/**
 * Color studio panel: preset swatches + custom color picker +
 * Canvas compositor with download button.
 */
export function ColorStudio({ transparentPngBase64, width, height, onReset }: ColorStudioProps) {
  const [bgColor, setBgColor] = useState("#ffffff");
  const compositorRef = useRef<CanvasCompositorHandle>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(() => {
    setIsDownloading(true);
    setTimeout(() => {
      const dataUrl = compositorRef.current?.exportPng();
      if (!dataUrl) return;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `bg-replaced-${Date.now()}.png`;
      a.click();
      setIsDownloading(false);
    }, 100);
  }, []);

  // Canvas display dimensions — constrain to a max display size while
  // keeping the actual canvas at the real pixel dimensions for export quality.
  const MAX_DISPLAY = 480;
  const aspectRatio = width > 0 && height > 0 ? width / height : 1;
  const displayWidth = Math.min(width, MAX_DISPLAY);
  const displayHeight = Math.round(displayWidth / aspectRatio);

  return (
    <div className="flex flex-col gap-5">
      {/* Canvas preview */}
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/50"
        style={{ minHeight: 240 }}
      >
        {/* Checkered "transparent" pattern visible behind canvas if needed */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-conic-gradient(#64748b 0% 25%, transparent 0% 50%)",
            backgroundSize: "20px 20px",
          }}
        />
        <div className="relative z-10 p-4">
          <CanvasCompositor
            ref={compositorRef}
            transparentPngBase64={transparentPngBase64}
            bgColor={bgColor}
            width={displayWidth}
            height={displayHeight}
          />
        </div>
      </div>

      {/* Color selection controls */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Background Color Studio
        </h4>

        {/* Preset swatches */}
        <div>
          <p className="mb-2.5 text-xs text-slate-500">Quick Presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                title={preset.label}
                onClick={() => setBgColor(preset.value)}
                className={`h-8 w-8 rounded-lg border-2 transition-all hover:scale-110 ${
                  bgColor === preset.value
                    ? "border-indigo-400 ring-2 ring-indigo-500/50 scale-110"
                    : "border-slate-700"
                }`}
                style={{ backgroundColor: preset.value }}
                aria-label={preset.label}
              />
            ))}
          </div>
        </div>

        {/* Custom color picker */}
        <div className="flex items-center gap-3">
          <div>
            <p className="mb-1.5 text-xs text-slate-500">Custom Color</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-slate-700 bg-transparent p-0.5"
                aria-label="Pick a custom background color"
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setBgColor(v);
                }}
                className="w-28 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                maxLength={7}
                placeholder="#ffffff"
              />
              <div
                className="h-10 w-10 rounded-lg border border-slate-700 shadow-inner"
                style={{ backgroundColor: bgColor }}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 hover:brightness-110 disabled:opacity-60 transition-all"
          >
            <Download className="h-4 w-4" />
            {isDownloading ? "Preparing…" : "Download PNG"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
