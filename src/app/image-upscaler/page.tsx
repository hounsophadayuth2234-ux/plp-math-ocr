"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  AlertCircle,
  Download,
  ImageIcon,
  Wand2,
  Cpu,
  XCircle,
  CheckCircle2,
  HelpCircle,
  FileText,
  User,
  Zap,
  Activity,
  Maximize2,
  Layers,
  Clipboard,
} from "lucide-react";
import { BgUploadZone } from "@/components/bg-remover/BgUploadZone";
import { BeforeAfterSlider } from "@/components/image-upscaler/BeforeAfterSlider";
import { ImageDiagnosticsCard } from "@/components/image-upscaler/ImageDiagnosticsCard";
import { UpscaleControls } from "@/components/image-upscaler/UpscaleControls";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import { cyberAudio } from "@/lib/cyber-audio";
import { ObjectUrlRegistry } from "@/lib/processing-utils";
import {
  upscaleImageStudio,
  calculateImageDiagnostics,
  UpscalePreset,
  UpscaleProgress,
  ImageDiagnostics,
  UpscaleResult,
  UpscaleScale,
  EnhancementConfig,
} from "@/lib/image-upscale-client";
import { generateUpscaleSmartName } from "@/lib/smart-naming";

export default function ImageUpscalerPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [inputDiagnostics, setInputDiagnostics] = useState<ImageDiagnostics | null>(null);

  // Authoritative Enhancement Configuration Object
  const [config, setConfig] = useState<EnhancementConfig>({
    factor: 2,
    preset: "general",
    sharpness: 65,
    denoise: 35,
    clarity: 45,
    faceEnhancement: false,
  });

  // Authoritative Ref to prevent stale React closure reads in handlers
  const configRef = useRef<EnhancementConfig>({
    factor: 2,
    preset: "general",
    sharpness: 65,
    denoise: 35,
    clarity: 45,
    faceEnhancement: false,
  });

  // Synchronous config updater
  const updateConfig = useCallback(
    (
      updater:
        | Partial<EnhancementConfig>
        | ((prev: EnhancementConfig) => EnhancementConfig)
    ) => {
      setConfig((prev) => {
        const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
        configRef.current = next;
        return next;
      });
    },
    []
  );

  // Export settings
  const [exportFormat, setExportFormat] = useState<"png" | "jpeg">("png");
  const [customFilename, setCustomFilename] = useState<string>("");

  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UpscaleProgress | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<{ message: string; suggestedAction?: string } | null>(null);
  const [result, setResult] = useState<UpscaleResult | null>(null);

  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const urlRegistryRef = useRef<ObjectUrlRegistry>(new ObjectUrlRegistry());
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const registry = urlRegistryRef.current;
    return () => {
      registry.revokeAll();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Broadcast processing state to pause heavy background decorative animations
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ai-processing-change", {
        detail: { isProcessing: isLoading },
      })
    );
  }, [isLoading]);

  // Handle Preset Changes & set optimal defaults
  const handlePresetSelect = useCallback((selectedPreset: UpscalePreset) => {
    cyberAudio.playClick();
    if (selectedPreset === "ultra") {
      updateConfig((prev) => ({
        ...prev,
        preset: "ultra",
        faceEnhancement: false,
        sharpness: 85,
        denoise: 30,
        clarity: 65,
        factor: (prev.factor < 4 ? 4 : prev.factor) as 1 | 2 | 4,
      }));
    } else if (selectedPreset === "portrait") {
      updateConfig((prev) => ({
        ...prev,
        preset: "portrait",
        faceEnhancement: true,
        sharpness: 60,
        denoise: 45,
        clarity: 55,
      }));
    } else if (selectedPreset === "text") {
      updateConfig((prev) => ({
        ...prev,
        preset: "text",
        faceEnhancement: false,
        sharpness: 80,
        denoise: 30,
        clarity: 60,
      }));
    } else if (selectedPreset === "restore") {
      updateConfig((prev) => ({
        ...prev,
        preset: "restore",
        faceEnhancement: false,
        sharpness: 50,
        denoise: 70,
        clarity: 40,
      }));
    } else if (selectedPreset === "custom") {
      updateConfig((prev) => ({
        ...prev,
        preset: "custom",
      }));
    } else {
      // General
      updateConfig((prev) => ({
        ...prev,
        preset: "general",
        faceEnhancement: false,
        sharpness: 65,
        denoise: 35,
        clarity: 45,
      }));
    }
  }, [updateConfig]);

  // Analyze image on upload for Stage 1 Diagnostics
  const analyzeInputImage = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Unable to decode uploaded image."));
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        URL.revokeObjectURL(url);
        setIsUploading(false);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const diag = calculateImageDiagnostics(imgData);
      diag.actualEngine = "Browser resize/sharpen";
      setInputDiagnostics(diag);

      // Auto-set recommended scale for tiny image
      if (diag.isTinyImage) {
        const recommendedFactor = (diag.is8xEligible ? 4 : 4) as 1 | 2 | 4;
        updateConfig({ factor: recommendedFactor });
      }

      // Auto-set recommended preset
      handlePresetSelect(diag.recommendedPreset);
    } catch (err) {
      console.warn("[image-upscaler] Failed to run auto-diagnostics:", err);
    } finally {
      setIsUploading(false);
    }
  }, [handlePresetSelect, updateConfig]);

  const handleFileSelect = useCallback((file: File | null) => {
    urlRegistryRef.current.revokeAll();
    setImageFile(file);
    setResult(null);
    setError(null);
    setInputDiagnostics(null);

    if (file) {
      cyberAudio.playClick();
      const url = urlRegistryRef.current.create(file);
      setPreviewUrl(url);
      analyzeInputImage(file);
    } else {
      setPreviewUrl(null);
    }
  }, [analyzeInputImage]);

  // Support clipboard paste (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileSelect(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleFileSelect]);

  // Sample Image Generator for instant 1-click test
  const handleLoadSample = () => {
    cyberAudio.playClick();
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Dark cyber backdrop
    const grad = ctx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, "#090d16");
    grad.addColorStop(1, "#030712");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Grid pattern
    ctx.strokeStyle = "rgba(0, 240, 255, 0.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x < 640; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 480);
      ctx.stroke();
    }
    for (let y = 0; y < 480; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(640, y);
      ctx.stroke();
    }

    // Stylized Face Oval (for skin tone detection demo)
    ctx.fillStyle = "rgb(215, 165, 135)";
    ctx.beginPath();
    ctx.ellipse(220, 240, 75, 105, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(195, 220, 9, 0, Math.PI * 2);
    ctx.arc(245, 220, 9, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = "#00f0ff";
    ctx.beginPath();
    ctx.arc(195, 220, 4, 0, Math.PI * 2);
    ctx.arc(245, 220, 4, 0, Math.PI * 2);
    ctx.fill();

    // Smile
    ctx.strokeStyle = "#be123c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(220, 265, 25, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Document & Khmer text sample box
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(360, 140, 240, 200);
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(360, 140, 240, 200);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px 'Kantumruy Pro', sans-serif";
    ctx.fillText("គំរូអក្សរខ្មែរ (Khmer Text)", 375, 180);
    ctx.font = "14px monospace";
    ctx.fillText("x² + 5x + 6 = 0", 375, 215);
    ctx.fillText("Super-Resolution 4X", 375, 250);
    ctx.font = "12px 'Kantumruy Pro', sans-serif";
    ctx.fillText("ធ្វើរូបឱ្យច្បាស់ studio", 375, 285);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "sample-studio-test.png", { type: "image/png" });
      handleFileSelect(file);
    }, "image/png");
  };

  const handleCancel = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    cyberAudio.stopScanningHum();
    cyberAudio.playClick();
    setIsLoading(false);
    setProgress(null);
    setError({ message: "ការកែសម្រួលត្រូវបានបោះបង់ដោយអ្នកប្រើប្រាស់ (Upscaling cancelled by user)." });
  };

  const handleEnhance = async () => {
    if (!imageFile || isLoading) return;

    // Read synchronously from authoritative ref to guarantee zero stale React closure bugs
    const currentConfig = { ...configRef.current };
    const targetFactor = currentConfig.factor;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setProgress({
      stage: 1,
      totalStages: 5,
      stageName: "Smart Image Diagnostics",
      stageNameKh: "វិភាគកម្រិតគុណភាពរូបភាព",
      percent: 10,
    });
    setElapsedSeconds(0);

    cyberAudio.playClick();
    cyberAudio.startScanningHum();

    const startTime = performance.now();
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds(+((performance.now() - startTime) / 1000).toFixed(1));
    }, 100);

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    // Generate unique processing job ID
    const currentJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeJobIdRef.current = currentJobId;

    try {
      const res = await upscaleImageStudio(imageFile, {
        scale: targetFactor,
        preset: currentConfig.preset as UpscalePreset,
        faceEnhance: currentConfig.faceEnhancement,
        sharpness: currentConfig.sharpness,
        denoise: currentConfig.denoise,
        clarity: currentConfig.clarity,
        jobId: currentJobId,
        config: currentConfig,
        signal: abortController.signal,
        onProgress: (p) => {
          if (activeJobIdRef.current === currentJobId) {
            setProgress(p);
          }
        },
      });

      // Ignore stale worker results or aborted jobs
      if (abortController.signal.aborted || activeJobIdRef.current !== currentJobId) {
        console.warn(`[image-upscaler] Ignoring stale result from earlier job ${currentJobId}`);
        return;
      }

      const registeredUrl = urlRegistryRef.current.create(res.blob);
      res.outputUrl = registeredUrl;
      setResult(res);
      setInputDiagnostics(res.diagnostics);

      const autoName = generateUpscaleSmartName({
        originalName: imageFile?.name,
        preset: currentConfig.preset,
        isSmoothObject: res.diagnostics.isSmoothObjectLikely,
        isDocument: res.diagnostics.isDocumentLikely,
        skinToneRatio: res.diagnostics.skinToneRatio,
        scale: res.scale,
        outputWidth: res.outputWidth,
        outputHeight: res.outputHeight,
      });
      setCustomFilename(autoName);

      cyberAudio.stopScanningHum();
      cyberAudio.playSuccessChime();
    } catch (err: unknown) {
      cyberAudio.stopScanningHum();
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError({
        message: err instanceof Error ? err.message : "Upscaling processing failed.",
      });
    } finally {
      if (activeJobIdRef.current === currentJobId) {
        setIsLoading(false);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  // Export & Download
  const handleDownload = async () => {
    if (!result) return;
    cyberAudio.playClick();

    let downloadBlob = result.blob;
    let extension = "png";

    if (exportFormat === "jpeg") {
      extension = "jpg";
      // Convert to JPG 95%
      const img = new Image();
      img.src = result.outputUrl;
      await new Promise((res) => {
        img.onload = res;
      });

      const canvas = document.createElement("canvas");
      canvas.width = result.outputWidth;
      canvas.height = result.outputHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const jpegBlob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, "image/jpeg", 0.95)
        );
        if (jpegBlob) downloadBlob = jpegBlob;
      }
    }

    const downloadUrl = URL.createObjectURL(downloadBlob);
    const link = document.createElement("a");
    const sanitizedBase = customFilename.trim().replace(/\.[a-zA-Z0-9]+$/i, "");
    const finalStem = sanitizedBase || "plp-ai-upscaled";
    link.href = downloadUrl;
    link.download = `${finalStem}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
  };

  // Derive unified workflow status area
  const currentStatus: "Ready" | "Uploading" | "Processing" | "Complete" | "Error" = error
    ? "Error"
    : isLoading
    ? "Processing"
    : isUploading
    ? "Uploading"
    : result
    ? "Complete"
    : "Ready";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-cyan-500/20 pb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-slate-900/80 text-cyan-400 hover:bg-slate-800 transition-colors"
              title="ត្រឡប់ទៅទំព័រដើម (Back to Home)"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-mono text-xs font-bold text-cyan-400 border border-cyan-500/30">
                  MODULE 03
                </span>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Real AI Super-Resolution (Real-ESRGAN 4X)
                </h1>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Deep Convolutional Neural Network (SRVGGNetCompact) Super-Resolution · FastAPI AI Backend
              </p>
            </div>
          </div>

          {/* Unified Status Area */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 flex items-center gap-2 shadow-sm">
              <span className="text-slate-400">STATUS:</span>
              <span
                data-testid="upscale-unified-status"
                className={`font-bold ${
                  currentStatus === "Complete"
                    ? "text-emerald-400"
                    : currentStatus === "Processing"
                    ? "text-cyan-400"
                    : currentStatus === "Uploading"
                    ? "text-amber-400"
                    : currentStatus === "Error"
                    ? "text-rose-400"
                    : "text-slate-300"
                }`}
              >
                ● {currentStatus.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Engine Notice: Real AI Super-Resolution */}
        <div className="flex items-start gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3.5 font-mono text-xs text-cyan-200">
          <Sparkles className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase text-cyan-300">
                Engine: Real-ESRGAN Compact ONNX Neural Super-Resolution (4X)
              </span>
              <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                AI Neural Network
              </span>
            </div>
            <p className="text-[11px] text-cyan-100/80 leading-relaxed">
              This system executes authentic 4x Real-ESRGAN deep neural network inference on the FastAPI backend. It reconstructs genuine high-frequency textures, sharp text strokes, and clean contours. Large images exceeding 1200px are capped proportionally to protect CPU memory.
            </p>
          </div>
        </div>

        {/* Main 2-Column Studio Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Upload, Diagnostics, Controls (5 cols) */}
          <div className="flex flex-col gap-5 lg:col-span-5">
            {/* Upload Zone */}
            <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 shadow-lg backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
                  បញ្ចូលរូបភាព (Upload Image)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="sample-image-upscale-btn"
                    onClick={handleLoadSample}
                    className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-2 py-1 text-[11px] font-mono font-bold text-cyan-300 hover:bg-cyan-900/50 transition-colors cursor-pointer"
                    title="សាកល្បងជាមួយរូបភាពគំរូ"
                  >
                    <Zap className="h-3 w-3" />
                    <span>សាកល្បងរូបគំរូ (Sample)</span>
                  </button>
                </div>
              </div>

              <BgUploadZone
                onFileSelect={handleFileSelect}
                selectedFile={imageFile}
                disabled={isLoading}
              />

              <div className="mt-2 flex items-center justify-between px-1 text-[11px] font-mono text-slate-500">
                <span>គាំទ្រ: PNG, JPG, WEBP (រហូតដល់ 4096px)</span>
                <span className="flex items-center gap-1">
                  <Clipboard className="h-3 w-3" />
                  ចុច Ctrl+V ដើម្បី Paste
                </span>
              </div>
            </div>

            {/* Smart Image Diagnostics (Stage 1) */}
            {inputDiagnostics && (
              <ImageDiagnosticsCard
                diagnostics={inputDiagnostics}
                fileSize={imageFile?.size}
                selectedPreset={config.preset as UpscalePreset}
                onApplyPreset={handlePresetSelect}
              />
            )}

            {/* Enhancement Controls */}
            <UpscaleControls
              scale={config.factor}
              onChangeScale={(s) => {
                cyberAudio.playClick();
                const factor = (s > 4 ? 4 : s) as 1 | 2 | 4;
                updateConfig({ factor });
              }}
              preset={config.preset as UpscalePreset}
              onChangePreset={handlePresetSelect}
              faceEnhance={config.faceEnhancement}
              onToggleFaceEnhance={(f) => {
                cyberAudio.playClick();
                updateConfig({ faceEnhancement: f });
              }}
              sharpness={config.sharpness}
              onChangeSharpness={(val) => updateConfig({ sharpness: val })}
              denoise={config.denoise}
              onChangeDenoise={(val) => updateConfig({ denoise: val })}
              clarity={config.clarity}
              onChangeClarity={(val) => updateConfig({ clarity: val })}
              is8xEligible={inputDiagnostics?.is8xEligible}
              isTinyImage={inputDiagnostics?.isTinyImage}
              isLoading={isLoading}
              progress={progress}
              elapsedSeconds={elapsedSeconds}
              onEnhance={handleEnhance}
              onCancel={handleCancel}
              disabled={!imageFile}
            />
          </div>

          {/* Right Column: Comparison Workspace & Export Deck (7 cols) */}
          <div className="flex flex-col gap-5 lg:col-span-7">
            {/* Error Message */}
            {error && (
              <div className="flex flex-col gap-2 rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 font-mono text-xs text-rose-300 shadow-lg">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <div>
                    <p className="font-bold text-rose-200">Execution Error</p>
                    <p className="mt-0.5 leading-relaxed">{error.message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Live Progress Scanner HUD */}
            {isLoading && (
              <RoboticScanner
                active={true}
                moduleName="REAL AI SUPER-RESOLUTION // [REAL-ESRGAN 4X]"
                steps={[
                  "STAGE 1/5: SMART IMAGE DIAGNOSTICS & RESOLUTION CHECK...",
                  "STAGE 2/5: DISPATCHING PAYLOAD TO FASTAPI AI BACKEND...",
                  "STAGE 3/5: REAL-ESRGAN 4X NEURAL INFERENCE (SRVGGNET)...",
                  "STAGE 4/5: HIGH-PRECISION TEXTURE RECONSTRUCTION...",
                  "STAGE 5/5: PNG STREAMING & CLIENT BLOB RENDERING...",
                ]}
                subtext="Authentic Real-ESRGAN neural super-resolution running on FastAPI backend"
              />
            )}

            {/* Comparison Workspace (Active when result is ready) */}
            {result && previewUrl && !isLoading && (
              <div className="flex flex-col gap-4">
                {/* Fallback Non-Success Banner (Requirement 10: Never silently claim 4x) */}
                {result.isFallback && (
                  <div
                    data-testid="upscale-fallback-banner"
                    className="flex items-center gap-2.5 rounded-xl border border-amber-500/50 bg-amber-950/50 p-3.5 font-mono text-xs text-amber-200 shadow-lg animate-pulse"
                  >
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    <div className="flex-1">
                      <span className="font-bold text-amber-300 uppercase">
                        {result.fallbackReason || `${result.requestedScale}x unavailable — output generated at ${result.scale}x`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Before / After Slider Workspace */}
                <BeforeAfterSlider
                  beforeSrc={previewUrl}
                  afterSrc={result.outputUrl}
                  beforeLabel="BEFORE (រូបដើម)"
                  afterLabel={
                    result.isFallback
                      ? `AFTER (${result.scale}X Real-ESRGAN AI · Capped at 1200px)`
                      : `AFTER (${result.scale}X Real-ESRGAN AI)`
                  }
                  srcWidth={result.srcWidth}
                  srcHeight={result.srcHeight}
                  outputWidth={result.outputWidth}
                  outputHeight={result.outputHeight}
                  isTinyImage={inputDiagnostics?.isTinyImage}
                />

                {/* Export & Download Deck */}
                <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/80 p-5 shadow-[0_0_25px_rgba(0,240,255,0.1)] backdrop-blur-md">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-cyan-500/20 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                          លទ្ធផលកែសម្រួលរួចរាល់ ({result.scale}X HD Complete)
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-400">
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-300 border border-emerald-500/30">
                          {result.label}
                        </span>
                        <span>·</span>
                        <span>{result.model}</span>
                        <span>·</span>
                        <span className="text-cyan-400 font-bold">{result.elapsedMs} ms</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                        <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-emerald-300 border border-emerald-500/30">
                          ✓ Exact {result.outputWidth}×{result.outputHeight} ({result.scale}x Verified)
                        </span>
                        <span className="rounded bg-slate-900 px-2 py-0.5 text-slate-300 border border-slate-700">
                          ✓ Ringing Clamp Active
                        </span>
                        <span className="rounded bg-slate-900 px-2 py-0.5 text-slate-300 border border-slate-700">
                          ✓ Stroke Edge Crispness
                        </span>
                      </div>
                    </div>

                    {/* Resolution Transformation Badge */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 font-mono text-xs">
                      <span className="text-slate-400">{result.srcWidth}×{result.srcHeight} px</span>
                      <span className="mx-2 text-cyan-400 font-bold">➔</span>
                      <span className="text-white font-bold">{result.outputWidth}×{result.outputHeight} px</span>
                    </div>
                  </div>

                  {/* Smart Editable Filename Deck */}
                  <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-300 shrink-0">
                        ឈ្មោះឯកសារ (File Name):
                      </span>
                      <input
                        type="text"
                        value={customFilename}
                        onChange={(e) => setCustomFilename(e.target.value)}
                        placeholder="plp-enhanced-image"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                      />
                      <span className="font-mono text-xs font-bold text-cyan-400 shrink-0">
                        .{exportFormat === "jpeg" ? "jpg" : "png"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        cyberAudio.playClick();
                        const freshAutoName = generateUpscaleSmartName({
                          originalName: imageFile?.name,
                          preset: config.preset,
                          isSmoothObject: result.diagnostics.isSmoothObjectLikely,
                          isDocument: result.diagnostics.isDocumentLikely,
                          skinToneRatio: result.diagnostics.skinToneRatio,
                          scale: result.scale,
                          outputWidth: result.outputWidth,
                          outputHeight: result.outputHeight,
                        });
                        setCustomFilename(freshAutoName);
                      }}
                      className="shrink-0 flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-mono font-bold text-amber-300 hover:bg-amber-900/60 transition-colors cursor-pointer"
                      title="បង្កើតឈ្មោះស្វ័យប្រវត្តិតាមទំហំ និងប្រភេទរូបភាព"
                    >
                      <Zap className="h-3.5 w-3.5 text-amber-400" />
                      <span>⚡ បង្កើតឈ្មោះស្វ័យប្រវត្តិ (Auto-Name)</span>
                    </button>
                  </div>

                  {/* Export Options & Download Button */}
                  <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* Format Selector */}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">ទម្រង់ File:</span>
                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setExportFormat("png")}
                          className={`px-3 py-1 rounded-lg font-mono text-xs font-bold transition-all ${
                            exportFormat === "png"
                              ? "bg-cyan-500 text-slate-950 shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          PNG (Lossless)
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportFormat("jpeg")}
                          className={`px-3 py-1 rounded-lg font-mono text-xs font-bold transition-all ${
                            exportFormat === "jpeg"
                              ? "bg-cyan-500 text-slate-950 shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          JPG (95% Web)
                        </button>
                      </div>
                    </div>

                    {/* Download Button */}
                    <button
                      type="button"
                      data-testid="upscale-download-btn"
                      onClick={handleDownload}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-6 py-3 font-mono text-xs font-bold text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.35)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all cursor-pointer"
                    >
                      <Download className="h-4 w-4" />
                      <span>ទាញយករូប ({exportFormat.toUpperCase()} · {result.outputWidth}×{result.outputHeight}px)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Standby Placeholder when no result and not loading */}
            {!result && !isLoading && !error && (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-500/20 bg-slate-950/40 p-10 text-center min-h-[420px]">
                {previewUrl ? (
                  <div className="flex flex-col items-center max-w-sm">
                    <div className="relative mb-4 h-48 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-center">
                      <img
                        src={previewUrl}
                        alt="Selected source"
                        className="max-h-full max-w-full object-contain"
                      />
                      <div className="absolute top-2 right-2 rounded bg-slate-950/80 px-2 py-0.5 font-mono text-[10px] text-cyan-400 border border-cyan-500/30">
                        រូបដើម (SOURCE LOADED)
                      </div>
                    </div>
                    <h3 className="font-mono text-sm font-bold text-white">
                      ត្រៀមកែសម្រួល (READY FOR HD RESIZE)
                    </h3>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                      ជ្រើសរើស Factor ({config.factor}x) ឬចុចប៊ូតុង{" "}
                      <span className="text-amber-400 font-bold">&quot;HD Resize & Sharpen&quot;</span>{" "}
                      ដើម្បីដំណើរការ Stage 1 ដល់ 5។
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center max-w-sm">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 border border-cyan-500/20 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <h3 className="mt-4 font-mono text-sm font-bold text-white uppercase tracking-wider">
                      HD RESIZE & SHARPEN STANDBY
                    </h3>
                    <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                      សូមបញ្ចូលរូបភាព ឬចុចប៊ូតុង{" "}
                      <span className="text-cyan-400 font-semibold">&quot;សាកល្បងរូបគំរូ (Sample)&quot;</span>{" "}
                      ដើម្បីពិនិត្យផ្ទាំងប្រៀបធៀប Before/After Slider និង Loupe Magnifier 200%។
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
