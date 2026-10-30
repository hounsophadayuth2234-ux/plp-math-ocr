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
  Square,
  Trash2,
  Zap,
} from "lucide-react";
import {
  compositeWithSolidColor,
  createAlphaMaskDataUrl,
  recompositeAlphaMask,
  exportAtFullResolution,
  refineAlphaMattingWithMask,
  BgRemovalOutput,
  ProcessingStageMetrics,
} from "@/lib/bg-removal-client";
import {
  generateExportFilename,
  detectContainerAndContents,
  generateTrimap,
  generateMaskOverlay,
  refineMaskWithGuidedFilter,
  computeMaskDiagnostics,
  applyAreaSafetyCheck,
  MaskDiagnostics,
  SelectionMode,
  QuadCorners,
  detectDocumentQuad,
  generateQuadMask,
  warpPerspectiveQuad,
  applyColorDehalo,
  isolatePersonMask,
  combinePersonWithSelectedRegions,
  extractTextStrokeMask,
  extractPersonMask,
  combinePersonAndTextMasks,
  generatePersonTextLayerOverlay,
} from "@/lib/bg-compositor";
import { cyberAudio } from "@/lib/cyber-audio";
import { ProcessingStatusLabel } from "@/lib/types";
import { BeforeAfterSlider } from "@/components/image-upscaler/BeforeAfterSlider";
import { generateBgRemoverSmartName } from "@/lib/smart-naming";
import {
  getTelemetrySnapshot,
  getTelemetrySnapshotSync,
  TelemetryDiagnostics,
} from "@/lib/hardware-diagnostics";

export type ViewChannel =
  | "white"
  | "pink"
  | "custom"
  | "transparent"
  | "cutout"
  | "person_mask"
  | "text_mask"
  | "combined_mask"
  | "initial_mask"
  | "refined_mask"
  | "mask"
  | "mask_compare"
  | "overlay"
  | "original"
  | "split";

