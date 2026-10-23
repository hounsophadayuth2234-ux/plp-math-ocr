"use client";

import React, { useRef, useState, useCallback } from "react";
import { Upload, Camera, X, Image as ImageIcon, FileWarning, Sparkles } from "lucide-react";
import {
  optimizeLargeImageIfNeeded,
  AUTO_OPTIMIZE_MESSAGE_KHMER,
} from "@/lib/image-auto-optimizer";

interface SolverImageUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_MB = 20;

export function SolverImageUpload({
  onFileSelect,
  selectedFile,
  disabled,
}: SolverImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [optimizationNotice, setOptimizationNotice] = useState<string | null>(null);

  const validateAndSelect = useCallback(
    async (file: File) => {
      setValidationError(null);
      setOptimizationNotice(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setValidationError(
          "ប្រភេទឯកសារមិនត្រឹមត្រូវ។ សូមប្រើរូបភាព PNG, JPG, ឬ WEBP។"
        );
        return;
      }

      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setValidationError(
          `រូបភាពមានទំហំធំពេក (${(file.size / (1024 * 1024)).toFixed(1)} MB)។ អតិបរមា ${MAX_SIZE_MB} MB។`
        );
        return;
      }

      let targetFile = file;
      if (file.size > 4.0 * 1024 * 1024) {
        try {
          const optRes = await optimizeLargeImageIfNeeded(file, {
            maxDimension: 2048,
            sizeThresholdBytes: 4.0 * 1024 * 1024,
          });
          if (optRes.wasOptimized) {
            targetFile = optRes.file;
            setOptimizationNotice(AUTO_OPTIMIZE_MESSAGE_KHMER);
          }
        } catch (e) {
          console.warn("Client auto-optimization warning in solver upload:", e);
        }
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(targetFile);
      setPreviewUrl(url);
      onFileSelect(targetFile);
    },
    [onFileSelect, previewUrl]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) validateAndSelect(file);
    },
    [disabled, validateAndSelect]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragActive(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
    },
    []
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSelect(file);
      // Reset input value so re-selecting the same file works
      e.target.value = "";
    },
    [validateAndSelect]
  );

  const handleClear = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setValidationError(null);
    setOptimizationNotice(null);
    onFileSelect(null);
  }, [previewUrl, onFileSelect]);

  return (
    <div className="space-y-3">
      {/* Upload Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label="Upload math problem image"
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all cursor-pointer min-h-[160px] ${
          isDragActive
            ? "border-violet-400 bg-violet-950/40"
            : selectedFile
            ? "border-violet-500/40 bg-violet-950/20"
            : "border-slate-700 bg-slate-950/40 hover:border-violet-500/40 hover:bg-violet-950/20"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {previewUrl && selectedFile ? (
          <div className="relative w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Uploaded math problem preview"
              className="mx-auto max-h-48 rounded-lg object-contain"
            />
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-300">
              <ImageIcon className="h-3.5 w-3.5 text-violet-400" />
              <span className="truncate max-w-[200px]">{selectedFile.name}</span>
              <span className="text-slate-500">
                ({(selectedFile.size / 1024).toFixed(0)} KB)
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              disabled={disabled}
              className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg hover:bg-rose-500 transition-colors"
              aria-label="Remove image"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
              <Upload className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-200">
              ទម្លាក់រូបភាពទីនេះ ឬចុចដើម្បីជ្រើសរើស
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Drop image here or click to select
            </p>
            <p className="mt-2 text-[10px] text-slate-500 font-mono">
              PNG, JPG, WEBP · Max {MAX_SIZE_MB} MB
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          onChange={handleInputChange}
          disabled={disabled}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* Camera button for mobile */}
      {!selectedFile && (
        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.capture = "environment";
            input.onchange = () => {
              const file = input.files?.[0];
              if (file) validateAndSelect(file);
            };
            input.click();
          }}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 text-xs text-slate-300 hover:border-violet-500/40 hover:text-violet-300 transition-colors disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          <span>ថតរូបពីកាមេរ៉ា (Take Photo)</span>
        </button>
      )}

      {/* Large Image Auto-Optimization Badge */}
      {optimizationNotice && (
        <div
          role="status"
          data-testid="solver-large-image-optimized-badge"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/60 p-2.5 text-xs text-emerald-200 font-sans shadow-md"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{optimizationNotice}</span>
        </div>
      )}

      {/* Validation error */}
      {validationError && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
          <FileWarning className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
}
