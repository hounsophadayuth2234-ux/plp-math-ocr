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

export default function BgRemoverPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cachedResult, setCachedResult] = useState<BgRemovalOutput | null>(null);
  const [previousResult, setPreviousResult] = useState<BgRemovalOutput | null>(null);
  const [initialCompositeUrl, setInitialCompositeUrl] = useState<string | null>(null);
  const [selectedPurpose, setSelectedPurpose] = useState<"white" | "pink" | "transparent">("white");

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

    bgWorkerManager.terminateActiveWorker();
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
        const segResult = await segmentObjectSelection(imageFile, {
          mode: activeSelectionMode,
          targetMaxDimension: targetMaxDim,
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
    "[1/5] PREPARING IMAGE MATRIX (MAX 1024PX)...",
    "[2/5] LOADING MODEL WEIGHTS (ISNET_FP16 CACHE)...",
    progressInfo?.stage
      ? `[3/5] ${progressInfo.stage.toUpperCase()}...`
      : "[3/5] SEGMENTING FOREGROUND & BACKGROUND...",
    "[4/5] REFINING MASK EDGES & SUB-PIXEL MATTING (ZERO AGGRESSIVE EROSION)...",
    "[5/5] READY (COMPOSITING RGB CANVAS & ALPHA BUFFER)...",
  ];

  return (
    <div
      className={`relative space-y-5 text-slate-100 transition-colors duration-300 ${studioFont}`}
      data-app-state={manualState}
      data-studio-theme={studioTheme}
    >
      {/* ── Workstation Command Deck Instrument Header ── */}
      <div className="relative z-10">
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
        />
      </div>

      {/* ── Workstation Engineering Specification Header Plate ── */}
      <div className="relative z-10">
        <BgStudioHero />
      </div>


      {/* ── Main Control Console ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── LEFT: Control Deck & Tactical Switches ── */}
        <div className="flex flex-col gap-5 lg:col-span-5 xl:col-span-4">
          {/* Accessible Screen Reader Status Announcement */}
          <div role="status" aria-live="polite" className="sr-only">
            {isProcessing ? "កំពុងដំណើរការកាត់រូបភាព..." : cachedResult ? "ដំណើរការកាត់រូបភាពរួចរាល់" : error ? `កំហុស: ${error}` : "ត្រៀមរួចរាល់"}
          </div>

          <div className="machine-module relative border border-slate-800/90 bg-slate-950/85 backdrop-blur-md p-5 space-y-4 shadow-2xl font-mono">
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

            <div className="flex items-center justify-between border-b border-slate-800/90 pb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-cyan-400 animate-pulse" />
                <h2 className="text-xs font-bold tracking-wider text-slate-200 uppercase font-mono">
                  {"// SEGMENTATION_CONFIG"}
                </h2>
              </div>
              <span className="text-[10px] bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 font-bold font-mono">
                MODULE 02
              </span>
            </div>

            {/* ── ជំហានទី ១ ៖ ជ្រើសរើសរូបភាព (STEP 1: UPLOAD IMAGE) ── */}
            <div>
              <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider mb-1.5">
                <span>ជំហានទី ១ ៖ ជ្រើសរើសរូបភាព</span>
                <span className="text-cyan-400 font-bold">SOURCE_IMAGE</span>
              </div>
              <BgUploadZone
                onFileSelect={handleFileSelect}
                selectedFile={imageFile}
                disabled={isProcessing}
                label="SOURCE INPUT"
                hint="PNG · JPG · WEBP (MAX 12MB)"
              />
            </div>

            {/* ── ជំហានទី ២ ៖ គោលដៅរក្សាទុក (STEP 2: WHAT DO YOU WANT TO KEEP?) ── */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider">
                <span>What do you want to keep? / តើអ្នកចង់រក្សាទុកអ្វី?</span>
                <span className="text-cyan-400 font-bold uppercase">{activeSelectionMode}</span>
              </div>

              <div role="radiogroup" aria-label="What do you want to keep?" className="space-y-2 text-xs font-mono">
                {/* Primary Modes Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* 1. Preserve all foreground (Default) */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={activeSelectionMode === "preserve_all_foreground"}
                    data-testid="content-mode-preserve-all"
                    onClick={() => {
                      cyberAudio.playClick();
                      setActiveSelectionMode("preserve_all_foreground");
                    }}
                    className={`min-h-[44px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all ${
                      activeSelectionMode === "preserve_all_foreground"
                        ? "border-emerald-400 bg-emerald-950/60 text-white font-bold ring-1 ring-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                        : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[11px]">
                      <span className="h-2 w-2 rounded-none bg-emerald-400" />
                      <span>1. Preserve all foreground (Default)</span>
                    </div>
                    <span className="text-[9px] text-emerald-300/80 mt-0.5">Keep all people, animals, plants, products, text &amp; details</span>
                  </button>

                  {/* 2. Person + Text Only */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={activeSelectionMode === "person_text_only" || activeSelectionMode === "person_plus_text"}
                    data-testid="content-mode-person-text-only"
                    onClick={() => {
                      cyberAudio.playClick();
                      setActiveSelectionMode("person_text_only");
                    }}
                    className={`min-h-[44px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all ${
                      activeSelectionMode === "person_text_only" || activeSelectionMode === "person_plus_text"
                        ? "border-sky-400 bg-sky-950/60 text-white font-bold ring-1 ring-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                        : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[11px]">
                      <span className="h-2 w-2 rounded-none bg-sky-400" />
                      <span>2. Person + Text Only / រក្សាមនុស្ស + អក្សរតែប៉ុណ្ណោះ</span>
                    </div>
                    <span className="text-[9px] text-sky-300/80 mt-0.5">This mode keeps the selected person and text, and removes the poster/background. Use Keep Brush if OCR misses any letters.</span>
                  </button>
                </div>

                {/* Secondary Modes Collapsible Accordion */}
                <details
                  className="group rounded-none border border-slate-800/90 bg-slate-950/40 p-2.5 font-mono"
                  open={["person", "person_only", "whole_product", "product_only", "document_poster", "whole_poster", "document_text", "custom", "custom_mask"].includes(activeSelectionMode) || undefined}
                >
                  <summary className="min-h-[36px] flex items-center justify-between cursor-pointer text-[11px] font-bold text-slate-400 hover:text-cyan-300 select-none">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 bg-cyan-400" />
                      <span>MORE SELECTION MODES (PERSON, PRODUCT, DOCUMENT, CUSTOM) / ជម្រើសបន្ថែម</span>
                    </span>
                    <span className="text-[10px] text-cyan-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 mt-1 border-t border-slate-800/80">
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
                      className={`min-h-[44px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all ${
                        activeSelectionMode === "person" || activeSelectionMode === "person_only"
                          ? "border-purple-400 bg-purple-950/60 text-white font-bold ring-1 ring-purple-400/40 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[11px]">
                        <span className="h-2 w-2 rounded-none bg-purple-400" />
                        <span>3. Person only</span>
                      </div>
                      <span className="text-[9px] text-purple-300/80 mt-0.5">Keep real person; remove printed poster text</span>
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
                      className={`min-h-[44px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all ${
                        activeSelectionMode === "whole_product" || activeSelectionMode === "product_only"
                          ? "border-amber-400 bg-amber-950/60 text-white font-bold ring-1 ring-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[11px]">
                        <span className="h-2 w-2 rounded-none bg-amber-400" />
                        <span>4. Product only</span>
                      </div>
                      <span className="text-[9px] text-amber-300/80 mt-0.5">Keep whole product, white boxes, packages</span>
                    </button>

                    {/* 5. Document / text preserve */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activeSelectionMode === "document_poster" || activeSelectionMode === "whole_poster" || activeSelectionMode === "document_text"}
                      data-testid="content-mode-document"
                      onClick={() => {
                        cyberAudio.playClick();
                        setActiveSelectionMode("document_poster");
                      }}
                      className={`min-h-[44px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all ${
                        activeSelectionMode === "document_poster" || activeSelectionMode === "whole_poster" || activeSelectionMode === "document_text"
                          ? "border-cyan-400 bg-cyan-950/60 text-white font-bold ring-1 ring-cyan-400/40 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[11px]">
                        <span className="h-2 w-2 rounded-none bg-cyan-400" />
                        <span>5. Document/text preserve</span>
                      </div>
                      <span className="text-[9px] text-cyan-300/80 mt-0.5">Byte-perfect page, Khmer text, logos, graphics</span>
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
                      className={`min-h-[44px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all ${
                        activeSelectionMode === "custom" || activeSelectionMode === "custom_mask"
                          ? "border-rose-400 bg-rose-950/60 text-white font-bold ring-1 ring-rose-400/40 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[11px]">
                        <span className="h-2 w-2 rounded-none bg-rose-400" />
                        <span>6. Custom mask</span>
                      </div>
                      <span className="text-[9px] text-rose-300/80 mt-0.5">User paints/clicks exactly what to keep with brush &amp; points</span>
                    </button>
                  </div>
                </details>
              </div>

              {/* Document Safe Mode Badge */}
              {(activeSelectionMode === "document_poster" || activeSelectionMode === "whole_poster") && (
                <div
                  data-testid="document-safe-mode-badge"
                  className="flex items-center justify-between px-3 py-2 bg-emerald-950/80 border border-emerald-400 text-emerald-300 font-mono text-[11px] font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)] mt-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-none bg-emerald-400 animate-pulse" />
                    <span>DOCUMENT SAFE MODE: AI MATTE DISABLED</span>
                  </div>
                  <span className="text-[9px] text-emerald-400/80 font-normal">Byte-Preserved (&lt;1s)</span>
                </div>
              )}

              {/* Mode Explanation & Person + Text Only Options */}
              <div className="text-[9.5px] text-slate-300 leading-relaxed font-mono bg-slate-950/60 p-2.5 border border-slate-800/80">
                {(activeSelectionMode === "person_text_only" || activeSelectionMode === "person_plus_text") && (
                  <div className="space-y-2">
                    <div>
                      👤📝 <strong>Person + Text Only / រក្សាមនុស្ស + អក្សរតែប៉ុណ្ណោះ</strong>៖ This mode keeps the selected person and text, and removes the poster/background. Use Keep Brush if OCR misses any letters. (រក្សារូបមនុស្ស និងអក្សរខ្មែរ/អង់គ្លេសទាំងមូល រួមទាំងជើងអក្សរ ស្រៈ វណ្ណយុត្តិ និងលុបផ្ទៃ poster ពណ៌ស គែមស៊ុម និងផ្ទាំងក្រាហ្វិកខាងក្រោយចោល)
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-800 text-[10px]">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                        <input
                          type="checkbox"
                          data-testid="sub-option-person"
                          checked={personSubOption}
                          onChange={(e) => setPersonSubOption(e.target.checked)}
                          className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Person: keep detected person</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                        <input
                          type="checkbox"
                          data-testid="sub-option-text"
                          checked={textSubOption}
                          onChange={(e) => setTextSubOption(e.target.checked)}
                          className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Text: keep detected text</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                        <input
                          type="checkbox"
                          data-testid="sub-option-keep-graphics"
                          checked={keepGraphicsSubOption}
                          onChange={(e) => setKeepGraphicsSubOption(e.target.checked)}
                          className="accent-pink-500 rounded-none w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Keep selected graphics: optional</span>
                      </label>
                    </div>
                  </div>
                )}
                {(activeSelectionMode === "document_poster" || activeSelectionMode === "whole_poster") && (
                  <span>
                    📄 <strong>Whole poster/document</strong>៖ រក្សាផ្ទៃទំព័រចតុកោណកែងទាំងមូល មិនលុបអក្សរ ឡូហ្គោ ឬរូបមនុស្សដែលបោះពុម្ពខាងក្នុង poster ឡើយ (Bypasses AI, under 1s).
                  </span>
                )}
                {(activeSelectionMode === "person" || activeSelectionMode === "person_only") && (
                  <span>
                    👤 <strong>Person only</strong>៖ កាត់យករូបមនុស្សពិតចេញពីរូបថត មិនរក្សាទុកអក្សរបោះពុម្ពលើ poster ឡើយ។
                  </span>
                )}
                {activeSelectionMode === "preserve_all_foreground" && (
                  <span>
                    🌟 <strong>Preserve all foreground (Default)</strong>៖ រក្សាគ្រប់វត្ថុទាំងអស់ (មនុស្ស សត្វ រុក្ខជាតិ ផលិតផល អក្សរ ឡូហ្គោ និងព័ត៌មានលម្អិតតូចៗ) និងលុបតែផ្ទៃ environmental background ខាងក្រោយប៉ុណ្ណោះ។
                  </span>
                )}
                {(activeSelectionMode === "custom" || activeSelectionMode === "custom_mask") && (
                  <span>
                    🎯 <strong>Custom mask</strong>៖ ជ្រើសរើសវត្ថុដោយដៃតាមរយៈចំណុច (+) / (-) ឬគូសប្រអប់ និងពហុកោណ (Polygon)។
                  </span>
                )}
                {activeSelectionMode === "whole_product" && (
                  <span>
                    📦 <strong>Product cutout</strong>៖ រក្សាផលិតផល និងប្រអប់វេចខ្ចប់ទាំងមូល (Conservative default) ការពារមិនឱ្យកាត់ឆកគម្របប្រអប់។
                  </span>
                )}
              </div>
            </div>

            {/* ── ជំហានទី ៣ ៖ ដំណើរការកាត់រូបភាព (STEP 3: PROCESS EXECUTION) ── */}
            <div className="space-y-2 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider">
                <span>ជំហានទី ៣ ៖ ដំណើរការ AI</span>
                <span className="text-cyan-400 font-bold">EXECUTION</span>
              </div>

              {selectedEngine === "worker" ? (
                <button
                  type="button"
                  data-testid="run-remote-worker-btn"
                  onClick={() => handleRunSegmentation("worker")}
                  disabled={!imageFile || isProcessing || !isWorkerConfigured || workerStatus === "unavailable"}
                  className={`min-h-[48px] group relative w-full overflow-hidden rounded-none border p-3 text-left transition-all duration-200 active:scale-[0.98] font-mono ${
                    isProcessing && processingMode === "worker"
                      ? "pointer-events-none opacity-80 border-purple-400 bg-purple-950/50"
                      : !imageFile || !isWorkerConfigured || workerStatus === "unavailable"
                      ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50"
                      : "border-purple-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-purple-950/40 shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:border-purple-300 ring-1 ring-purple-400/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-purple-400 bg-slate-950 text-purple-400">
                        <Server className="h-4 w-4 text-purple-400" />
                      </div>
                      <div>
                        <div className="text-xs font-black uppercase tracking-wider text-white font-mono flex items-center gap-2">
                          <span>ដំណើរការ REMOTE WORKER</span>
                          <span className={`text-[9px] rounded-none px-1 py-0.2 ${
                            workerStatus === "unavailable"
                              ? "bg-rose-950 border border-rose-500/40 text-rose-300"
                              : "bg-purple-950 border border-purple-500/40 text-purple-300"
                          }`}>
                            {workerStatus === "unavailable" ? "OFFLINE / UNAVAILABLE" : "SERVER"}
                          </span>
                        </div>
                        <span className="text-[10px] text-purple-300/80 font-mono">
                          {workerStatus === "unavailable"
                            ? "Remote Worker មិនអាចភ្ជាប់បានទេ — សូមជ្រើសរើស Browser AI ជំនួសវិញ"
                            : "បញ្ជូនទៅកាន់ Remote AI Server តាមរយៈសុវត្ថិភាព Proxy"}
                        </span>
                      </div>
                    </div>
                    {isProcessing && processingMode === "worker" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                    ) : (
                      <span className="text-[10px] font-bold text-purple-400 font-mono">
                        {workerStatus === "unavailable" ? "[OFFLINE]" : "[START]"}
                      </span>
                    )}
                  </div>
                </button>
              ) : (
                <>
                  {/* Primary: Fast Preview (Highlighted Default) */}
                  <button
                    type="button"
                    data-testid="fast-preview-start-btn"
                    onClick={() => handleRunSegmentation("preview")}
                    disabled={!imageFile || isProcessing}
                    className={`min-h-[48px] group relative w-full overflow-hidden rounded-none border p-3 text-left transition-all duration-200 active:scale-[0.98] font-mono ${
                      isProcessing && processingMode === "preview"
                        ? "pointer-events-none opacity-80 border-cyan-400 bg-cyan-950/50"
                        : !imageFile
                        ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50"
                        : "border-cyan-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 shadow-[0_0_20px_rgba(0,240,255,0.2)] hover:border-cyan-300 ring-1 ring-cyan-400/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-cyan-400 bg-slate-950 text-cyan-400">
                          <Zap className="h-4 w-4 text-cyan-400" />
                        </div>
                        <div>
                          <div className="text-xs font-black uppercase tracking-wider text-white font-mono flex items-center gap-2">
                            <span>ដំណើរការលឿន (FAST PREVIEW)</span>
                            <span className="text-[9px] rounded-none bg-cyan-950 border border-cyan-500/40 text-cyan-300 px-1 py-0.2">
                              លំនាំដើម
                            </span>
                          </div>
                          <span className="text-[10px] text-cyan-300/80 font-mono">
                            ដំណើរការក្នុង Browser ភ្លាមៗ · ឥតគិតថ្លៃ · រក្សាភាពឯកជន
                          </span>
                        </div>
                      </div>
                      {isProcessing && processingMode === "preview" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                      ) : (
                        <span className="text-[10px] font-bold text-cyan-400 font-mono">[START]</span>
                      )}
                    </div>
                  </button>

                  {/* Secondary: Clean Cut (Optional High-Quality Enhancement) */}
                  <button
                    type="button"
                    onClick={() => handleRunSegmentation("final")}
                    disabled={!imageFile || isProcessing}
                    className={`min-h-[44px] group relative w-full overflow-hidden rounded-none border p-3 text-left transition-all duration-200 active:scale-[0.98] font-mono ${
                      isProcessing && processingMode === "final"
                        ? "pointer-events-none opacity-80 border-emerald-400 bg-emerald-950/50"
                        : !imageFile
                        ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50"
                        : "border-emerald-500/40 bg-slate-900/70 hover:border-emerald-400 text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-emerald-500/40 bg-slate-950 text-emerald-400">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                        </div>
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                            កាត់ច្បាស់គុណភាពខ្ពស់ (CLEAN CUT)
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            សម្រាប់រូបភាពធំ ឬត្រូវការគែមច្បាស់ល្អិតល្អន់
                          </span>
                        </div>
                      </div>
                      {isProcessing && processingMode === "final" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-400 font-mono">[HD]</span>
                      )}
                    </div>
                  </button>
                </>
              )}
            </div>

            {/* Multi-Stage Loading Telemetry Banner */}
            {isProcessing && (
              <div className="space-y-2.5 rounded-none border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs shadow-[0_0_15px_rgba(245,158,11,0.15)] font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-300">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                    <span className="font-bold uppercase tracking-wider">
                      {progressInfo?.stage || "SEGMENTING FOREGROUND..."}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="cancel-btn"
                      data-testid-alias="processing-cancel-btn"
                      onClick={handleCancel}
                      className="min-h-[44px] flex items-center gap-1 rounded-none border border-rose-500/40 bg-rose-950/60 px-2.5 py-1 text-[10px] font-mono text-rose-300 hover:bg-rose-900/60 transition-colors uppercase"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      CANCEL
                    </button>
                    <button
                      type="button"
                      data-testid="reset-btn"
                      data-testid-alias="processing-reset-btn"
                      onClick={handleReset}
                      className="min-h-[44px] flex items-center gap-1 rounded-none border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-mono text-slate-300 hover:text-white transition-colors uppercase"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      RESET
                    </button>
                  </div>
                </div>

                {progressInfo && (
                  <div className="space-y-2 pt-1 font-mono">
                    {/* Model Loading Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-cyan-400">
                        <span>Model Loading</span>
                        <span>
                          {progressInfo.modelLoadingPercent ??
                            (progressInfo.stage === "Loading model" ? progressInfo.percent : 100)}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-none bg-slate-800">
                        <div
                          className="h-full bg-cyan-400 transition-all duration-300"
                          style={{
                            width: `${
                              progressInfo.modelLoadingPercent ??
                              (progressInfo.stage === "Loading model" ? progressInfo.percent : 100)
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Processing / Segmentation Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-emerald-400">
                        <span>Inference &amp; Processing</span>
                        <span>
                          {progressInfo.processingPercent ??
                            (progressInfo.stage === "Segmenting" ? progressInfo.percent : 0)}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-none bg-slate-800">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-300"
                          style={{
                            width: `${
                              progressInfo.processingPercent ??
                              (progressInfo.stage === "Segmenting" ? progressInfo.percent : 0)
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {slowNotice && (
                  <div className="rounded-none border border-amber-500/30 bg-amber-950/40 p-2 text-[10px] text-amber-300 font-mono">
                    {slowNotice}
                  </div>
                )}
              </div>
            )}

            {/* ── Advanced Settings & Engine Configuration (ADVANCED COLLAPSIBLE PANEL) ── */}
            <details className="group rounded-none border border-slate-800 bg-slate-950/60 p-3 font-mono">
              <summary className="min-h-[44px] flex items-center justify-between cursor-pointer text-xs font-bold text-slate-400 hover:text-cyan-300 select-none">
                <span className="flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-cyan-400" />
                  <span>ADVANCED SETTINGS &amp; ENGINE CONFIGURATION (ការកំណត់កម្រិតខ្ពស់)</span>
                </span>
                <span className="text-[10px] text-cyan-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>

              <div className="space-y-3.5 pt-3 border-t border-slate-800/80 mt-2 text-xs">
                {/* 1. Background Color / Purpose */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider">
                    <span>ពណ៌ផ្ទៃខាងក្រោយ (Output Background)</span>
                    <span className="text-cyan-400 font-bold">PURPOSE</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        cyberAudio.playClick();
                        setSelectedPurpose("white");
                      }}
                      className={`min-h-[44px] flex flex-col items-center justify-center p-2 rounded-none border text-center transition-all ${
                        selectedPurpose === "white"
                          ? "border-cyan-400 bg-cyan-950/60 text-white font-bold ring-1 ring-cyan-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <span className="h-2.5 w-2.5 bg-white border border-slate-400 mb-1" />
                      <span className="text-[11px] leading-tight font-bold text-white">រូបសំណួរ (ស)</span>
                      <span className="text-[9px] text-slate-400 font-mono">#FFFFFF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        cyberAudio.playClick();
                        setSelectedPurpose("pink");
                      }}
                      className={`min-h-[44px] flex flex-col items-center justify-center p-2 rounded-none border text-center transition-all ${
                        selectedPurpose === "pink"
                          ? "border-pink-400 bg-pink-950/60 text-white font-bold ring-1 ring-pink-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <span className="h-2.5 w-2.5 border border-pink-400 mb-1" style={{ backgroundColor: "#FFF0F5" }} />
                      <span className="text-[11px] leading-tight font-bold text-white">ដំណោះស្រាយ</span>
                      <span className="text-[9px] text-pink-300 font-mono">#FFF0F5</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        cyberAudio.playClick();
                        setSelectedPurpose("transparent");
                      }}
                      className={`min-h-[44px] flex flex-col items-center justify-center p-2 rounded-none border text-center transition-all ${
                        selectedPurpose === "transparent"
                          ? "border-indigo-400 bg-indigo-950/60 text-white font-bold ring-1 ring-indigo-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <span className="text-[11px] mb-0.5">🏁</span>
                      <span className="text-[11px] leading-tight font-bold text-white">រូបថ្លា</span>
                      <span className="text-[9px] text-indigo-300 font-mono">PNG Alpha</span>
                    </button>
                  </div>
                </div>

                {/* 2. Processing Engine Selector */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider">
                    <span>ម៉ាស៊ីនដំណើរការ (Engine)</span>
                    <span className="text-cyan-400 font-bold">
                      {selectedEngine === "browser" ? "BROWSER AI" : "REMOTE WORKER"}
                    </span>
                  </div>

                  <div role="radiogroup" aria-label="ជ្រើសរើសម៉ាស៊ីនដំណើរការ (Processing Engine)" className="grid grid-cols-2 gap-2 text-xs">
                    {/* 1. Browser AI Option */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedEngine === "browser"}
                      data-testid="engine-select-browser"
                      onClick={() => handleSwitchEngine("browser")}
                      disabled={isProcessing}
                      className={`min-h-[44px] flex items-center justify-between p-2.5 rounded-none border text-left transition-all font-mono focus:ring-2 focus:ring-cyan-400 focus:outline-none ${
                        selectedEngine === "browser"
                          ? "border-cyan-400 bg-cyan-950/60 text-white font-bold ring-1 ring-cyan-400/40 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-none border ${selectedEngine === "browser" ? "bg-cyan-400 border-cyan-300" : "bg-transparent border-slate-500"}`} />
                        <div>
                          <div className="text-[11px] font-bold text-white">Browser AI</div>
                          <div className="text-[9px] text-cyan-300/80">លំនាំដើម · ក្នុងម៉ាស៊ីន</div>
                        </div>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold">FREE</span>
                    </button>

                    {/* 2. Remote Worker Option */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedEngine === "worker"}
                      aria-disabled={!isWorkerConfigured}
                      data-testid="engine-select-worker"
                      onClick={() => handleSwitchEngine("worker")}
                      disabled={!isWorkerConfigured || isProcessing}
                      className={`min-h-[44px] flex items-center justify-between p-2.5 rounded-none border text-left transition-all font-mono focus:ring-2 focus:ring-purple-400 focus:outline-none ${
                        !isWorkerConfigured
                          ? "border-slate-800 bg-slate-900/40 text-slate-500 opacity-50 cursor-not-allowed"
                          : selectedEngine === "worker"
                          ? "border-purple-400 bg-purple-950/60 text-white font-bold ring-1 ring-purple-400/40 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                      title={
                        !isWorkerConfigured
                          ? "Remote Worker មិនទាន់កំណត់ក្នុង Settings (BACKGROUND_REMOVAL_WORKER_URL)។"
                          : workerStatus === "unavailable"
                          ? `Remote Worker មិនអាចភ្ជាប់បានទេ (OFFLINE / UNAVAILABLE): ${workerError || "Offline"}`
                          : `Remote Worker Microservice (${workerModel || "Online"})`
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-none border ${
                            selectedEngine === "worker"
                              ? "bg-purple-400 border-purple-300"
                              : "bg-transparent border-slate-500"
                          }`}
                        />
                        <div>
                          <div className="text-[11px] font-bold text-slate-200">
                            Remote Worker
                          </div>
                          <div className="text-[9px]">
                            {!isWorkerConfigured ? (
                              <span className="text-slate-400">🔒 មិនទាន់កំណត់</span>
                            ) : workerStatus === "checking" ? (
                              <span className="text-amber-400 animate-pulse">⏳ កំពុងពិនិត្យ...</span>
                            ) : workerStatus === "ready" ? (
                              <span className="text-emerald-400">🟢 ត្រៀមរួចរាល់ (ONLINE)</span>
                            ) : workerStatus === "unavailable" ? (
                              <span className="text-rose-400 font-bold">🔴 OFFLINE / UNAVAILABLE</span>
                            ) : (
                              <span className="text-cyan-400">⚙️ បានកំណត់</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Server className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </div>

                  {/* Accessible live status for engine selection */}
                  <div aria-live="polite" className="sr-only">
                    {selectedEngine === "browser"
                      ? "ម៉ាស៊ីនដំណើរការបច្ចុប្បន្នគឺ Browser AI (ដំណើរការក្នុងម៉ាស៊ីន)"
                      : "ម៉ាស៊ីនដំណើរការបច្ចុប្បន្នគឺ Remote Worker (ដំណើរការលើម៉ាស៊ីនមេ)"}
                  </div>

                  {/* Remote Worker Privacy Notice & Re-check */}
                  {selectedEngine === "worker" && isWorkerConfigured && (
                    <div className="text-[10px] text-purple-200/90 leading-relaxed font-mono bg-purple-950/30 p-2.5 border border-purple-500/30 space-y-1">
                      <div className="font-bold flex items-center justify-between text-purple-300">
                        <span>ℹ️ សេចក្តីជូនដំណឹងអំពីឯកជនភាព</span>
                        {workerStatus === "unavailable" && (
                          <button
                            type="button"
                            data-testid="recheck-worker-btn"
                            onClick={() => checkWorkerStatus(true)}
                            className="text-[9px] text-purple-300 hover:text-white underline font-mono cursor-pointer"
                          >
                            [ពិនិត្យឡើងវិញ]
                          </button>
                        )}
                      </div>
                      <p>
                        មុខងារ Remote Worker នឹងបញ្ជូនរូបភាពរបស់អ្នកទៅកាន់ម៉ាស៊ីនមេ Remote Worker ដែលបានកំណត់តាមរយៈ Server Proxy ដើម្បីដំណើរការកាត់ផ្ទៃខាងក្រោយ។
                      </p>
                    </div>
                  )}

                  {!isWorkerConfigured && (
                    <p className="text-[9.5px] text-slate-400 leading-relaxed font-mono bg-slate-950/40 p-2 border border-slate-800/80">
                      ℹ️ Remote Worker មិនទាន់កំណត់ក្នុង Settings (BACKGROUND_REMOVAL_WORKER_URL)។ Browser AI ដំណើរការក្នុងម៉ាស៊ីនផ្ទាល់ដោយឥតគិតថ្លៃ និងមានសុវត្ថិភាពខ្ពស់។
                    </p>
                  )}
                </div>

                {/* 3. Edge Quality / Alpha Matting Refinement */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider">
                    <span>គុណភាពគែម (Edge Quality)</span>
                    <span className="text-cyan-400 font-bold">
                      {edgeQuality === "fast"
                        ? "FAST PREVIEW"
                        : edgeQuality === "balanced"
                        ? "BALANCED"
                        : "FINE HAIR & DETAILS"}
                    </span>
                  </div>
                  <div role="radiogroup" aria-label="Edge Quality & Alpha Matting" className="grid grid-cols-3 gap-1.5 text-xs font-mono">
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
                      className={`min-h-[44px] flex flex-col items-center justify-center p-2 rounded-none border text-center transition-all ${
                        edgeQuality === "fast"
                          ? "border-cyan-400 bg-cyan-950/60 text-white font-bold ring-1 ring-cyan-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <span className="text-[11px] font-bold">Fast Preview</span>
                      <span className="text-[9px] text-slate-500">Preview / Low-res</span>
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
                      className={`min-h-[44px] flex flex-col items-center justify-center p-2 rounded-none border text-center transition-all ${
                        edgeQuality === "balanced"
                          ? "border-purple-400 bg-purple-950/60 text-white font-bold ring-1 ring-purple-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <span className="text-[11px] font-bold text-purple-300">Balanced</span>
                      <span className="text-[9px] text-purple-400/80">Alpha Matting</span>
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
                      className={`min-h-[44px] flex flex-col items-center justify-center p-2 rounded-none border text-center transition-all ${
                        edgeQuality === "quality" || edgeQuality === "fine_details"
                          ? "border-emerald-400 bg-emerald-950/60 text-white font-bold ring-1 ring-emerald-400/40"
                          : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <span className="text-[11px] font-bold text-emerald-300">Fine Hair &amp; Details</span>
                      <span className="text-[9px] text-emerald-400/80">Hair, Fur, Plants</span>
                    </button>
                  </div>

                  <p className="text-[9.5px] text-slate-400 leading-relaxed font-mono bg-slate-950/40 p-2 border border-slate-800/80">
                    ℹ️ <strong>ចំណាំ (Limitation)</strong>៖ មុខងារ Alpha Matting ជួយសម្រួលគែមសក់ និងអក្សរស្ដើងៗក្នុងតំបន់ដែល AI បានរកឃើញ ប៉ុន្តែមិនអាចបង្កើតសរសៃសក់ដែលម៉ូដែលកាត់បាត់ទាំងស្រុងនោះទេ។
                    <span className="block mt-0.5 text-slate-500 font-sans">
                      (Alpha matting refines boundaries and fine hair/text where detected; it cannot reconstruct strokes completely missed by the coarse model.)
                    </span>
                  </p>
                </div>

                {/* 4. Manual Mask Mode Launcher */}
                <div className="pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    data-testid="manual-mask-btn"
                    onClick={handleOpenManualMode}
                    disabled={!imageFile || isProcessing}
                    className="min-h-[44px] w-full flex items-center justify-center gap-1.5 rounded-none border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white hover:border-cyan-400 transition-colors uppercase font-mono"
                  >
                    <span>OPEN MANUAL MASK MODE (គូរម៉ាសដោយដៃ)</span>
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* ── RIGHT: Preview & Interactive Mask Studio Deck ── */}
        <div className="flex flex-col gap-5 lg:col-span-7 xl:col-span-8">
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

          {/* High-Tech Robotic Scanner Telemetry with Scanning Animation & Corner HUD */}
          {isProcessing && (
            <div data-testid="processing-scanner" className="relative overflow-hidden rounded-none border border-cyan-500/40 bg-slate-950/95 shadow-[0_0_35px_rgba(0,240,255,0.15)] font-mono">
              {/* Corner target reticles */}
              <div className="pointer-events-none absolute top-1.5 left-1.5 h-3 w-3 border-t-2 border-l-2 border-cyan-400 z-30" />
              <div className="pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 border-t-2 border-r-2 border-cyan-400 z-30" />
              <div className="pointer-events-none absolute bottom-1.5 left-1.5 h-3 w-3 border-b-2 border-l-2 border-cyan-400 z-30" />
              <div className="pointer-events-none absolute bottom-1.5 right-1.5 h-3 w-3 border-b-2 border-r-2 border-cyan-400 z-30" />

              {/* Corner HUD Telemetry Badges */}
              <div className="pointer-events-none absolute top-2 left-2 z-20 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/80 px-2 py-0.5 text-[10px] text-cyan-400">
                <span className="text-slate-500">SYS:</span> ONLINE
              </div>
              <div className="pointer-events-none absolute top-2 right-2 z-20 flex items-center gap-1.5 border border-amber-500/40 bg-slate-950/80 px-2 py-0.5 text-[10px] text-amber-300">
                <span className="h-1.5 w-1.5 bg-amber-400 animate-ping" />
                <span>STATUS: SEGMENTING</span>
              </div>
              <div className="pointer-events-none absolute bottom-2 left-2 z-20 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/80 px-2 py-0.5 text-[10px] text-cyan-400">
                <span className="text-slate-500">ENGINE:</span> @IMGLY/ISNET_FP16
              </div>
              <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/80 px-2 py-0.5 text-[10px] text-cyan-400">
                <span className="text-slate-500">MODE:</span> {processingMode.toUpperCase()}
              </div>

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
                      ? "REMOTE WORKER // [OPTIONAL SERVICE]"
                      : processingMode === "final"
                      ? "CLEAN CUT // [@IMGLY/ISNET_FP16 2048PX]"
                      : "FAST PREVIEW // [@IMGLY/ISNET_FP16 1024PX]"
                  }
                  steps={scannerSteps}
                  subtext={
                    processingMode === "worker"
                      ? "Remote background removal microservice if configured in settings"
                      : processingMode === "final"
                      ? "@imgly/isnet_fp16 browser AI with zero aggressive erosion and local color decontamination"
                      : "@imgly/isnet_fp16 high-speed preview segmentation with browser model caching"
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
                initialPurpose={selectedPurpose}
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

          {/* Standby Empty State: Precision Inspection Chamber */}
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

              {/* Chamber HUD Telemetry Badges */}
              <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/90 px-2 py-0.5 text-[10px] text-cyan-400 font-mono">
                <span className="text-slate-500">CHAMBER:</span>
                <span className="font-bold">INSPECTION // UNIT-02</span>
              </div>
              <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 border border-emerald-500/40 bg-slate-950/90 px-2 py-0.5 text-[10px] text-emerald-400 font-mono">
                <span className="h-1.5 w-1.5 bg-emerald-400 animate-pulse" />
                <span className="text-slate-500">STATUS:</span>
                <span className="font-bold">STANDBY // READY</span>
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/90 px-2 py-0.5 text-[10px] text-cyan-400 font-mono">
                <span className="text-slate-500">SENSOR:</span>
                <span className="font-bold">APERTURE OPTICS ONLINE</span>
              </div>
              <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 border border-cyan-500/30 bg-slate-950/90 px-2 py-0.5 text-[10px] text-cyan-400 font-mono">
                <span className="text-slate-500">CALIBRATION:</span>
                <span className="font-bold">KHMER LIGATURE SAFE</span>
              </div>

              {/* Center Radar Scanner Reticle */}
              <div className="relative mb-5 flex h-24 w-24 items-center justify-center border border-cyan-500/40 bg-cyan-950/40 shadow-[0_0_35px_rgba(0,240,255,0.2)]">
                {/* Rotating scanner ring */}
                <div className="pointer-events-none absolute inset-1 border border-dashed border-cyan-400/50 animate-[spin_20s_linear_infinite]" />
                {/* Crosshairs */}
                <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-[1px] bg-cyan-500/30 -translate-x-1/2" />
                <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] bg-cyan-500/30 -translate-y-1/2" />
                <Sparkles className="h-8 w-8 text-cyan-300 animate-pulse" />
              </div>

              <h3 className="text-sm font-bold tracking-wider uppercase text-white font-mono flex items-center gap-2">
                <span>PRECISION INSPECTION CHAMBER // STANDBY</span>
              </h3>
              <p className="mt-2 text-xs text-slate-400 font-mono max-w-md leading-relaxed">
                រង់ចាំបញ្ចូលរូបភាពពីម៉ូឌុលទី ១ (Intake Chamber)។ ប្រព័ន្ធ AI នឹងធ្វើកាត់ផ្ទៃខាងក្រោយដោយស្វ័យប្រវត្តិ និងរក្សាអក្សរខ្មែរយ៉ាងច្បាស់ល្អិតល្អន់។
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-300 font-mono">
                <span className="border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-cyan-300">
                  FORMATS: PNG · JPG · WEBP
                </span>
                <span className="border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-emerald-300">
                  TYPOGRAPHY: KHMER + EN SAFE
                </span>
                <span className="border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-purple-300">
                  ENGINE: ON-DEVICE WASM
                </span>
                <span className="border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-slate-400">
                  CANVAS: ALPHA MATRIX READY
                </span>
              </div>
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
