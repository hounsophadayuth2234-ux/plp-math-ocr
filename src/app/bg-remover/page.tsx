"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Zap,
  Sparkles,
  Server,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ImageOff,
  XCircle,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  removeBackgroundBrowser,
  removeBackgroundRemote,
  compositeWithSolidColor,
  segmentObjectSelection,
  refineAlphaMattingWithMask,
  BgRemovalOutput,
  BgRemovalProgress,
  STAGE_DEADLINES,
  DOCUMENT_SAFE_MODE,
} from "@/lib/bg-removal-client";
import { SelectionMode } from "@/lib/bg-compositor";
import { bgWorkerManager } from "@/lib/bg-removal-worker-manager";
import { cyberAudio } from "@/lib/cyber-audio";
import { ObjectUrlRegistry } from "@/lib/processing-utils";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { ColorStudio } from "@/components/bg-remover/ColorStudio";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import { recordExecutionTelemetry } from "@/lib/hardware-diagnostics";
import { BgStudioNav, StudioFont, StudioTheme } from "@/components/bg-remover/BgStudioNav";
import { BgStudioHero } from "@/components/bg-remover/BgStudioHero";
import { BgStudioSettingsModal } from "@/components/bg-remover/BgStudioSettingsModal";
import { BgStudioHelpModal } from "@/components/bg-remover/BgStudioHelpModal";
import { BgAdvancedSettings } from "@/components/bg-remover/BgAdvancedSettings";
import { StudioLocale, getSavedLocale, saveLocale, getTranslation } from "@/lib/i18n";
import { resolveAutoQualityWorkingResolution } from "@/lib/khmer-text-analyzer";

