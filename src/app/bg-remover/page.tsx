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
  AlertCircle,
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
  requiresTextDetection,
  runRequiredTextDetection,
  detectTextRegionsFromBlob,
  TextDetectionExecutionResult,
  ProcessingStageMetrics,
} from "@/lib/bg-removal-client";
import { SelectionMode } from "@/lib/bg-compositor";
import { bgWorkerManager } from "@/lib/bg-removal-worker-manager";
import { cyberAudio } from "@/lib/cyber-audio";
import { ObjectUrlRegistry } from "@/lib/processing-utils";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { BgProcessingCard } from "@/components/bg-remover/BgProcessingCard";
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
import { bgRemovalQueue, QueueStatus } from "@/lib/concurrency-queue";

export default function BgRemoverPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cachedResult, setCachedResult] = useState<BgRemovalOutput | null>(null);
  const [previousResult, setPreviousResult] = useState<BgRemovalOutput | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [initialCompositeUrl, setInitialCompositeUrl] = useState<string | null>(null);
  const [selectedPurpose, setSelectedPurpose] = useState<"white" | "pink" | "transparent" | "custom">("transparent");
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
    "auto_portrait"
  );
  const [simplifiedQuality, setSimplifiedQuality] = useState<"fast" | "quality">("fast");
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
  const [failedMetrics, setFailedMetrics] = useState<ProcessingStageMetrics | null>(null);
  const [liveStageMetrics, setLiveStageMetrics] = useState<ProcessingStageMetrics | null>(null);

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
      const { dataUrl: whiteUrl } = await compositeWithSolidColor(imageFile, "#F4F5F7");

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
          "#F4F5F7"
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
    if (!imageFile || isProcessingRef.current) {
      console.log("[bg-remover] Ignoring duplicate click or missing image during processing");
      return;
    }
    isProcessingRef.current = true;
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
    setFailedMetrics(null);
    setLiveStageMetrics(null);
    setSlowNotice(null);
    setProgressInfo(null);
    setProcessingMode(mode);

    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    // ── Hard Timeout Enforcement using AbortController (20s Fast, 35s High Quality) ──
    const hardTimeoutMs = mode === "preview" ? 20000 : 35000;
    const hardTimeoutTimer = setTimeout(() => {
      if (activeAbortControllerRef.current === abortController) {
        console.warn(`[bg-remover] Hard timeout triggered after ${hardTimeoutMs / 1000}s`);
        abortController.abort(
          new Error(
            `TIMEOUT: ដំណើរការលើសកំណត់ពេល (${hardTimeoutMs / 1000} វិនាទី)។ Processing exceeded ${hardTimeoutMs / 1000}s deadline. Please retry with Fast Mode or use Browser AI.`
          )
        );
      }
    }, hardTimeoutMs);

    try {
      console.log(`[bg-remover] Starting segmentation for ${imageFile.name}, mode=${mode}`);
      const output = await bgRemovalQueue.enqueue(
        async () => {
          let segOutput: BgRemovalOutput;

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
        segOutput = {
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
      } else {
        const isWorkerMode = mode === "worker";
        let precomputedTextDetection: TextDetectionExecutionResult | undefined = undefined;

        if (requiresTextDetection(activeSelectionMode)) {
          precomputedTextDetection = await runRequiredTextDetection({
            keepMode: activeSelectionMode,
            image: imageFile,
            detectText: async (blob) => detectTextRegionsFromBlob(blob, abortController.signal),
            signal: abortController.signal,
          });

          if (precomputedTextDetection.status === "failed") {
            cyberAudio.stopScanningHum();
            if (activeAbortControllerRef.current === abortController) {
              setIsProcessing(false);
              isProcessingRef.current = false;
              setError("Text Detection: Required but failed. Could not detect text regions for Person + Text mode.");
              setFailedMetrics({
                totalMs: precomputedTextDetection.durationMs,
                textDetectionMs: precomputedTextDetection.durationMs,
                textDetectionStatus: "failed",
                textDetectionReason: "Required but failed",
              });
            }
            return;
          }
        }

        if (precomputedTextDetection && precomputedTextDetection.status === "completed") {
          setLiveStageMetrics({
            totalMs: precomputedTextDetection.durationMs,
            textDetectionMs: precomputedTextDetection.durationMs,
            textDetectionStatus: "completed",
            textDetectionDurationMs: precomputedTextDetection.durationMs,
          });
        }

        const autoRes = resolveAutoQualityWorkingResolution({
          mode: activeSelectionMode,
          edgeQuality,
          hasSmallKhmerText: precomputedTextDetection?.hasSmallOrUncertainKhmer,
          textConfidence: precomputedTextDetection?.hasSmallOrUncertainKhmer ? "uncertain" : "high",
        });
        const effectiveDim = isWorkerMode ? undefined : (targetMaxDim ?? autoRes.resolution);

        const segResult = await segmentObjectSelection(imageFile, {
          mode: activeSelectionMode,
          targetMaxDimension: effectiveDim,
          quality: edgeQuality,
          keepPerson: personSubOption,
          keepText: textSubOption,
          keepGraphics: keepGraphicsSubOption,
          precomputedTextDetection,
          remoteWorker: isWorkerMode,
          directUrl: directWorkerUrl,
          signal: abortController.signal,
          onProgress: (p) => {
            setProgressInfo(p);
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
        let transparentPixelCount = 0;
        for (let i = 0; i < total; i++) {
          const pIdx = i * 4;
          outData[pIdx] = srcData[pIdx];
          outData[pIdx + 1] = srcData[pIdx + 1];
          outData[pIdx + 2] = srcData[pIdx + 2];
          outData[pIdx + 3] = activeMask[i];
          if (activeMask[i] < 128) {
            transparentPixelCount++;
          }
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
        segOutput = {
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
          label: isWorkerMode ? "Cloud API result" : "Browser AI result",
          model: isWorkerMode
            ? (workerModel || "rembg / u2net (Remote Worker)")
            : "@imgly/isnet_fp16 (On-Device WASM)",
          mode,
          metrics: segResult.metrics || { totalMs: elapsedTotal },
          visualDebug: segResult.visualDebug,
          refinedMask: segResult.refinedMask,
          removedComponentsMask: segResult.removedComponentsMask,
          removedComponentsCount: segResult.removedComponentsCount,
          hasIsolatedBlobsRemaining: segResult.hasIsolatedBlobsRemaining,
        };

        console.log("[bg-remover-trace]", {
          selectedMode: activeSelectionMode,
          selectedQuality: simplifiedQuality,
          engine: isWorkerMode ? "Remote Worker" : "Browser Web Worker",
          requestId: currentGenerationId,
          endpoint: isWorkerMode ? (directWorkerUrl || "/api/remove-bg") : "browser-worker",
          inputDimensions: `${segResult.sourceWidth || width}x${segResult.sourceHeight || height}`,
          outputDimensions: `${width}x${height}`,
          textDetectionRan: Boolean(precomputedTextDetection),
          autoPortraitPipelineRan: activeSelectionMode === "auto_portrait" || activeSelectionMode === "person" || activeSelectionMode === "person_only",
          blobCountBefore: (segResult.removedComponentsCount || 0) + (segResult.hasIsolatedBlobsRemaining ? 1 : 0),
          blobCountAfter: segResult.hasIsolatedBlobsRemaining ? 1 : 0,
          alphaTransparentPixelCount: transparentPixelCount,
          totalDurationMs: elapsedTotal,
        });
      }

          return segOutput;
        },
        {
          signal: abortController.signal,
          onQueueStatus: (status) => {
            setQueueStatus(status);
            if (status.position > 0) {
              setProgressInfo({
                key: "queue",
                current: 0,
                total: 100,
                percent: 5,
                stage: "Preparing image",
                message: `Queued (Position #${status.position} of ${status.totalQueued}) · Max 4 active users`,
              });
            }
          },
        }
      );

      console.log(`[bg-remover] Segmentation finished for ${imageFile.name}`);

      if (
        requestGenerationIdRef.current !== currentGenerationId ||
        abortController.signal.aborted ||
        activeAbortControllerRef.current !== abortController
      ) {
        console.log(`[bg-remover] Discarding result for ${imageFile.name} because superseded/stale`);
        return;
      }

      if (!output) {
        throw new Error("No output generated from background removal.");
      }

      // Check for remaining isolated blobs in Auto Portrait mode
      if (
        output.hasIsolatedBlobsRemaining &&
        (activeSelectionMode === "auto_portrait" || activeSelectionMode === "person" || activeSelectionMode === "person_only")
      ) {
        setError(
          "Disconnected foreground components (isolated blobs) detected after portrait matting. Please verify in Advanced Diagnostics or refine using Manual Mask."
        );
      }

      // Composite initially onto Off-White #F4F5F7
      const { dataUrl } = await compositeWithSolidColor(output.transparentBlob, "#F4F5F7");

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
      setQueueStatus(null);
      clearTimeout(hardTimeoutTimer);
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

  // Instant acceptance test sample generator:
  // - Person wearing black suit and blue tie
  // - White background
  // - Small isolated blue dot to the right of the face
  const handleLoadSample = () => {
    cyberAudio.playClick();
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Pure White Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 640, 480);

    // 2. Black suit jacket and shoulders
    ctx.fillStyle = "#111827"; // Dark black suit
    ctx.beginPath();
    ctx.ellipse(320, 450, 190, 140, 0, Math.PI, 0, false);
    ctx.fill();

    // 3. White shirt collar in V-neck opening
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.moveTo(270, 310);
    ctx.lineTo(320, 370);
    ctx.lineTo(370, 310);
    ctx.closePath();
    ctx.fill();

    // 4. Blue tie running down from collar
    ctx.fillStyle = "#2563eb"; // Royal blue tie
    ctx.beginPath();
    ctx.moveTo(312, 320);
    ctx.lineTo(328, 320);
    ctx.lineTo(334, 450);
    ctx.lineTo(320, 475);
    ctx.lineTo(306, 450);
    ctx.closePath();
    ctx.fill();

    // 5. Neck
    ctx.fillStyle = "#f5d0b5"; // Skin tone
    ctx.fillRect(296, 250, 48, 65);

    // 6. Ears
    ctx.beginPath();
    ctx.ellipse(248, 200, 14, 24, 0, 0, Math.PI * 2);
    ctx.ellipse(392, 200, 14, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // 7. Face
    ctx.beginPath();
    ctx.ellipse(320, 200, 72, 85, 0, 0, Math.PI * 2);
    ctx.fill();

    // 8. Hair (black hair on top and temples)
    ctx.fillStyle = "#09090b";
    ctx.beginPath();
    ctx.arc(320, 175, 78, Math.PI * 0.82, Math.PI * 2.18);
    ctx.fill();

    // 9. Eyes and mouth
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(295, 195, 5, 0, Math.PI * 2);
    ctx.arc(345, 195, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#be123c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(320, 230, 18, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // 10. CRITICAL ACCEPTANCE TEST ELEMENT:
    // Small isolated blue dot to the right of the face
    ctx.fillStyle = "#2563eb"; // Blue dot
    ctx.beginPath();
    ctx.arc(460, 175, 7, 0, Math.PI * 2);
    ctx.fill();

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "acceptance-portrait-suit-tie.png", { type: "image/png" });
      handleFileSelect(file);
    }, "image/png");
  };

  const handleDownloadTransparentPng = () => {
    if (!cachedResult?.transparentBlob) return;
    cyberAudio.playClick();
    const url = URL.createObjectURL(cachedResult.transparentBlob);
    const link = document.createElement("a");
    const baseStem = imageFile?.name ? imageFile.name.replace(/\.[a-zA-Z0-9]+$/i, "") : "portrait-cutout";
    link.download = `${baseStem}-transparent.png`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
      <div className="relative z-10 space-y-2">
        <BgStudioHero
          locale={locale}
          selectedEngine={selectedEngine}
          workerStatus={workerStatus}
          isModelCached={isModelCached}
        />

        {/* Unified Status Area (Requirement 4) */}
        <div className="flex items-center justify-between border border-slate-800 bg-slate-900/90 px-4 py-2 font-mono text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">STUDIO STATUS:</span>
            <span
              data-testid="bg-unified-status"
              className={`font-bold ${
                error
                  ? "text-rose-400"
                  : isProcessing
                  ? "text-cyan-400"
                  : cachedResult
                  ? "text-emerald-400"
                  : imageFile
                  ? "text-amber-400"
                  : "text-slate-300"
              }`}
            >
              ● {error ? "ERROR" : isProcessing ? "PROCESSING" : cachedResult ? "COMPLETE" : imageFile ? "IMAGE LOADED" : "READY"}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            Ready → Uploading → Processing → Complete → Error
          </span>
        </div>
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

            {/* ── 1. UPLOAD IMAGE ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
                  1. Upload Image
                </span>
                <button
                  type="button"
                  data-testid="sample-image-btn"
                  onClick={handleLoadSample}
                  disabled={isProcessing}
                  className="min-h-[32px] flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-950/60 px-3 py-1 text-xs font-mono font-bold text-cyan-300 hover:bg-cyan-900/60 transition-colors cursor-pointer disabled:opacity-50"
                  title="Load acceptance test portrait (Black suit & blue tie with isolated blue dot)"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Sample Portrait (Suit & Tie)</span>
                </button>
              </div>
              <BgUploadZone
                onFileSelect={handleFileSelect}
                selectedFile={imageFile}
                disabled={isProcessing}
                label="Upload image"
                hint="PNG, JPG, WEBP · Max 12MB"
              />
            </div>

            {/* ── 2. MODE: Auto Portrait vs Auto General ── */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80 font-mono">
              <div className="flex items-center justify-between text-xs uppercase text-slate-300 tracking-wider">
                <span className="font-bold">2. Mode</span>
                <span className="text-cyan-400 font-bold text-[11px]">
                  {activeSelectionMode === "auto_portrait" ? "Auto Portrait (Recommended)" : "Auto General"}
                </span>
              </div>
              <div role="radiogroup" aria-label="Mode" className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={activeSelectionMode === "auto_portrait"}
                  data-testid="content-mode-auto-portrait"
                  onClick={() => {
                    cyberAudio.playClick();
                    setActiveSelectionMode("auto_portrait");
                  }}
                  className={`min-h-[48px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all cursor-pointer ${
                    activeSelectionMode === "auto_portrait"
                      ? "border-cyan-400 bg-cyan-950/70 text-white font-bold ring-1 ring-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                      : "border-slate-850 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span className="h-2 w-2 bg-cyan-400" />
                    <span>Auto Portrait</span>
                  </div>
                  <span className="text-[10px] text-cyan-200/70 mt-0.5">Person, suit, hair, ears</span>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={activeSelectionMode === "auto_general" || activeSelectionMode === "preserve_all_foreground"}
                  data-testid="content-mode-auto-general"
                  data-testid-alias="content-mode-all"
                  onClick={() => {
                    cyberAudio.playClick();
                    setActiveSelectionMode("auto_general");
                  }}
                  className={`min-h-[48px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all cursor-pointer ${
                    activeSelectionMode === "auto_general" || activeSelectionMode === "preserve_all_foreground"
                      ? "border-emerald-400 bg-emerald-950/70 text-white font-bold ring-1 ring-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                      : "border-slate-850 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span className="h-2 w-2 bg-emerald-400" />
                    <span>Auto General</span>
                  </div>
                  <span className="text-[10px] text-emerald-200/70 mt-0.5">Products, pets, scenes</span>
                </button>
              </div>
            </div>

            {/* ── 3. QUALITY: Fast vs High Quality ── */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80 font-mono">
              <div className="flex items-center justify-between text-xs uppercase text-slate-300 tracking-wider">
                <span className="font-bold">3. Quality</span>
                <span className="text-cyan-400 font-bold text-[11px]">
                  {simplifiedQuality === "fast" ? "Fast (<10s)" : "High Quality (<20s)"}
                </span>
              </div>
              <div role="radiogroup" aria-label="Quality" className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  role="radio"
                  aria-checked={simplifiedQuality === "fast"}
                  data-testid="edge-quality-fast"
                  onClick={() => {
                    cyberAudio.playClick();
                    setSimplifiedQuality("fast");
                    setEdgeQuality("fast");
                  }}
                  className={`min-h-[42px] flex items-center justify-center gap-2 p-2 rounded-none border text-center transition-all cursor-pointer ${
                    simplifiedQuality === "fast"
                      ? "border-cyan-400 bg-cyan-950/70 text-white font-bold ring-1 ring-cyan-400/40 shadow-sm"
                      : "border-slate-850 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="font-semibold text-xs">Fast (Usually under 10s)</span>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={simplifiedQuality === "quality"}
                  data-testid="edge-quality-quality"
                  onClick={() => {
                    cyberAudio.playClick();
                    setSimplifiedQuality("quality");
                    setEdgeQuality("fine_details");
                  }}
                  className={`min-h-[42px] flex items-center justify-center gap-2 p-2 rounded-none border text-center transition-all cursor-pointer ${
                    simplifiedQuality === "quality"
                      ? "border-emerald-400 bg-emerald-950/70 text-white font-bold ring-1 ring-emerald-400/40 shadow-sm"
                      : "border-slate-850 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-semibold text-xs">High Quality (Usually under 25s)</span>
                </button>
              </div>
            </div>

            {/* ── 4. PRIMARY BUTTON: Remove Background ── */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80 font-mono">
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  data-testid="fast-preview-start-btn"
                  data-testid-alias="remove-background-btn"
                  onClick={() => {
                    if (simplifiedQuality === "fast") {
                      handleRunSegmentation("preview", 1024);
                    } else {
                      if (selectedEngine === "worker" && isWorkerConfigured && workerStatus === "ready") {
                        handleRunSegmentation("worker");
                      } else {
                        handleRunSegmentation("final", 1500);
                      }
                    }
                  }}
                  disabled={!imageFile || isProcessing}
                  className={`min-h-[50px] flex-1 group relative overflow-hidden rounded-none border p-3.5 text-center transition-all duration-200 active:scale-[0.98] font-mono cursor-pointer ${
                    isProcessing
                      ? "pointer-events-none opacity-80 border-cyan-400 bg-cyan-950/60"
                      : !imageFile
                      ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50 text-slate-500"
                      : "border-cyan-400 bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 text-white shadow-[0_0_25px_rgba(0,240,255,0.3)] hover:brightness-110 ring-1 ring-cyan-400/50 font-bold"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    {isProcessing ? (
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    ) : (
                      <Zap className="h-5 w-5 text-white" />
                    )}
                    <span className="text-sm font-black uppercase tracking-wider text-white">
                      {isProcessing ? "Processing Cutout..." : "Remove Background"}
                    </span>
                  </div>
                </button>

                {isProcessing && (
                  <button
                    type="button"
                    data-testid="cancel-btn"
                    onClick={handleCancel}
                    className="min-h-[50px] px-4 flex items-center justify-center gap-1.5 rounded-none border border-rose-500/50 bg-rose-950/70 text-rose-300 hover:bg-rose-900/80 transition-colors uppercase font-mono font-bold text-xs cursor-pointer"
                    title="Cancel processing"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>

              {/* Actionable recovery option when High Quality is unavailable */}
              {error && error.includes("High Quality engine unavailable") && (
                <div className="p-3 border border-amber-500/40 bg-amber-950/60 font-mono text-xs text-amber-200 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="font-bold">High Quality Engine Unavailable</span>
                  </div>
                  <p className="text-[11px] text-amber-100/80">
                    The Remote Worker is currently unreachable. You can process immediately with Fast Mode on your device.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSimplifiedQuality("fast");
                      setEdgeQuality("fast");
                      handleRunSegmentation("preview", 640);
                    }}
                    className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>Run with Fast Mode (&lt;10s)</span>
                  </button>
                </div>
              )}

              {/* Queue Status Notification when job is waiting */}
              {queueStatus && queueStatus.position > 0 && (
                <div data-testid="queue-status-banner" className="flex items-center justify-between p-3 border border-amber-500/50 bg-amber-950/60 font-mono text-xs text-amber-200">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
                    <span>
                      SYS_QUEUE: ជួររង់ចាំ (Queued: #{queueStatus.position} of {queueStatus.totalQueued}) · កំណត់អ្នកប្រើប្រាស់ ៤ នាក់ស្របគ្នា (Max 4 active users)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-2.5 py-1 border border-rose-500/50 bg-rose-950/60 text-rose-300 text-[10px] font-bold uppercase hover:bg-rose-900 transition-colors cursor-pointer"
                  >
                    Cancel Wait
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
                          ? "Preparing image..."
                          : progressInfo?.stage === "Quick cut in progress" ||
                            progressInfo?.stage === "Segmenting" ||
                            progressInfo?.stage === "Loading model"
                          ? "Removing background..."
                          : progressInfo?.stage === "Preview ready"
                          ? "Preview ready"
                          : progressInfo?.stage === "Optional edge refinement" ||
                            progressInfo?.stage === "Refining mask"
                          ? "Refining edges & color decontamination..."
                          : "Processing..."}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="reset-btn"
                        onClick={handleReset}
                        className="min-h-[32px] flex items-center gap-1 rounded-none border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white uppercase cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" /> Reset
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Slow warning banner if >30s (Requirement 10) */}
              {slowNotice && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 border border-amber-500/50 bg-amber-950/60 text-amber-200 text-xs font-mono">
                  <span>{slowNotice}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        handleCancel();
                        setSimplifiedQuality("fast");
                        handleRunSegmentation("preview", 640);
                      }}
                      className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold text-[10px] rounded uppercase cursor-pointer hover:bg-amber-400"
                    >
                      Use Fast Mode
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-2.5 py-1 bg-slate-800 text-slate-200 font-bold text-[10px] rounded uppercase cursor-pointer hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── 5. COLLAPSED ADVANCED PANEL ── */}
            <div className="pt-2 border-t border-slate-800/80">
              <BgAdvancedSettings
                locale={locale}
                activeSelectionMode={activeSelectionMode}
                onSelectSelectionMode={(m) => {
                  cyberAudio.playClick();
                  setActiveSelectionMode(m);
                }}
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
                metrics={cachedResult?.metrics || liveStageMetrics || failedMetrics || undefined}
                diagnostics={cachedResult?.diagnostics}
                visualDebug={cachedResult?.visualDebug}
                onResetAdvanced={handleResetAdvanced}
              />
            </div>
          </div>
        </div>

        {/* ── RIGHT: Preview & Interactive Mask Studio Deck ── */}
        <div className="lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:row-span-2 flex flex-col gap-5">
          {/* ── Deterministic Recovery Card on Error / Timeout / Cancel ── */}
          {error && (
            <div
              data-testid="recovery-card"
              className="flex flex-col gap-3 rounded-2xl border border-rose-500/40 bg-slate-900/95 p-5 shadow-xl backdrop-blur-md font-sans"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-400">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>ការកាត់រូបភាពជួបបញ្ហា</span>
                    <span className="text-xs text-rose-300 font-normal">(Processing Issue / Timeout)</span>
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{error}</p>
                  <p className="text-[11px] text-slate-400">
                    រូបភាពដើមរបស់អ្នកត្រូវបានរក្សាទុក។ សូមជ្រើសរើសជម្រើសស្ដារឡើងវិញខាងក្រោម៖
                  </p>
                </div>
              </div>

              {/* 4 Explicit Recovery Actions */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  data-testid="error-retry-btn"
                  onClick={() => handleRunSegmentation(processingMode)}
                  className="flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-900/40 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-900/70 transition-all cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>ព្យាយាមម្តងទៀត (Retry)</span>
                </button>

                <button
                  type="button"
                  data-testid="retry-fast-mode-btn"
                  onClick={() => {
                    setSimplifiedQuality("fast");
                    handleRunSegmentation("preview", 1024);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-500/50 bg-cyan-950/60 px-3.5 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-900/70 transition-all cursor-pointer"
                >
                  <Zap className="h-3.5 w-3.5 text-cyan-400" />
                  <span>ប្តូរទៅ Fast Mode (Switch to Fast Mode)</span>
                </button>

                <button
                  type="button"
                  data-testid="retry-browser-ai-btn"
                  onClick={() => {
                    setSelectedEngine("browser");
                    handleRunSegmentation("preview");
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/50 bg-emerald-950/60 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-900/70 transition-all cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  <span>ប្រើ Browser AI (Use Browser AI)</span>
                </button>

                <button
                  type="button"
                  data-testid="choose-another-image-btn"
                  onClick={handleReset}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  <ImageOff className="h-3.5 w-3.5 text-slate-400" />
                  <span>ជ្រើសរើសរូបភាពផ្សេង (Choose Another Image)</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Deterministic Stage-based Processing Card (Replaces infinite laser stall) ── */}
          {isProcessing && (
            <BgProcessingCard
              isProcessing={isProcessing}
              processingMode={processingMode}
              progressInfo={progressInfo}
              slowNotice={slowNotice}
              onCancel={handleCancel}
              onReset={handleReset}
              originalUrl={originalUrl}
            />
          )}

          {/* 5. RESULT PANEL: Download Transparent PNG bar */}
          {cachedResult && originalUrl && !isProcessing && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border border-emerald-500/40 bg-slate-950/95 font-mono shadow-lg">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Transparent Cutout Ready ({cachedResult.width}×{cachedResult.height}px)
                  </span>
                  <span className="text-[10.5px] text-slate-400">
                    Engine: {cachedResult.model} · {cachedResult.metrics?.totalMs ?? 0}ms
                  </span>
                </div>
              </div>
              <button
                type="button"
                data-testid="download-transparent-png-btn"
                onClick={handleDownloadTransparentPng}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 rounded-none border border-emerald-400 bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_20px_rgba(16,185,129,0.35)] hover:brightness-110 transition-all cursor-pointer"
              >
                <span>Download Transparent PNG</span>
              </button>
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
                      compositeWithSolidColor(previousResult.transparentBlob, "#F4F5F7")
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

              {/* Center Radar Scanner Reticle */}
              <div className="relative mb-5 flex h-20 w-20 items-center justify-center border border-cyan-500/40 bg-cyan-950/40 shadow-[0_0_25px_rgba(0,240,255,0.15)]">
                <div className="pointer-events-none absolute inset-1 border border-dashed border-cyan-400/50 animate-[spin_20s_linear_infinite]" />
                <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-[1px] bg-cyan-500/30 -translate-x-1/2" />
                <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] bg-cyan-500/30 -translate-y-1/2" />
                <Sparkles className="h-7 w-7 text-cyan-300 animate-pulse" />
              </div>

              <h3 className="text-sm font-bold tracking-wider uppercase text-white font-mono flex items-center gap-2">
                <span>Your transparent cutout will appear here</span>
              </h3>
              <p className="mt-2 text-xs text-slate-400 font-mono max-w-md leading-relaxed">
                Upload a portrait or image to remove the background automatically.
              </p>
            </div>
          )}
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
