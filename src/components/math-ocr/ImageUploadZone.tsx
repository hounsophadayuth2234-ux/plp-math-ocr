"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { Upload, X, ImageIcon, AlertCircle, Sparkles } from "lucide-react";
import {
  optimizeLargeImageIfNeeded,
  AUTO_OPTIMIZE_MESSAGE_KHMER,
} from "@/lib/image-auto-optimizer";

interface ImageUploadZoneProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Accessible drag-and-drop + click-to-upload zone for math problem images.
 * Accepts PNG, JPG, WEBP up to 25MB with client-side auto-optimization.
 * Validates decodability, MIME type, empty files, and manages Object URLs cleanly.
 */
export function ImageUploadZone({ onFileSelect, selectedFile, disabled }: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [optimizationNotice, setOptimizationNotice] = useState<string | null>(null);

  // Clean up preview object URL on unmount or file replacement
  useEffect(() => {
    return () => {
      if (previewUrl) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch {}
      }
    };
  }, [previewUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      setSizeError(null);
      setOptimizationNotice(null);

      // 1. MIME type validation
      const lowerType = file.type ? file.type.toLowerCase() : "";
      if (!ACCEPTED_TYPES.includes(lowerType)) {
        setSizeError("ប្រភេទឯកសារមិនគាំទ្រ សូមបញ្ចូលឯកសារ PNG, JPG, ឬ WEBP (Unsupported format)");
        return;
      }

      // 2. 0-byte check
      if (file.size === 0) {
        setSizeError("ឯកសារទទេ (0 bytes) មិនអាចដំណើរការបានទេ (Empty image file)");
        return;
      }

      // 3. Size check: allow up to 25 MB for client-side auto-compression
      if (file.size > 25 * 1024 * 1024) {
        setSizeError("ទំហំឯកសារធំជាង 25 MB សូមជ្រើសរើសរូបភាពតូចជាងនេះ (File exceeds 25 MB limit)");
        return;
      }

      // 4. Auto-optimization for large/heavy files (> 4.0 MB or > 2048px dimension)
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
          console.warn("Client auto-optimization warning in math OCR:", e);
        }
      }

      // 5. Decodability check
      try {
        if (typeof window !== "undefined" && "createImageBitmap" in window) {
          const bitmap = await createImageBitmap(targetFile);
          bitmap.close();
        }
      } catch (decodeErr) {
        console.warn("[ImageUploadZone] Image decode check failed:", decodeErr);
        setSizeError("ឯកសាររូបភាពខូច ឬមិនអាចអានបាន (Corrupted or unreadable image file)");
        return;
      }

      if (previewUrl) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch {}
      }

      const url = URL.createObjectURL(targetFile);
      setPreviewUrl(url);
      onFileSelect(targetFile);
    },
    [onFileSelect, previewUrl]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleClear = () => {
    setSizeError(null);
    setOptimizationNotice(null);
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {}
    }
    setPreviewUrl(null);
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2 min-w-0 max-w-full w-full">
      <label
        htmlFor="math-ocr-file"
        className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
      >
        Upload math image
        <span className="ml-2 font-normal normal-case text-slate-500">
          (PNG, JPG, WEBP · Auto-compressed before upload)
        </span>
      </label>

      {selectedFile && previewUrl ? (
        /* Preview state with holographic laser scanner */
        <div className="relative overflow-hidden rounded-xl border border-cyan-500/40 bg-slate-950/45 backdrop-blur-[8px] shadow-[0_0_25px_rgba(0,240,255,0.15)] min-w-0 max-w-full w-full">
          {/* Subtle scanning laser bar across preview */}
          <div className="animate-laser-scan opacity-70" />
          
          <img
            src={previewUrl}
            alt="Uploaded math problem"
            className="max-h-64 w-full object-contain p-3 relative z-10"
          />
          <div className="flex items-center justify-between border-t border-cyan-500/20 bg-slate-950/50 backdrop-blur-[6px] px-4 py-2.5 relative z-10">
            <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
              <ImageIcon className="h-3.5 w-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
              <span className="truncate font-medium text-slate-200">
                {selectedFile.name}
              </span>
              <span className="font-mono text-cyan-400/80 shrink-0">
                ({(selectedFile.size / 1024).toFixed(0)} KB)
              </span>
            </div>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              aria-label="Remove uploaded math image"
              title="Remove uploaded math image"
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 backdrop-blur-[4px] px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-900/60 hover:text-white disabled:opacity-50 transition-colors focus:ring-2 focus:ring-rose-400 focus:outline-none shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      ) : (
        /* Drop zone with cyber borders and full keyboard accessibility */
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Upload math problem image. Drag and drop or press Enter to choose file."
          aria-describedby="math-ocr-file-instructions"
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all overflow-hidden focus:ring-2 focus:ring-cyan-400 focus:outline-none min-w-0 max-w-full w-full ${
            disabled
              ? "cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-50"
              : isDragging
              ? "border-cyan-400 bg-cyan-950/40 backdrop-blur-[8px] shadow-[0_0_25px_rgba(0,240,255,0.25)]"
              : "border-cyan-500/35 bg-slate-950/40 backdrop-blur-[8px] hover:border-cyan-400 hover:bg-cyan-950/20 hover:shadow-[0_0_25px_rgba(0,240,255,0.2)]"
          }`}
        >
          {/* Corner target reticles */}
          <div className="absolute top-1 left-1 h-2 w-2 border-t-2 border-l-2 border-cyan-500/50" />
          <div className="absolute top-1 right-1 h-2 w-2 border-t-2 border-r-2 border-cyan-500/50" />
          <div className="absolute bottom-1 left-1 h-2 w-2 border-b-2 border-l-2 border-cyan-500/50" />
          <div className="absolute bottom-1 right-1 h-2 w-2 border-b-2 border-r-2 border-cyan-500/50" />

          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all ${
              isDragging ? "bg-cyan-500/20 text-cyan-300 ring-2 ring-cyan-400" : "bg-cyan-950/60 text-cyan-400 ring-1 ring-cyan-500/30"
            }`}
          >
            <Upload className={`h-6 w-6 ${isDragging ? "text-indigo-400" : "text-slate-400"}`} aria-hidden="true" />
          </div>
          <div className="min-w-0 max-w-full">
            <p className="text-sm font-medium text-slate-200">
              {isDragging ? "Drop image here" : "Drag & drop or click to upload"}
            </p>
            <p id="math-ocr-file-instructions" className="mt-1 text-xs text-slate-500">
              Supports handwritten equations, printed formulas, and geometric diagrams (PNG, JPG, WEBP · max 4.5 MB)
            </p>
          </div>
        </div>
      )}

      {optimizationNotice && (
        <div
          role="status"
          data-testid="ocr-large-image-optimized-badge"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/60 p-2.5 text-xs text-emerald-200 font-sans shadow-md"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{optimizationNotice}</span>
        </div>
      )}

      {sizeError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
          <span>{sizeError}</span>
        </div>
      )}

      <input
        id="math-ocr-file"
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled}
        aria-describedby="math-ocr-file-instructions"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