export default function BgRemoverPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cachedResult, setCachedResult] = useState<BgRemovalOutput | null>(null);
  const [previousResult, setPreviousResult] = useState<BgRemovalOutput | null>(null);
  const [initialCompositeUrl, setInitialCompositeUrl] = useState<string | null>(null);
  const [selectedPurpose, setSelectedPurpose] = useState<"white" | "pink" | "transparent" | "custom">("white");
  const [locale, setLocale] = useState<StudioLocale>(() => getSavedLocale());
  const [dehaloRadius, setDehaloRadius] = useState<number>(2);
  const [alphaChoke, setAlphaChoke] = useState<number>(1);
  const [featherRadius, setFeatherRadius] = useState<number>(1.5);
  const [customColor, setCustomColor] = useState<string>("#FFFFFF");

  // Workflow state (4-Stage Pipeline: Detecting -> Edit Mask -> Refining Edges -> Ready)
  const [workflowStep, setWorkflowStep] = useState<
    "detecting" | "edit_mask" | "refining" | "ready" | "failed"
  >("ready");

  const [activeSelectionMode, setActiveSelectionMode] = useState<SelectionMode>(
    "preserve_all_foreground"
  );
  const excludedMaskRef = useRef<Uint8ClampedArray | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMode, setProcessingMode] = useState<"preview" | "final" | "worker">("preview");
  const [progressInfo, setProgressInfo] = useState<BgRemovalProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slowNotice, setSlowNotice] = useState<string | null>(null);
  const [isModelCached, setIsModelCached] = useState(false);
  const [isWorkerConfigured, setIsWorkerConfigured] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<
    "not_configured" | "checking" | "ready" | "unavailable" | "configured"
  >("checking");
  const [workerModel, setWorkerModel] = useState<string | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<"browser" | "worker">("browser");
  const [edgeQuality, setEdgeQuality] = useState<"fast" | "balanced" | "quality" | "fine_details">("fast");
  const [directWorkerUrl, setDirectWorkerUrl] = useState<string | null>(null);

  // Explicit Manual-Assisted Background Remover State Machine:
  // idle -> image_loaded -> generating_initial_mask -> mask_editing -> previewing -> refining_edges -> ready_to_export -> error
  const manualState = useMemo<
    | "idle"
    | "image_loaded"
    | "generating_initial_mask"
    | "mask_editing"
    | "previewing"
    | "refining_edges"
    | "ready_to_export"
    | "error"
  >(() => {
    if (error) return "error";
    if (isProcessing && (workflowStep === "detecting" || !cachedResult)) return "generating_initial_mask";
    if (isProcessing && workflowStep === "refining") return "refining_edges";
    if (cachedResult) {
      if (workflowStep === "edit_mask") return "mask_editing";
      return "ready_to_export";
    }
    if (imageFile) return "image_loaded";
    return "idle";
  }, [error, isProcessing, workflowStep, cachedResult, imageFile]);

  // Audio settings state
  const [audioMuted, setAudioMuted] = useState(() => cyberAudio.isMuted());
  const [audioVolume, setAudioVolume] = useState(() => cyberAudio.getVolume());

  // Redesign UI State: Modals, Theme & Fonts
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [studioFont, setStudioFont] = useState<StudioFont>("font-kantumruy");
  const [studioTheme, setStudioTheme] = useState<StudioTheme>("cyber-dark");

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedFont = localStorage.getItem("plp_studio_font") as StudioFont | null;
        if (savedFont) setStudioFont(savedFont);
        const savedTheme = localStorage.getItem("plp_studio_theme") as StudioTheme | null;
        if (savedTheme) setStudioTheme(savedTheme);
      } catch {}
    }
  }, []);

  const handleChangeFont = (font: StudioFont) => {
    setStudioFont(font);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("plp_studio_font", font);
      } catch {}
    }
  };

  const handleChangeStudioTheme = (newTheme: StudioTheme) => {
    setStudioTheme(newTheme);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("plp_studio_theme", newTheme);
      } catch {}
      if (newTheme === "clean-light") {
        setTheme("light");
        document.documentElement.classList.remove("dark");
      } else {
        setTheme("dark");
        document.documentElement.classList.add("dark");
      }
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        if (next === "light") {
          document.documentElement.classList.remove("dark");
          setStudioTheme("clean-light");
        } else {
          document.documentElement.classList.add("dark");
          setStudioTheme("cyber-dark");
        }
      }
      return next;
    });
  };

  const handleToggleAudio = () => {
    const next = !audioMuted;
    cyberAudio.setMuted(next);
    setAudioMuted(next);
  };

  const handleChangeLocale = (newLocale: StudioLocale) => {
    setLocale(newLocale);
    saveLocale(newLocale);
  };

  const handleResetAdvanced = () => {
    cyberAudio.playClick();
    setSelectedEngine("browser");
    setEdgeQuality("fast");
    setDehaloRadius(2);
    setAlphaChoke(1);
    setFeatherRadius(1.5);
    setSelectedPurpose("white");
    setCustomColor("#FFFFFF");
  };

  useEffect(() => {
    const handleLangChange = (e: Event) => {
      const custom = e as CustomEvent<StudioLocale>;
      if (custom.detail) {
        setLocale(custom.detail);
      }
    };
    window.addEventListener("plp_studio_lang_change", handleLangChange);
    return () => window.removeEventListener("plp_studio_lang_change", handleLangChange);
  }, []);

  const t = (k: string) => getTranslation(locale, k);

  // Concurrency & lifecycle refs
  const isProcessingRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const urlRegistryRef = useRef<ObjectUrlRegistry>(new ObjectUrlRegistry());
  const requestGenerationIdRef = useRef<number>(0);
  const isFirstRunRef = useRef(true);
  const lastCompletedRunKeyRef = useRef<string | null>(null);

  // Sub-options for Person + Text Only mode
  const [personSubOption, setPersonSubOption] = useState<boolean>(true);
  const [textSubOption, setTextSubOption] = useState<boolean>(true);
  const [keepGraphicsSubOption, setKeepGraphicsSubOption] = useState<boolean>(false);

  // Subscribe to audio changes
  useEffect(() => {
    return cyberAudio.subscribe(() => {
      setAudioMuted(cyberAudio.isMuted());
      setAudioVolume(cyberAudio.getVolume());
    });
  }, []);

  // Pre-warm AI model session during idle browser time
  useEffect(() => {
    if (typeof window !== "undefined" && selectedEngine === "browser") {
      const idleTimer = setTimeout(() => {
        try {
          bgWorkerManager.preloadModel();
          setIsModelCached(true);
        } catch (err) {
          console.warn("[bg-remover] Idle model preload skipped:", err);
        }
      }, 1200);
      return () => clearTimeout(idleTimer);
    }
  }, [selectedEngine]);

  const checkWorkerStatus = async (forceHealthCheck = true) => {
    try {
      setWorkerStatus("checking");
      const url = forceHealthCheck
        ? "/api/remove-bg?checkHealth=true"
        : "/api/remove-bg";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const isConfigured = Boolean(data.configured);
        setIsWorkerConfigured(isConfigured);
        if (!isConfigured) {
          setWorkerStatus("not_configured");
          setWorkerModel(null);
          setWorkerError(null);
        } else if (data.status === "ready") {
          setWorkerStatus("ready");
          setWorkerModel(data.model || "rembg / u2net");
          setDirectWorkerUrl(data.directUrl || null);
          setWorkerError(null);
        } else if (data.status === "unavailable") {
          setWorkerStatus("unavailable");
          setWorkerModel(null);
          setWorkerError(data.error || "Worker offline or unreachable");
        } else {
          setWorkerStatus("configured");
          setWorkerModel(data.model || null);
          setWorkerError(null);
        }
      } else {
        setIsWorkerConfigured(false);
        setWorkerStatus("not_configured");
      }
    } catch {
      setIsWorkerConfigured(false);
      setWorkerStatus("unavailable");
    }
  };

  // Check settings for remote worker configuration on mount and on settings update
  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) {
        checkWorkerStatus(true);
        // Preload in-browser Web Worker model session so first run is warm
        try {
          bgWorkerManager.preloadModel("isnet_fp16");
        } catch {
          // ignore in environments without worker support
        }
      }
    }, 0);

    const onSettingsUpdated = () => {
      if (isMounted) {
        checkWorkerStatus(true);
      }
    };
    window.addEventListener("app:settings-updated", onSettingsUpdated);
    return () => {
      isMounted = false;
      clearTimeout(timer);
      window.removeEventListener("app:settings-updated", onSettingsUpdated);
    };
  }, []);

  // Cleanup object URLs and active abort controller on unmount
  useEffect(() => {
    const registry = urlRegistryRef.current;
    return () => {
      registry.revokeAll();
      cyberAudio.stopScanningHum();
      bgWorkerManager.terminateActiveWorker();
      if (activeAbortControllerRef.current) {
        console.log("[bg-remover] ABORT TRIGGER: useEffect cleanup");
        activeAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Broadcast AI processing changes to the global application shell background
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ai-processing-change", {
        detail: { isProcessing },
      })
    );
  }, [isProcessing]);

  const handleCancel = () => {
    bgWorkerManager.terminateActiveWorker();
    if (activeAbortControllerRef.current) {
      console.log("[bg-remover] ABORT TRIGGER: handleCancel");
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    cyberAudio.playClick();
    cyberAudio.stopScanningHum();
    isProcessingRef.current = false;
    setIsProcessing(false);
    setProgressInfo(null);
    setSlowNotice(null);
    if (workflowStep === "detecting" || workflowStep === "refining") {
      setWorkflowStep(cachedResult ? "edit_mask" : "ready");
    }
  };

  const handleOpenManualMode = async () => {
    if (!imageFile) return;
    setError(null);
    setIsProcessing(false);
    setProgressInfo(null);
    cyberAudio.playClick();

    let imgBitmap: ImageBitmap | null = null;
    try {
      imgBitmap = await createImageBitmap(imageFile);
      const maxDim = 1024;
      let w = imgBitmap.width;
      let h = imgBitmap.height;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(imgBitmap, 0, 0, w, h);
      const srcImageData = ctx.getImageData(0, 0, w, h);

      // Initial mask: full foreground (255) so user can carve away background with Remove brush
      const initialMask = new Uint8ClampedArray(w * h);
      initialMask.fill(255);

      const { createAlphaMaskDataUrl } = await import("@/lib/bg-removal-client");
      const maskUrl = createAlphaMaskDataUrl(initialMask, w, h);
      const { dataUrl: whiteUrl } = await compositeWithSolidColor(imageFile, "#FFFFFF");

      canvas.toBlob((blob) => {
        if (!blob) return;
        if (cachedResult?.transparentUrl) {
          try {
            URL.revokeObjectURL(cachedResult.transparentUrl);
          } catch {}
        }
        const transUrl = urlRegistryRef.current.create(blob);
        setCachedResult({
          transparentBlob: blob,
          transparentUrl: transUrl,
          alphaMaskUrl: maskUrl,
          alphaMaskBuffer: initialMask,
          sourceImageData: srcImageData,
          width: w,
          height: h,
          label: "Manual mask result",
          model: "Manual Edge Correction Studio",
          mode: "preview",
        });
        setInitialCompositeUrl(whiteUrl);
        setWorkflowStep("edit_mask");
      }, "image/png");
    } catch (e) {
      console.error("Failed to open manual mode:", e);
    } finally {
      if (imgBitmap && typeof imgBitmap.close === "function") {
        imgBitmap.close();
      }
    }
  };

  const handleConfirmMask = useCallback(
    async (confirmedMask: Uint8ClampedArray) => {
      if (!cachedResult || !cachedResult.sourceImageData) return;
      cyberAudio.playClick();
      setWorkflowStep("refining");
      setIsProcessing(true);

      try {
        const refinedOutput = await refineAlphaMattingWithMask(
          cachedResult.sourceImageData,
          confirmedMask,
          excludedMaskRef.current,
          {
            mode: activeSelectionMode,
            documentSafeMode:
              activeSelectionMode === "document_poster" ||
              activeSelectionMode === "whole_poster",
            quality: edgeQuality,
            remoteWorker: processingMode === "worker",
            directUrl: directWorkerUrl,
          }
        );

        if (cachedResult.transparentUrl) {
          try {
            URL.revokeObjectURL(cachedResult.transparentUrl);
          } catch {}
        }
        const transUrl = urlRegistryRef.current.create(refinedOutput.transparentBlob);
        refinedOutput.transparentUrl = transUrl;

        const { dataUrl: whiteUrl } = await compositeWithSolidColor(
          refinedOutput.transparentBlob,
          "#FFFFFF"
        );

        setPreviousResult(cachedResult);
        setCachedResult(refinedOutput);
        setInitialCompositeUrl(whiteUrl);
        setWorkflowStep("ready");
        cyberAudio.playMetallicDing();
      } catch (err) {
        console.error("[bg-remover] Mask refinement failed:", err);
        setWorkflowStep("failed");
        setError(
          err instanceof Error
            ? err.message
            : "ការសម្រួលគែមជួបបញ្ហា។ អ្នកអាចកែសម្រួលម៉ាស់ម្តងទៀត។"
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [cachedResult, edgeQuality, processingMode, directWorkerUrl]
  );

  const handleSwitchEngine = (engine: "browser" | "worker") => {
    if (isProcessingRef.current) return;
    if (engine === "worker" && !isWorkerConfigured) return;
    cyberAudio.playClick();
    setSelectedEngine(engine);
  };

  const handleRunSegmentation = async (mode: "preview" | "final" | "worker", targetMaxDim?: number) => {
    if (!imageFile) return;
    if (isProcessingRef.current) {
      console.log("[bg-remover] Ignoring duplicate click during processing");
      return;
    }
    const priorResult = cachedResult;
    if (cachedResult) {
      setPreviousResult(cachedResult);
    }
    const startTime = performance.now();
    if (!imageFile) return;

    // Safe optimization: Reuse previous result when image bytes and settings are unchanged
    const runKey = `${imageFile.name}_${imageFile.size}_${imageFile.lastModified}_${mode}_${targetMaxDim || "def"}_${activeSelectionMode}`;
    if (lastCompletedRunKeyRef.current === runKey && cachedResult) {
      console.log(`[bg-remover] Reusing previous result for unchanged image & settings: ${runKey}`);
      return;
    }

    if (mode === "worker" && (!isWorkerConfigured || workerStatus === "unavailable")) {
      setError(
        workerStatus === "unavailable"
          ? `Remote Worker មិនអាចភ្ជាប់បានទេ (OFFLINE / UNAVAILABLE): ${workerError || "Connection timed out"}។ សូមប្រើ Browser AI ជំនួសវិញ។`
          : "Remote Worker មិនទាន់កំណត់ក្នុង Settings (BACKGROUND_REMOVAL_WORKER_URL)។ សូមប្រើ Browser AI ជំនួសវិញ。"
      );
      return;
    }

    if (activeAbortControllerRef.current) {
      console.log(`[bg-remover] ABORT TRIGGER: handleRunSegmentation starting new mode=${mode}`);
      activeAbortControllerRef.current.abort();
    }
    const currentGenerationId = ++requestGenerationIdRef.current;
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    isProcessingRef.current = true;
    setIsProcessing(true);
    setWorkflowStep("detecting");
    setError(null);
    setSlowNotice(null);
    setProgressInfo(null);
    setProcessingMode(mode);

    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    // ── Stage Deadlines & Stall Detection ──
    // 1. Soft slow notice at 20 seconds: Informational only, does NOT fail or abort
    const slowTimer = setTimeout(() => {
      if (activeAbortControllerRef.current === abortController) {
        setSlowNotice(
          `SYS_NOTICE: Model processing taking longer than usual on this device (elapsed: ${STAGE_DEADLINES.SLOW_NOTICE_SEC}s)...`
        );
      }
    }, STAGE_DEADLINES.SLOW_NOTICE_SEC * 1000);

    // 2. Cold asset download deadline: 120 seconds
    let assetLoadTimer: NodeJS.Timeout | null = setTimeout(() => {
      if (activeAbortControllerRef.current === abortController) {
        console.log(`[bg-remover] Asset download deadline reached (${STAGE_DEADLINES.COLD_ASSET_LOAD_SEC}s)`);
        abortController.abort(
          new Error(
            `ASSET_LOAD_TIMEOUT: Model asset loading timed out after ${STAGE_DEADLINES.COLD_ASSET_LOAD_SEC}s. Please check network connection and retry.`
          )
        );
      }
    }, STAGE_DEADLINES.COLD_ASSET_LOAD_SEC * 1000);

    // 3. Inference deadline: 60s for preview, 90s for final
    let inferenceTimer: NodeJS.Timeout | null = null;
    const startInferenceDeadline = () => {
      if (assetLoadTimer) {
        clearTimeout(assetLoadTimer);
        assetLoadTimer = null;
      }
      if (!inferenceTimer) {
        const infDuration =
          mode === "preview"
            ? STAGE_DEADLINES.INFERENCE_PREVIEW_SEC
            : STAGE_DEADLINES.INFERENCE_FINAL_SEC;
        inferenceTimer = setTimeout(() => {
          if (activeAbortControllerRef.current === abortController) {
            console.log(`[bg-remover] Inference deadline reached (${infDuration}s)`);
            abortController.abort(
              new Error(
                `INFERENCE_TIMEOUT: Model inference timed out after ${infDuration}s on this device. You can retry or open Manual Mask Mode.`
              )
            );
          }
        }, infDuration * 1000);
      }
    };

    try {
      console.log(`[bg-remover] Starting segmentation for ${imageFile.name}, mode=${mode}`);
      let output: BgRemovalOutput;

      if (activeSelectionMode === "document_poster" || activeSelectionMode === "whole_poster") {
        // DOCUMENT SAFE MODE: AI MATTE DISABLED
        // Zero worker calls, zero model inference, 100% byte-identical RGB preservation.
        const segResult = await segmentObjectSelection(imageFile, {
          mode: activeSelectionMode,
          signal: abortController.signal,
        });

        excludedMaskRef.current = segResult.excludedMask;

        const { width, height, sourceImageData, activeMask } = segResult;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context for document segmentation.");

        const outImgData = ctx.createImageData(width, height);
        const outData = outImgData.data;
        const srcData = sourceImageData.data;
        const total = width * height;
        for (let i = 0; i < total; i++) {
          const pIdx = i * 4;
          outData[pIdx] = srcData[pIdx];
          outData[pIdx + 1] = srcData[pIdx + 1];
          outData[pIdx + 2] = srcData[pIdx + 2];
          outData[pIdx + 3] = activeMask[i];
        }
        ctx.putImageData(outImgData, 0, 0);

        const transparentBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to create blob for document cutout."));
          }, "image/png");
        });

        const transUrl = urlRegistryRef.current.create(transparentBlob);
        const { createAlphaMaskDataUrl } = await import("@/lib/bg-removal-client");
        const maskUrl = createAlphaMaskDataUrl(activeMask, width, height);

        const elapsedTotal = Math.round(performance.now() - startTime);
        output = {
          transparentBlob,
          transparentUrl: transUrl,
          alphaMaskUrl: maskUrl,
          alphaMaskBuffer: activeMask,
          sourceImageData,
          width,
          height,
          sourceWidth: segResult.sourceWidth,
          sourceHeight: segResult.sourceHeight,
          wasDownscaled: false,
          label: "Document Safe Mode (AI Matte Disabled)",
          model: "DOCUMENT SAFE MODE: AI MATTE DISABLED",
          mode: "preview",
          metrics: {
            uploadDecodeMs: segResult.metrics?.uploadDecodeMs ?? 20,
            segmentationMs: segResult.metrics?.segmentationMs ?? 5,
            maskRefineMs: segResult.metrics?.maskRefineMs ?? 5,
            mattingMs: 0,
            encodingMs: Math.max(1, elapsedTotal - (segResult.metrics?.uploadDecodeMs ?? 20)),
            totalMs: elapsedTotal,
          },
        };
      } else if (mode === "worker") {
        output = await removeBackgroundRemote(imageFile, {
          refine: edgeQuality !== "fast",
          quality: edgeQuality,
          directUrl: directWorkerUrl,
          signal: abortController.signal,
          mode: activeSelectionMode,
        });
        const elapsedTotal = Math.round(performance.now() - startTime);
        if (output.metrics) {
          output.metrics.totalMs = elapsedTotal;
        } else {
          output.metrics = { totalMs: elapsedTotal };
        }
      } else {
        const autoRes = resolveAutoQualityWorkingResolution({
          mode: activeSelectionMode,
          edgeQuality,
        });
        const effectiveDim = targetMaxDim ?? autoRes.resolution;
        const segResult = await segmentObjectSelection(imageFile, {
          mode: activeSelectionMode,
          targetMaxDimension: effectiveDim,
          signal: abortController.signal,
          onProgress: (p) => {
            setProgressInfo(p);
            if (p.stage === "Segmenting" || p.stage === "Refining mask") {
              startInferenceDeadline();
            }
          },
        });

        excludedMaskRef.current = segResult.excludedMask;

        const { width, height, sourceImageData, activeMask } = segResult;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context for segmentation.");

        const outImgData = ctx.createImageData(width, height);
        const outData = outImgData.data;
        const srcData = sourceImageData.data;
        const total = width * height;
        for (let i = 0; i < total; i++) {
          const pIdx = i * 4;
          outData[pIdx] = srcData[pIdx];
          outData[pIdx + 1] = srcData[pIdx + 1];
          outData[pIdx + 2] = srcData[pIdx + 2];
          outData[pIdx + 3] = activeMask[i];
        }
        ctx.putImageData(outImgData, 0, 0);

        const transparentBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to create blob for selection cutout."));
          }, "image/png");
        });

        const transUrl = urlRegistryRef.current.create(transparentBlob);
        const { createAlphaMaskDataUrl } = await import("@/lib/bg-removal-client");
        const maskUrl = createAlphaMaskDataUrl(activeMask, width, height);

        const elapsedTotal = Math.round(performance.now() - startTime);
        output = {
          transparentBlob,
          transparentUrl: transUrl,
          alphaMaskUrl: maskUrl,
          alphaMaskBuffer: activeMask,
          sourceImageData,
          width,
          height,
          sourceWidth: segResult.sourceWidth,
          sourceHeight: segResult.sourceHeight,
          wasDownscaled: false,
          label: "Browser AI result",
          model: "@imgly/isnet_fp16",
          mode,
          metrics: segResult.metrics || { totalMs: elapsedTotal },
        };
      }

      console.log(`[bg-remover] Segmentation finished for ${imageFile.name}`);

      if (
        requestGenerationIdRef.current !== currentGenerationId ||
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController
      ) {
        console.log(`[bg-remover] Discarding result for ${imageFile.name} because superseded/stale`);
        return;
      }

      // Composite initially onto White #FFFFFF
      const { dataUrl } = await compositeWithSolidColor(output.transparentBlob, "#FFFFFF");

      if (
        requestGenerationIdRef.current !== currentGenerationId ||
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController
      ) {
        return;
      }

      setCachedResult(output);
      setInitialCompositeUrl(dataUrl);
      setIsModelCached(true);
      setWorkflowStep("edit_mask");

      recordExecutionTelemetry({
        isFirstRun: isFirstRunRef.current,
        totalMs: output.metrics?.totalMs || Math.round(performance.now() - startTime),
        modelLoadMs: output.metrics?.modelLoadMs,
        inferenceMs: output.metrics?.inferenceMs || output.metrics?.segmentationMs,
        inputWidth: output.sourceWidth || output.width,
        inputHeight: output.sourceHeight || output.height,
        inferenceWidth: output.width,
        inferenceHeight: output.height,
      });
      isFirstRunRef.current = false;
      lastCompletedRunKeyRef.current = runKey;

      cyberAudio.playShutter();
      cyberAudio.playMetallicDing();
    } catch (err: unknown) {
      cyberAudio.stopScanningHum();

      const errMessage = err instanceof Error ? err.message : String(err);
      const isTimeout =
        errMessage.includes("TIMEOUT") ||
        (abortController.signal.reason instanceof Error &&
          abortController.signal.reason.message.includes("TIMEOUT"));

      if (isTimeout) {
        const rawReason =
          abortController.signal.reason instanceof Error
            ? abortController.signal.reason.message
            : errMessage;
        const cleanMsg = rawReason
          .replace("ASSET_LOAD_TIMEOUT: ", "")
          .replace("INFERENCE_TIMEOUT: ", "");
        setError(cleanMsg);
        return;
      }

      if (
        err instanceof Error &&
        (err.name === "NOT_CONFIGURED" || errMessage.includes("NOT_CONFIGURED"))
      ) {
        setError(
          "Remote Worker microservice is not configured in settings. Switched to Browser AI mode (runs locally with complete privacy and zero cost)."
        );
        setProcessingMode("preview");
        return;
      }

      if (
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController ||
        (err instanceof Error &&
          (err.name === "AbortError" || errMessage.toLowerCase().includes("abort")))
      ) {
        console.log(`[bg-remover] Exiting catch silently for ${imageFile.name} (aborted/superseded)`);
        return;
      }

      console.error("[bg-remover] Error:", err);
      setWorkflowStep("failed");
      // Retain previous valid result if clean cut failed
      if (priorResult && !cachedResult) {
        setCachedResult(priorResult);
      }
      setError(
        err instanceof Error
          ? err.message
          : "ដំណើរការកាត់រូបភាពជួបបញ្ហា។ អ្នកអាចព្យាយាមម្តងទៀត ឬដំណើរការកម្រិត 1024px។"
      );
    } finally {
      clearTimeout(slowTimer);
      if (assetLoadTimer) clearTimeout(assetLoadTimer);
      if (inferenceTimer) clearTimeout(inferenceTimer);
      setSlowNotice(null);

      if (activeAbortControllerRef.current === abortController) {
        cyberAudio.stopScanningHum();
        activeAbortControllerRef.current = null;
        isProcessingRef.current = false;
        setIsProcessing(false);
        setProgressInfo(null);
      }
    }
  };

  const handleFileSelect = (file: File | null) => {
    console.log(`[bg-remover] handleFileSelect called for file=${file?.name}`);
    ++requestGenerationIdRef.current;
    bgWorkerManager.terminateActiveWorker();
    if (activeAbortControllerRef.current) {
      console.log(`[bg-remover] ABORT TRIGGER: handleFileSelect aborting active controller for new file=${file?.name}`);
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
      isProcessingRef.current = false;
      setIsProcessing(false);
    }

    urlRegistryRef.current.revokeAll();
    setImageFile(file);
    setCachedResult(null);
    setInitialCompositeUrl(null);
    setError(null);
    setProgressInfo(null);
    setWorkflowStep("ready");
    excludedMaskRef.current = null;

    if (file) {
      cyberAudio.playHydraulicHiss();
      const url = urlRegistryRef.current.create(file);
      setOriginalUrl(url);
    } else {
      setOriginalUrl(null);
    }
  };

  const handleReset = () => {
    cyberAudio.playClick();
    cyberAudio.stopScanningHum();
    ++requestGenerationIdRef.current;
    bgWorkerManager.terminateActiveWorker();
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    isProcessingRef.current = false;
    setIsProcessing(false);
    setProgressInfo(null);
    setSlowNotice(null);
    urlRegistryRef.current.revokeAll();
    setImageFile(null);
    setOriginalUrl(null);
    setCachedResult(null);
    setInitialCompositeUrl(null);
    setError(null);
    setWorkflowStep("ready");
    excludedMaskRef.current = null;
  };

  const scannerSteps = [
    "[1/4] Preparing image...",
    "[2/4] Loading AI model...",
    progressInfo?.stage
      ? `[3/4] ${progressInfo.stage}...`
      : "[3/4] Removing background...",
    "[4/4] Finishing edges & preparing result...",
  ];

  return (
    <div
      className={`relative space-y-5 text-slate-100 transition-colors duration-300 ${studioFont}`}
      data-app-state={manualState}
      data-studio-theme={studioTheme}
    >
      {/* ── Workstation Command Deck Instrument Header ── */}
      <div className="relative z-30">
        <BgStudioNav
          theme={theme}
          onToggleTheme={handleToggleTheme}
          audioMuted={audioMuted}
          onToggleAudio={handleToggleAudio}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenHelp={() => setIsHelpOpen(true)}
          isProcessing={isProcessing}
          activeFont={studioFont}
          onChangeFont={handleChangeFont}
          activeStudioTheme={studioTheme}
          onChangeStudioTheme={handleChangeStudioTheme}
          activeLocale={locale}
          onChangeLocale={handleChangeLocale}
        />
      </div>

      {/* ── Workstation Engineering Specification Header Plate ── */}
      <div className="relative z-10">
        <BgStudioHero locale={locale} />
      </div>


      {/* ── Main Control Console ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── UPPER CONTROLS: Upload, Keep, Process ── */}
        <div className="lg:col-span-5 lg:col-start-1 lg:row-start-1 flex flex-col gap-4">
          {/* Accessible Screen Reader Status Announcement */}
          <div role="status" aria-live="polite" className="sr-only">
            {isProcessing ? "កំពុងដំណើរការកាត់រូបភាព..." : cachedResult ? "ដំណើរការកាត់រូបភាពរួចរាល់" : error ? `កំហុស: ${error}` : "ត្រៀមរួចរាល់"}
          </div>

          <div className="machine-module relative border border-slate-800/90 bg-slate-950/85 backdrop-blur-md p-5 space-y-4 shadow-xl font-mono">
            {/* Corner brackets */}
            <div className="pointer-events-none absolute top-0 left-0 h-2.5 w-2.5 border-t-2 border-l-2 border-cyan-400/70" />
            <div className="pointer-events-none absolute top-0 right-0 h-2.5 w-2.5 border-t-2 border-r-2 border-cyan-400/70" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-2.5 w-2.5 border-b-2 border-l-2 border-cyan-400/70" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 border-b-2 border-r-2 border-cyan-400/70" />

            {/* Corner rivets */}
            <div className="pointer-events-none absolute top-1.5 left-1.5 h-1 w-1 bg-slate-700/80" />
            <div className="pointer-events-none absolute top-1.5 right-1.5 h-1 w-1 bg-slate-700/80" />
            <div className="pointer-events-none absolute bottom-1.5 left-1.5 h-1 w-1 bg-slate-700/80" />
            <div className="pointer-events-none absolute bottom-1.5 right-1.5 h-1 w-1 bg-slate-700/80" />

            {/* Card Header */}
            <div className="flex items-center justify-between border-b border-slate-800/90 pb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-cyan-400 animate-pulse" />
                <h2 className="text-xs font-bold tracking-wider text-slate-200 uppercase font-mono">
                  AI Background Studio
                </h2>
              </div>
              <span className="text-[10px] bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 font-bold font-mono">
                Workstation Mode
              </span>
            </div>

            {/* ── GROUP A: UPLOAD ── */}
            <div className="space-y-1">
              <BgUploadZone
                onFileSelect={handleFileSelect}
                selectedFile={imageFile}
                disabled={isProcessing}
                label="Upload image / បញ្ចូលរូបភាព"
                hint="PNG, JPG, WEBP · Max 12MB"
              />
            </div>

            {/* ── GROUP B: WHAT DO YOU WANT TO KEEP? ── */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider">
                <span>What do you want to keep? / រក្សាទុក</span>
                <span className="text-cyan-400 font-bold text-[10px]">
                  {activeSelectionMode === "preserve_all_foreground"
                    ? "All foreground"
                    : activeSelectionMode === "person_text_only" || activeSelectionMode === "person_plus_text"
                    ? "Person + Text"
                    : activeSelectionMode === "person" || activeSelectionMode === "person_only"
                    ? "Person only"
                    : activeSelectionMode === "whole_product" || activeSelectionMode === "product_only"
                    ? "Product only"
                    : activeSelectionMode === "document_poster" || activeSelectionMode === "whole_poster"
                    ? "Document/text"
                    : "Custom"}
                </span>
              </div>

              <div role="radiogroup" aria-label="What do you want to keep?" className="space-y-2 text-xs font-mono">
                {/* Top 2 Primary Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* 1. Keep foreground (Default) */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={activeSelectionMode === "preserve_all_foreground"}
                    data-testid="content-mode-all"
                    data-testid-alias="content-mode-preserve-all"
                    onClick={() => {
                      cyberAudio.playClick();
                      setActiveSelectionMode("preserve_all_foreground");
                    }}
                    className={`min-h-[48px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all ${
                      activeSelectionMode === "preserve_all_foreground"
                        ? "border-emerald-400 bg-emerald-950/60 text-white font-bold ring-1 ring-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                        : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[11px]">
                      <span className="h-2 w-2 rounded-none bg-emerald-400" />
                      <span>1. Keep foreground (Default)</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5">All people, products, animals, and objects</span>
                  </button>

                  {/* 2. Keep person + text */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={activeSelectionMode === "person_text_only" || activeSelectionMode === "person_plus_text"}
                    data-testid="content-mode-person-text-only"
                    data-testid-alias="content-mode-person-text"
                    onClick={() => {
                      cyberAudio.playClick();
                      setActiveSelectionMode("person_text_only");
                    }}
                    className={`min-h-[48px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all ${
                      activeSelectionMode === "person_text_only" || activeSelectionMode === "person_plus_text"
                        ? "border-pink-400 bg-pink-950/60 text-white font-bold ring-1 ring-pink-400/40 shadow-[0_0_12px_rgba(244,114,182,0.2)]"
                        : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[11px]">
                      <span className="h-2 w-2 rounded-none bg-pink-400" />
                      <span>2. Keep person + text</span>
                    </div>
                    <span className="text-[10px] text-pink-300/80 mt-0.5">Person and text strokes; removes poster backdrop</span>
                  </button>
                </div>

                {/* Sub-options for Person + Text Only mode */}
                {(activeSelectionMode === "person_text_only" || activeSelectionMode === "person_plus_text") && (
                  <div className="p-2.5 bg-slate-950/90 border border-pink-500/30 space-y-1.5">
                    <div className="text-[10.5px] text-pink-200 font-bold">
                      Person + Text Sub-options:
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10.5px]">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                        <input
                          type="checkbox"
                          data-testid="sub-option-person"
                          checked={personSubOption}
                          onChange={(e) => setPersonSubOption(e.target.checked)}
                          className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Keep detected person</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                        <input
                          type="checkbox"
                          data-testid="sub-option-text"
                          checked={textSubOption}
                          onChange={(e) => setTextSubOption(e.target.checked)}
                          className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Keep detected text</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                        <input
                          type="checkbox"
                          data-testid="sub-option-keep-graphics"
                          checked={keepGraphicsSubOption}
                          onChange={(e) => setKeepGraphicsSubOption(e.target.checked)}
                          className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Keep graphics</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Collapsible: More Keep Options */}
                <details className="group border border-slate-800/80 bg-slate-900/40 p-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-slate-400 hover:text-cyan-300 select-none flex items-center justify-between">
                    <span>More keep options / ជម្រើសបន្ថែម</span>
                    <span className="text-[9px] text-cyan-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 mt-1 border-t border-slate-800">
                    {/* 3. Person only */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activeSelectionMode === "person" || activeSelectionMode === "person_only"}
                      data-testid="content-mode-person"
                      onClick={() => {
                        cyberAudio.playClick();
                        setActiveSelectionMode("person");
                      }}
                      className={`min-h-[44px] flex flex-col items-start justify-center p-2 rounded-none border text-left transition-all ${
                        activeSelectionMode === "person" || activeSelectionMode === "person_only"
                          ? "border-purple-400 bg-purple-950/60 text-white font-bold ring-1 ring-purple-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[10.5px]">
                        <span className="h-1.5 w-1.5 rounded-none bg-purple-400" />
                        <span>Person only</span>
                      </div>
                      <span className="text-[9.5px] text-slate-400 mt-0.5">Keep human subject; remove poster text</span>
                    </button>

                    {/* 4. Product only */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activeSelectionMode === "whole_product" || activeSelectionMode === "product_only"}
                      data-testid="content-mode-product"
                      onClick={() => {
                        cyberAudio.playClick();
                        setActiveSelectionMode("whole_product");
                      }}
                      className={`min-h-[44px] flex flex-col items-start justify-center p-2 rounded-none border text-left transition-all ${
                        activeSelectionMode === "whole_product" || activeSelectionMode === "product_only"
                          ? "border-amber-400 bg-amber-950/60 text-white font-bold ring-1 ring-amber-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[10.5px]">
                        <span className="h-1.5 w-1.5 rounded-none bg-amber-400" />
                        <span>Product only</span>
                      </div>
                      <span className="text-[9.5px] text-slate-400 mt-0.5">Whole product, packages, boxes</span>
                    </button>

                    {/* 5. Document / text */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activeSelectionMode === "document_poster" || activeSelectionMode === "whole_poster" || activeSelectionMode === "document_text"}
                      data-testid="content-mode-document"
                      onClick={() => {
                        cyberAudio.playClick();
                        setActiveSelectionMode("document_poster");
                      }}
                      className={`min-h-[44px] flex flex-col items-start justify-center p-2 rounded-none border text-left transition-all ${
                        activeSelectionMode === "document_poster" || activeSelectionMode === "whole_poster" || activeSelectionMode === "document_text"
                          ? "border-cyan-400 bg-cyan-950/60 text-white font-bold ring-1 ring-cyan-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[10.5px]">
                        <span className="h-1.5 w-1.5 rounded-none bg-cyan-400" />
                        <span>Document/text</span>
                      </div>
                      <span className="text-[9.5px] text-slate-400 mt-0.5">Preserves page, text, logos byte-identical</span>
                    </button>

                    {/* 6. Custom mask */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activeSelectionMode === "custom" || activeSelectionMode === "custom_mask"}
                      data-testid="content-mode-custom"
                      onClick={() => {
                        cyberAudio.playClick();
                        setActiveSelectionMode("custom");
                      }}
                      className={`min-h-[44px] flex flex-col items-start justify-center p-2 rounded-none border text-left transition-all ${
                        activeSelectionMode === "custom" || activeSelectionMode === "custom_mask"
                          ? "border-rose-400 bg-rose-950/60 text-white font-bold ring-1 ring-rose-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[10.5px]">
                        <span className="h-1.5 w-1.5 rounded-none bg-rose-400" />
                        <span>Custom mask</span>
                      </div>
                      <span className="text-[9.5px] text-slate-400 mt-0.5">Paint custom areas with brushes</span>
                    </button>
                  </div>
                </details>
              </div>
            </div>

            {/* ── GROUP C: PROCESS ── */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
              {/* Quality Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider">
                  <span>Processing quality / គុណភាព</span>
                  <span className="text-cyan-400 font-bold text-[10px]">
                    {edgeQuality === "fast" ? "Fast" : edgeQuality === "balanced" ? "Balanced" : "Fine details"}
                  </span>
                </div>
                <div role="radiogroup" aria-label="Processing quality" className="grid grid-cols-3 gap-1.5 text-xs font-mono">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={edgeQuality === "fast"}
                    data-testid="edge-quality-fast"
                    onClick={() => {
                      cyberAudio.playClick();
                      setEdgeQuality("fast");
                    }}
                    disabled={isProcessing}
                    className={`min-h-[40px] flex items-center justify-center p-1.5 rounded-none border text-center transition-all ${
                      edgeQuality === "fast"
                        ? "border-cyan-400 bg-cyan-950/60 text-white font-bold ring-1 ring-cyan-400/40"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <span className="text-[11px]">Fast / លឿន</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={edgeQuality === "balanced"}
                    data-testid="edge-quality-balanced"
                    onClick={() => {
                      cyberAudio.playClick();
                      setEdgeQuality("balanced");
                    }}
                    disabled={isProcessing}
                    className={`min-h-[40px] flex items-center justify-center p-1.5 rounded-none border text-center transition-all ${
                      edgeQuality === "balanced"
                        ? "border-purple-400 bg-purple-950/60 text-white font-bold ring-1 ring-purple-400/40"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <span className="text-[11px]">Balanced / តុល្យភាព</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={edgeQuality === "quality" || edgeQuality === "fine_details"}
                    data-testid="edge-quality-quality"
                    onClick={() => {
                      cyberAudio.playClick();
                      setEdgeQuality("fine_details");
                    }}
                    disabled={isProcessing}
                    className={`min-h-[40px] flex items-center justify-center p-1.5 rounded-none border text-center transition-all ${
                      edgeQuality === "quality" || edgeQuality === "fine_details"
                        ? "border-emerald-400 bg-emerald-950/60 text-white font-bold ring-1 ring-emerald-400/40"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <span className="text-[11px]">Fine details / លម្អិត</span>
                  </button>
                </div>
              </div>

              {/* Primary Visually Dominant Button */}
              {selectedEngine === "worker" ? (
                <button
                  type="button"
                  data-testid="run-remote-worker-btn"
                  onClick={() => handleRunSegmentation("worker")}
                  disabled={!imageFile || isProcessing || !isWorkerConfigured || workerStatus === "unavailable"}
                  className={`min-h-[50px] group relative w-full overflow-hidden rounded-none border p-3.5 text-center transition-all duration-200 active:scale-[0.98] font-mono cursor-pointer ${
                    isProcessing && processingMode === "worker"
                      ? "pointer-events-none opacity-80 border-purple-400 bg-purple-950/50"
                      : !imageFile || !isWorkerConfigured || workerStatus === "unavailable"
                      ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50"
                      : "border-purple-400 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-700 text-white shadow-[0_0_25px_rgba(168,85,247,0.3)] hover:brightness-110 ring-1 ring-purple-400/50 font-bold"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    {isProcessing && processingMode === "worker" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    ) : (
                      <Server className="h-5 w-5 text-white" />
                    )}
                    <span className="text-sm font-black uppercase tracking-wider text-white">
                      Remove background (Remote Worker)
                    </span>
                  </div>
                </button>
              ) : (
                <div className="space-y-2">
                  {/* Primary Action Button */}
                  <button
                    type="button"
                    data-testid="fast-preview-start-btn"
                    onClick={() => handleRunSegmentation("preview")}
                    disabled={!imageFile || isProcessing}
                    className={`min-h-[50px] group relative w-full overflow-hidden rounded-none border p-3.5 text-center transition-all duration-200 active:scale-[0.98] font-mono cursor-pointer ${
                      isProcessing && processingMode === "preview"
                        ? "pointer-events-none opacity-80 border-cyan-400 bg-cyan-950/60"
                        : !imageFile
                        ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50 text-slate-500"
                        : "border-cyan-400 bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 text-white shadow-[0_0_25px_rgba(0,240,255,0.3)] hover:brightness-110 ring-1 ring-cyan-400/50 font-bold"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {isProcessing && processingMode === "preview" ? (
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      ) : (
                        <Zap className="h-5 w-5 text-white" />
                      )}
                      <span className="text-sm font-black uppercase tracking-wider text-white">
                        Remove background / លុបផ្ទៃខាងក្រោយ
                      </span>
                    </div>
                  </button>

                  {/* Secondary High Quality Option */}
                  <button
                    type="button"
                    onClick={() => handleRunSegmentation("final")}
                    disabled={!imageFile || isProcessing}
                    className={`min-h-[42px] w-full flex items-center justify-center gap-2 rounded-none border p-2 text-center transition-all duration-200 active:scale-[0.98] font-mono ${
                      isProcessing && processingMode === "final"
                        ? "pointer-events-none opacity-80 border-emerald-400 bg-emerald-950/50 text-emerald-300"
                        : !imageFile
                        ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/40 text-slate-500"
                        : "border-slate-700 bg-slate-900/80 hover:border-emerald-400/70 text-slate-300 hover:text-white cursor-pointer"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[11px] font-bold tracking-wider">
                      Clean Cut (High quality) / កាត់ច្បាស់គុណភាពខ្ពស់
                    </span>
                  </button>
                </div>
              )}

              {/* Friendly Processing Status */}
              {isProcessing && (
                <div className="space-y-2 rounded-none border border-cyan-500/40 bg-slate-950/90 p-3 text-xs shadow-lg font-mono">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-cyan-300 font-bold">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                      <span>
                        {progressInfo?.stage === "Preparing image"
                          ? "Preparing image... / កំពុងរៀបចំរូបភាព..."
                          : progressInfo?.stage === "Quick cut in progress" ||
                            progressInfo?.stage === "Segmenting" ||
                            progressInfo?.stage === "Loading model"
                          ? "Quick cut in progress... / កំពុងកាត់រហ័ស..."
                          : progressInfo?.stage === "Preview ready"
                          ? "Preview ready / រូបភាពមើលសាកល្បងរួចរាល់"
                          : progressInfo?.stage === "Optional edge refinement" ||
                            progressInfo?.stage === "Refining mask"
                          ? "Optional edge refinement... / សម្រួលគែមជម្រើស..."
                          : "Processing... / កំពុងដំណើរការ..."}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="cancel-btn"
                        data-testid-alias="processing-cancel-btn"
                        onClick={handleCancel}
                        className="min-h-[36px] flex items-center gap-1 rounded-none border border-rose-500/40 bg-rose-950/60 px-2.5 py-1 text-[10px] text-rose-300 hover:bg-rose-900/60 uppercase cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Cancel
                      </button>
                      <button
                        type="button"
                        data-testid="reset-btn"
                        data-testid-alias="processing-reset-btn"
                        onClick={handleReset}
                        className="min-h-[36px] flex items-center gap-1 rounded-none border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300 hover:text-white uppercase cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Reset
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── RIGHT: Preview & Interactive Mask Studio Deck ── */}
        <div className="lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:row-span-2 flex flex-col gap-5">
          {/* Error Banner with Retry */}
          {error && (
            <div className="flex flex-col gap-2 rounded-none border border-rose-500/50 bg-rose-950/40 p-4 shadow-[0_0_20px_rgba(244,63,94,0.2)] font-mono">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                    SEGMENTATION ERROR
                  </h4>
                  <p className="text-[11px] text-rose-200/80 leading-relaxed font-mono">{error}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  type="button"
                  data-testid="error-retry-btn"
                  onClick={() => handleRunSegmentation(processingMode)}
                  className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-rose-500/50 bg-rose-900/60 px-3 py-2 text-xs font-bold text-white hover:bg-rose-900/90 transition-colors uppercase font-mono"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>ព្យាយាមម្តងទៀត (RETRY)</span>
                </button>
                <button
                  type="button"
                  data-testid="retry-browser-ai-btn"
                  onClick={() => {
                    setSelectedEngine("browser");
                    handleRunSegmentation("preview");
                  }}
                  className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-emerald-500/50 bg-emerald-950/60 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-900/70 transition-colors uppercase font-mono"
                >
                  <Zap className="h-3.5 w-3.5 text-emerald-400" />
                  <span>ប្តូរទៅ BROWSER AI (RETRY USING BROWSER AI)</span>
                </button>
                <button
                  type="button"
                  data-testid="retry-1024-btn"
                  onClick={() => handleRunSegmentation("preview", 1024)}
                  className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-cyan-500/50 bg-cyan-950/60 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-900/70 transition-colors uppercase font-mono"
                >
                  <Zap className="h-3.5 w-3.5 text-cyan-400" />
                  <span>កម្រិត 1024PX (RETRY AT 1024PX)</span>
                </button>
                <button
                  type="button"
                  data-testid="error-cancel-btn"
                  onClick={handleCancel}
                  className="min-h-[44px] flex items-center gap-1 rounded-none border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white transition-colors uppercase font-mono"
                >
                  <XCircle className="h-3.5 w-3.5 text-slate-400" />
                  <span>បោះបង់ (CANCEL)</span>
                </button>
                <button
                  type="button"
                  data-testid="error-reset-btn"
                  onClick={handleReset}
                  className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white transition-colors uppercase font-mono"
                >
                  <span>កំណត់ឡើងវិញ (RESET)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="min-h-[44px] flex items-center gap-1 rounded-none border border-slate-800 bg-slate-950 px-2.5 py-2 text-xs text-slate-400 hover:text-white transition-colors uppercase font-mono"
                >
                  <span>បិទសារ (DISMISS)</span>
                </button>
              </div>
            </div>
          )}

          {/* High-Tech Robotic Scanner View with Laser Animation */}
          {isProcessing && (
            <div data-testid="processing-scanner" className="relative overflow-hidden rounded-none border border-cyan-500/40 bg-slate-950/95 shadow-[0_0_35px_rgba(0,240,255,0.15)] font-mono">
              {/* Corner target reticles */}
              <div className="pointer-events-none absolute top-1.5 left-1.5 h-3 w-3 border-t-2 border-l-2 border-cyan-400 z-30" />
              <div className="pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 border-t-2 border-r-2 border-cyan-400 z-30" />
              <div className="pointer-events-none absolute bottom-1.5 left-1.5 h-3 w-3 border-b-2 border-l-2 border-cyan-400 z-30" />
              <div className="pointer-events-none absolute bottom-1.5 right-1.5 h-3 w-3 border-b-2 border-r-2 border-cyan-400 z-30" />

              {/* Laser Scanning Beam & Scanlines */}
              <div className="animate-laser-scan opacity-90" />
              <div className="pointer-events-none absolute inset-0 cyber-scanlines opacity-30 z-20" />

              {/* Live Image Preview Under Active Scan */}
              {originalUrl && (
                <div className="relative flex items-center justify-center p-6 min-h-[300px] bg-slate-950/60">
                  <img
                    src={originalUrl}
                    alt="Scanning in progress"
                    className="max-h-[360px] max-w-full object-contain opacity-70 filter brightness-90 contrast-125"
                  />
                </div>
              )}

              {/* Robotic Scanner telemetry console */}
              <div className="p-4 border-t border-cyan-500/30 bg-slate-900/90">
                <RoboticScanner
                  active={true}
                  moduleName={
                    processingMode === "worker"
                      ? "REMOTE WORKER SERVICE"
                      : processingMode === "final"
                      ? "CLEAN CUT MATTING"
                      : "FAST PREVIEW"
                  }
                  steps={scannerSteps}
                  subtext={
                    processingMode === "worker"
                      ? "Remote background removal microservice"
                      : processingMode === "final"
                      ? "Local edge refinement and color decontamination"
                      : "High-speed preview segmentation with browser model caching"
                  }
                />
              </div>
            </div>
          )}

          {/* Output Deck: ColorStudio with Interactive Mask Correction Studio */}
          {cachedResult && originalUrl && initialCompositeUrl && !isProcessing && (
            <div className="space-y-3 font-mono">
              <ColorStudio
                originalUrl={originalUrl}
                originalFile={imageFile}
                transparentBlob={cachedResult.transparentBlob}
                transparentUrl={cachedResult.transparentUrl}
                alphaMaskUrl={cachedResult.alphaMaskUrl}
                alphaMaskBuffer={cachedResult.alphaMaskBuffer}
                sourceImageData={cachedResult.sourceImageData}
                initialCompositeUrl={initialCompositeUrl}
                width={cachedResult.width}
                height={cachedResult.height}
                sourceWidth={cachedResult.sourceWidth}
                sourceHeight={cachedResult.sourceHeight}
                wasDownscaled={cachedResult.wasDownscaled}
                mode={cachedResult.mode}
                initialPurpose={selectedPurpose === "custom" ? "white" : selectedPurpose}
                provider={cachedResult.model}
                processingLabel={cachedResult.label}
                metrics={cachedResult.metrics}
                diagnostics={cachedResult.diagnostics}
                rollbackTriggered={cachedResult.rollbackTriggered}
                previousResult={previousResult}
                onRestorePreviousResult={() => {
                  if (previousResult) {
                    setCachedResult(previousResult);
                    if (previousResult.transparentBlob) {
                      compositeWithSolidColor(previousResult.transparentBlob, "#FFFFFF")
                        .then(({ dataUrl }) => setInitialCompositeUrl(dataUrl))
                        .catch(() => {});
                    }
                  }
                }}
                isProcessingFinal={isProcessing && processingMode === "final"}
                workflowStep={workflowStep}
                onConfirmMask={handleConfirmMask}
                initialSelectionMode={activeSelectionMode}
                onReset={handleReset}
                onRerunFinal={(dim?: number) => { handleRunSegmentation("final", dim); }}
              />
            </div>
          )}

          {/* Standby Empty State: Streamlined Workspace */}
          {!cachedResult && !isProcessing && !error && (
            <div
              className="machine-module relative flex flex-1 min-h-[460px] flex-col items-center justify-center border border-slate-800/90 bg-slate-950/90 p-8 sm:p-12 text-center backdrop-blur-md shadow-2xl font-mono overflow-hidden"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, rgba(30, 41, 59, 0.3) 25%, transparent 25%),
                  linear-gradient(-45deg, rgba(30, 41, 59, 0.3) 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, rgba(30, 41, 59, 0.3) 75%),
                  linear-gradient(-45deg, transparent 75%, rgba(30, 41, 59, 0.3) 75%)
                `,
                backgroundSize: "24px 24px",
                backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
              }}
            >
              {/* Corner industrial brackets */}
              <div className="pointer-events-none absolute top-0 left-0 h-4 w-4 border-t-2 border-l-2 border-cyan-400/70" />
              <div className="pointer-events-none absolute top-0 right-0 h-4 w-4 border-t-2 border-r-2 border-cyan-400/70" />
              <div className="pointer-events-none absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-cyan-400/70" />
              <div className="pointer-events-none absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-cyan-400/70" />

              {/* Corner rivets */}
              <div className="pointer-events-none absolute top-2 left-2 h-1.5 w-1.5 bg-slate-700/80" />
              <div className="pointer-events-none absolute top-2 right-2 h-1.5 w-1.5 bg-slate-700/80" />
              <div className="pointer-events-none absolute bottom-2 left-2 h-1.5 w-1.5 bg-slate-700/80" />
              <div className="pointer-events-none absolute bottom-2 right-2 h-1.5 w-1.5 bg-slate-700/80" />

              {/* Center Radar Scanner Reticle */}
              <div className="relative mb-5 flex h-20 w-20 items-center justify-center border border-cyan-500/40 bg-cyan-950/40 shadow-[0_0_25px_rgba(0,240,255,0.15)]">
                {/* Rotating scanner ring */}
                <div className="pointer-events-none absolute inset-1 border border-dashed border-cyan-400/50 animate-[spin_20s_linear_infinite]" />
                {/* Crosshairs */}
                <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-[1px] bg-cyan-500/30 -translate-x-1/2" />
                <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] bg-cyan-500/30 -translate-y-1/2" />
                <Sparkles className="h-7 w-7 text-cyan-300 animate-pulse" />
              </div>

              <h3 className="text-sm font-bold tracking-wider uppercase text-white font-mono flex items-center gap-2">
                <span>Your result will appear here / លទ្ធផលនឹងបង្ហាញនៅទីនេះ</span>
              </h3>
              <p className="mt-2 text-xs text-slate-400 font-mono max-w-md leading-relaxed">
                Upload an image to begin
              </p>
            </div>
          )}
        </div>

        {/* ── LOWER CONTROL DECK: OUTPUT & ADVANCED SETTINGS ── */}
        <div className="lg:col-span-5 lg:col-start-1 lg:row-start-2 flex flex-col gap-4">
          <div className="machine-module relative border border-slate-800/90 bg-slate-950/85 backdrop-blur-md p-4 sm:p-5 space-y-4 shadow-xl font-mono">
            {/* Corner brackets */}
            <div className="pointer-events-none absolute top-0 left-0 h-2.5 w-2.5 border-t-2 border-l-2 border-cyan-400/70" />
            <div className="pointer-events-none absolute top-0 right-0 h-2.5 w-2.5 border-t-2 border-r-2 border-cyan-400/70" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-2.5 w-2.5 border-b-2 border-l-2 border-cyan-400/70" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 border-b-2 border-r-2 border-cyan-400/70" />

            {/* Corner rivets */}
            <div className="pointer-events-none absolute top-1.5 left-1.5 h-1 w-1 bg-slate-700/80" />
            <div className="pointer-events-none absolute top-1.5 right-1.5 h-1 w-1 bg-slate-700/80" />
            <div className="pointer-events-none absolute bottom-1.5 left-1.5 h-1 w-1 bg-slate-700/80" />
            <div className="pointer-events-none absolute bottom-1.5 right-1.5 h-1 w-1 bg-slate-700/80" />

            {/* Output Background Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase text-slate-300 font-mono tracking-wider font-bold">
                <span>{t("output.title")}</span>
                <span className="text-cyan-400 font-bold text-[11px]">
                  {selectedPurpose === "white"
                    ? t("output.white")
                    : selectedPurpose === "pink"
                    ? t("output.pink")
                    : selectedPurpose === "transparent"
                    ? t("output.transparent")
                    : t("output.custom")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    cyberAudio.playClick();
                    setSelectedPurpose("white");
                  }}
                  className={`min-h-[44px] flex items-center justify-center gap-2 p-2 rounded-none border text-center transition-all cursor-pointer ${
                    selectedPurpose === "white"
                      ? "border-cyan-400 bg-cyan-950/60 text-white font-bold ring-1 ring-cyan-400/40 shadow-sm"
                      : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <span className="h-3 w-3 bg-white border border-slate-400 shrink-0" />
                  <span className="text-xs font-semibold">{t("output.white").split(" ")[0]}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    cyberAudio.playClick();
                    setSelectedPurpose("pink");
                  }}
                  className={`min-h-[44px] flex items-center justify-center gap-2 p-2 rounded-none border text-center transition-all cursor-pointer ${
                    selectedPurpose === "pink"
                      ? "border-pink-400 bg-pink-950/60 text-white font-bold ring-1 ring-pink-400/40 shadow-sm"
                      : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <span className="h-3 w-3 border border-pink-400 shrink-0" style={{ backgroundColor: "#FFF0F5" }} />
                  <span className="text-xs font-semibold">{t("output.pink").split(" ")[0]}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    cyberAudio.playClick();
                    setSelectedPurpose("transparent");
                  }}
                  className={`min-h-[44px] flex items-center justify-center gap-2 p-2 rounded-none border text-center transition-all cursor-pointer ${
                    selectedPurpose === "transparent"
                      ? "border-indigo-400 bg-indigo-950/60 text-white font-bold ring-1 ring-indigo-400/40 shadow-sm"
                      : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <span className="text-xs">🏁</span>
                  <span className="text-xs font-semibold">{t("output.transparent").split(" ")[0]}</span>
                </button>
              </div>
            </div>

            {/* Grouped Advanced Settings Panel */}
            <div className="pt-2 border-t border-slate-800/80">
              <BgAdvancedSettings
                locale={locale}
                selectedEngine={selectedEngine}
                onSelectEngine={handleSwitchEngine}
                isWorkerConfigured={isWorkerConfigured}
                edgeQuality={edgeQuality === "quality" ? "fine_details" : edgeQuality}
                onChangeEdgeQuality={(q) => setEdgeQuality(q)}
                dehaloRadius={dehaloRadius}
                onChangeDehaloRadius={setDehaloRadius}
                alphaChoke={alphaChoke}
                onChangeAlphaChoke={setAlphaChoke}
                featherRadius={featherRadius}
                onChangeFeatherRadius={setFeatherRadius}
                selectedPurpose={selectedPurpose}
                onSelectPurpose={setSelectedPurpose}
                customColor={customColor}
                onChangeCustomColor={setCustomColor}
                onOpenManualMask={handleOpenManualMode}
                hasImage={Boolean(imageFile)}
                isProcessing={isProcessing}
                isModelCached={isModelCached}
                metrics={cachedResult?.metrics}
                diagnostics={cachedResult?.diagnostics}
                onResetAdvanced={handleResetAdvanced}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Studio Modals ── */}
      <BgStudioSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        audioMuted={audioMuted}
        onToggleAudio={handleToggleAudio}
        edgeQuality={edgeQuality}
        onChangeEdgeQuality={(q) => setEdgeQuality(q)}
      />

      <BgStudioHelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}