export type BrushTool =
  | "keep"
  | "keep_person"
  | "keep_text"
  | "remove"
  | "keep_rect"
  | "erase_rect"
  | "soft"
  | "eraser"
  | "pan"
  | "positive_point"
  | "negative_point";

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
  sourceWidth?: number;
  sourceHeight?: number;
  wasDownscaled?: boolean;
  mode: "preview" | "final" | "worker";
  initialPurpose?: "white" | "pink" | "transparent";
  provider?: string;
  processingLabel?: ProcessingStatusLabel;
  metrics?: ProcessingStageMetrics;
  diagnostics?: MaskDiagnostics;
  rollbackTriggered?: boolean;
  previousResult?: BgRemovalOutput | null;
  onRestorePreviousResult?: () => void;
  onReset: () => void;
  onRerunFinal?: (targetMaxDim?: number) => void;
  isProcessingFinal?: boolean;
  workflowStep?: "detecting" | "edit_mask" | "refining" | "ready" | "failed";
  onConfirmMask?: (mask: Uint8ClampedArray) => void;
  initialSelectionMode?: SelectionMode;
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
  sourceWidth,
  sourceHeight,
  wasDownscaled,
  mode,
  initialPurpose = "white",
  provider = "@imgly/isnet_fp16",
  processingLabel = "Browser AI result",
  metrics,
  diagnostics,
  rollbackTriggered,
  previousResult,
  onRestorePreviousResult,
  onReset,
  onRerunFinal,
  isProcessingFinal = false,
  workflowStep = "ready",
  onConfirmMask,
  initialSelectionMode = "whole_product",
}: ColorStudioProps) {
  // ── Selection Mode & Confirmation State ──
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(initialSelectionMode);
  const [containerWarning, setContainerWarning] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(workflowStep === "ready");

  // ── Safety & Diagnostics State ──
  const [localDiagnostics, setLocalDiagnostics] = useState<MaskDiagnostics | null>(diagnostics || null);
  const [telemetry, setTelemetry] = useState<TelemetryDiagnostics>(() => getTelemetrySnapshotSync());

  useEffect(() => {
    getTelemetrySnapshot().then(setTelemetry).catch(() => {});
  }, [metrics, width, height, sourceWidth, sourceHeight]);

  const [rollbackBanner, setRollbackBanner] = useState<string | null>(
    rollbackTriggered
      ? diagnostics?.warning ||
        "⚠️ We kept the safer mask because edge refinement removed possible foreground details (Automatic safety rollback engaged).\nYou can refine it manually with Keep/Erase brush."
      : null
  );
  const [initialAlphaMaskDataUrl, setInitialAlphaMaskDataUrl] = useState<string>(initialAlphaMaskUrl || "");
  const [maskOverlayDataUrl, setMaskOverlayDataUrl] = useState<string>("");
  const [documentCorners, setDocumentCorners] = useState<QuadCorners | null>(null);
  const [isPerspectiveMode, setIsPerspectiveMode] = useState<boolean>(false);

  useEffect(() => {
    setIsConfirmed(workflowStep === "ready");
  }, [workflowStep]);

  useEffect(() => {
    if (diagnostics) {
      setLocalDiagnostics(diagnostics);
      if (diagnostics.rollbackTriggered) {
        setRollbackBanner(
          diagnostics.warning ||
            `⚠️ We kept the safer mask because edge refinement removed possible foreground details (${diagnostics.removedAreaPercentage.toFixed(1)}% removed).\nYou can refine it manually with Keep/Erase brush.`
        );
      }
    }
  }, [diagnostics]);

  // ── Channel & Preview State (Default to user's selected purpose) ──
  const [activeChannel, setActiveChannel] = useState<ViewChannel>(initialPurpose || "white");
  const [customColor, setCustomColor] = useState<string>("#3b82f6");
  const [whiteCompositeUrl, setWhiteCompositeUrl] = useState<string>(initialCompositeUrl);
  const [pinkCompositeUrl, setPinkCompositeUrl] = useState<string>("");
  const [currentTransparentUrl, setCurrentTransparentUrl] = useState<string>(transparentUrl);
  const [currentAlphaMaskUrl, setCurrentAlphaMaskUrl] = useState<string>(initialAlphaMaskUrl || "");
  const [, setCurrentTransparentBlob] = useState<Blob>(transparentBlob);
  const [isCompositing, setIsCompositing] = useState(false);

  // ── Manual Mask Refinement Studio State (Open & active for manual corrections) ──
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(true);
  const [isEditMode, setIsEditMode] = useState(true);
  const [activeTool, setActiveTool] = useState<BrushTool>("keep");
  const [brushSize, setBrushSize] = useState<number>(20);
  const [brushHardness, setBrushHardness] = useState<number>(80); // 0 = ultra soft, 100 = hard edge
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDirty, setIsDirty] = useState(false);
  const [hasAppliedCorrections, setHasAppliedCorrections] = useState(false);

  // ── Edge Refinement Mode (Default: "off") & Auto-Crop Option ──
  const [edgeRefinementMode, setEdgeRefinementMode] = useState<"off" | "balanced" | "fine">("off");
  const [autoCropExport, setAutoCropExport] = useState<boolean>(false);
  const [customExportFilename, setCustomExportFilename] = useState<string>("");
  const [foregroundAreaPercent, setForegroundAreaPercent] = useState<number>(0);

  // ── Rectangle Selection Box & Cursor State ──
  const [rectBox, setRectBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  const rectClientStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDrawingRectRef = useRef<boolean>(false);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  // ── In-Memory Grayscale Alpha Mask Buffers (Length = width * height) ──
  // Working alpha mask currently being painted
  const alphaMaskRef = useRef<Uint8ClampedArray | null>(null);
  // Unchangeable base AI mask from @imgly/isnet_fp16
  const baseAlphaMaskRef = useRef<Uint8ClampedArray | null>(null);
  // Last committed/applied state for "Cancel Changes"
  const committedAlphaMaskRef = useRef<Uint8ClampedArray | null>(null);
  // Optional excluded mask (e.g. stripped cardboard box) to prevent trimap bleed
  const excludedMaskRef = useRef<Uint8ClampedArray | null>(null);
  // User's manual keep strokes strictly preserved
  const manualKeepMaskRef = useRef<Uint8ClampedArray | null>(null);

  // ── Person + Text Only Sub-options & State ──
  const [subOptionPerson, setSubOptionPerson] = useState<boolean>(true);
  const [subOptionText, setSubOptionText] = useState<boolean>(true);
  const [subOptionGraphics, setSubOptionGraphics] = useState<boolean>(false);
  const personMaskRef = useRef<Uint8ClampedArray | null>(null);
  const textMaskRef = useRef<Uint8ClampedArray | null>(null);
  const graphicsMaskRef = useRef<Uint8ClampedArray | null>(null);
  const [personTextDiagnostics, setPersonTextDiagnostics] = useState<{
    personArea: number;
    textArea: number;
    graphicsArea: number;
    combinedArea: number;
    textComponentCount: number;
    smallComponentCount: number;
    keptPixelPercentage: number;
    warning?: string;
  } | null>(null);

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
    manualKeepMaskRef.current = new Uint8ClampedArray(totalPixels);

    if (initialAlphaBuffer && initialAlphaBuffer.length === totalPixels) {
      alphaMaskRef.current = new Uint8ClampedArray(initialAlphaBuffer);
      baseAlphaMaskRef.current = new Uint8ClampedArray(initialAlphaBuffer);
      committedAlphaMaskRef.current = new Uint8ClampedArray(initialAlphaBuffer);

      let fg = 0;
      for (let i = 0; i < totalPixels; i++) {
        if (initialAlphaBuffer[i] > 128) fg++;
      }
      setForegroundAreaPercent(totalPixels > 0 ? (fg / totalPixels) * 100 : 0);

      const initMaskUrl = createAlphaMaskDataUrl(initialAlphaBuffer, width, height);
      setInitialAlphaMaskDataUrl(initMaskUrl);

      if (sourceImageData) {
        const overlayPixels = generateMaskOverlay(sourceImageData.data, initialAlphaBuffer, width, height);
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const cCtx = c.getContext("2d");
        if (cCtx) {
          const id = cCtx.createImageData(width, height);
          id.data.set(overlayPixels);
          cCtx.putImageData(id, 0, 0);
          setMaskOverlayDataUrl(c.toDataURL("image/png"));
        }
      }
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
          let fg = 0;
          for (let i = 0; i < totalPixels; i++) {
            const a = data[i * 4 + 3];
            buf[i] = a;
            if (a > 128) fg++;
          }
          setForegroundAreaPercent(totalPixels > 0 ? (fg / totalPixels) * 100 : 0);
          alphaMaskRef.current = buf;
          baseAlphaMaskRef.current = new Uint8ClampedArray(buf);
          committedAlphaMaskRef.current = new Uint8ClampedArray(buf);
          const initMaskUrl = createAlphaMaskDataUrl(buf, width, height);
          setInitialAlphaMaskDataUrl(initMaskUrl);
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

    // Extract person and text masks so Text Mask and Person Mask previews are immediately ready before export
    if (sourceImageData) {
      try {
        const pRes = extractPersonMask(sourceImageData.data, baseAlphaMaskRef.current, width, height);
        const tRes = extractTextStrokeMask(sourceImageData.data, width, height);
        personMaskRef.current = pRes.personMask;
        textMaskRef.current = tRes.textStrokeMask;
        graphicsMaskRef.current = tRes.graphicsMask;

        if (initialSelectionMode === "person_text_only" || initialSelectionMode === "person_plus_text") {
          const combined = combinePersonAndTextMasks(
            pRes.personMask,
            tRes.textStrokeMask,
            width,
            height,
            {
              keepPerson: true,
              keepText: true,
              keepGraphics: false,
              graphicsMask: tRes.graphicsMask,
            }
          );
          setPersonTextDiagnostics(combined.diagnostics);
        }
      } catch (err) {
        console.warn("Failed to extract initial person/text masks:", err);
      }
    }

    // Clear undo history & dirty states when a new image or buffer is uploaded
    queueMicrotask(() => {
      setHistory([]);
      setRedoStack([]);
      setIsDirty(false);
      setHasAppliedCorrections(false);
    });

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
      manualKeepMaskRef.current = null;
    };
  }, [initialAlphaBuffer, transparentUrl, width, height, sourceImageData]);

  // Pre-generate initial pink composite (#FADADD)
  useEffect(() => {
    let cancelled = false;
    compositeWithSolidColor(transparentBlob, "#FADADD").then(({ dataUrl }) => {
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
      case "cutout":
        return currentTransparentUrl || transparentUrl;
      case "initial_mask":
        return initialAlphaMaskDataUrl || currentAlphaMaskUrl || transparentUrl;
      case "refined_mask":
      case "mask":
        return currentAlphaMaskUrl || initialAlphaMaskUrl || transparentUrl;
      case "overlay":
        return maskOverlayDataUrl || currentTransparentUrl || transparentUrl;
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
    initialAlphaMaskDataUrl,
    currentAlphaMaskUrl,
    initialAlphaMaskUrl,
    maskOverlayDataUrl,
    initialCompositeUrl,
    originalUrl,
  ]);

  // Auto-generate smart download filename when image or channel updates
  useEffect(() => {
    if (originalFile?.name) {
      const autoName = generateBgRemoverSmartName({
        originalName: originalFile.name,
        channel: activeChannel === "custom" ? "custom" : (activeChannel as "transparent" | "white" | "pink" | "mask"),
        mode,
        width: originalFile && (sourceWidth || sourceHeight) ? (sourceWidth || width) : width,
        height: originalFile && (sourceWidth || sourceHeight) ? (sourceHeight || height) : height,
      });
      setCustomExportFilename(autoName);
    }
  }, [originalFile, activeChannel, mode, width, height, sourceWidth, sourceHeight]);

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

        // 3-Color Mask Diagnostics Overlay (Green=Foreground, Yellow=Edge, Red=Background)
        const overlayPixels = generateMaskOverlay(sourceImageData.data, mask, width, height);
        const overlayCanvas = document.createElement("canvas");
        overlayCanvas.width = width;
        overlayCanvas.height = height;
        const oCtx = overlayCanvas.getContext("2d");
        if (oCtx) {
          const oImg = oCtx.createImageData(width, height);
          oImg.data.set(overlayPixels);
          oCtx.putImageData(oImg, 0, 0);
          setMaskOverlayDataUrl(overlayCanvas.toDataURL("image/png"));
        }

        // Live mask diagnostics update
        if (baseAlphaMaskRef.current) {
          const diag = computeMaskDiagnostics(baseAlphaMaskRef.current, mask, width, height, 0.20);
          setLocalDiagnostics(diag);
          if (diag.rollbackTriggered) {
            setRollbackBanner(diag.warning || "Automatic safety rollback engaged to prevent over-cutting white lids/boxes.");
          } else {
            setRollbackBanner(null);
          }
        }
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
    const baseMask = baseAlphaMaskRef.current;
    const sPixels = sourceImageData.data;
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;
    const total = w * h;

    if (activeChannel === "text_mask" && !textMaskRef.current && sourceImageData) {
      try {
        const tRes = extractTextStrokeMask(sourceImageData.data, width, height);
        textMaskRef.current = tRes.textStrokeMask;
        graphicsMaskRef.current = tRes.graphicsMask;
      } catch (e) {
        console.warn("Failed lazy text mask extraction", e);
      }
    }

    for (let i = 0; i < total; i++) {
      const pIdx = i * 4;
      const a = mask[i];
      const r = sPixels[pIdx];
      const g = sPixels[pIdx + 1];
      const b = sPixels[pIdx + 2];

      if (activeChannel === "initial_mask") {
        const initA = baseMask ? baseMask[i] : a;
        data[pIdx] = initA;
        data[pIdx + 1] = initA;
        data[pIdx + 2] = initA;
        data[pIdx + 3] = 255;
      } else if (activeChannel === "mask_compare") {
        // Real Before/After Mask Comparison: Left = Before AI Mask, Right = After Refined/Edited Mask
        const splitX = Math.floor(width / 2);
        const curX = i % width;
        const baseA = baseMask ? baseMask[i] : a;
        if (Math.abs(curX - splitX) <= 1) {
          // Sharp divider line: bright cyan indicator (#00f0ff)
          data[pIdx] = 0;
          data[pIdx + 1] = 240;
          data[pIdx + 2] = 255;
          data[pIdx + 3] = 255;
        } else if (curX < splitX) {
          // Left: Before AI Raw Mask (clean grayscale)
          data[pIdx] = baseA;
          data[pIdx + 1] = baseA;
          data[pIdx + 2] = baseA;
          data[pIdx + 3] = 255;
        } else {
          // Right: After Refined / User-Edited Mask
          // Highlight differences: Green tint if kept/restored, Red tint if removed/erased
          if (a > baseA + 20) {
            data[pIdx] = 34;
            data[pIdx + 1] = 197;
            data[pIdx + 2] = 94;
            data[pIdx + 3] = 255;
          } else if (a < baseA - 20) {
            data[pIdx] = 239;
            data[pIdx + 1] = 68;
            data[pIdx + 2] = 68;
            data[pIdx + 3] = 255;
          } else {
            data[pIdx] = a;
            data[pIdx + 1] = a;
            data[pIdx + 2] = a;
            data[pIdx + 3] = 255;
          }
        }
      } else if (activeChannel === "person_mask") {
        // Blue overlay for person mask (#3b82f6)
        const pVal = personMaskRef.current ? personMaskRef.current[i] : a;
        if (pVal > 128) {
          data[pIdx] = Math.round(r * 0.35 + 59 * 0.65);
          data[pIdx + 1] = Math.round(g * 0.35 + 130 * 0.65);
          data[pIdx + 2] = Math.round(b * 0.35 + 246 * 0.65);
          data[pIdx + 3] = 255;
        } else {
          data[pIdx] = Math.round(r * 0.6 + 60);
          data[pIdx + 1] = Math.round(g * 0.3);
          data[pIdx + 2] = Math.round(b * 0.3);
          data[pIdx + 3] = 255;
        }
      } else if (activeChannel === "text_mask") {
        // Yellow overlay for text mask (#eab308)
        const tVal = textMaskRef.current ? textMaskRef.current[i] : a;
        if (tVal > 128) {
          data[pIdx] = Math.round(r * 0.2 + 234 * 0.8);
          data[pIdx + 1] = Math.round(g * 0.2 + 179 * 0.8);
          data[pIdx + 2] = Math.round(b * 0.2 + 8 * 0.8);
          data[pIdx + 3] = 255;
        } else {
          data[pIdx] = Math.round(r * 0.4);
          data[pIdx + 1] = Math.round(g * 0.4);
          data[pIdx + 2] = Math.round(b * 0.4);
          data[pIdx + 3] = 255;
        }
      } else if (activeChannel === "combined_mask") {
        // Green overlay for combined keep mask (#22c55e)
        if (a > 128) {
          data[pIdx] = Math.round(r * 0.35 + 34 * 0.65);
          data[pIdx + 1] = Math.round(g * 0.35 + 197 * 0.65);
          data[pIdx + 2] = Math.round(b * 0.35 + 94 * 0.65);
          data[pIdx + 3] = 255;
        } else {
          data[pIdx] = Math.round(r * 0.6 + 80);
          data[pIdx + 1] = Math.round(g * 0.2);
          data[pIdx + 2] = Math.round(b * 0.2);
          data[pIdx + 3] = 255;
        }
      } else if (activeChannel === "mask" || activeChannel === "refined_mask") {
        // Pure grayscale mask visualizer: Black = 0 (background), White = 255 (foreground), Gray = boundary
        data[pIdx] = a;
        data[pIdx + 1] = a;
        data[pIdx + 2] = a;
        data[pIdx + 3] = 255;
      } else if (activeChannel === "transparent" || activeChannel === "cutout") {
        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = a;
      } else if (activeChannel === "pink") {
        // Soft Portrait Pink #FADADD (250, 218, 221)
        const aNorm = a / 255;
        data[pIdx] = Math.round(r * aNorm + 250 * (1 - aNorm));
        data[pIdx + 1] = Math.round(g * aNorm + 218 * (1 - aNorm));
        data[pIdx + 2] = Math.round(b * aNorm + 221 * (1 - aNorm));
        data[pIdx + 3] = 255;
      } else if (activeChannel === "overlay") {
        // 3-color diagnostic overlay:
        // Green: Definite Foreground (a > 200)
        // Yellow: Uncertain Boundary Edge (55 <= a <= 200)
        // Red: Removed Background (a < 55)
        if (a > 200) {
          data[pIdx] = Math.round(r * 0.55 + 34 * 0.45);
          data[pIdx + 1] = Math.round(g * 0.55 + 197 * 0.45);
          data[pIdx + 2] = Math.round(b * 0.55 + 94 * 0.45);
          data[pIdx + 3] = 255;
        } else if (a >= 55) {
          data[pIdx] = Math.round(r * 0.50 + 234 * 0.50);
          data[pIdx + 1] = Math.round(g * 0.50 + 179 * 0.50);
          data[pIdx + 2] = Math.round(b * 0.50 + 8 * 0.50);
          data[pIdx + 3] = 255;
        } else {
          data[pIdx] = Math.round(r * 0.65 + 239 * 0.35);
          data[pIdx + 1] = Math.round(g * 0.65 + 68 * 0.35);
          data[pIdx + 2] = Math.round(b * 0.65 + 68 * 0.35);
          data[pIdx + 3] = 255;
        }
      } else if (activeChannel === "original") {
        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = 255;
      } else if (activeChannel === "custom") {
        const cR = parseInt(customColor.slice(1, 3), 16) || 0;
        const cG = parseInt(customColor.slice(3, 5), 16) || 0;
        const cB = parseInt(customColor.slice(5, 7), 16) || 0;
        const aNorm = a / 255;
        data[pIdx] = Math.round(r * aNorm + cR * (1 - aNorm));
        data[pIdx + 1] = Math.round(g * aNorm + cG * (1 - aNorm));
        data[pIdx + 2] = Math.round(b * aNorm + cB * (1 - aNorm));
        data[pIdx + 3] = 255;
      } else {
        // Default Off-White / Light Gray composite #F4F5F7 (244, 245, 247)
        const aNorm = a / 255;
        data[pIdx] = Math.round(r * aNorm + 244 * (1 - aNorm));
        data[pIdx + 1] = Math.round(g * aNorm + 245 * (1 - aNorm));
        data[pIdx + 2] = Math.round(b * aNorm + 247 * (1 - aNorm));
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [width, height, sourceImageData, activeChannel, customColor]);

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

          if (activeChannel === "initial_mask") {
            const initA = baseAlphaMaskRef.current ? baseAlphaMaskRef.current[i] : a;
            data[dIdx] = initA;
            data[dIdx + 1] = initA;
            data[dIdx + 2] = initA;
            data[dIdx + 3] = 255;
          } else if (activeChannel === "mask" || activeChannel === "refined_mask") {
            data[dIdx] = a;
            data[dIdx + 1] = a;
            data[dIdx + 2] = a;
            data[dIdx + 3] = 255;
          } else if (activeChannel === "transparent" || activeChannel === "cutout") {
            data[dIdx] = r;
            data[dIdx + 1] = g;
            data[dIdx + 2] = b;
            data[dIdx + 3] = a;
          } else if (activeChannel === "pink") {
            // Soft Portrait Pink #FADADD (250, 218, 221)
            const aNorm = a / 255;
            data[dIdx] = Math.round(r * aNorm + 250 * (1 - aNorm));
            data[dIdx + 1] = Math.round(g * aNorm + 218 * (1 - aNorm));
            data[dIdx + 2] = Math.round(b * aNorm + 221 * (1 - aNorm));
            data[dIdx + 3] = 255;
          } else if (activeChannel === "overlay") {
            if (a > 200) {
              data[dIdx] = Math.round(r * 0.55 + 34 * 0.45);
              data[dIdx + 1] = Math.round(g * 0.55 + 197 * 0.45);
              data[dIdx + 2] = Math.round(b * 0.55 + 94 * 0.45);
              data[dIdx + 3] = 255;
            } else if (a >= 55) {
              data[dIdx] = Math.round(r * 0.50 + 234 * 0.50);
              data[dIdx + 1] = Math.round(g * 0.50 + 179 * 0.50);
              data[dIdx + 2] = Math.round(b * 0.50 + 8 * 0.50);
              data[dIdx + 3] = 255;
            } else {
              data[dIdx] = Math.round(r * 0.65 + 239 * 0.35);
              data[dIdx + 1] = Math.round(g * 0.65 + 68 * 0.35);
              data[dIdx + 2] = Math.round(b * 0.65 + 68 * 0.35);
              data[dIdx + 3] = 255;
            }
          } else if (activeChannel === "original") {
            data[dIdx] = r;
            data[dIdx + 1] = g;
            data[dIdx + 2] = b;
            data[dIdx + 3] = 255;
          } else {
            // Default Off-White / Light Gray composite #F4F5F7 (244, 245, 247)
            const aNorm = a / 255;
            data[dIdx] = Math.round(r * aNorm + 244 * (1 - aNorm));
            data[dIdx + 1] = Math.round(g * aNorm + 245 * (1 - aNorm));
            data[dIdx + 2] = Math.round(b * aNorm + 247 * (1 - aNorm));
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

            if (tool === "keep" || tool === "keep_person" || tool === "keep_text") {
              // Keep Brush: Paints white (255) onto the mask, restoring foreground areas
              mask[idx] = Math.round(currentAlpha + (255 - currentAlpha) * weight);
              if (manualKeepMaskRef.current && weight > 0.5) {
                manualKeepMaskRef.current[idx] = 255;
              }
              if (tool === "keep_text" && textMaskRef.current && weight > 0.5) {
                textMaskRef.current[idx] = 255;
              }
              if (tool === "keep_person" && personMaskRef.current && weight > 0.5) {
                personMaskRef.current[idx] = 255;
              }
            } else if (tool === "remove") {
              // Remove Brush: Paints black (0) onto the mask, removing unwanted background
              mask[idx] = Math.round(currentAlpha * (1 - weight));
              if (manualKeepMaskRef.current && weight > 0.5) {
                manualKeepMaskRef.current[idx] = 0;
              }
              if (textMaskRef.current && weight > 0.5) {
                textMaskRef.current[idx] = 0;
              }
              if (personMaskRef.current && weight > 0.5) {
                personMaskRef.current[idx] = 0;
              }
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
              if (manualKeepMaskRef.current) {
                manualKeepMaskRef.current[idx] = 0;
              }
            } else if (tool === "positive_point") {
              // Positive Click: stamps solid opaque (255) onto mask
              mask[idx] = 255;
              if (manualKeepMaskRef.current) {
                manualKeepMaskRef.current[idx] = 255;
              }
            } else if (tool === "negative_point") {
              // Negative Click: stamps solid background (0) onto mask
              mask[idx] = 0;
              if (manualKeepMaskRef.current) {
                manualKeepMaskRef.current[idx] = 0;
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

  const updateForegroundPercentage = useCallback(() => {
    if (!alphaMaskRef.current) return;
    const mask = alphaMaskRef.current;
    const total = width * height;
    let fg = 0;
    for (let i = 0; i < total; i++) {
      if (mask[i] > 128) fg++;
    }
    setForegroundAreaPercent(total > 0 ? (fg / total) * 100 : 0);
  }, [width, height]);

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

    if (activeTool === "keep_rect" || activeTool === "erase_rect") {
      rectStartRef.current = { x, y };
      rectClientStartRef.current = { x: e.clientX, y: e.clientY };
      isDrawingRectRef.current = true;
      setIsDrawing(true);
      return;
    }

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

    if (canvasContainerRef.current) {
      const containerRect = canvasContainerRef.current.getBoundingClientRect();
      setCursorPos({ x: e.clientX - containerRect.left, y: e.clientY - containerRect.top });
    }

    if (isDrawingRectRef.current && rectClientStartRef.current && canvasContainerRef.current) {
      const containerRect = canvasContainerRef.current.getBoundingClientRect();
      const left = Math.min(rectClientStartRef.current.x, e.clientX) - containerRect.left;
      const top = Math.min(rectClientStartRef.current.y, e.clientY) - containerRect.top;
      const w = Math.abs(e.clientX - rectClientStartRef.current.x);
      const h = Math.abs(e.clientY - rectClientStartRef.current.y);
      setRectBox({ left, top, width: w, height: h });
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

    if (isDrawingRectRef.current && rectStartRef.current && alphaMaskRef.current) {
      const { x, y } = getMaskCoordinates(e);
      const minX = Math.max(0, Math.min(rectStartRef.current.x, x));
      const maxX = Math.min(width - 1, Math.max(rectStartRef.current.x, x));
      const minY = Math.max(0, Math.min(rectStartRef.current.y, y));
      const maxY = Math.min(height - 1, Math.max(rectStartRef.current.y, y));

      const fillVal = activeTool === "keep_rect" ? 255 : 0;
      const mask = alphaMaskRef.current;
      for (let ry = minY; ry <= maxY; ry++) {
        const yOff = ry * width;
        for (let rx = minX; rx <= maxX; rx++) {
          const idx = yOff + rx;
          mask[idx] = fillVal;
          if (manualKeepMaskRef.current) {
            manualKeepMaskRef.current[idx] = fillVal;
          }
        }
      }

      redrawCanvasRegion(minX, minY, maxX, maxY);
      updateForegroundPercentage();
      setRectBox(null);
      isDrawingRectRef.current = false;
      rectStartRef.current = null;
      rectClientStartRef.current = null;
      setIsDrawing(false);
      setIsDirty(true);
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
      updateForegroundPercentage();
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
    updateForegroundPercentage();
    setIsDirty(true);
  }, [history, redrawCanvas, updateForegroundPercentage]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    const nextSnapshot = redoStack[redoStack.length - 1];
    setHistory((h) => [...h, new Uint8ClampedArray(alphaMaskRef.current!)]);
    alphaMaskRef.current.set(nextSnapshot);
    setRedoStack((r) => r.slice(0, -1));
    redrawCanvas();
    updateForegroundPercentage();
    setIsDirty(true);
  }, [redoStack, redrawCanvas, updateForegroundPercentage]);

  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);

  useEffect(() => {
    handleUndoRef.current = handleUndo;
    handleRedoRef.current = handleRedo;
  }, [handleUndo, handleRedo]);

  // "Clear Mask": Sets entire mask to 0 (empty background)
  const handleClearMask = useCallback(async () => {
    if (!alphaMaskRef.current) return;
    cyberAudio.playClick();
    saveSnapshotToHistory();
    alphaMaskRef.current.fill(0);
    if (manualKeepMaskRef.current) {
      manualKeepMaskRef.current.fill(0);
    }
    updateForegroundPercentage();
    await recompositeAll(alphaMaskRef.current);
    redrawCanvas();
    setIsDirty(true);
  }, [saveSnapshotToHistory, updateForegroundPercentage, recompositeAll, redrawCanvas]);

  // "Reset Mask": Reverts working mask back to initial AI segmentation
  const handleResetMask = useCallback(async () => {
    if (!baseAlphaMaskRef.current || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    saveSnapshotToHistory();
    setHasAppliedCorrections(false);
    setIsDirty(false);
    alphaMaskRef.current.set(baseAlphaMaskRef.current);
    committedAlphaMaskRef.current = new Uint8ClampedArray(baseAlphaMaskRef.current);
    if (manualKeepMaskRef.current) {
      manualKeepMaskRef.current.fill(0);
    }
    updateForegroundPercentage();
    redrawCanvas();
    await recompositeAll(alphaMaskRef.current);
  }, [saveSnapshotToHistory, updateForegroundPercentage, redrawCanvas, recompositeAll]);

  // "Use Original Image": Completely keeps original image (mask filled with 255)
  const handleUseOriginalImage = useCallback(async () => {
    if (!alphaMaskRef.current) return;
    cyberAudio.playClick();
    saveSnapshotToHistory();
    alphaMaskRef.current.fill(255);
    if (manualKeepMaskRef.current) {
      manualKeepMaskRef.current.fill(255);
    }
    updateForegroundPercentage();
    await recompositeAll(alphaMaskRef.current);
    redrawCanvas();
    setIsDirty(true);
  }, [saveSnapshotToHistory, updateForegroundPercentage, recompositeAll, redrawCanvas]);

  const handleResetMaskRef = useRef(handleResetMask);
  useEffect(() => {
    handleResetMaskRef.current = handleResetMask;
  }, [handleResetMask]);

  // Keyboard shortcuts (B Keep, E Erase, Z Undo, Y Redo, R Reset)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedoRef.current();
        } else {
          handleUndoRef.current();
        }
      } else if ((e.ctrlKey || e.metaKey) && key === "y") {
        e.preventDefault();
        handleRedoRef.current();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (key === "b") {
          e.preventDefault();
          setActiveTool("keep");
          setIsEditMode(true);
        } else if (key === "e") {
          e.preventDefault();
          setActiveTool("remove");
          setIsEditMode(true);
        } else if (key === "z") {
          e.preventDefault();
          handleUndoRef.current();
        } else if (key === "y") {
          e.preventDefault();
          handleRedoRef.current();
        } else if (key === "r") {
          e.preventDefault();
          handleResetMaskRef.current();
        }
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
    updateForegroundPercentage();
    redrawCanvas();
    setIsDirty(false);
  }, [updateForegroundPercentage, redrawCanvas]);

  // Switch Selection Mode (document_poster, person, whole_product, contents_only, custom, box_polygon)
  const handleSwitchSelectionMode = useCallback(
    async (newMode: SelectionMode) => {
      cyberAudio.playClick();
      setSelectionMode(newMode);
      setIsConfirmed(false);
      if (!sourceImageData || !alphaMaskRef.current || !baseAlphaMaskRef.current) return;

      saveSnapshotToHistory();

      if (newMode === "document_poster" || newMode === "whole_poster") {
        const docResult = detectDocumentQuad(sourceImageData.data, width, height);
        const quadMask = generateQuadMask(docResult.corners, width, height);
        alphaMaskRef.current.set(quadMask);
        setDocumentCorners(docResult.corners);
        excludedMaskRef.current = null;
        setContainerWarning(
          docResult.isFullImage
            ? "📄 [POSTER/DOCUMENT] រក្សាទំព័រ និងខ្លឹមសារទាំងស្រុង (Full poster page preserved intact)."
            : "📄 [POSTER/DOCUMENT] រកឃើញព្រំដែនទំព័រ (Document boundary detected. Outside page is transparent)."
        );
      } else if (newMode === "person" || newMode === "person_only") {
        const pMask = isolatePersonMask(sourceImageData.data, baseAlphaMaskRef.current, width, height);
        alphaMaskRef.current.set(pMask);
        excludedMaskRef.current = null;
        setContainerWarning("👤 [PERSON ONLY] កាត់យករូបមនុស្ស មិនរក្សាទុកអក្សរបោះពុម្ព ឬក្រាហ្វិកខាងក្រៅឡើយ។");
      } else if (newMode === "person_text_only" || newMode === "person_plus_text") {
        const pRes = extractPersonMask(sourceImageData.data, baseAlphaMaskRef.current, width, height);
        const tRes = extractTextStrokeMask(sourceImageData.data, width, height);
        personMaskRef.current = pRes.personMask;
        textMaskRef.current = tRes.textStrokeMask;
        graphicsMaskRef.current = tRes.graphicsMask;

        const combined = combinePersonAndTextMasks(pRes.personMask, tRes.textStrokeMask, width, height, {
          keepPerson: subOptionPerson,
          keepText: subOptionText,
          keepGraphics: subOptionGraphics,
          graphicsMask: tRes.graphicsMask,
          userKeepMask: manualKeepMaskRef.current,
        });

        alphaMaskRef.current.set(combined.finalKeepMask);
        excludedMaskRef.current = null;
        setPersonTextDiagnostics(combined.diagnostics);
        setIsEditMode(true);
        setActiveTool("keep_text");
        setContainerWarning(
          combined.diagnostics.warning ||
            "✨ [PERSON + TEXT ONLY / រក្សាមនុស្ស + អក្សរតែប៉ុណ្ណោះ] រក្សារូបមនុស្ស និងអក្សរដែលបានរកឃើញ ដោយលុបផ្ទាំងខាងក្រោយនៃ Poster ចេញ។"
        );
      } else if (newMode === "contents_only") {
        const res = detectContainerAndContents(
          sourceImageData.data,
          baseAlphaMaskRef.current,
          width,
          height,
          { mode: "contents_only", conservative: false }
        );
        if (res.hasContainer) {
          alphaMaskRef.current.set(res.contentsMask);
          excludedMaskRef.current = res.containerMask;
          setContainerWarning(
            res.warning ||
              "⚠️ [BETA - EXPERIMENTAL] Cardboard box detected. In 'Keep Contents Only' mode, outer packaging is stripped."
          );
        } else {
          excludedMaskRef.current = null;
          setContainerWarning(
            "ℹ️ មិនមានប្រអប់ធំត្រូវបានរកឃើញទេ។ (No distinct container detected.)"
          );
        }
      } else if (newMode === "whole_product") {
        alphaMaskRef.current.set(baseAlphaMaskRef.current);
        excludedMaskRef.current = null;
        setContainerWarning(null);
      } else if (newMode === "custom") {
        setIsEditMode(true);
        setActiveTool("positive_point");
      } else if (newMode === "box_polygon") {
        setIsEditMode(true);
      }

      await recompositeAll(alphaMaskRef.current);
      redrawCanvas();
    },
    [sourceImageData, width, height, subOptionPerson, subOptionText, subOptionGraphics, saveSnapshotToHistory, recompositeAll, redrawCanvas]
  );

  // Toggle Sub-Options for Person + Text Only mode (Person, Text, Graphics)
  const handleToggleSubOption = useCallback(
    async (option: "person" | "text" | "graphics") => {
      if (!sourceImageData || !alphaMaskRef.current) return;
      cyberAudio.playClick();
      saveSnapshotToHistory();

      const nextP = option === "person" ? !subOptionPerson : subOptionPerson;
      const nextT = option === "text" ? !subOptionText : subOptionText;
      const nextG = option === "graphics" ? !subOptionGraphics : subOptionGraphics;

      if (option === "person") setSubOptionPerson(nextP);
      if (option === "text") setSubOptionText(nextT);
      if (option === "graphics") setSubOptionGraphics(nextG);

      if (!personMaskRef.current || !textMaskRef.current) {
        const pRes = extractPersonMask(sourceImageData.data, baseAlphaMaskRef.current, width, height);
        const tRes = extractTextStrokeMask(sourceImageData.data, width, height);
        personMaskRef.current = pRes.personMask;
        textMaskRef.current = tRes.textStrokeMask;
        graphicsMaskRef.current = tRes.graphicsMask;
      }

      const combined = combinePersonAndTextMasks(
        personMaskRef.current,
        textMaskRef.current,
        width,
        height,
        {
          keepPerson: nextP,
          keepText: nextT,
          keepGraphics: nextG,
          graphicsMask: graphicsMaskRef.current,
          userKeepMask: manualKeepMaskRef.current,
        }
      );

      alphaMaskRef.current.set(combined.finalKeepMask);
      setPersonTextDiagnostics(combined.diagnostics);
      if (combined.diagnostics.warning) {
        setContainerWarning(combined.diagnostics.warning);
      }
      await recompositeAll(alphaMaskRef.current);
      redrawCanvas();
    },
    [subOptionPerson, subOptionText, subOptionGraphics, sourceImageData, width, height, saveSnapshotToHistory, recompositeAll, redrawCanvas]
  );

  // Reset to AI Masks (Recomputes independent person & text stroke segmentation from scratch)
  const handleResetToAiMasks = useCallback(async () => {
    if (!sourceImageData || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    saveSnapshotToHistory();
    if (manualKeepMaskRef.current) {
      manualKeepMaskRef.current.fill(0);
    }
    const pRes = extractPersonMask(sourceImageData.data, baseAlphaMaskRef.current, width, height);
    const tRes = extractTextStrokeMask(sourceImageData.data, width, height);
    personMaskRef.current = pRes.personMask;
    textMaskRef.current = tRes.textStrokeMask;
    graphicsMaskRef.current = tRes.graphicsMask;

    const combined = combinePersonAndTextMasks(
      pRes.personMask,
      tRes.textStrokeMask,
      width,
      height,
      {
        keepPerson: subOptionPerson,
        keepText: subOptionText,
        keepGraphics: subOptionGraphics,
        graphicsMask: tRes.graphicsMask,
      }
    );
    alphaMaskRef.current.set(combined.finalKeepMask);
    setPersonTextDiagnostics(combined.diagnostics);
    await recompositeAll(alphaMaskRef.current);
    redrawCanvas();
  }, [sourceImageData, width, height, subOptionPerson, subOptionText, subOptionGraphics, saveSnapshotToHistory, recompositeAll, redrawCanvas]);

  // Document / Poster Handlers
  const handleDetectPageBoundary = useCallback(async () => {
    if (!sourceImageData || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    saveSnapshotToHistory();
    const docResult = detectDocumentQuad(sourceImageData.data, width, height);
    const quadMask = generateQuadMask(docResult.corners, width, height);
    alphaMaskRef.current.set(quadMask);
    setDocumentCorners(docResult.corners);
    setContainerWarning(
      docResult.isFullImage
        ? "📄 [POSTER/DOCUMENT] រក្សាទំព័រ និងខ្លឹមសារទាំងស្រុង (Full poster page preserved intact)."
        : "📄 [POSTER/DOCUMENT] រកឃើញព្រំដែនទំព័រ (Document boundary detected. Outside page is transparent)."
    );
    await recompositeAll(alphaMaskRef.current);
    redrawCanvas();
  }, [sourceImageData, width, height, saveSnapshotToHistory, recompositeAll, redrawCanvas]);

  const handleKeepOriginalPage = useCallback(async () => {
    if (!alphaMaskRef.current) return;
    cyberAudio.playClick();
    saveSnapshotToHistory();
    alphaMaskRef.current.fill(255);
    if (manualKeepMaskRef.current) {
      manualKeepMaskRef.current.fill(255);
    }
    await recompositeAll(alphaMaskRef.current);
    redrawCanvas();
    setIsDirty(true);
  }, [saveSnapshotToHistory, recompositeAll, redrawCanvas]);

  const handleWarpPerspective = useCallback(async () => {
    if (!sourceImageData) return;
    cyberAudio.playShutter();
    const corners = documentCorners || {
      topLeft: [0, 0],
      topRight: [width - 1, 0],
      bottomRight: [width - 1, height - 1],
      bottomLeft: [0, height - 1],
    };
    const warped = warpPerspectiveQuad(sourceImageData.data, width, height, corners);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        const imgData = ctx.createImageData(warped.width, warped.height);
        imgData.data.set(warped.warpedRgba);
        canvasRef.current.width = warped.width;
        canvasRef.current.height = warped.height;
        ctx.putImageData(imgData, 0, 0);
      }
    }
  }, [sourceImageData, width, height, documentCorners]);

  const handleTransparentOutsidePage = useCallback(async () => {
    if (!sourceImageData || !alphaMaskRef.current) return;
    cyberAudio.playClick();
    saveSnapshotToHistory();

    let corners = documentCorners;
    if (!corners) {
      const docResult = detectDocumentQuad(sourceImageData.data, width, height);
      if (docResult.hasDocumentBoundary && !docResult.isFullImage) {
        corners = docResult.corners;
        setDocumentCorners(corners);
      }
    }

    if (corners) {
      const quadMask = generateQuadMask(corners, width, height);
      alphaMaskRef.current.set(quadMask);
      setContainerWarning(
        "📄 [POSTER/DOCUMENT] កំណត់ផ្ទៃខាងក្រៅឱ្យថ្លា (Transparent outside page polygon applied. Inside page remains 100% byte-identical)."
      );
    } else {
      alphaMaskRef.current.fill(255);
      setContainerWarning(
        "📄 [POSTER/DOCUMENT] រក្សាទំព័រពេញលេញ (Full canvas preserved as page boundary was uncertain)."
      );
    }

    await recompositeAll(alphaMaskRef.current);
    redrawCanvas();
    setIsDirty(true);
  }, [sourceImageData, width, height, documentCorners, saveSnapshotToHistory, recompositeAll, redrawCanvas]);

  const handleResetDocument = useCallback(async () => {
    if (!alphaMaskRef.current) return;
    cyberAudio.playClick();
    saveSnapshotToHistory();
    setDocumentCorners(null);
    setIsPerspectiveMode(false);
    alphaMaskRef.current.fill(255);
    if (manualKeepMaskRef.current) {
      manualKeepMaskRef.current.fill(255);
    }
    setContainerWarning(null);
    setActiveChannel(initialPurpose || "white");
    await recompositeAll(alphaMaskRef.current);
    redrawCanvas();
    setIsDirty(false);
    if (onReset) onReset();
  }, [saveSnapshotToHistory, initialPurpose, onReset, recompositeAll, redrawCanvas]);

  // Confirm Mask & Run Alpha Matting Refinement with Automated Safety Check
  const handleConfirmMaskAndExport = useCallback(async () => {
    if (!alphaMaskRef.current || !sourceImageData) return;
    cyberAudio.playShutter();
    setIsConfirmed(true);
    setIsCompositing(true);
    try {
      if (onConfirmMask) {
        onConfirmMask(alphaMaskRef.current);
      }

      // If user selected "No Refinement" (off by default): preserve the authoritative edited mask directly!
      if (edgeRefinementMode === "off") {
        await recompositeAll(alphaMaskRef.current);
        redrawCanvas();
        updateForegroundPercentage();
        cyberAudio.playMetallicDing();
        return;
      }

      // Otherwise run narrow boundary guided matting with 10% safety rollback
      const initialMask = baseAlphaMaskRef.current || alphaMaskRef.current;
      const refinedOutput = await refineAlphaMattingWithMask(
        sourceImageData,
        alphaMaskRef.current,
        excludedMaskRef.current,
        {
          mode: selectionMode,
          documentSafeMode:
            selectionMode === "document_poster" ||
            selectionMode === "whole_poster",
          quality: edgeRefinementMode === "fine" ? "fine_details" : "balanced",
          initialMask,
          manualKeepMask: manualKeepMaskRef.current,
          maxDropRatio: 0.10, // 10% safety drop limit
        }
      );
      alphaMaskRef.current.set(refinedOutput.alphaMaskBuffer);
      setLocalDiagnostics(refinedOutput.diagnostics || null);
      if (refinedOutput.rollbackTriggered) {
        setRollbackBanner(
          refinedOutput.diagnostics?.warning ||
            `We kept the safer mask because edge refinement removed possible foreground details (Automatic safety rollback engaged).\nYou can refine it manually with Keep/Erase brush.`
        );
      } else {
        setRollbackBanner(null);
      }
      await recompositeAll(refinedOutput.alphaMaskBuffer);
      redrawCanvas();
      updateForegroundPercentage();
      cyberAudio.playMetallicDing();
    } catch (e) {
      console.error("Mask confirmation refinement error:", e);
    } finally {
      setIsCompositing(false);
    }
  }, [sourceImageData, onConfirmMask, edgeRefinementMode, selectionMode, recompositeAll, redrawCanvas, updateForegroundPercentage]);

  // Export the current HTML5 Canvas composition locally using canvas.toBlob("image/png")
  const handleDownloadHdCanvasPng = useCallback(
    (forcedChannel?: ViewChannel) => {
      const targetChannel = forcedChannel || activeChannel;
      cyberAudio.playClick();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const w = width;
      const h = height;

      const triggerBlobDownload = (exportCanvas: HTMLCanvasElement, presetSuffix: string) => {
        exportCanvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          const baseStem = originalFile?.name
            ? originalFile.name.replace(/\.[a-zA-Z0-9]+$/i, "")
            : "plp-cutout";
          const sanitizedBase = customExportFilename.trim().replace(/\.[a-zA-Z0-9]+$/i, "");
          const filename = sanitizedBase
            ? `${sanitizedBase}-${presetSuffix}.png`
            : `${baseStem}-${presetSuffix}-${w}x${h}.png`;

          link.download = filename;
          link.href = url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          cyberAudio.playMetallicDing();

          // Revoke temporary download URL after use to avoid memory leaks
          setTimeout(() => {
            try {
              URL.revokeObjectURL(url);
            } catch {}
          }, 3000);
        }, "image/png");
      };

      if (targetChannel === activeChannel) {
        // Direct export from current active HTML5 Canvas
        const presetSuffix =
          targetChannel === "transparent"
            ? "transparent"
            : targetChannel === "pink"
            ? "soft-portrait-pink"
            : targetChannel === "white"
            ? "off-white"
            : targetChannel;
        triggerBlobDownload(canvas, presetSuffix);
      } else {
        // Offscreen canvas composite matching current mask and requested preset at processed canvas resolution
        const offCanvas = document.createElement("canvas");
        offCanvas.width = w;
        offCanvas.height = h;
        const oCtx = offCanvas.getContext("2d");
        if (!oCtx || !alphaMaskRef.current || !sourceImageData) {
          triggerBlobDownload(canvas, "processed");
          return;
        }

        const mask = alphaMaskRef.current;
        const sPixels = sourceImageData.data;
        const imgData = oCtx.createImageData(w, h);
        const data = imgData.data;
        const total = w * h;

        let rBg = 244, gBg = 245, bBg = 247;
        let isTrans = false;
        if (targetChannel === "pink") {
          rBg = 250; gBg = 218; bBg = 221;
        } else if (targetChannel === "custom") {
          rBg = parseInt(customColor.slice(1, 3), 16) || 0;
          gBg = parseInt(customColor.slice(3, 5), 16) || 0;
          bBg = parseInt(customColor.slice(5, 7), 16) || 0;
        } else if (targetChannel === "transparent" || targetChannel === "cutout") {
          isTrans = true;
        }

        for (let i = 0; i < total; i++) {
          const pIdx = i * 4;
          const a = mask[i];
          const r = sPixels[pIdx];
          const g = sPixels[pIdx + 1];
          const b = sPixels[pIdx + 2];
          if (isTrans) {
            data[pIdx] = r;
            data[pIdx + 1] = g;
            data[pIdx + 2] = b;
            data[pIdx + 3] = a;
          } else {
            const aNorm = a / 255;
            data[pIdx] = Math.round(r * aNorm + rBg * (1 - aNorm));
            data[pIdx + 1] = Math.round(g * aNorm + gBg * (1 - aNorm));
            data[pIdx + 2] = Math.round(b * aNorm + bBg * (1 - aNorm));
            data[pIdx + 3] = 255;
          }
        }
        oCtx.putImageData(imgData, 0, 0);
        const presetSuffix =
          targetChannel === "transparent"
            ? "transparent"
            : targetChannel === "pink"
            ? "soft-portrait-pink"
            : targetChannel === "white"
            ? "off-white"
            : targetChannel;
        triggerBlobDownload(offCanvas, presetSuffix);
      }
    },
    [activeChannel, width, height, originalFile, customExportFilename, sourceImageData, customColor]
  );

  const handleDownload = handleDownloadHdCanvasPng;

  // "Export Transparent PNG": Full resolution composite with genuine alpha channel
  const handleExportTransparentPng = useCallback(async () => {
    return handleDownload("transparent");
  }, [handleDownload]);

  const displayProvenance = useMemo(() => {
    if (mode === "worker") {
      return `Remote Worker — ${provider || "rembg / isnet-general-use"}`;
    }
    if (
      provider.includes("Manual") ||
      processingLabel.includes("Manual") ||
      provider === "Manual Edge Correction Studio"
    ) {
      return "Manual Mask Studio (User Defined)";
    }
    if (hasAppliedCorrections) {
      return "On-Device AI result — ISNet-FP16 + Manual Refinements";
    }
    return `On-Device AI result — ${provider || "ISNet-FP16"}`;
  }, [mode, provider, processingLabel, hasAppliedCorrections]);

  return (
    <div className="flex flex-col gap-4 font-mono">
      {/* ── Status & Truthful Telemetry Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-none border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs">
        <div data-testid="provenance-badge" className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-none border border-cyan-500/40 bg-cyan-950/50 text-cyan-300 px-2.5 py-1 text-[11px] font-bold tracking-wider shadow-[0_0_12px_rgba(0,240,255,0.2)]"
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>{displayProvenance}</span>
          </span>
          {hasAppliedCorrections && mode !== "worker" && !provider.includes("Manual") && (
            <span
              data-testid="corrections-badge"
              className="inline-flex items-center gap-1.5 rounded-none border border-amber-500/40 bg-amber-950/50 text-amber-300 px-2.5 py-1 text-[11px] font-bold tracking-wider shadow-[0_0_12px_rgba(245,158,11,0.2)]"
            >
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>កែគែមដោយដៃរួចរាល់ (Corrections Applied)</span>
            </span>
          )}
          <span className="hidden sm:inline text-slate-600">·</span>
          <span className="text-slate-300 text-[11px]">
            ប្រភពដើម: <strong className="text-white">{sourceWidth || width}×{sourceHeight || height}px</strong>
          </span>
          <span className="hidden sm:inline text-slate-600">·</span>
          <span className="text-slate-300 text-[11px]">
            ដំណើរការ: <strong className="text-cyan-300">{width}×{height}px</strong>
          </span>
          {metrics?.totalMs ? (
            <>
              <span className="hidden sm:inline text-slate-600">·</span>
              <span className="text-slate-300 text-[11px]" data-testid="timing-total">
                រយៈពេល: <strong className="text-emerald-300">{(metrics.totalMs / 1000).toFixed(2)}s</strong>
              </span>
              {(metrics.uploadDecodeMs !== undefined || metrics.segmentationMs !== undefined || metrics.mattingMs !== undefined) && (
                <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] text-slate-400 font-mono ml-1 border-l border-slate-800 pl-2">
                  {metrics.uploadDecodeMs !== undefined && <span>Decode: <strong className="text-slate-300">{metrics.uploadDecodeMs}ms</strong></span>}
                  {metrics.segmentationMs !== undefined && <span>Seg: <strong className="text-cyan-300">{metrics.segmentationMs}ms</strong></span>}
                  {metrics.maskRefineMs !== undefined && metrics.maskRefineMs > 0 && <span>Refine: <strong className="text-amber-300">{metrics.maskRefineMs}ms</strong></span>}
                  {metrics.mattingMs !== undefined && metrics.mattingMs > 0 && <span>Matte: <strong className="text-pink-300">{metrics.mattingMs}ms</strong></span>}
                  {metrics.encodingMs !== undefined && <span>Encode: <strong className="text-slate-300">{metrics.encodingMs}ms</strong></span>}
                </span>
              )}
            </>
          ) : metrics?.inferenceMs ? (
            <>
              <span className="hidden sm:inline text-slate-600">·</span>
              <span className="text-slate-300 text-[11px]">
                Inference: <strong className="text-emerald-300">{(metrics.inferenceMs / 1000).toFixed(2)}s</strong>
              </span>
            </>
          ) : null}
        </div>

        {/* Upgrade / Rerun Final Button */}
        {mode === "preview" && onRerunFinal && (
          <button
            type="button"
            disabled={isProcessingFinal}
            onClick={() => {
              if (isProcessingFinal) return;
              cyberAudio.playClick();
              onRerunFinal();
            }}
            className={`min-h-[44px] flex items-center gap-1.5 rounded-none border border-emerald-500/50 bg-emerald-950/40 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900/60 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.2)] uppercase tracking-wider ${
              isProcessingFinal ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              {isProcessingFinal
                ? "កំពុងដំណើរការ CLEAN CUT..."
                : `ដំណើរការកាត់ច្បាស់ (CLEAN CUT · ${Math.min(Math.max(sourceWidth || width, sourceHeight || height), 2048)}PX)`}
            </span>
          </button>
        )}
      </div>

      {/* Downscale note if image was scaled to fit device memory limits */}
      {wasDownscaled && (
        <div className="rounded-none border border-amber-500/30 bg-amber-950/30 px-3 py-1.5 text-[11px] text-amber-300 font-mono">
          ℹ️ កម្រិតរូបភាពត្រូវបានកំណត់ត្រឹម {Math.max(width, height)}px សម្រាប់ដំណើរការ AI ក្នុង Browser ដើម្បីរក្សាស្ថិរភាព។ ការទាញយកនឹងរក្សាភាពច្បាស់ពេញលេញ។
        </div>
      )}

      {/* ── Rollback Warning Banner if Foreground Area Drop > 20% ── */}
      {rollbackBanner && (
        <div
          data-testid="rollback-banner"
          className="flex items-start gap-3 p-3.5 border-2 border-amber-500 bg-amber-950/80 text-amber-200 font-mono shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse"
        >
          <span className="text-amber-400 text-lg">⚠️</span>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-300 uppercase tracking-wider text-xs">
                [ROLLBACK ENGAGED - CONSERVATIVE RESTORED]
              </span>
              <span className="text-[10px] bg-amber-900/90 text-amber-200 px-1.5 py-0.5 border border-amber-400 font-bold">
                SAFETY THRESHOLD EXCEEDED (&gt;20% DROP)
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-100 font-mono">
              {rollbackBanner}
            </p>
          </div>
        </div>
      )}

      {/* ── Mask Diagnostics & Telemetry HUD Panel (Collapsed by default) ── */}
      <details
        data-testid="mask-diagnostics-panel"
        open
        className="group rounded-none border border-slate-800 bg-slate-950/90 font-mono"
      >
        <summary className="cursor-pointer p-3 text-xs font-bold text-slate-400 hover:text-cyan-300 select-none flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-cyan-400" />
            <span>Advanced Diagnostics (Admin Only / ការវិភាគកម្រិតខ្ពស់)</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[9px] px-2 py-0.5 font-bold uppercase ${
                localDiagnostics?.rollbackTriggered
                  ? "bg-amber-950 border border-amber-500 text-amber-300"
                  : "bg-emerald-950 border border-emerald-500 text-emerald-300"
              }`}
            >
              {localDiagnostics?.rollbackTriggered ? "ROLLBACK ENGAGED" : "SAFETY PASS"}
            </span>
            <span className="text-[10px] text-cyan-400 group-open:rotate-180 transition-transform">▼</span>
          </div>
        </summary>

        <div className="p-3 pt-0 space-y-2 text-xs border-t border-slate-800/80 mt-2">
          {/* Hardware & Runtime Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px]">
            <div className="p-1.5 bg-slate-900/60 border border-slate-800">
              <div className="text-slate-500 text-[9px]">WEBGPU AVAILABLE</div>
              <div data-testid="diag-webgpu-available" className={`font-bold ${telemetry.webGpuAvailable ? "text-emerald-400" : "text-slate-400"}`}>
                {telemetry.webGpuAvailable ? "true" : "false"}
              </div>
            </div>
            <div className="p-1.5 bg-slate-900/60 border border-slate-800">
              <div className="text-slate-500 text-[9px]">ACTUAL BACKEND</div>
              <div data-testid="diag-actual-backend" className="font-bold text-cyan-300">
                {telemetry.actualBackend}
              </div>
            </div>
            <div className="p-1.5 bg-slate-900/60 border border-slate-800">
              <div className="text-slate-500 text-[9px]">COLD-START TIME</div>
              <div data-testid="diag-cold-start" className="font-bold text-slate-200">
                {telemetry.coldStartTimeMs ? `${telemetry.coldStartTimeMs} ms` : metrics?.totalMs ? `${metrics.totalMs} ms` : "N/A"}
              </div>
            </div>
            <div className="p-1.5 bg-slate-900/60 border border-slate-800">
              <div className="text-slate-500 text-[9px]">CACHED MODEL-LOAD</div>
              <div data-testid="diag-cached-load" className="font-bold text-slate-200">
                {telemetry.cachedModelLoadTimeMs ? `${telemetry.cachedModelLoadTimeMs} ms` : metrics?.modelLoadMs ? `${metrics.modelLoadMs} ms` : "cached"}
              </div>
            </div>
            <div className="p-1.5 bg-slate-900/60 border border-slate-800">
              <div className="text-slate-500 text-[9px]">INFERENCE TIME</div>
              <div data-testid="diag-inference-time" className="font-bold text-cyan-300">
                {telemetry.inferenceTimeMs ? `${telemetry.inferenceTimeMs} ms` : metrics?.inferenceMs ? `${metrics.inferenceMs} ms` : `${metrics?.segmentationMs || 0} ms`}
              </div>
            </div>
            <div className="p-1.5 bg-slate-900/60 border border-slate-800">
              <div className="text-slate-500 text-[9px]">INPUT DIMENSIONS</div>
              <div data-testid="diag-input-dim" className="font-bold text-slate-200">
                {sourceWidth || width}×{sourceHeight || height} px
              </div>
            </div>
            <div className="p-1.5 bg-slate-900/60 border border-slate-800 col-span-2">
              <div className="text-slate-500 text-[9px]">INFERENCE DIMENSIONS</div>
              <div data-testid="diag-inference-dim" className="font-bold text-slate-200">
                {width}×{height} px
              </div>
            </div>
          </div>

          {/* Safety & Retention Metrics */}
          {localDiagnostics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px] pt-1 border-t border-slate-800/80">
              <div className="p-1.5 bg-slate-900/40 border border-slate-800">
                <div className="text-slate-500 text-[9px]">INITIAL AREA</div>
                <div className="font-bold text-slate-200">{localDiagnostics.initialForegroundArea.toLocaleString()} px</div>
              </div>
              <div className="p-1.5 bg-slate-900/40 border border-slate-800">
                <div className="text-slate-500 text-[9px]">REFINED AREA</div>
                <div className="font-bold text-slate-200">{localDiagnostics.refinedForegroundArea.toLocaleString()} px</div>
              </div>
              <div className="p-1.5 bg-slate-900/40 border border-slate-800">
                <div className="text-slate-500 text-[9px]">AREA RETENTION</div>
                <div className={`font-bold ${(localDiagnostics.areaRetentionRatio < 0.8) ? "text-amber-400" : "text-emerald-400"}`}>
                  {(localDiagnostics.areaRetentionRatio * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-1.5 bg-slate-900/40 border border-slate-800">
                <div className="text-slate-500 text-[9px]">REMOVED RATIO</div>
                <div className="font-bold text-slate-200">{localDiagnostics.removedAreaPercentage.toFixed(1)}%</div>
              </div>
              <div className="p-1.5 bg-slate-900/40 border border-slate-800">
                <div className="text-slate-500 text-[9px]">COMPONENTS (&gt;20px)</div>
                <div className="font-bold text-cyan-300">{localDiagnostics.connectedComponentCount}</div>
              </div>
              <div className="p-1.5 bg-slate-900/40 border border-slate-800">
                <div className="text-slate-500 text-[9px]">HOLES (&gt;50px)</div>
                <div className="font-bold text-cyan-300">{localDiagnostics.interiorHoleCount}</div>
              </div>
              <div className="p-1.5 bg-slate-900/40 border border-slate-800 col-span-2">
                <div className="text-slate-500 text-[9px]">BOUNDING BOX</div>
                <div className="font-bold text-slate-200">
                  {localDiagnostics.boundingBox.width}×{localDiagnostics.boundingBox.height} px ({localDiagnostics.boundingBoxArea.toLocaleString()} px²)
                </div>
              </div>
            </div>
          )}
        </div>
      </details>

      {/* ── 7 Explicit Preview Tabs ── */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-none border border-cyan-500/30 bg-slate-950 p-2 text-xs font-mono">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider mr-1">PREVIEW:</span>
        <button
          type="button"
          data-testid="preview-tab-original"
          onClick={() => handleSelectChannel("original")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "original"
              ? "bg-slate-900 border-cyan-400 text-white shadow-[0_0_10px_rgba(0,240,255,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Original</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-initial-mask"
          onClick={() => handleSelectChannel("initial_mask")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "initial_mask"
              ? "bg-slate-900 border-slate-300 text-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <span>Initial AI Mask</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-edited-mask"
          onClick={() => handleSelectChannel("mask")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "mask" || activeChannel === "refined_mask"
              ? "bg-slate-900 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <span>Edited Mask</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-mask-compare"
          onClick={() => handleSelectChannel("mask_compare")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "mask_compare"
              ? "bg-slate-900 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <Sliders className="h-3.5 w-3.5 text-cyan-400" />
          <span>Mask Compare (Before vs After)</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-person-mask"
          onClick={() => handleSelectChannel("person_mask")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "person_mask"
              ? "bg-slate-900 border-blue-400 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <span className="h-2.5 w-2.5 bg-blue-500 rounded-none inline-block" />
          <span>Person Mask</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-text-mask"
          onClick={() => handleSelectChannel("text_mask")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "text_mask"
              ? "bg-slate-900 border-yellow-400 text-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <span className="h-2.5 w-2.5 bg-yellow-500 rounded-none inline-block" />
          <span>Text Mask</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-combined-mask"
          onClick={() => handleSelectChannel("combined_mask")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "combined_mask"
              ? "bg-slate-900 border-emerald-400 text-emerald-300 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <span className="h-2.5 w-2.5 bg-emerald-500 rounded-none inline-block" />
          <span>Combined Keep Mask</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-cutout"
          onClick={() => handleSelectChannel("cutout")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "cutout"
              ? "bg-slate-900 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <span>Cutout Preview</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-checkerboard"
          onClick={() => handleSelectChannel("transparent")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "transparent"
              ? "bg-slate-900 border-indigo-400 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <Grid className="h-3.5 w-3.5" />
          <span>Checkerboard</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-white"
          onClick={() => handleSelectChannel("white")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "white"
              ? "bg-slate-900 border-white text-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <span className="h-2.5 w-2.5 bg-white border border-slate-400 inline-block" />
          <span>White</span>
        </button>

        <button
          type="button"
          data-testid="preview-tab-custom"
          onClick={() => handleSelectChannel("custom")}
          className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 border font-bold text-xs transition-all ${
            activeChannel === "custom" || activeChannel === "pink"
              ? "bg-slate-900 border-emerald-400 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
              : "border-slate-800 text-slate-400 hover:text-white bg-slate-950/60"
          }`}
        >
          <span className="h-2.5 w-2.5 bg-emerald-400 border border-slate-400 inline-block" />
          <span>Custom</span>
        </button>
      </div>

      {/* ── 4-Channel Mask & Cutout Previews ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-none border border-slate-800 bg-slate-950 p-2 text-xs">
        <button
          type="button"
          data-testid="channel-initial-mask"
          onClick={() => handleSelectChannel("initial_mask")}
          className={`min-h-[44px] flex flex-col items-center justify-center p-2 transition-all font-mono ${
            activeChannel === "initial_mask"
              ? "bg-slate-900 border-2 border-slate-300 text-white font-bold shadow-[0_0_12px_rgba(255,255,255,0.2)]"
              : "border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <span className="text-xs font-bold">1. ម៉ាស់ដំបូង</span>
          <span className="text-[9px] text-slate-500">AI Initial Mask / ម៉ាស់ដំបូងពី AI</span>
        </button>

        <button
          type="button"
          data-testid="channel-refined-mask"
          onClick={() => handleSelectChannel("mask")}
          className={`min-h-[44px] flex flex-col items-center justify-center p-2 transition-all font-mono ${
            activeChannel === "mask" || activeChannel === "refined_mask"
              ? "bg-slate-900 border-2 border-amber-400 text-white font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)]"
              : "border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <span className="text-xs font-bold text-amber-300">2. ម៉ាស់សម្រួល</span>
          <span className="text-[9px] text-amber-400/80">Refined Alpha Mask</span>
        </button>

        <button
          type="button"
          data-testid="channel-overlay"
          onClick={() => handleSelectChannel("overlay")}
          className={`min-h-[44px] flex flex-col items-center justify-center p-2 transition-all font-mono ${
            activeChannel === "overlay"
              ? "bg-slate-900 border-2 border-emerald-400 text-white font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)]"
              : "border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <span className="text-xs font-bold text-emerald-300">3. ម៉ាស់វិភាគ OVERLAY</span>
          <span className="text-[9px] text-emerald-400/80">បៃតង/លឿង/ក្រហម</span>
        </button>

        <button
          type="button"
          data-testid="channel-cutout"
          onClick={() => handleSelectChannel(initialPurpose || "white")}
          className={`min-h-[44px] flex flex-col items-center justify-center p-2 transition-all font-mono ${
            activeChannel === "white" || activeChannel === "pink" || activeChannel === "transparent" || activeChannel === "cutout"
              ? "bg-slate-900 border-2 border-cyan-400 text-white font-bold shadow-[0_0_12px_rgba(0,240,255,0.3)]"
              : "border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <span className="text-xs font-bold text-cyan-300">4. រូបកាត់ចុងក្រោយ</span>
          <span className="text-[9px] text-cyan-400/80">Final Cutout</span>
        </button>
      </div>

      {/* ── Primary Output Purpose Selector (Khmer-First, accessible min 44px) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-none border border-cyan-500/30 bg-slate-950 p-2 text-xs">
        {/* 1. Off-White / Light Gray Background */}
        <button
          type="button"
          data-channel="white"
          data-testid="bg-color-white"
          aria-label="Select Off-White / Light Gray preset (#F4F5F7)"
          onClick={() => handleSelectChannel("white")}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-none py-2 px-2 transition-all font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
            activeChannel === "white"
              ? "bg-slate-900 border-2 border-cyan-400 text-white shadow-[0_0_12px_rgba(0,240,255,0.3)] font-bold ring-1 ring-cyan-400/50"
              : "border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-none border border-slate-300 shrink-0"
              style={{ backgroundColor: "#F4F5F7" }}
            />
            <span className="text-white font-bold">Off-White / Light Gray</span>
          </div>
          <span className="text-[10px] text-slate-300 font-mono">#F4F5F7 Preset</span>
        </button>

        {/* 2. Soft Portrait Pink Background */}
        <button
          type="button"
          data-channel="pink"
          data-testid="bg-color-pink"
          aria-label="Select Soft Portrait Pink preset (#FADADD)"
          onClick={() => handleSelectChannel("pink")}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-none py-2 px-2 transition-all font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-pink-400 ${
            activeChannel === "pink"
              ? "bg-slate-900 border-2 border-pink-400 text-white shadow-[0_0_12px_rgba(255,105,180,0.3)] font-bold ring-1 ring-pink-400/50"
              : "border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-none border border-pink-300 shrink-0"
              style={{ backgroundColor: "#FADADD" }}
            />
            <span className="text-white font-bold">Soft Portrait Pink</span>
          </div>
          <span className="text-[10px] text-pink-300 font-mono">#FADADD Preset</span>
        </button>

        {/* 3. Transparent Checkerboard */}
        <button
          type="button"
          data-channel="transparent"
          data-testid="bg-color-transparent"
          aria-label="Select Transparent preset"
          onClick={() => handleSelectChannel("transparent")}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-none py-2 px-2 transition-all font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
            activeChannel === "transparent"
              ? "bg-slate-900 border-2 border-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.3)] font-bold ring-1 ring-indigo-400/50"
              : "border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Grid className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span className="text-white font-bold">Transparent</span>
          </div>
          <span className="text-[10px] text-indigo-300 font-mono">Pure Alpha PNG</span>
        </button>

        {/* 4. Custom Color */}
        <div
          data-channel="custom"
          data-testid="bg-color-custom"
          onClick={() => handleSelectChannel("custom")}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-none py-2 px-2 transition-all font-mono tracking-wider cursor-pointer ${
            activeChannel === "custom"
              ? "bg-slate-900 border-2 border-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)] font-bold"
              : "border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              data-testid="custom-color-picker"
              value={customColor}
              onChange={(e) => {
                setCustomColor(e.target.value);
                handleSelectChannel("custom");
              }}
              className="h-4 w-4 rounded-none cursor-pointer border border-slate-300 bg-transparent p-0"
              title="Pick custom background color"
            />
            <span className="text-white font-bold">Custom</span>
          </div>
          <span className="text-[10px] text-emerald-300/80 font-mono uppercase">{customColor} Custom</span>
        </div>

        {/* 5. Original Photo */}
        <button
          type="button"
          onClick={() => handleSelectChannel("original")}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-none py-2 px-2 transition-all font-mono tracking-wider ${
            activeChannel === "original"
              ? "bg-slate-900 border-2 border-slate-400 text-white shadow-[0_0_12px_rgba(148,163,184,0.3)] font-bold"
              : "border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900/40"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-white font-bold">Original</span>
          </div>
        </button>
      </div>

      {/* ── Holographic Preview Deck with Transparent Checkerboard ── */}
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-none border p-4 transition-all duration-300 font-mono ${
          activeChannel === "pink"
            ? "border-pink-500/40 shadow-[0_0_35px_rgba(255,105,180,0.12)] bg-slate-950"
            : activeChannel === "custom"
            ? "border-emerald-500/40 shadow-[0_0_35px_rgba(16,185,129,0.12)] bg-slate-950"
            : activeChannel === "transparent"
            ? "border-indigo-500/40 shadow-[0_0_35px_rgba(99,102,241,0.12)] bg-slate-950"
            : activeChannel === "mask"
            ? "border-amber-500/40 shadow-[0_0_35px_rgba(245,158,11,0.12)] bg-black"
            : "border-cyan-500/40 shadow-[0_0_35px_rgba(0,240,255,0.12)] bg-slate-950"
        }`}
        style={{ minHeight: 400 }}
      >
        {/* Reticles */}
        <div className="absolute top-1.5 left-1.5 h-3 w-3 border-t-2 border-l-2 border-cyan-400 pointer-events-none z-20" />
        <div className="absolute top-1.5 right-1.5 h-3 w-3 border-t-2 border-r-2 border-cyan-400 pointer-events-none z-20" />
        <div className="absolute bottom-1.5 left-1.5 h-3 w-3 border-b-2 border-l-2 border-cyan-400 pointer-events-none z-20" />
        <div className="absolute bottom-1.5 right-1.5 h-3 w-3 border-b-2 border-r-2 border-cyan-400 pointer-events-none z-20" />

        {/* Corner HUD Telemetry Badges */}
        <div className="pointer-events-none absolute top-2 left-2 z-20 flex flex-wrap items-center gap-1.5 font-mono">
          <div className="flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/85 px-2 py-0.5 text-[10px] text-cyan-400">
            <span className="text-slate-500">RES:</span>
            <span className="text-white font-bold">{width}×{height}PX</span>
          </div>
          <div
            data-testid="mask-status-badge"
            className="flex items-center gap-1 border border-emerald-500/40 bg-emerald-950/90 px-2 py-0.5 text-[10px] text-emerald-300 font-bold"
          >
            <Check className="h-3 w-3 text-emerald-400" />
            <span>Mask is ready / ម៉ាស់រួចរាល់</span>
          </div>
          <div
            data-testid="foreground-area-percent"
            className="flex items-center gap-1 border border-cyan-500/40 bg-slate-950/90 px-2 py-0.5 text-[10px] text-cyan-300 font-bold"
          >
            <span>Foreground: {foregroundAreaPercent.toFixed(1)}%</span>
          </div>
        </div>
        <div className="pointer-events-none absolute top-2 right-2 z-20 flex items-center gap-1.5 border border-slate-700 bg-slate-950/85 px-2 py-0.5 text-[10px] text-slate-300 font-mono">
          <span
            className={`h-1.5 w-1.5 rounded-none ${
              isCompositing
                ? "bg-amber-400 animate-ping"
                : isDirty
                ? "bg-amber-400"
                : "bg-emerald-400 animate-pulse"
            }`}
          />
          <span className="text-slate-500">STATUS:</span>
          <span className="font-bold text-white">
            {isCompositing ? "COMPOSITING" : isDirty ? "MODIFIED" : "READY"}
          </span>
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 z-20 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/85 px-2 py-0.5 text-[10px] text-cyan-400 font-mono">
          <span className="text-slate-500">ENGINE:</span>
          <span className="text-white font-bold">{metrics?.actualModel || (provider ? `${provider}` : "briaai/RMBG-1.4 (FP32)")}</span>
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/85 px-2 py-0.5 text-[10px] text-cyan-400 font-mono">
          <span className="text-slate-500">ZOOM:</span>
          <span className="text-white font-bold">{Math.round(zoom * 100)}%</span>
        </div>

        {/* Text Mask Preview Header Overlay */}
        {activeChannel === "text_mask" && (
          <div className="pointer-events-none absolute top-10 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-2.5 bg-slate-950/95 border border-yellow-500/50 px-3 py-1 text-[11px] font-mono shadow-lg">
            <span className="text-yellow-300 font-bold">TEXT MASK PREVIEW</span>
            <span className="text-slate-400 border-l border-slate-700 pl-2">
              <span className="text-yellow-400">Yellow</span> = Detected Text Regions · Editable before export
            </span>
          </div>
        )}

        {/* Real Mask Comparison Header Overlay */}
        {activeChannel === "mask_compare" && (
          <div className="pointer-events-none absolute top-10 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-2.5 bg-slate-950/95 border border-cyan-500/50 px-3 py-1 text-[11px] font-mono shadow-lg">
            <span className="text-slate-300 font-bold">◀ BEFORE (AI MASK)</span>
            <span className="text-cyan-400 font-bold">|</span>
            <span className="text-emerald-400 font-bold">AFTER (REFINED / EDITED) ▶</span>
            <span className="text-[10px] text-slate-400 border-l border-slate-700 pl-2">
              <span className="text-emerald-400">Green</span> = Kept · <span className="text-red-400">Red</span> = Erased
            </span>
          </div>
        )}

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
            ref={canvasContainerRef}
            className="relative overflow-hidden flex items-center justify-center"
            style={{
              transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
              transformOrigin: "center center",
              transition: isPanning ? "none" : "transform 0.1s ease-out",
              cursor: activeTool === "pan" ? "grab" : "crosshair",
            }}
          >
            {(activeChannel === "transparent" || activeChannel === "cutout") && (
              <div
                className="absolute inset-0 rounded-none opacity-40 pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #334155 25%, transparent 25%), linear-gradient(-45deg, #334155 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #334155 75%), linear-gradient(-45deg, transparent 75%, #334155 75%)",
                  backgroundSize: "20px 20px",
                }}
              />
            )}
            <canvas
              ref={canvasRef}
              data-testid="mask-editor-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="max-h-[460px] max-w-full object-contain rounded-none shadow-2xl"
              style={{ touchAction: "none" }}
            />
            {/* Floating Rectangle selection overlay */}
            {rectBox && (
              <div
                data-testid="rect-selection-box"
                className={`absolute pointer-events-none border-2 border-dashed z-20 ${
                  activeTool === "keep_rect"
                    ? "border-emerald-400 bg-emerald-500/20"
                    : "border-rose-400 bg-rose-500/20"
                }`}
                style={{
                  left: rectBox.left,
                  top: rectBox.top,
                  width: rectBox.width,
                  height: rectBox.height,
                }}
              />
            )}
            {/* Floating Brush cursor indicator */}
            {cursorPos && (activeTool === "keep" || activeTool === "remove" || activeTool === "soft" || activeTool === "eraser") && (
              <div
                className="absolute pointer-events-none rounded-full border border-cyan-400/70 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
                style={{
                  left: cursorPos.x,
                  top: cursorPos.y,
                  width: brushSize * 2,
                  height: brushSize * 2,
                }}
              />
            )}
          </div>
        ) : (
          /* Standard Re-composited Image Display */
          <div className="relative z-10 flex items-center justify-center">
            {activeChannel === "transparent" && (
              <div
                className="absolute inset-0 rounded-none opacity-40 pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #334155 25%, transparent 25%), linear-gradient(-45deg, #334155 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #334155 75%), linear-gradient(-45deg, transparent 75%, #334155 75%)",
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
              className="max-h-[460px] max-w-full object-contain rounded-none shadow-2xl transition-all"
            />
          </div>
        )}
      </div>

      {/* ── Selection Mode, Mask Preview & Confirmation Deck ── */}
      <div className="rounded-none border border-cyan-500/30 bg-slate-950 p-4 space-y-3 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Selection mode / របៀបជ្រើសរើសវត្ថុ
            </span>
            <span className="text-[10px] bg-cyan-950 border border-cyan-500/40 text-cyan-300 px-1.5 py-0.5 font-bold uppercase">
              {selectionMode}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mask Overlay View Button */}
            <button
              type="button"
              data-testid="toggle-mask-overlay-btn"
              onClick={() => {
                cyberAudio.playClick();
                handleSelectChannel(activeChannel === "overlay" ? "white" : "overlay");
              }}
              className={`min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 text-xs border transition-all ${
                activeChannel === "overlay"
                  ? "border-emerald-400 bg-emerald-950 text-white font-bold ring-1 ring-emerald-400"
                  : "border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white"
              }`}
            >
              <span className="h-2 w-2 rounded-none bg-emerald-400" />
              <span>Mask overlay / ម៉ាស់វិភាគ</span>
            </button>
          </div>
        </div>

        {/* Selection Modes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          <button
            type="button"
            data-testid="mode-document-poster"
            onClick={() => handleSwitchSelectionMode("document_poster")}
            className={`min-h-[44px] flex flex-col items-center justify-center p-2 border text-center transition-all ${
              selectionMode === "document_poster"
                ? "border-cyan-400 bg-cyan-950 text-white font-bold ring-1 ring-cyan-400"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold text-cyan-300">📄 ឯកសារ/Poster</span>
            <span className="text-[9px] text-cyan-400/80">Preserve Full Page</span>
          </button>

          <button
            type="button"
            data-testid="mode-person"
            onClick={() => handleSwitchSelectionMode("person")}
            className={`min-h-[44px] flex flex-col items-center justify-center p-2 border text-center transition-all ${
              selectionMode === "person" || selectionMode === "person_only"
                ? "border-purple-400 bg-purple-950 text-white font-bold ring-1 ring-purple-400"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold text-purple-300">👤 មនុស្ស</span>
            <span className="text-[9px] text-purple-400/80">Person Cutout</span>
          </button>

          <button
            type="button"
            data-testid="mode-person-text-only"
            data-testid-alias="mode-person-plus-text"
            onClick={() => handleSwitchSelectionMode("person_text_only")}
            className={`min-h-[44px] flex flex-col items-center justify-center p-2 border text-center transition-all ${
              selectionMode === "person_text_only" || selectionMode === "person_plus_text"
                ? "border-pink-400 bg-pink-950 text-white font-bold ring-1 ring-pink-400"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold text-pink-300">✨ មនុស្ស + អក្សរតែប៉ុណ្ណោះ</span>
            <span className="text-[9px] text-pink-400/80">Person + Text Only</span>
          </button>

          <button
            type="button"
            data-testid="mode-whole-product"
            onClick={() => handleSwitchSelectionMode("whole_product")}
            className={`min-h-[44px] flex flex-col items-center justify-center p-2 border text-center transition-all ${
              selectionMode === "whole_product"
                ? "border-emerald-400 bg-emerald-950 text-white font-bold ring-1 ring-emerald-400"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold">★ រក្សាផលិតផលទាំងមូល [CONSERVATIVE - DEFAULT]</span>
            <span className="text-[9px] text-slate-500">Keep Entire Product</span>
          </button>

          <button
            type="button"
            data-testid="mode-contents-only"
            onClick={() => handleSwitchSelectionMode("contents_only")}
            className={`min-h-[44px] flex flex-col items-center justify-center p-2 border text-center transition-all ${
              selectionMode === "contents_only"
                ? "border-purple-400 bg-purple-950 text-white font-bold ring-1 ring-purple-400"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold text-purple-300">🍩 រក្សាទុកតែរបស់ខាងក្នុង [BETA - EXPERIMENTAL]</span>
            <span className="text-[9px] text-purple-400/80">Keep Contents Only</span>
          </button>

          <button
            type="button"
            data-testid="mode-custom"
            onClick={() => handleSwitchSelectionMode("custom")}
            className={`min-h-[44px] flex flex-col items-center justify-center p-2 border text-center transition-all ${
              selectionMode === "custom"
                ? "border-amber-400 bg-amber-950 text-white font-bold ring-1 ring-amber-400"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold text-amber-300">🎯 ជ្រើសរើសដោយផ្ទាល់</span>
            <span className="text-[9px] text-amber-400/80">Custom Point (+/-)</span>
          </button>

          <button
            type="button"
            data-testid="mode-box-polygon"
            onClick={() => handleSwitchSelectionMode("box_polygon")}
            className={`min-h-[44px] flex flex-col items-center justify-center p-2 border text-center transition-all ${
              selectionMode === "box_polygon"
                ? "border-rose-400 bg-rose-950 text-white font-bold ring-1 ring-rose-400"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold text-rose-300">📐 ប្រអប់-ពហុកោណ</span>
            <span className="text-[9px] text-rose-400/80">Rectangle / Polygon</span>
          </button>
        </div>

        {/* Document / Poster Mode Controls & Tools */}
        {selectionMode === "document_poster" && (
          <div className="space-y-2">
            {/* Prominent Badge */}
            <div
              data-testid="document-safe-mode-badge"
              className="flex items-center justify-between px-3.5 py-2.5 bg-emerald-950/80 border border-emerald-400 text-emerald-300 font-mono text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-none bg-emerald-400 animate-pulse" />
                <span className="tracking-wider">DOCUMENT SAFE MODE: AI MATTE DISABLED</span>
              </div>
              <span className="text-[10px] text-emerald-400/80 font-normal">
                0% Fading · 100% Opaque Text · Byte-Preserved
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 p-3 border border-cyan-500/40 bg-cyan-950/40 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-2">
                {/* 1. Keep original document */}
                <button
                  type="button"
                  data-testid="keep-original-document-btn"
                  onClick={handleKeepOriginalPage}
                  className="min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 border border-cyan-400/60 bg-cyan-950/70 text-cyan-200 hover:text-white hover:bg-cyan-900 transition-all font-bold shadow-sm"
                >
                  <span>📄 រក្សាទំព័រដើម (Keep Original Document)</span>
                </button>

                {/* 2. Draw page boundary */}
                <button
                  type="button"
                  data-testid="draw-page-boundary-btn"
                  onClick={handleDetectPageBoundary}
                  className="min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 border border-cyan-500/50 bg-slate-900 text-cyan-300 hover:text-white hover:bg-cyan-950 transition-all font-bold"
                >
                  <span>📐 គូសព្រំដែនទំព័រ (Draw Page Boundary)</span>
                </button>

                {/* 3. Perspective crop */}
                <button
                  type="button"
                  data-testid="perspective-crop-btn"
                  onClick={() => {
                    cyberAudio.playClick();
                    setIsPerspectiveMode(!isPerspectiveMode);
                  }}
                  className={`min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 border transition-all font-bold ${
                    isPerspectiveMode
                      ? "border-amber-400 bg-amber-950 text-white ring-1 ring-amber-400"
                      : "border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
                  }`}
                >
                  <span>✂️ តម្រង់ផ្ទៃក្រដាស (Perspective Crop)</span>
                </button>
                {isPerspectiveMode && (
                  <button
                    type="button"
                    data-testid="warp-page-btn"
                    onClick={handleWarpPerspective}
                    className="min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 border border-amber-400 bg-amber-900/80 text-white font-bold hover:brightness-110 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                    <span>បញ្ជាក់ការតម្រង់ (Apply Warp)</span>
                  </button>
                )}

                {/* 4. Transparent outside page (opt-in) */}
                <button
                  type="button"
                  data-testid="transparent-outside-page-btn"
                  onClick={handleTransparentOutsidePage}
                  className="min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 border border-indigo-400/60 bg-indigo-950/60 text-indigo-200 hover:text-white hover:bg-indigo-900 transition-all font-bold"
                >
                  <span>🏁 ផ្ទៃខាងក្រៅថ្លា (Transparent Outside Page - Opt-In)</span>
                </button>

                {/* 5. Original preview */}
                <button
                  type="button"
                  data-testid="original-preview-btn"
                  onClick={() => handleSelectChannel("original")}
                  className={`min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 border transition-all font-bold ${
                    activeChannel === "original"
                      ? "border-cyan-400 bg-cyan-900 text-white ring-1 ring-cyan-400"
                      : "border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5 text-cyan-400" />
                  <span>👁️ មើលរូបដើម (Original Preview)</span>
                </button>

                {/* 6. Reset */}
                <button
                  type="button"
                  data-testid="reset-document-btn"
                  onClick={handleResetDocument}
                  className="min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 border border-rose-500/40 bg-rose-950/40 text-rose-300 hover:text-white hover:bg-rose-900/60 transition-all font-bold"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>🔄 កំណត់ឡើងវិញ (Reset)</span>
                </button>
              </div>

              {/* Preview Tabs for Document/Poster */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800">
                <button
                  type="button"
                  data-testid="tab-original"
                  onClick={() => handleSelectChannel("original")}
                  className={`min-h-[40px] px-2.5 py-1 text-[10px] uppercase font-bold transition-all ${
                    activeChannel === "original"
                      ? "bg-cyan-500 text-black shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Original
                </button>
                <button
                  type="button"
                  data-testid="tab-page-mask"
                  onClick={() => handleSelectChannel("initial_mask")}
                  className={`min-h-[40px] px-2.5 py-1 text-[10px] uppercase font-bold transition-all ${
                    activeChannel === "initial_mask"
                      ? "bg-cyan-500 text-black shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Page Mask
                </button>
                <button
                  type="button"
                  data-testid="tab-final"
                  onClick={() => handleSelectChannel("transparent")}
                  className={`min-h-[40px] px-2.5 py-1 text-[10px] uppercase font-bold transition-all ${
                    activeChannel === "transparent"
                      ? "bg-cyan-500 text-black shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Final Cutout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Person + Text Only Controls & Sub-Options */}
        {(selectionMode === "person_text_only" || selectionMode === "person_plus_text") && (
          <div className="space-y-2 p-3 border border-pink-500/40 bg-pink-950/30 text-xs font-mono">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-pink-300">
                ✨ PERSON + TEXT ONLY / រក្សាមនុស្ស + អក្សរតែប៉ុណ្ណោះ
              </span>
              <span className="text-[10px] text-pink-400/80">
                This mode keeps the selected person and text, and removes the poster/background. Use Keep Brush if OCR misses any letters.
              </span>
            </div>

            {/* Sub-options */}
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                <input
                  type="checkbox"
                  data-testid="sub-option-person"
                  checked={subOptionPerson}
                  onChange={() => handleToggleSubOption("person")}
                  className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                />
                <span>Person: keep detected person</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                <input
                  type="checkbox"
                  data-testid="sub-option-text"
                  checked={subOptionText}
                  onChange={() => handleToggleSubOption("text")}
                  className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                />
                <span>Text: keep detected text</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                <input
                  type="checkbox"
                  data-testid="sub-option-graphics"
                  checked={!subOptionGraphics}
                  onChange={() => handleToggleSubOption("graphics")}
                  className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                />
                <span>Graphics: remove by default</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                <input
                  type="checkbox"
                  data-testid="sub-option-keep-graphics"
                  checked={subOptionGraphics}
                  onChange={() => handleToggleSubOption("graphics")}
                  className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                />
                <span>Keep selected graphics: optional</span>
              </label>
            </div>

            {/* Warning banner if text mask is empty or low confidence */}
            {personTextDiagnostics?.warning && (
              <div
                data-testid="person-text-warning"
                className="p-2 bg-amber-950/60 border border-amber-500/50 text-amber-300 text-xs flex items-center gap-2"
              >
                <span>{personTextDiagnostics.warning}</span>
              </div>
            )}
          </div>
        )}

        {/* Warning Banner if Container/Box Detected */}
        {containerWarning && (
          <div className="flex items-start gap-2.5 p-3 border border-amber-500/40 bg-amber-950/40 text-xs text-amber-200">
            <span className="text-amber-400 text-sm mt-0.5">⚠️</span>
            <div className="space-y-0.5">
              <div className="font-bold uppercase tracking-wider text-amber-300">
                រកឃើញកេស/ប្រអប់ (BOX / CONTAINER DETECTED)
              </div>
              <div className="text-[11px] leading-relaxed text-amber-200/90 font-mono">
                {containerWarning}
              </div>
            </div>
          </div>
        )}

        {/* Custom Point Prompts Toolbar */}
        {selectionMode === "custom" && (
          <div className="flex flex-wrap items-center gap-2 p-2 border border-slate-800 bg-slate-900/90 text-xs">
            <span className="text-[10px] text-slate-400 uppercase font-mono">POINT PROMPT:</span>
            <button
              type="button"
              data-testid="tool-positive-point"
              onClick={() => {
                setIsEditMode(true);
                setActiveTool("positive_point");
              }}
              className={`min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 border transition-all ${
                activeTool === "positive_point"
                  ? "border-emerald-400 bg-emerald-950 text-white font-bold ring-1 ring-emerald-400"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:text-emerald-300"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>(+) ចុចរក្សាទុក (Keep Point)</span>
            </button>
            <button
              type="button"
              data-testid="tool-negative-point"
              onClick={() => {
                setIsEditMode(true);
                setActiveTool("negative_point");
              }}
              className={`min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 border transition-all ${
                activeTool === "negative_point"
                  ? "border-rose-400 bg-rose-950 text-white font-bold ring-1 ring-rose-400"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:text-rose-300"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              <span>(-) ចុចលុបប្រអប់ (Remove Point)</span>
            </button>
          </div>
        )}

        {/* ── Step 5: Optional Edge Refinement Selector ── */}
        <div className="flex flex-col gap-2 p-3 border border-slate-800 bg-slate-900/60 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-300 text-xs">
              ជំហានទី ៥: សម្រួលគែម (STEP 5: OPTIONAL EDGE MATTING)
            </span>
            <span className="text-[10px] text-slate-500">
              {selectionMode === "document_poster" ? "Disabled for Document/Poster" : "Off by default · Non-destructive"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              data-testid="refine-mode-off"
              onClick={() => {
                cyberAudio.playClick();
                setEdgeRefinementMode("off");
              }}
              className={`min-h-[44px] flex flex-col items-center justify-center p-2 border transition-all ${
                edgeRefinementMode === "off"
                  ? "border-cyan-400 bg-cyan-950 text-white font-bold ring-1 ring-cyan-400"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
              }`}
            >
              <span className="text-xs font-bold text-cyan-300">1. No Refinement [DEFAULT]</span>
              <span className="text-[9px] text-slate-400">Keep exact user mask (0 matting)</span>
            </button>

            <button
              type="button"
              data-testid="refine-mode-balanced"
              disabled={selectionMode === "document_poster"}
              onClick={() => {
                cyberAudio.playClick();
                setEdgeRefinementMode("balanced");
              }}
              className={`min-h-[44px] flex flex-col items-center justify-center p-2 border transition-all ${
                selectionMode === "document_poster"
                  ? "opacity-40 cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600"
                  : edgeRefinementMode === "balanced"
                  ? "border-emerald-400 bg-emerald-950 text-white font-bold ring-1 ring-emerald-400"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
              }`}
            >
              <span className="text-xs font-bold text-emerald-300">2. Balanced Refinement</span>
              <span className="text-[9px] text-slate-400">Narrow edge band filter (max 10% rollback)</span>
            </button>

            <button
              type="button"
              data-testid="refine-mode-fine"
              disabled={selectionMode === "document_poster"}
              onClick={() => {
                cyberAudio.playClick();
                setEdgeRefinementMode("fine");
              }}
              className={`min-h-[44px] flex flex-col items-center justify-center p-2 border transition-all ${
                selectionMode === "document_poster"
                  ? "opacity-40 cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600"
                  : edgeRefinementMode === "fine"
                  ? "border-purple-400 bg-purple-950 text-white font-bold ring-1 ring-purple-400"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
              }`}
            >
              <span className="text-xs font-bold text-purple-300">3. Fine Hair &amp; Details</span>
              <span className="text-[9px] text-slate-400">Hair, fur &amp; thin branches detail matte</span>
            </button>
          </div>
        </div>

        {/* Confirm Mask and Export CTA Button */}
        {!isConfirmed && (
          <button
            type="button"
            data-testid="confirm-mask-export-btn"
            onClick={handleConfirmMaskAndExport}
            className="min-h-[48px] w-full flex items-center justify-center gap-2 border border-emerald-400 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-4 py-3 text-xs sm:text-sm font-black text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:brightness-110 active:scale-[0.98] transition-all tracking-wider uppercase font-mono"
          >
            <Sparkles className="h-4 w-4 text-emerald-200 shrink-0" />
            <span className="truncate">✨ បញ្ជាក់ម៉ាស់ និងកាត់សម្រួលគែម (Confirm Mask)</span>
          </button>
        )}
      </div>

      {/* ── Telemetry HUD & Download Deck ── */}
      <div className="rounded-none border border-slate-800 bg-slate-900/80 p-4 space-y-3 font-mono">
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-300 border-b border-slate-800 pb-2">
          <span className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-none ${
                activeChannel === "pink"
                  ? "bg-pink-400"
                  : activeChannel === "custom"
                  ? "bg-emerald-400"
                  : activeChannel === "mask"
                  ? "bg-amber-400"
                  : activeChannel === "transparent"
                  ? "bg-indigo-400"
                  : "bg-cyan-400"
              }`}
            />
            <span className="uppercase font-bold text-white">
              {activeChannel === "white"
                ? "Off-White / Light Gray (#F4F5F7)"
                : activeChannel === "pink"
                ? "Soft Portrait Pink (#FADADD)"
                : activeChannel === "custom"
                ? `Custom Color — ${customColor.toUpperCase()}`
                : activeChannel === "transparent"
                ? "Transparent Cutout (Alpha PNG)"
                : activeChannel === "mask"
                ? "ALPHA MASK DEBUG"
                : "ORIGINAL IMAGE"}
            </span>
          </span>
          <div className="flex items-center gap-3 text-slate-300">
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] select-none">
              <input
                type="checkbox"
                data-testid="export-crop-to-content"
                checked={autoCropExport}
                onChange={(e) => setAutoCropExport(e.target.checked)}
                className="h-3.5 w-3.5 rounded-none border-slate-700 bg-slate-950 accent-cyan-400 cursor-pointer"
              />
              <span className="text-slate-300">Crop to Content</span>
            </label>
            <span>
              Export: <strong className="text-white">{width}×{height}px</strong>
            </span>
          </div>
        </div>

        {/* Smart Editable Filename Deck */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-none border border-slate-800 bg-slate-900/60 p-2.5 font-mono">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-300 shrink-0">
              ឈ្មោះឯកសារ (File Name):
            </span>
            <input
              type="text"
              data-testid="bg-remover-custom-filename"
              value={customExportFilename}
              onChange={(e) => setCustomExportFilename(e.target.value)}
              placeholder="plp-cutout-transparent"
              className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <span className="text-xs font-bold text-cyan-400 shrink-0">
              .png
            </span>
          </div>

          <button
            type="button"
            data-testid="bg-remover-auto-name-btn"
            onClick={() => {
              cyberAudio.playClick();
              const freshAutoName = generateBgRemoverSmartName({
                originalName: originalFile?.name || "image",
                channel: activeChannel === "custom" ? "custom" : (activeChannel as "transparent" | "white" | "pink" | "mask"),
                mode,
                width: originalFile && (sourceWidth || sourceHeight) ? (sourceWidth || width) : width,
                height: originalFile && (sourceWidth || sourceHeight) ? (sourceHeight || height) : height,
              });
              setCustomExportFilename(freshAutoName);
            }}
            className="shrink-0 flex items-center justify-center gap-1.5 border border-amber-500/40 bg-amber-950/40 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-900/60 transition-colors cursor-pointer"
            title="បង្កើតឈ្មោះស្វ័យប្រវត្តិតាមរូបភាព និងប្រភេទពណ៌"
          >
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span>⚡ បង្កើតឈ្មោះស្វ័យប្រវត្តិ (Auto-Name)</span>
          </button>
        </div>

        {/* Primary Download Button: Download HD PNG / ទាញយក PNG គុណភាពខ្ពស់ */}
        <div className="space-y-1.5">
          <button
            type="button"
            data-testid="download-hd-png-btn"
            aria-label="Download HD PNG with current preset composition"
            onClick={() => handleDownloadHdCanvasPng()}
            disabled={isCompositing}
            className={`min-h-[48px] flex w-full items-center justify-center gap-2 rounded-none px-5 py-3.5 text-xs font-black tracking-wider uppercase text-white shadow-lg transition-all duration-200 active:scale-[0.98] font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
              activeChannel === "pink"
                ? "bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 shadow-pink-900/40 hover:shadow-pink-500/25 ring-1 ring-pink-400/40"
                : activeChannel === "custom"
                ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 shadow-emerald-900/40 hover:shadow-emerald-500/25 ring-1 ring-emerald-400/40"
                : activeChannel === "transparent"
                ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 shadow-indigo-900/40 hover:shadow-indigo-500/25 ring-1 ring-indigo-400/40"
                : "bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 shadow-cyan-900/40 hover:shadow-cyan-500/25 ring-1 ring-cyan-400/40"
            }`}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="flex flex-col sm:flex-row items-center justify-center gap-1 text-center">
              {activeChannel === "transparent" ? (
                <>
                  <span>ទាញយក PNG គុណភាពខ្ពស់ (ថ្លា)</span>
                  <span className="text-[10px] text-white/80 font-normal sm:border-l sm:border-white/30 sm:pl-1.5">Download HD Transparent</span>
                </>
              ) : activeChannel === "pink" ? (
                <>
                  <span>ទាញយក PNG គុណភាពខ្ពស់ (ផ្កាឈូក)</span>
                  <span className="text-[10px] text-white/80 font-normal sm:border-l sm:border-white/30 sm:pl-1.5">Download HD Soft Pink</span>
                </>
              ) : activeChannel === "custom" ? (
                <>
                  <span>ទាញយក PNG ({customColor.toUpperCase()})</span>
                  <span className="text-[10px] text-white/80 font-normal sm:border-l sm:border-white/30 sm:pl-1.5">Download HD Custom</span>
                </>
              ) : activeChannel === "mask" ? (
                <>
                  <span>ទាញយក Alpha Mask</span>
                  <span className="text-[10px] text-white/80 font-normal sm:border-l sm:border-white/30 sm:pl-1.5">Download Mask Debug</span>
                </>
              ) : (
                <>
                  <span>ទាញយក PNG គុណភាពខ្ពស់ (Off-White)</span>
                  <span className="text-[10px] text-white/80 font-normal sm:border-l sm:border-white/30 sm:pl-1.5">Download HD Off-White</span>
                </>
              )}
            </span>
          </button>
          <button
            type="button"
            data-testid="primary-download"
            onClick={() => handleDownloadHdCanvasPng()}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className="text-[10px] text-slate-400 font-mono text-center">
            Processed resolution: {width}×{height}px {wasDownscaled ? "(Inference downscaled proportionally)" : "(100% native resolution preserved)"}
          </div>
        </div>

        {/* Direct Quick Download Row */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] text-slate-400 font-mono tracking-wider">
            ទាញយកភ្លាមៗតាមពណ៌ (1-CLICK INSTANT PRESET DOWNLOAD):
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
            <button
              type="button"
              data-testid="quick-download-white"
              aria-label="Download Off-White / Light Gray PNG"
              onClick={() => handleDownloadHdCanvasPng("white")}
              className="min-h-[44px] flex items-center justify-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100 hover:border-cyan-400 hover:text-white transition-colors"
            >
              <span className="h-2.5 w-2.5 border border-slate-400 shrink-0" style={{ backgroundColor: "#F4F5F7" }} />
              <span>Off-White (#F4F5F7)</span>
            </button>
            <button
              type="button"
              data-testid="quick-download-pink"
              aria-label="Download Soft Portrait Pink PNG"
              onClick={() => handleDownloadHdCanvasPng("pink")}
              className="min-h-[44px] flex items-center justify-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100 hover:border-pink-400 hover:text-white transition-colors"
            >
              <span className="h-2.5 w-2.5 border border-pink-400 shrink-0" style={{ backgroundColor: "#FADADD" }} />
              <span>Soft Pink (#FADADD)</span>
            </button>
            <button
              type="button"
              data-testid="quick-download-transparent"
              aria-label="Download Transparent PNG"
              onClick={() => handleDownloadHdCanvasPng("transparent")}
              className="min-h-[44px] flex items-center justify-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100 hover:border-indigo-400 hover:text-white transition-colors"
            >
              <Grid className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span>Transparent (PNG)</span>
            </button>
            <button
              type="button"
              data-testid="quick-download-custom"
              aria-label="Download Custom Color PNG"
              onClick={() => handleDownloadHdCanvasPng("custom")}
              className="min-h-[44px] flex items-center justify-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100 hover:border-emerald-400 hover:text-white transition-colors"
            >
              <span className="h-2.5 w-2.5 border border-slate-400 shrink-0" style={{ backgroundColor: customColor }} />
              <span>Custom Color</span>
            </button>
          </div>
        </div>

        {/* Secondary Download Actions & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 font-mono border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="export-transparent-png-btn"
              onClick={handleExportTransparentPng}
              className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-cyan-500/40 bg-cyan-950/60 px-3.5 py-1.5 text-cyan-300 hover:bg-cyan-900/70 hover:text-white transition-colors shadow-[0_0_12px_rgba(0,240,255,0.2)] font-bold tracking-wider uppercase"
            >
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              <span>Export Transparent PNG</span>
            </button>

            {previousResult && onRestorePreviousResult && (
              <button
                type="button"
                data-testid="restore-previous-btn"
                onClick={onRestorePreviousResult}
                className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-amber-500/40 bg-amber-950/60 px-3.5 py-1.5 text-amber-300 hover:bg-amber-900/70 hover:text-white transition-colors font-bold tracking-wider uppercase"
                title="Restore previous good background removal result"
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
                <span>Restore Previous Result</span>
              </button>
            )}

            <button
              type="button"
              data-testid="use-original-btn"
              data-testid-alias="reset-original-btn"
              onClick={handleUseOriginalImage}
              className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-slate-700 bg-slate-800/80 px-3.5 py-1.5 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors font-bold tracking-wider uppercase"
              title="Use original image uncropped (recovers 100% foreground)"
            >
              <Eye className="h-3.5 w-3.5 text-slate-400" />
              <span>Use Original Image</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-slate-400 hover:text-rose-300 hover:border-rose-500/30 transition-colors tracking-wider uppercase"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Start over / កំណត់ឡើងវិញ</span>
          </button>
        </div>
      </div>

      {/* ── Collapsible Advanced Disclosure: Manual Mask Studio & Diagnostic Views ── */}
      <div className="rounded-none border border-slate-800 bg-slate-950 p-3.5 text-xs shadow-inner font-mono">
        <button
          type="button"
          onClick={() => {
            cyberAudio.playClick();
            setIsAdvancedOpen(!isAdvancedOpen);
          }}
          className="min-h-[44px] w-full flex items-center justify-between text-xs text-slate-300 hover:text-cyan-300 font-bold tracking-wider py-1 font-mono"
        >
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-cyan-400" />
            <span>Edit mask & Advanced tools / កែសម្រួលម៉ាស់</span>
          </div>
          <span className="text-[11px] text-cyan-400">{isAdvancedOpen ? "[-] Close" : "[+] Open"}</span>
        </button>

        {isAdvancedOpen && (
          <div className="flex flex-col gap-3 pt-3 border-t border-slate-800 mt-2">
            {/* Diagnostic View Toggles */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">របៀបពិនិត្យម៉ាស:</span>
              <button
                type="button"
                onClick={() => handleSelectChannel("mask")}
                className={`min-h-[44px] flex items-center gap-1.5 rounded-none px-3 py-1.5 text-xs transition-all tracking-wider ${
                  activeChannel === "mask"
                    ? "bg-slate-900 border border-amber-400 text-white font-bold"
                    : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white"
                }`}
              >
                <Eye className="h-3.5 w-3.5 text-amber-400" />
                <span>ពិនិត្យម៉ាសអាល់ហ្វា (MASK DEBUG)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectChannel("mask_compare")}
                className={`min-h-[44px] flex items-center gap-1.5 rounded-none px-3 py-1.5 text-xs transition-all tracking-wider ${
                  activeChannel === "mask_compare"
                    ? "bg-slate-900 border border-cyan-400 text-white font-bold"
                    : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white"
                }`}
              >
                <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                <span>ប្រៀបធៀបម៉ាស (MASK COMPARE)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectChannel("split")}
                className={`min-h-[44px] flex items-center gap-1.5 rounded-none px-3 py-1.5 text-xs transition-all tracking-wider ${
                  activeChannel === "split"
                    ? "bg-slate-900 border border-emerald-400 text-white font-bold"
                    : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white"
                }`}
              >
                <Sliders className="h-3.5 w-3.5 text-emerald-400" />
                <span>ស្លាយប្រៀបធៀបរូបដើម (SPLIT SLIDER)</span>
              </button>
            </div>

            {/* Manual Mask Refinement Studio Toolbar */}
<div className="flex flex-col gap-3 rounded-none border border-slate-800 bg-slate-950 p-3.5 text-xs shadow-inner">
        {/* Top Control Bar: Studio Toggle, Undo, Redo, Apply & Cancel */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                cyberAudio.playClick();
                setIsEditMode(!isEditMode);
              }}
              className={`flex items-center gap-1.5 rounded-none px-3 py-1.5 font-bold transition-all font-mono tracking-wider text-xs ${
                isEditMode
                  ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(0,240,255,0.4)]"
                  : "border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50"
              }`}
            >
              <Paintbrush className="h-3.5 w-3.5" />
              <span>{isEditMode ? "MANUAL MASK STUDIO [ACTIVE]" : "EDIT ALPHA MASK TOOLS"}</span>
            </button>
            <span className="text-[11px] text-slate-500 hidden md:inline font-mono">
              (Refines alpha mask directly before final compositing)
            </span>
          </div>

          {/* Action Buttons: Undo, Redo, Reset Mask, Clear Mask, Cancel, Apply Corrections */}
          <div className="flex flex-wrap items-center gap-1.5 font-mono">
            <button
              type="button"
              data-testid="tool-undo"
              data-testid-alias="undo-btn"
              onClick={handleUndo}
              disabled={history.length === 0}
              className="flex items-center gap-1 rounded-none border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors tracking-wider uppercase"
              title="Undo stroke (Ctrl+Z / Z)"
            >
              <Undo2 className="h-3 w-3" />
              <span className="text-[10px]">Undo</span>
            </button>
            <button
              type="button"
              data-testid="tool-redo"
              data-testid-alias="redo-btn"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="flex items-center gap-1 rounded-none border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors tracking-wider uppercase"
              title="Redo stroke (Ctrl+Y / Y)"
            >
              <Redo2 className="h-3 w-3" />
              <span className="text-[10px]">Redo</span>
            </button>

            <button
              type="button"
              data-testid="reset-ai-masks-btn"
              onClick={handleResetToAiMasks}
              className="flex items-center gap-1 rounded-none border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1 text-[10px] text-cyan-300 hover:bg-cyan-900/60 transition-colors tracking-wider uppercase"
              title="Recomputes independent person & text AI masks"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset to AI masks</span>
            </button>

            <button
              type="button"
              data-testid="mask-reset-button"
              data-testid-alias="reset-initial-mask-btn"
              onClick={handleResetMask}
              className="flex items-center gap-1 rounded-none border border-rose-500/30 bg-rose-950/40 px-2.5 py-1 text-[10px] text-rose-300 hover:bg-rose-900/60 transition-colors tracking-wider uppercase"
              title="Reset mask back to initial AI segmentation (R)"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Mask</span>
            </button>

            <button
              type="button"
              data-testid="clear-mask-btn"
              onClick={handleClearMask}
              className="flex items-center gap-1 rounded-none border border-red-500/30 bg-red-950/40 px-2.5 py-1 text-[10px] text-red-300 hover:bg-red-900/60 transition-colors tracking-wider uppercase"
              title="Clear entire mask to transparent (alpha = 0)"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear Mask</span>
            </button>

            {isDirty && (
              <button
                type="button"
                onClick={handleCancelChanges}
                className="flex items-center gap-1 rounded-none border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300 hover:text-white transition-colors tracking-wider uppercase"
                title="Discard unapplied changes"
              >
                <X className="h-3 w-3" />
                <span>Cancel Changes</span>
              </button>
            )}

            <button
              type="button"
              data-testid="tool-apply"
              onClick={handleApplyCorrections}
              disabled={!isDirty && hasAppliedCorrections}
              className={`flex items-center gap-1 rounded-none px-3 py-1 text-[10px] font-bold transition-all tracking-wider uppercase ${
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
                  data-testid="tool-keep-brush"
                  onClick={() => setActiveTool("keep")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
                    activeTool === "keep"
                      ? "bg-emerald-900/90 border border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-emerald-300"
                  }`}
                  title="Paints white/opaque (α = 255) to restore missing foreground details (B)"
                >
                  <span className="h-2 w-2 rounded-none bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                  <span>Keep Brush</span>
                </button>

                {/* 1b. Keep Person Brush */}
                <button
                  type="button"
                  data-testid="tool-keep-person"
                  onClick={() => setActiveTool("keep_person")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
                    activeTool === "keep_person"
                      ? "bg-blue-900/90 border border-blue-400 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-blue-300"
                  }`}
                  title="Paints onto person mask (α = 255) for hair, clothing, body"
                >
                  <span className="h-2 w-2 rounded-none bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                  <span>Keep Person Brush</span>
                </button>

                {/* 1c. Keep Text Brush */}
                <button
                  type="button"
                  data-testid="tool-keep-text"
                  onClick={() => setActiveTool("keep_text")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
                    activeTool === "keep_text"
                      ? "bg-yellow-900/90 border border-yellow-400 text-yellow-200 shadow-[0_0_12px_rgba(234,179,8,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-yellow-300"
                  }`}
                  title="Paints onto text mask (α = 255) for missed letters, Khmer subscripts & diacritics"
                >
                  <span className="h-2 w-2 rounded-none bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.8)]" />
                  <span>Keep Text Brush</span>
                </button>

                {/* 2. Remove / Erase Brush */}
                <button
                  type="button"
                  data-testid="tool-remove-brush"
                  data-testid-alias="tool-erase"
                  onClick={() => setActiveTool("remove")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
                    activeTool === "remove"
                      ? "bg-rose-900/90 border border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-rose-300"
                  }`}
                  title="Paints black/transparent (α = 0) to carve away background (E)"
                >
                  <Scissors className="h-3 w-3 text-rose-400" />
                  <span>Erase Brush</span>
                </button>

                {/* 2a. Positive Point Click */}
                <button
                  type="button"
                  data-testid="tool-positive-point"
                  onClick={() => setActiveTool("positive_point")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
                    activeTool === "positive_point"
                      ? "bg-emerald-900/90 border border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-emerald-300"
                  }`}
                  title="Click point to add foreground (+)"
                >
                  <span>+ Point</span>
                </button>

                {/* 2b. Negative Point Click */}
                <button
                  type="button"
                  data-testid="tool-negative-point"
                  onClick={() => setActiveTool("negative_point")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
                    activeTool === "negative_point"
                      ? "bg-rose-900/90 border border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-rose-300"
                  }`}
                  title="Click point to remove background (-)"
                >
                  <span>- Point</span>
                </button>

                {/* 2b. Keep Rectangle */}
                <button
                  type="button"
                  data-testid="tool-keep-rect"
                  onClick={() => setActiveTool("keep_rect")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
                    activeTool === "keep_rect"
                      ? "bg-emerald-900/90 border border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-emerald-300"
                  }`}
                  title="Drag rectangle to keep entire region (sets alpha = 255)"
                >
                  <Square className="h-3 w-3 text-emerald-400" />
                  <span>Keep Rect</span>
                </button>

                {/* 2c. Erase Rectangle */}
                <button
                  type="button"
                  data-testid="tool-erase-rect"
                  onClick={() => setActiveTool("erase_rect")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
                    activeTool === "erase_rect"
                      ? "bg-rose-900/90 border border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.35)]"
                      : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-rose-300"
                  }`}
                  title="Drag rectangle to erase entire region (sets alpha = 0)"
                >
                  <Square className="h-3 w-3 text-rose-400" />
                  <span>Erase Rect</span>
                </button>

                {/* 3. Soft Edge Brush */}
                <button
                  type="button"
                  data-testid="tool-soft-brush"
                  onClick={() => setActiveTool("soft")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
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
                  data-testid="tool-eraser"
                  onClick={() => setActiveTool("eraser")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
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
                  data-testid="tool-pan"
                  onClick={() => setActiveTool("pan")}
                  className={`flex items-center gap-1.5 rounded-none px-2.5 py-1 text-[11px] font-bold transition-all font-mono tracking-wider uppercase ${
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
              <div className="flex items-center gap-1 border-l border-slate-800 pl-2 font-mono">
                <span className="text-[10px] text-slate-500 mr-1">ZOOM:</span>
                {[1, 2, 4].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => {
                      setZoom(z);
                      if (z === 1) setPanOffset({ x: 0, y: 0 });
                    }}
                    className={`rounded-none px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                      zoom === z
                        ? "bg-cyan-500 text-black"
                        : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                    }`}
                  >
                    {z * 100}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                  className="rounded-none p-1 bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
                  className="rounded-none p-1 bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
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
                  className="rounded-none p-1 bg-slate-900 text-slate-400 hover:text-white ml-0.5 border border-slate-800"
                  title="Reset Zoom & Pan"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Sliders: Brush Size & Brush Hardness/Softness */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-none border border-slate-800 bg-slate-900/60 p-2.5 font-mono">
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
                  className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-none appearance-none"
                />
                <div className="flex items-center gap-1">
                  {[6, 16, 32, 60].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setBrushSize(sz)}
                      className={`rounded-none px-1 py-0.5 text-[9px] border border-slate-800 ${
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
                  className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-none appearance-none"
                />
                <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
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
          </div>
        )}
      </div>
    </div>
  );
}
