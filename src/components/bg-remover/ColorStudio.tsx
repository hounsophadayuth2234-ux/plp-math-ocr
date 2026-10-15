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
  Check,
  X,
  Feather,
} from "lucide-react";
import {
  compositeWithSolidColor,
  createAlphaMaskDataUrl,
  recompositeAlphaMask,
  exportAtFullResolution,
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

export type BrushTool = "keep" | "remove" | "soft" | "eraser" | "pan";

interface ColorStudioProps {
  originalUrl: string;
  originalFile?: File | null;
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

const MAX_HISTORY_STATES = 20;

export function ColorStudio({
  originalUrl,
  originalFile,
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
  // ── Channel & Preview State ──
  const [activeChannel, setActiveChannel] = useState<ViewChannel>("white");
  const [whiteCompositeUrl, setWhiteCompositeUrl] = useState<string>(initialCompositeUrl);
  const [pinkCompositeUrl, setPinkCompositeUrl] = useState<string>("");
  const [currentTransparentUrl, setCurrentTransparentUrl] = useState<string>(transparentUrl);
  const [currentAlphaMaskUrl, setCurrentAlphaMaskUrl] = useState<string>(initialAlphaMaskUrl || "");
  const [currentTransparentBlob, setCurrentTransparentBlob] = useState<Blob>(transparentBlob);
  const [isCompositing, setIsCompositing] = useState(false);

  // ── Manual Mask Refinement Studio State ──
  const [isEditMode, setIsEditMode] = useState(true);
  const [activeTool, setActiveTool] = useState<BrushTool>("keep");
  const [brushSize, setBrushSize] = useState<number>(20);
  const [brushHardness, setBrushHardness] = useState<number>(80); // 0 = ultra soft, 100 = hard edge
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDirty, setIsDirty] = useState(false);
  const [hasAppliedCorrections, setHasAppliedCorrections] = useState(false);

  // ── In-Memory Grayscale Alpha Mask Buffers (Length = width * height) ──
  // Working alpha mask currently being painted
  const alphaMaskRef = useRef<Uint8ClampedArray | null>(null);
  // Unchangeable base AI mask from @imgly/isnet_fp16
  const baseAlphaMaskRef = useRef<Uint8ClampedArray | null>(null);
  // Last committed/applied state for "Cancel Changes"
  const committedAlphaMaskRef = useRef<Uint8ClampedArray | null>(null);

  // Undo / Redo stacks (Limited to MAX_HISTORY_STATES)
  const [history, setHistory] = useState<Uint8ClampedArray[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8ClampedArray[]>([]);

  // Interactive editing canvas ref & offscreen mask canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const dirtyRectRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);

  // Initialize in-memory grayscale alpha mask buffers
  useEffect(() => {
    const totalPixels = width * height;
    if (initialAlphaBuffer && initialAlphaBuffer.length === totalPixels) {
      alphaMaskRef.current = new Uint8ClampedArray(initialAlphaBuffer);
      baseAlphaMaskRef.current = new Uint8ClampedArray(initialAlphaBuffer);
      committedAlphaMaskRef.current = new Uint8ClampedArray(initialAlphaBuffer);
    } else {
      // Fallback: extract alpha from transparentBlob
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const data = ctx.getImageData(0, 0, width, height).data;
          const buf = new Uint8ClampedArray(totalPixels);
          for (let i = 0; i < totalPixels; i++) {
            buf[i] = data[i * 4 + 3];
          }
          alphaMaskRef.current = buf;
          baseAlphaMaskRef.current = new Uint8ClampedArray(buf);
          committedAlphaMaskRef.current = new Uint8ClampedArray(buf);
        }
      };
      img.src = transparentUrl;
    }

    // Clear interactive canvas when new image or buffer is loaded
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    // Clear undo history & dirty states when a new image or buffer is uploaded
    setHistory([]);
    setRedoStack([]);
    setIsDirty(false);
    setHasAppliedCorrections(false);

    // Initialize offscreen mask canvas
    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    offscreenMaskCanvasRef.current = offscreen;

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      offscreenMaskCanvasRef.current = null;
      alphaMaskRef.current = null;
      baseAlphaMaskRef.current = null;
      committedAlphaMaskRef.current = null;
    };
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

  // Active display URL for passive image view
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

        // Alpha Mask Debug visualizer (pure 8-bit black-and-white)
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

  // Redraw interactive canvas based on working alpha mask and activeChannel
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !alphaMaskRef.current || !sourceImageData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = width;
    const h = height;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const mask = alphaMaskRef.current;
    const sPixels = sourceImageData.data;
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;
    const total = w * h;

    for (let i = 0; i < total; i++) {
      const pIdx = i * 4;
      const a = mask[i];
      const r = sPixels[pIdx];
      const g = sPixels[pIdx + 1];
      const b = sPixels[pIdx + 2];

      if (activeChannel === "mask") {
        // Pure grayscale mask visualizer: Black = 0 (background), White = 255 (foreground), Gray = boundary
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
      } else if (activeChannel === "original") {
        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = 255;
      } else {
        // Default white composite #FFFFFF
        const aNorm = a / 255;
        data[pIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
        data[pIdx + 1] = Math.round(g * aNorm + 255 * (1 - aNorm));
        data[pIdx + 2] = Math.round(b * aNorm + 255 * (1 - aNorm));
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [width, height, sourceImageData, activeChannel]);

  // Redraw ONLY the dirty region modified by the brush stroke (draws only the brush region)
  const redrawCanvasRegion = useCallback(
    (minX: number, minY: number, maxX: number, maxY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !alphaMaskRef.current || !sourceImageData) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = width;
      const h = height;
      const mask = alphaMaskRef.current;
      const sPixels = sourceImageData.data;

      const cMinX = Math.max(0, Math.floor(minX));
      const cMaxX = Math.min(w - 1, Math.ceil(maxX));
      const cMinY = Math.max(0, Math.floor(minY));
      const cMaxY = Math.min(h - 1, Math.ceil(maxY));

      const subW = cMaxX - cMinX + 1;
      const subH = cMaxY - cMinY + 1;
      if (subW <= 0 || subH <= 0) return;

      const imgData = ctx.createImageData(subW, subH);
      const data = imgData.data;

      let dIdx = 0;
      for (let y = cMinY; y <= cMaxY; y++) {
        const yOff = y * w;
        for (let x = cMinX; x <= cMaxX; x++) {
          const i = yOff + x;
          const pIdx = i * 4;
          const a = mask[i];
          const r = sPixels[pIdx];
          const g = sPixels[pIdx + 1];
          const b = sPixels[pIdx + 2];

          if (activeChannel === "mask") {
            data[dIdx] = a;
            data[dIdx + 1] = a;
            data[dIdx + 2] = a;
            data[dIdx + 3] = 255;
          } else if (activeChannel === "transparent") {
            data[dIdx] = r;
            data[dIdx + 1] = g;
            data[dIdx + 2] = b;
            data[dIdx + 3] = a;
          } else if (activeChannel === "pink") {
            const aNorm = a / 255;
            data[dIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
            data[dIdx + 1] = Math.round(g * aNorm + 240 * (1 - aNorm));
            data[dIdx + 2] = Math.round(b * aNorm + 245 * (1 - aNorm));
            data[dIdx + 3] = 255;
          } else if (activeChannel === "original") {
            data[dIdx] = r;
            data[dIdx + 1] = g;
            data[dIdx + 2] = b;
            data[dIdx + 3] = 255;
          } else {
            // Default white composite #FFFFFF
            const aNorm = a / 255;
            data[dIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
            data[dIdx + 1] = Math.round(g * aNorm + 255 * (1 - aNorm));
            data[dIdx + 2] = Math.round(b * aNorm + 255 * (1 - aNorm));
            data[dIdx + 3] = 255;
          }
          dIdx += 4;
        }
      }

      ctx.putImageData(imgData, cMinX, cMinY);
    },
    [width, height, sourceImageData, activeChannel]
  );

  useEffect(() => {
    if (isEditMode) {
      redrawCanvas();
    }
  }, [isEditMode, activeChannel, redrawCanvas]);

  // Push current mask to history snapshot before each stroke (max 20 states)
  const saveSnapshotToHistory = useCallback(() => {
    if (!alphaMaskRef.current) return;
    const snapshot = new Uint8ClampedArray(alphaMaskRef.current);
    setHistory((prev) => {
      const next = [...prev, snapshot];
      return next.length > MAX_HISTORY_STATES
        ? next.slice(next.length - MAX_HISTORY_STATES)
        : next;
    });
    setRedoStack([]); // Clear redo stack on new action
    setIsDirty(true);
  }, []);

  // ── Brush Mathematics & Radial Gradient Falloff ──
  const applyBrushCircle = useCallback(
    (
      cx: number,
      cy: number,
      tool: BrushTool,
      radius: number,
      hardnessRatio: number
    ) => {
      if (!alphaMaskRef.current) return;
      const mask = alphaMaskRef.current;
      const baseMask = baseAlphaMaskRef.current;
      const w = width;
      const h = height;

      const rSq = radius * radius;
      const minX = Math.max(0, Math.floor(cx - radius));
      const maxX = Math.min(w - 1, Math.ceil(cx + radius));
      const minY = Math.max(0, Math.floor(cy - radius));
      const maxY = Math.min(h - 1, Math.ceil(cy + radius));

      // Track dirty bounding box for targeted sub-region redraw
      if (!dirtyRectRef.current) {
        dirtyRectRef.current = { minX, minY, maxX, maxY };
      } else {
        dirtyRectRef.current.minX = Math.min(dirtyRectRef.current.minX, minX);
        dirtyRectRef.current.minY = Math.min(dirtyRectRef.current.minY, minY);
        dirtyRectRef.current.maxX = Math.max(dirtyRectRef.current.maxX, maxX);
        dirtyRectRef.current.maxY = Math.max(dirtyRectRef.current.maxY, maxY);
      }

      for (let y = minY; y <= maxY; y++) {
        const dy = y - cy;
        const yOff = y * w;
        for (let x = minX; x <= maxX; x++) {
          const dx = x - cx;
          const distSq = dx * dx + dy * dy;
          if (distSq <= rSq) {
            const d = Math.sqrt(distSq);
            const u = d / radius; // Normalized distance [0..1]
            let weight = 1.0;

            if (hardnessRatio < 0.99) {
              if (u > hardnessRatio) {
                const t = (u - hardnessRatio) / (1 - hardnessRatio);
                // Cubic Hermite smoothstep falloff
                weight = Math.max(0, 1 - (3 * t * t - 2 * t * t * t));
              }
            }

            const idx = yOff + x;
            const currentAlpha = mask[idx];

            if (tool === "keep") {
              // Keep Brush: Paints white (255) onto the mask, restoring foreground areas
              mask[idx] = Math.round(currentAlpha + (255 - currentAlpha) * weight);
            } else if (tool === "remove") {
              // Remove Brush: Paints black (0) onto the mask, removing unwanted background
              mask[idx] = Math.round(currentAlpha * (1 - weight));
            } else if (tool === "soft") {
              // Soft Edge Brush: Paints semi-transparent feathering (~128) with smooth radial gradient
              const targetVal = 128;
              mask[idx] = Math.round(currentAlpha + (targetVal - currentAlpha) * (weight * 0.45));
            } else if (tool === "eraser") {
              // Eraser: Removes mask content, restoring the original AI segmentation
              if (baseMask) {
                const baseVal = baseMask[idx];
                mask[idx] = Math.round(currentAlpha + (baseVal - currentAlpha) * weight);
              }
            }
          }
        }
      }
    },
    [width, height]
  );

  // Stroke Interpolation: Paints along path between (x0, y0) and (x1, y1)
  const applyBrushStroke = useCallback(
    (x0: number, y0: number, x1: number, y1: number) => {
      const radius = Math.max(1, Math.round(brushSize / 2));
      const hardnessRatio =
        activeTool === "soft"
          ? Math.min(0.2, brushHardness / 100) // Soft Edge Brush enforces gentle feathering
          : Math.max(0, Math.min(1, brushHardness / 100));

      const dist = Math.hypot(x1 - x0, y1 - y0);
      const step = Math.max(1, radius / 3);
      const steps = Math.ceil(dist / step);

      for (let i = 0; i <= steps; i++) {
        const t = steps > 0 ? i / steps : 0;
        const px = x0 + (x1 - x0) * t;
        const py = y0 + (y1 - y0) * t;
        applyBrushCircle(px, py, activeTool, radius, hardnessRatio);
      }
    },
    [brushSize, brushHardness, activeTool, applyBrushCircle]
  );

  // ── Exact Coordinate Mapping with Zoom and Pan Invariance ──
  const getMaskCoordinates = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };

      // Bounding box mapping: exactly accounts for client position, canvas scale, and pan
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      const maskX = Math.min(width - 1, Math.floor(normX * width));
      const maskY = Math.min(height - 1, Math.floor(normY * height));

      return { x: maskX, y: maskY };
    },
    [width, height]
  );

  // Pointer event handlers with Pointer Capture for seamless dragging
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === "pan") {
      setIsPanning(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      return;
    }

    if (!alphaMaskRef.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    // Save snapshot for Undo (one snapshot at pointerdown)
    saveSnapshotToHistory();

    const { x, y } = getMaskCoordinates(e);
    lastPointRef.current = { x, y };
    setIsDrawing(true);

    applyBrushStroke(x, y, x, y);
    if (dirtyRectRef.current) {
      const { minX, minY, maxX, maxY } = dirtyRectRef.current;
      redrawCanvasRegion(minX, minY, maxX, maxY);
      dirtyRectRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (!isDrawing || !lastPointRef.current) return;
    const { x, y } = getMaskCoordinates(e);
    const last = lastPointRef.current;

    applyBrushStroke(last.x, last.y, x, y);
    lastPointRef.current = { x, y };

    if (!animFrameIdRef.current) {
      animFrameIdRef.current = requestAnimationFrame(() => {
        if (dirtyRectRef.current) {
          const { minX, minY, maxX, maxY } = dirtyRectRef.current;
          redrawCanvasRegion(minX, minY, maxX, maxY);
          dirtyRectRef.current = null;
        }
        animFrameIdRef.current = null;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer already released
    }

    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDrawing) {
      setIsDrawing(false);
      lastPointRef.current = null;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (dirtyRectRef.current) {
        const { minX, minY, maxX, maxY } = dirtyRectRef.current;
        redrawCanvasRegion(minX, minY, maxX, maxY);
        dirtyRectRef.current = null;
      }
    }
  };

  // Undo & Redo Handlers (Max 20 snapshots)
  const handleUndo = useCallback(() => {
    if (history.length === 0 || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    const prevSnapshot = history[history.length - 1];
    setRedoStack((r) => [...r, new Uint8ClampedArray(alphaMaskRef.current!)]);
    alphaMaskRef.current.set(prevSnapshot);
    setHistory((h) => h.slice(0, -1));
    redrawCanvas();
    setIsDirty(true);
  }, [history, redrawCanvas]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    const nextSnapshot = redoStack[redoStack.length - 1];
    setHistory((h) => [...h, new Uint8ClampedArray(alphaMaskRef.current!)]);
    alphaMaskRef.current.set(nextSnapshot);
    setRedoStack((r) => r.slice(0, -1));
    redrawCanvas();
    setIsDirty(true);
  }, [redoStack, redrawCanvas]);

  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const handleRedoRef = useRef(handleRedo);
  handleRedoRef.current = handleRedo;

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z) - registered only once
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedoRef.current();
        } else {
          handleUndoRef.current();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedoRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // "Apply Corrections": Commits changes and updates all composite views
  const handleApplyCorrections = useCallback(async () => {
    if (!alphaMaskRef.current) return;
    cyberAudio.playSuccessChime();
    setHasAppliedCorrections(true);
    setIsDirty(false);
    committedAlphaMaskRef.current = new Uint8ClampedArray(alphaMaskRef.current);
    await recompositeAll(alphaMaskRef.current);
  }, [recompositeAll]);

  // "Cancel Changes": Discards uncommitted strokes made during this session
  const handleCancelChanges = useCallback(() => {
    if (!committedAlphaMaskRef.current || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    alphaMaskRef.current.set(committedAlphaMaskRef.current);
    redrawCanvas();
    setIsDirty(false);
  }, [redrawCanvas]);

  // "Reset Mask": Reverts working mask back to initial AI segmentation
  const handleResetMask = useCallback(async () => {
    if (!baseAlphaMaskRef.current || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    saveSnapshotToHistory();
    setHasAppliedCorrections(false);
    setIsDirty(false);
    alphaMaskRef.current.set(baseAlphaMaskRef.current);
    committedAlphaMaskRef.current = new Uint8ClampedArray(baseAlphaMaskRef.current);
    redrawCanvas();
    await recompositeAll(alphaMaskRef.current);
  }, [saveSnapshotToHistory, redrawCanvas, recompositeAll]);

  // "Export Transparent PNG": Full resolution composite with genuine alpha channel
  const handleExportTransparentPng = useCallback(async () => {
    cyberAudio.playClick();
    const timestamp = Date.now();
    let downloadUrl = "";
    const activeMask = alphaMaskRef.current;

    if (originalFile && activeMask) {
      try {
        const fullRes = await exportAtFullResolution(
          originalFile,
          activeMask,
          width,
          height,
          "transparent"
        );
        downloadUrl = fullRes.dataUrl;
      } catch (err) {
        console.warn("Full-resolution export error, falling back to working canvas:", err);
      }
    }

    if (!downloadUrl) {
      downloadUrl = currentTransparentUrl || transparentUrl;
    }

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `PLP-Cutout-Transparent-${mode}-${timestamp}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up temporary Object URL
    setTimeout(() => {
      try {
        URL.revokeObjectURL(downloadUrl);
      } catch {
        // Ignore revocation errors
      }
    }, 5000);
  }, [originalFile, width, height, mode, currentTransparentUrl, transparentUrl]);

  // 1-Click Download for active preview channel
  const handleDownload = useCallback(async () => {
    cyberAudio.playClick();
    const timestamp = Date.now();
    let downloadUrl = "";
    let filename = "";
    const activeMask = alphaMaskRef.current;

    if (
      originalFile &&
      activeMask &&
      (activeChannel === "transparent" || activeChannel === "white" || activeChannel === "pink")
    ) {
      try {
        const fullRes = await exportAtFullResolution(
          originalFile,
          activeMask,
          width,
          height,
          activeChannel
        );
        downloadUrl = fullRes.dataUrl;
      } catch (err) {
        console.warn("Full-resolution export error, falling back to canvas:", err);
      }
    }

    if (!downloadUrl) {
      if (activeChannel === "transparent") {
        downloadUrl = currentTransparentUrl || transparentUrl;
      } else if (activeChannel === "pink") {
        downloadUrl = pinkCompositeUrl || activeDisplayUrl;
      } else if (activeChannel === "mask") {
        downloadUrl = currentAlphaMaskUrl || initialAlphaMaskUrl || transparentUrl;
      } else {
        downloadUrl = whiteCompositeUrl || activeDisplayUrl;
      }
    }

    if (activeChannel === "transparent") {
      filename = `PLP-Cutout-Transparent-${mode}-${timestamp}.png`;
    } else if (activeChannel === "pink") {
      filename = `PLP-Solution-Pink-FFF0F5-${mode}-${timestamp}.png`;
    } else if (activeChannel === "mask") {
      filename = `PLP-AlphaMask-Debug-${mode}-${timestamp}.png`;
    } else {
      filename = `PLP-Product-White-FFFFFF-${mode}-${timestamp}.png`;
    }

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      try {
        URL.revokeObjectURL(downloadUrl);
      } catch {
        // Ignore
      }
    }, 5000);
  }, [
    originalFile,
    activeChannel,
    width,
    height,
    mode,
    currentTransparentUrl,
    transparentUrl,
    pinkCompositeUrl,
    activeDisplayUrl,
    currentAlphaMaskUrl,
    initialAlphaMaskUrl,
    whiteCompositeUrl,
  ]);

  // Provenance Label
  const provenanceText = hasAppliedCorrections
    ? "Manual mask corrections applied"
    : `${processingLabel} — ${provider}`;

  return (
    <div className="flex flex-col gap-4 font-mono">
      {/* ── Status & Provenance Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs">
        <div data-testid="provenance-badge" className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-950/50 text-cyan-300 px-2.5 py-1 text-[11px] font-bold tracking-wider shadow-[0_0_12px_rgba(0,240,255,0.2)]"
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>Browser AI result — @imgly/isnet_fp16</span>
          </span>
          {hasAppliedCorrections && (
            <span
              data-testid="corrections-badge"
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-950/50 text-amber-300 px-2.5 py-1 text-[11px] font-bold tracking-wider shadow-[0_0_12px_rgba(245,158,11,0.2)]"
            >
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>Manual mask corrections applied</span>
            </span>
          )}
          <span className="hidden sm:inline text-slate-500">·</span>
          <span className="text-slate-400 text-[11px]">
            Engine: <strong className="text-white">@imgly/isnet_fp16</strong>
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
          title="Inspect edge alpha & halo boundary (Black = 0, White = 255)"
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

      {/* ── Manual Mask Refinement Studio Toolbar ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3.5 text-xs shadow-inner">
        {/* Top Control Bar: Studio Toggle, Undo, Redo, Apply & Cancel */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
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
            <span className="text-[11px] text-slate-500 hidden md:inline">
              (Refines alpha mask directly before final compositing)
            </span>
          </div>

          {/* Action Buttons: Undo, Redo, Reset Mask, Cancel, Apply Corrections */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length === 0}
              className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Undo stroke (Ctrl+Z)"
            >
              <Undo2 className="h-3 w-3" />
              <span className="text-[10px]">Undo</span>
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Redo stroke (Ctrl+Y)"
            >
              <Redo2 className="h-3 w-3" />
              <span className="text-[10px]">Redo</span>
            </button>

            <button
              type="button"
              onClick={handleResetMask}
              className="flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-950/40 px-2.5 py-1 text-[10px] text-rose-300 hover:bg-rose-900/60 transition-colors"
              title="Reset mask back to initial AI segmentation"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Mask</span>
            </button>

            {isDirty && (
              <button
                type="button"
                onClick={handleCancelChanges}
                className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300 hover:text-white transition-colors"
                title="Discard unapplied changes"
              >
                <X className="h-3 w-3" />
                <span>Cancel Changes</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleApplyCorrections}
              disabled={!isDirty && hasAppliedCorrections}
              className={`flex items-center gap-1 rounded-md px-3 py-1 text-[10px] font-bold transition-all ${
                isDirty
                  ? "bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse"
                  : "border border-emerald-500/40 bg-emerald-950/60 text-emerald-300"
              }`}
              title="Re-composite preview channels with corrected mask"
            >
              <Check className="h-3 w-3" />
              <span>Apply Corrections</span>
            </button>
          </div>
        </div>

        {/* Brush Tools & Settings Deck */}
        {isEditMode && (
          <div className="flex flex-col gap-3 pt-1">
            {/* Tool Selection Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* 1. Keep Brush */}
                <button
                  type="button"
                  onClick={() => setActiveTool("keep")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                    activeTool === "keep"
                      ? "bg-emerald-900/90 border border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-emerald-300"
                  }`}
                  title="Paints white/opaque (α = 255) to restore missing foreground details"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                  <span>Keep Brush</span>
                </button>

                {/* 2. Remove Brush */}
                <button
                  type="button"
                  onClick={() => setActiveTool("remove")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                    activeTool === "remove"
                      ? "bg-rose-900/90 border border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-rose-300"
                  }`}
                  title="Paints black/transparent (α = 0) to carve away background"
                >
                  <Scissors className="h-3 w-3 text-rose-400" />
                  <span>Remove Brush</span>
                </button>

                {/* 3. Soft Edge Brush */}
                <button
                  type="button"
                  onClick={() => setActiveTool("soft")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                    activeTool === "soft"
                      ? "bg-cyan-900/90 border border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-cyan-300"
                  }`}
                  title="Paints partially transparent gray alpha values for hair flyaways & soft edges"
                >
                  <Feather className="h-3 w-3 text-cyan-400" />
                  <span>Soft Edge Brush</span>
                </button>

                {/* 4. Eraser */}
                <button
                  type="button"
                  onClick={() => setActiveTool("eraser")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                    activeTool === "eraser"
                      ? "bg-sky-900/90 border border-sky-400 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-sky-300"
                  }`}
                  title="Erases brush strokes back to original AI mask content"
                >
                  <RotateCcw className="h-3 w-3 text-sky-400" />
                  <span>Eraser</span>
                </button>

                {/* 5. Pan Tool */}
                <button
                  type="button"
                  onClick={() => setActiveTool("pan")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                    activeTool === "pan"
                      ? "bg-amber-900/90 border border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-amber-300"
                  }`}
                  title="Pan and navigate around zoomed canvas"
                >
                  <Hand className="h-3 w-3 text-amber-400" />
                  <span>Pan</span>
                </button>
              </div>

              {/* Zoom Presets: 100%, 200%, 400% */}
              <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                <span className="text-[10px] text-slate-500 mr-1">ZOOM:</span>
                {[1, 2, 4].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => {
                      setZoom(z);
                      if (z === 1) setPanOffset({ x: 0, y: 0 });
                    }}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                      zoom === z
                        ? "bg-cyan-500 text-black"
                        : "bg-slate-900 text-slate-400 hover:text-white"
                    }`}
                  >
                    {z * 100}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                  className="rounded p-1 bg-slate-900 text-slate-400 hover:text-white"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3 w-3" />
                </button>
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
                  className="rounded p-1 bg-slate-900 text-slate-400 hover:text-white ml-0.5"
                  title="Reset Zoom & Pan"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Sliders: Brush Size & Brush Hardness/Softness */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5">
              {/* Brush Size Slider */}
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-between w-24 text-[10.5px] text-slate-300">
                  <span>Size:</span>
                  <span className="font-bold text-cyan-400">{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="100"
                  step="1"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <div className="flex items-center gap-1">
                  {[6, 16, 32, 60].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setBrushSize(sz)}
                      className={`rounded px-1 py-0.5 text-[9px] ${
                        brushSize === sz
                          ? "bg-cyan-500 text-black font-bold"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brush Hardness / Softness Slider */}
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-between w-28 text-[10.5px] text-slate-300">
                  <span>Hardness:</span>
                  <span className="font-bold text-cyan-400">{brushHardness}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={brushHardness}
                  onChange={(e) => setBrushHardness(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="text-[10px] text-slate-500 font-sans whitespace-nowrap">
                  {brushHardness <= 25
                    ? "Feathered"
                    : brushHardness >= 85
                    ? "Sharp"
                    : "Balanced"}
                </span>
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
            ? "border-indigo-500/40 shadow-[0_0_35px_rgba(99,102,241,0.12)] bg-slate-950"
            : activeChannel === "mask"
            ? "border-amber-500/40 shadow-[0_0_35px_rgba(245,158,11,0.12)] bg-black"
            : "border-cyan-500/40 shadow-[0_0_35px_rgba(0,240,255,0.12)] bg-slate-950"
        }`}
        style={{ minHeight: 400 }}
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
            className="relative overflow-hidden flex items-center justify-center"
            style={{
              transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
              transformOrigin: "center center",
              transition: isPanning ? "none" : "transform 0.1s ease-out",
              cursor: activeTool === "pan" ? "grab" : "crosshair",
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
              onPointerCancel={handlePointerUp}
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
              ? "Export Transparent PNG (Alpha Channel)"
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
            onClick={handleExportTransparentPng}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/60 px-3.5 py-1.5 text-cyan-300 hover:bg-cyan-900/70 hover:text-white transition-colors shadow-[0_0_12px_rgba(0,240,255,0.2)] font-bold"
          >
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            <span>Export Transparent PNG</span>
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
