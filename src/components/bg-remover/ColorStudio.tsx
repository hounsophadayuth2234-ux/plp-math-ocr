"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Download,
  RefreshCw,
  Layers,
  CheckCircle2,
  Eye,
  Sparkles,
  Grid,
  Paintbrush,
  Scissors,
  RotateCcw,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Hand,
  Sliders,
  Maximize2,
} from "lucide-react";
import {
  compositeWithSolidColor,
  createAlphaMaskDataUrl,
  recompositeAlphaMask,
} from "@/lib/bg-removal-client";
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

export type BrushTool = "keep" | "remove" | "eraser" | "restore-edge" | "pan";

interface ColorStudioProps {
  originalUrl: string;
  transparentBlob: Blob;
  transparentUrl: string;
  alphaMaskUrl?: string;
  alphaMaskBuffer?: Uint8ClampedArray;
  sourceImageData?: ImageData;
  initialCompositeUrl: string;
  width: number;
  height: number;
  mode: "preview" | "final" | "worker";
  provider?: string;
  processingLabel?: ProcessingStatusLabel;
  metrics?: {
    modelLoadMs?: number;
    inferenceMs?: number;
    refineMs?: number;
    totalMs?: number;
  };
  onReset: () => void;
  onRerunFinal?: () => void;
}

