"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { Upload, X, ImageIcon, AlertCircle } from "lucide-react";
import { cyberAudio } from "@/lib/cyber-audio";

interface BgUploadZoneProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
  label?: string;
  hint?: string;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Reusable robotic drag-and-drop upload zone for the Background Removal module.
 * Accessible with mouse, keyboard (Enter/Space), and drag/drop.
 * 0px border-radius, 1px solid cyan/slate borders, monospace typography, and Khmer-first guidance.
 */
export function BgUploadZone({
  onFileSelect,
  selectedFile,
  disabled,
  label = "បញ្ចូលរូបភាព (សំណួរ ឬដំណោះស្រាយ)",
  hint = "PNG, JPG, WEBP · អតិបរមា 12 MB",
}: BgUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMessage(null);

      // 1. Format validation
      if (!ACCEPTED_TYPES.includes(file.type.toLowerCase())) {
        setErrorMessage("ប្រភេទឯកសារមិនគាំទ្រ សូមបញ្ចូលឯកសារ PNG, JPG, ឬ WEBP (Unsupported format)");
        return;
      }

      // 2. Size validation
      if (file.size > 12 * 1024 * 1024) {
        setErrorMessage("ទំហំឯកសារធំជាង ១២ MB សូមជ្រើសរើសរូបភាពតូចជាងនេះ (Payload exceeds 12 MB limit)");
        return;
      }

      // 3. 0-byte validation
      if (file.size === 0) {
        setErrorMessage("ឯកសារទទេ (0 bytes) មិនអាចដំណើរការបានទេ (Empty image file)");
        return;
      }

      // 4. Decodability & Dimension verification (catch corrupt files early)
      try {
        let w = 0;
        let h = 0;
        if (typeof createImageBitmap === "function") {
          const bitmap = await createImageBitmap(file);
          w = bitmap.width;
          h = bitmap.height;
          bitmap.close();
        } else {
          await new Promise<void>((resolve, reject) => {
            const testUrl = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
              w = img.naturalWidth;
              h = img.naturalHeight;
              URL.revokeObjectURL(testUrl);
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(testUrl);
              reject(new Error("Decodability test failed"));
            };
            img.src = testUrl;
          });
        }

        if (w <= 0 || h <= 0) {
          throw new Error("Invalid image dimensions");
        }

        setImageMeta({ width: w, height: h });
      } catch {
        setErrorMessage("ឯកសាររូបភាពខូច ឬមិនអាចអានបាន សូមជ្រើសរើសរូបភាពផ្សេង (Corrupted or undecodable image file)");
        return;
      }

      // Revoke old object URL before creating a new one
      if (previewUrlRef.current) {
        try {
          URL.revokeObjectURL(previewUrlRef.current);
        } catch {}
      }
      const newUrl = URL.createObjectURL(file);
      previewUrlRef.current = newUrl;
      setPreviewUrl(newUrl);

      // Play robotic hydraulic hiss on successful file ingest
      cyberAudio.playHydraulicHiss();
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleClear = () => {
    setErrorMessage(null);
    setImageMeta(null);
    cyberAudio.playClick();
    if (previewUrlRef.current) {
      try {
        URL.revokeObjectURL(previewUrlRef.current);
      } catch {}
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Synchronize and clean up when parent resets selectedFile to null
  useEffect(() => {
    if (!selectedFile) {
      if (previewUrlRef.current) {
        try {
          URL.revokeObjectURL(previewUrlRef.current);
        } catch {}
        previewUrlRef.current = null;
      }
      queueMicrotask(() => {
        setPreviewUrl(null);
        setImageMeta(null);
      });
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [selectedFile]);

  // Revoke preview URL on component unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        try {
          URL.revokeObjectURL(previewUrlRef.current);
        } catch {}
        previewUrlRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-2.5 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs tracking-wider text-slate-400">
        <label
          htmlFor="bg-source-file-input"
          className="flex items-center gap-1.5 font-bold text-slate-200 cursor-pointer"
        >
          <span className="h-2 w-2 bg-cyan-400" />
          <span>{label}</span>
        </label>
        <span className="text-[11px] text-cyan-400/80 font-mono">{hint}</span>
      </div>

      {selectedFile && previewUrl ? (
        <div className="relative overflow-hidden rounded-none border border-cyan-500/40 bg-slate-950/95 shadow-[0_0_20px_rgba(0,240,255,0.12)]">
          {/* Laser scan line over preview */}
          <div className="animate-laser-scan opacity-60 pointer-events-none" />
          <div className="pointer-events-none absolute inset-0 cyber-scanlines opacity-20" />

          {/* Corner reticles */}
          <div className="pointer-events-none absolute top-1 left-1 h-2.5 w-2.5 border-t border-l border-cyan-400 z-20" />
          <div className="pointer-events-none absolute top-1 right-1 h-2.5 w-2.5 border-t border-r border-cyan-400 z-20" />
          <div className="pointer-events-none absolute bottom-1 left-1 h-2.5 w-2.5 border-b border-l border-cyan-400 z-20" />
          <div className="pointer-events-none absolute bottom-1 right-1 h-2.5 w-2.5 border-b border-r border-cyan-400 z-20" />

          <div className="flex items-center justify-center p-3 min-h-[160px] bg-slate-950/70">
            <img
              src={previewUrl}
              alt="រូបភាពដើមដែលបានបញ្ចូល (Source image preview)"
              className="max-h-56 max-w-full object-contain relative z-10"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cyan-500/30 bg-slate-900/90 px-3.5 py-2.5 relative z-10 text-xs">
            <span className="flex items-center gap-2 text-slate-300">
              <ImageIcon className="h-4 w-4 text-cyan-400 shrink-0" />
              <span className="max-w-[170px] truncate font-mono font-medium text-white">
                {selectedFile.name}
              </span>
              <span className="font-mono text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5">
                {(selectedFile.size / 1024).toFixed(0)} KB
              </span>
              {imageMeta && (
                <span className="font-mono text-[10px] text-slate-400">
                  [{imageMeta.width} × {imageMeta.height} px]
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              aria-label="ដករូបភាពនេះចេញ (Remove this image)"
              className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-mono font-bold text-rose-300 hover:bg-rose-900/70 hover:text-white disabled:opacity-40 transition-colors active:scale-[0.98] focus:ring-2 focus:ring-rose-400 focus:outline-none"
            >
              <X className="h-3.5 w-3.5" /> ដកចេញ (REMOVE)
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="ចុច ឬទម្លាក់រូបភាពនៅទីនេះដើម្បីបញ្ចូល (Click or drag image to upload)"
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-none border border-dashed px-4 py-8 text-center transition-all overflow-hidden focus:ring-2 focus:ring-cyan-400 focus:outline-none ${
            disabled
              ? "cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-50"
              : isDragging
              ? "border-cyan-400 bg-cyan-950/50 shadow-[0_0_25px_rgba(0,240,255,0.25)]"
              : "border-cyan-500/40 bg-slate-950/80 hover:border-cyan-400 hover:bg-slate-900/90 hover:shadow-[0_0_20px_rgba(0,240,255,0.15)]"
          }`}
        >
          {/* Corner target reticles */}
          <div className="pointer-events-none absolute top-1.5 left-1.5 h-3 w-3 border-t border-l border-cyan-400/80" />
          <div className="pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 border-t border-r border-cyan-400/80" />
          <div className="pointer-events-none absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-cyan-400/80" />
          <div className="pointer-events-none absolute bottom-1.5 right-1.5 h-3 w-3 border-b border-r border-cyan-400/80" />

          <div
            className={`flex h-12 w-12 items-center justify-center rounded-none border border-cyan-500/40 ${
              isDragging ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-900 text-slate-300"
            }`}
          >
            <Upload className="h-6 w-6 text-cyan-400" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-mono font-bold tracking-wider text-slate-100">
              {isDragging ? ">> ទម្លាក់រូបភាពនៅទីនេះ <<" : "ចុច ឬទម្លាក់រូបភាពនៅទីនេះ (UPLOAD IMAGE)"}
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              រូបសំណួរ ឬរូបដំណោះស្រាយគណិតវិទ្យា PLP
            </p>
            <p className="text-[10px] text-cyan-400/80 font-mono">
              [PNG, JPG, WEBP · អតិបរមា 12 MB]
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-2 rounded-none border border-rose-500/50 bg-rose-950/60 px-3 py-2 text-xs font-mono text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <input
        id="bg-source-file-input"
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled}
        aria-label="បញ្ចូលរូបភាពសម្រាប់កាត់ផ្ទៃខាងក្រោយ"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