export function ColorStudio({
  originalUrl,
  transparentBlob,
  transparentUrl,
  alphaMaskUrl: initialAlphaMaskUrl,
  alphaMaskBuffer: initialAlphaBuffer,
  sourceImageData,
  initialCompositeUrl,
  width,
  height,
  mode,
  provider = "@imgly/isnet_fp16",
  processingLabel = "Browser AI result",
  metrics,
  onReset,
  onRerunFinal,
}: ColorStudioProps) {
  // ── Channel & View State ──
  const [activeChannel, setActiveChannel] = useState<ViewChannel>("white");
  const [whiteCompositeUrl, setWhiteCompositeUrl] = useState<string>(initialCompositeUrl);
  const [pinkCompositeUrl, setPinkCompositeUrl] = useState<string>("");
  const [currentTransparentUrl, setCurrentTransparentUrl] = useState<string>(transparentUrl);
  const [currentAlphaMaskUrl, setCurrentAlphaMaskUrl] = useState<string>(initialAlphaMaskUrl || "");
  const [currentTransparentBlob, setCurrentTransparentBlob] = useState<Blob>(transparentBlob);
  const [isCompositing, setIsCompositing] = useState(false);

  // ── Manual Mask Correction State (Applied to Alpha Mask Before Compositing) ──
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTool, setActiveTool] = useState<BrushTool>("keep");
  const [brushSize, setBrushSize] = useState<number>(18);
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // In-memory working alpha mask (length: width * height)
  const alphaMaskRef = useRef<Uint8ClampedArray | null>(null);
  const baseAlphaMaskRef = useRef<Uint8ClampedArray | null>(null);

  // Undo / Redo stacks
  const [history, setHistory] = useState<Uint8ClampedArray[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8ClampedArray[]>([]);

  // Interactive editing canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize working alpha mask
  useEffect(() => {
    if (initialAlphaBuffer && initialAlphaBuffer.length === width * height) {
      alphaMaskRef.current = new Uint8ClampedArray(initialAlphaBuffer);
      baseAlphaMaskRef.current = new Uint8ClampedArray(initialAlphaBuffer);
    } else {
      // Fallback: extract alpha from transparentBlob if initialAlphaBuffer is missing
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const data = ctx.getImageData(0, 0, width, height).data;
          const buf = new Uint8ClampedArray(width * height);
          for (let i = 0; i < width * height; i++) {
            buf[i] = data[i * 4 + 3];
          }
          alphaMaskRef.current = buf;
          baseAlphaMaskRef.current = new Uint8ClampedArray(buf);
        }
      };
      img.src = transparentUrl;
    }
  }, [initialAlphaBuffer, transparentUrl, width, height]);

  // Pre-generate initial pink composite
  useEffect(() => {
    let cancelled = false;
    compositeWithSolidColor(transparentBlob, "#FFF0F5").then(({ dataUrl }) => {
      if (!cancelled) setPinkCompositeUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [transparentBlob]);

  // Active display URL based on selected channel
  const activeDisplayUrl = useMemo(() => {
    switch (activeChannel) {
      case "white":
        return whiteCompositeUrl || initialCompositeUrl;
      case "pink":
        return pinkCompositeUrl || initialCompositeUrl;
      case "transparent":
        return currentTransparentUrl || transparentUrl;
      case "mask":
        return currentAlphaMaskUrl || initialAlphaMaskUrl || transparentUrl;
      case "original":
        return originalUrl;
      default:
        return whiteCompositeUrl || initialCompositeUrl;
    }
  }, [
    activeChannel,
    whiteCompositeUrl,
    pinkCompositeUrl,
    currentTransparentUrl,
    transparentUrl,
    currentAlphaMaskUrl,
    initialAlphaMaskUrl,
    initialCompositeUrl,
    originalUrl,
  ]);

  // Instant Channel Selection (< 5ms, zero model rerun)
  const handleSelectChannel = (channel: ViewChannel) => {
    cyberAudio.playClick();
    setActiveChannel(channel);
  };

  // Re-composite all channels from current alpha mask
  const recompositeAll = useCallback(
    async (mask: Uint8ClampedArray) => {
      if (!sourceImageData) return;
      setIsCompositing(true);
      try {
        // Transparent
        const trans = await recompositeAlphaMask(sourceImageData, mask, "transparent");
        setCurrentTransparentUrl(trans.dataUrl);
        setCurrentTransparentBlob(trans.blob);

        // White
        const white = await recompositeAlphaMask(sourceImageData, mask, "white");
        setWhiteCompositeUrl(white.dataUrl);

        // Pink
        const pink = await recompositeAlphaMask(sourceImageData, mask, "pink");
        setPinkCompositeUrl(pink.dataUrl);

        // Alpha Mask Debug visualizer
        const maskDebugUrl = createAlphaMaskDataUrl(mask, width, height);
        setCurrentAlphaMaskUrl(maskDebugUrl);
      } catch (err) {
        console.error("Recompositing error:", err);
      } finally {
        setIsCompositing(false);
      }
    },
    [sourceImageData, width, height]
  );

  // Redraw interactive edit canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !alphaMaskRef.current || !sourceImageData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = width;
    const h = height;
    canvas.width = w;
    canvas.height = h;

    const mask = alphaMaskRef.current;
    const sPixels = sourceImageData.data;
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    // Render depending on active preview
    for (let i = 0; i < w * h; i++) {
      const pIdx = i * 4;
      const a = mask[i];
      const r = sPixels[pIdx];
      const g = sPixels[pIdx + 1];
      const b = sPixels[pIdx + 2];

      if (activeChannel === "mask") {
        data[pIdx] = a;
        data[pIdx + 1] = a;
        data[pIdx + 2] = a;
        data[pIdx + 3] = 255;
      } else if (activeChannel === "transparent") {
        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = a;
      } else if (activeChannel === "pink") {
        const aNorm = a / 255;
        data[pIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
        data[pIdx + 1] = Math.round(g * aNorm + 240 * (1 - aNorm));
        data[pIdx + 2] = Math.round(b * aNorm + 245 * (1 - aNorm));
        data[pIdx + 3] = 255;
      } else {
        // default white
        const aNorm = a / 255;
        data[pIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
        data[pIdx + 1] = Math.round(g * aNorm + 255 * (1 - aNorm));
        data[pIdx + 2] = Math.round(b * aNorm + 255 * (1 - aNorm));
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [width, height, sourceImageData, activeChannel]);

  useEffect(() => {
    if (isEditMode) {
      redrawCanvas();
    }
  }, [isEditMode, activeChannel, redrawCanvas]);

  // ── Brush Stroke Engine (Modifies Alpha Mask Before Compositing) ──
  const applyBrushAtPoint = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!alphaMaskRef.current) return;
      const mask = alphaMaskRef.current;
      const baseMask = baseAlphaMaskRef.current;
      const w = width;
      const h = height;
      const r = Math.max(1, Math.round(brushSize / 2));
      const rSq = r * r;

      const minX = Math.max(0, Math.floor(canvasX - r));
      const maxX = Math.min(w - 1, Math.ceil(canvasX + r));
      const minY = Math.max(0, Math.floor(canvasY - r));
      const maxY = Math.min(h - 1, Math.ceil(canvasY + r));

      for (let y = minY; y <= maxY; y++) {
        const dy = y - canvasY;
        const yOff = y * w;
        for (let x = minX; x <= maxX; x++) {
          const dx = x - canvasX;
          const distSq = dx * dx + dy * dy;
          if (distSq <= rSq) {
            const idx = yOff + x;
            if (activeTool === "keep") {
              mask[idx] = 255; // Force opaque foreground
            } else if (activeTool === "remove") {
              mask[idx] = 0;   // Force transparent background
            } else if (activeTool === "eraser") {
              // Restore to initial AI mask state
              if (baseMask) mask[idx] = baseMask[idx];
            } else if (activeTool === "restore-edge") {
              // Local soft bilateral blur for boundary refinement
              let sum = 0;
              let count = 0;
              for (let sy = Math.max(0, y - 1); sy <= Math.min(h - 1, y + 1); sy++) {
                const sOff = sy * w;
                for (let sx = Math.max(0, x - 1); sx <= Math.min(w - 1, x + 1); sx++) {
                  sum += mask[sOff + sx];
                  count++;
                }
              }
              mask[idx] = Math.round(sum / count);
            }
          }
        }
      }
      redrawCanvas();
    },
    [brushSize, activeTool, width, height, redrawCanvas]
  );

  // Pointer event handlers on interactive canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === "pan") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    if (!alphaMaskRef.current) return;
    // Push current mask to undo history before starting new stroke
    setHistory((prev) => [...prev.slice(-14), new Uint8ClampedArray(alphaMaskRef.current!)]);
    setRedoStack([]); // Clear redo stack on new action
    setIsDrawing(true);

    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    applyBrushAtPoint(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (!isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    applyBrushAtPoint(x, y);
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (isDrawing && alphaMaskRef.current) {
      setIsDrawing(false);
      recompositeAll(alphaMaskRef.current);
    }
  };

  // Undo & Redo
  const handleUndo = () => {
    if (history.length === 0 || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    const prev = history[history.length - 1];
    setRedoStack((r) => [...r, new Uint8ClampedArray(alphaMaskRef.current!)]);
    alphaMaskRef.current.set(prev);
    setHistory((h) => h.slice(0, -1));
    redrawCanvas();
    recompositeAll(alphaMaskRef.current);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    const next = redoStack[redoStack.length - 1];
    setHistory((h) => [...h, new Uint8ClampedArray(alphaMaskRef.current!)]);
    alphaMaskRef.current.set(next);
    setRedoStack((r) => r.slice(0, -1));
    redrawCanvas();
    recompositeAll(alphaMaskRef.current);
  };

  // 1-Click Download for active view
  const handleDownload = useCallback(() => {
    cyberAudio.playClick();
    const a = document.createElement("a");
    const timestamp = Date.now();

    if (activeChannel === "transparent") {
      a.href = currentTransparentUrl || transparentUrl;
      a.download = `PLP-Cutout-Transparent-${mode}-${timestamp}.png`;
    } else if (activeChannel === "pink") {
      a.href = pinkCompositeUrl || activeDisplayUrl;
      a.download = `PLP-Solution-Pink-FFF0F5-${mode}-${timestamp}.png`;
    } else if (activeChannel === "mask") {
      a.href = currentAlphaMaskUrl || initialAlphaMaskUrl || transparentUrl;
      a.download = `PLP-AlphaMask-Debug-${mode}-${timestamp}.png`;
    } else {
      a.href = whiteCompositeUrl || activeDisplayUrl;
      a.download = `PLP-Question-White-FFFFFF-${mode}-${timestamp}.png`;
    }
    a.click();
  }, [
    activeChannel,
    currentTransparentUrl,
    transparentUrl,
    pinkCompositeUrl,
    whiteCompositeUrl,
    activeDisplayUrl,
    currentAlphaMaskUrl,
    initialAlphaMaskUrl,
    mode,
  ]);

  // High-Res HD Transparent Export
  const handleDownloadTransparent = () => {
    cyberAudio.playClick();
    const a = document.createElement("a");
    a.href = currentTransparentUrl || transparentUrl;
    a.download = `PLP-Cutout-Transparent-HD-${Date.now()}.png`;
    a.click();
  };

  const getBadgeStyle = () => {
    if (mode === "final") {
      return "border-emerald-400 bg-emerald-950/70 text-emerald-300 ring-1 ring-emerald-400/40";
    }
    if (mode === "worker") {
      return "border-purple-400 bg-purple-950/70 text-purple-300 ring-1 ring-purple-400/40";
    }
    return "border-cyan-500/40 bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-500/30";
  };

  return (
    <div className="flex flex-col gap-4 font-mono">
      {/* ── Status & Provenance Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${getBadgeStyle()}`}
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>{processingLabel}</span>
          </span>
          <span className="hidden sm:inline text-slate-500">·</span>
          <span className="text-slate-400 text-[11px]">
            Model: <strong className="text-white">{provider}</strong>
          </span>
        </div>

        {/* Upgrade / Rerun Final Button */}
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

      {/* ── Channel & Quality View Controls (Instant Switching < 5ms) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 rounded-xl border border-cyan-500/20 bg-slate-950 p-1.5 text-xs">
        {/* 1. White Background */}
        <button
          type="button"
          data-channel="white"
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
          data-channel="pink"
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
          data-channel="transparent"
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
              ? "bg-slate-900 border border-slate-500 text-white shadow-[0_0_12px_rgba(148,163,184,0.25)] font-bold"
              : "text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <span>ORIGINAL</span>
        </button>

        {/* 6. Before / After Split Slider */}
        <button
          type="button"
          onClick={() => handleSelectChannel("split")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 transition-all ${
            activeChannel === "split"
              ? "bg-slate-900 border border-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.25)] font-bold"
              : "text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <Sliders className="h-3 w-3 text-emerald-400" />
          <span>SPLIT SLIDER</span>
        </button>
      </div>

      {/* ── Manual Mask Correction Toolbar (Applied Before Compositing) ── */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                cyberAudio.playClick();
                setIsEditMode(!isEditMode);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all ${
                isEditMode
                  ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(0,240,255,0.4)]"
                  : "border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50"
              }`}
            >
              <Paintbrush className="h-3.5 w-3.5" />
              <span>{isEditMode ? "MANUAL MASK STUDIO [ACTIVE]" : "EDIT ALPHA MASK TOOLS"}</span>
            </button>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              (Preserves thin legs, hair &amp; narrow gaps before compositing)
            </span>
          </div>

          {/* Undo / Redo */}
          {isEditMode && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleUndo}
                disabled={history.length === 0}
                className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-3 w-3" />
                <span className="text-[10px]">UNDO</span>
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="h-3 w-3" />
                <span className="text-[10px]">REDO</span>
              </button>
            </div>
          )}
        </div>

        {/* Edit Mode Controls (Active when Edit Mode is On) */}
        {isEditMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Tool Selection */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Keep Brush */}
              <button
                type="button"
                onClick={() => setActiveTool("keep")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  activeTool === "keep"
                    ? "bg-emerald-900/80 border border-emerald-400 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                    : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-emerald-300"
                }`}
                title="Paint to keep foreground details (α = 255)"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>KEEP BRUSH</span>
              </button>

              {/* Remove Brush */}
              <button
                type="button"
                onClick={() => setActiveTool("remove")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  activeTool === "remove"
                    ? "bg-rose-900/80 border border-rose-400 text-rose-200 shadow-[0_0_10px_rgba(244,63,94,0.3)]"
                    : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-rose-300"
                }`}
                title="Paint to remove background (α = 0)"
              >
                <Scissors className="h-3 w-3 text-rose-400" />
                <span>REMOVE BRUSH</span>
              </button>

              {/* Eraser */}
              <button
                type="button"
                onClick={() => setActiveTool("eraser")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  activeTool === "eraser"
                    ? "bg-sky-900/80 border border-sky-400 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.3)]"
                    : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-sky-300"
                }`}
                title="Restore to original AI segmentation mask"
              >
                <RotateCcw className="h-3 w-3 text-sky-400" />
                <span>ERASER</span>
              </button>

              {/* Restore Edge */}
              <button
                type="button"
                onClick={() => setActiveTool("restore-edge")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  activeTool === "restore-edge"
                    ? "bg-cyan-900/80 border border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(0,240,255,0.3)]"
                    : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-cyan-300"
                }`}
                title="Smooth and restore antialiased boundary"
              >
                <Sparkles className="h-3 w-3 text-cyan-400" />
                <span>RESTORE EDGE</span>
              </button>

              {/* Pan Tool */}
              <button
                type="button"
                onClick={() => setActiveTool("pan")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  activeTool === "pan"
                    ? "bg-amber-900/80 border border-amber-400 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                    : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-amber-300"
                }`}
                title="Pan and navigate around zoomed canvas"
              >
                <Hand className="h-3 w-3 text-amber-400" />
                <span>PAN</span>
              </button>
            </div>

            {/* Brush Size & Zoom Controls */}
            <div className="flex items-center gap-3">
              {/* Brush Size presets */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span>SIZE:</span>
                {[6, 16, 32, 60].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setBrushSize(sz)}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      brushSize === sz
                        ? "bg-cyan-500 text-black font-bold"
                        : "bg-slate-900 text-slate-400 hover:text-white"
                    }`}
                  >
                    {sz}px
                  </button>
                ))}
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 border-l border-slate-800 pl-3">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                  className="rounded p-1 bg-slate-900 text-slate-400 hover:text-white"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3 w-3" />
                </button>
                <span className="text-[10px] text-slate-400 w-10 text-center font-bold">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
                  className="rounded p-1 bg-slate-900 text-slate-400 hover:text-white"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="rounded p-1 bg-slate-900 text-slate-400 hover:text-white ml-1"
                  title="Reset Zoom & Pan"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        )}
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
        <div className="absolute top-2 left-2 h-3 w-3 border-t-2 border-l-2 border-cyan-400 pointer-events-none z-20" />
        <div className="absolute top-2 right-2 h-3 w-3 border-t-2 border-r-2 border-cyan-400 pointer-events-none z-20" />
        <div className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 border-cyan-400 pointer-events-none z-20" />
        <div className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 border-cyan-400 pointer-events-none z-20" />

        {/* View Mode: Split Comparison Slider vs Interactive Canvas vs Image */}
        {activeChannel === "split" ? (
          <div className="w-full max-w-2xl">
            <BeforeAfterSlider
              beforeSrc={originalUrl}
              afterSrc={whiteCompositeUrl || currentTransparentUrl}
              beforeLabel="Original Image"
              afterLabel="Clean Cutout"
            />
          </div>
        ) : isEditMode ? (
          /* Interactive Mask Painting Canvas */
          <div
            className="relative overflow-hidden cursor-crosshair flex items-center justify-center"
            style={{
              transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
              transition: isPanning ? "none" : "transform 0.1s ease-out",
            }}
          >
            {activeChannel === "transparent" && (
              <div
                className="absolute inset-0 rounded-xl opacity-40 pointer-events-none"
                style={{
                  backgroundImage: `linear-gradient(45deg, #334155 25%, transparent 25%), 
                                    linear-gradient(-45deg, #334155 25%, transparent 25%), 
                                    linear-gradient(45deg, transparent 75%, #334155 75%), 
                                    linear-gradient(-45deg, transparent 75%, #334155 75%)`,
                  backgroundSize: "20px 20px",
                }}
              />
            )}
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="max-h-[460px] max-w-full object-contain rounded-xl shadow-2xl"
              style={{ touchAction: "none" }}
            />
          </div>
        ) : (
          /* Standard Re-composited Image Display */
          <div className="relative z-10 flex items-center justify-center">
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
              data-active-channel={activeChannel}
              className="max-h-[460px] max-w-full object-contain rounded-xl shadow-2xl transition-all"
            />
          </div>
        )}
      </div>

      {/* ── Telemetry HUD & Download Actions ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
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
          <div className="flex items-center gap-3">
            {metrics?.inferenceMs ? (
              <span>Inference: {metrics.inferenceMs}ms</span>
            ) : null}
            <span>
              {width} × {height} PX · {mode === "final" ? "HD BUFFER" : "PREVIEW BUFFER"}
            </span>
          </div>
        </div>

        {/* Primary Download Button for Current View */}
        <button
          type="button"
          data-testid="primary-download"
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
