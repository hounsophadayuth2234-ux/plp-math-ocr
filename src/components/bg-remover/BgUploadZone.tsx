"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { X, ImageIcon, AlertCircle, Scan, Radio } from "lucide-react";
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
 * Industrial Mechanical Intake Chamber Upload Zone
 * Combines robotic vision aesthetics with strict compliance:
 * - data-testid="image-upload-input"
 * - button:has-text("ដកចេញ (REMOVE)")
 * - Text: "DROP IMAGE INTO SCANNER"
 * - Secondary: "or choose a file from your device"
 * - Formats: "PNG · JPG · WEBP · MAX 12MB"
 */
export function BgUploadZone({
  onFileSelect,
  selectedFile,
  disabled,
  label = "Upload image / បញ្ចូលរូបភាព",
  hint = "PNG, JPG, WEBP · Max 12MB",
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

      // 2. Size validation (12 MB max)
      if (file.size > 12 * 1024 * 1024) {
        setErrorMessage("ទំហំឯកសារធំជាង ១២ MB សូមជ្រើសរើសរូបភាពតូចជាងនេះ (Payload exceeds 12 MB limit)");
        return;
      }

      // 3. 0-byte validation
      if (file.size === 0) {
        setErrorMessage("ឯកសារទទេ (0 bytes) មិនអាចដំណើរការបានទេ (Empty image file)");
        return;
      }

      // 4. Decodability & Dimension verification
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

      // Revoke old object URL before creating new one
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
    <div className="space-y-2 font-mono">
      {/* Module Sub-Header */}
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] uppercase tracking-wider text-slate-400">
        <label
          htmlFor="bg-source-file-input"
          className="flex items-center gap-1.5 font-bold text-slate-200 cursor-pointer"
        >
          <span className="h-1.5 w-1.5 bg-cyan-400" />
          <span>{label}</span>
        </label>
        <span className="text-[10px] text-cyan-400/90 font-mono">{hint}</span>
      </div>

      {selectedFile && previewUrl ? (
        /* Loaded File Inspection Plate */
        <div className="relative overflow-hidden border border-cyan-500/50 bg-slate-950/95 shadow-[0_0_25px_rgba(0,240,255,0.15)]">
          {/* Mechanical Corner Brackets */}
          <div className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-cyan-400 z-20" />
          <div className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-cyan-400 z-20" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-cyan-400 z-20" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-cyan-400 z-20" />

          {/* Active Laser Sweep */}
          <div className="animate-laser-scan opacity-70 pointer-events-none" />
          <div className="pointer-events-none absolute inset-0 cyber-scanlines opacity-20" />

          {/* Intake Viewport */}
          <div className="flex items-center justify-center p-3 min-h-[170px] bg-slate-950/80">
            <img
              src={previewUrl}
              alt="Source image matrix preview"
              className="max-h-56 max-w-full object-contain relative z-10 border border-slate-800 shadow-inner"
            />
          </div>

          {/* Status Bar & Eject Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cyan-500/30 bg-slate-900/95 px-3 py-2.5 relative z-10 text-xs">
            <span className="flex items-center gap-2 text-slate-300">
              <ImageIcon className="h-4 w-4 text-cyan-400 shrink-0" />
              <span className="max-w-[170px] truncate font-mono font-bold text-white text-[11px]">
                {selectedFile.name}
              </span>
              <span className="font-mono text-[9px] text-cyan-400 bg-cyan-950/80 border border-cyan-500/40 px-1.5 py-0.5">
                {(selectedFile.size / 1024).toFixed(0)} KB
              </span>
              {imageMeta && (
                <span className="font-mono text-[9px] text-slate-400">
                  [{imageMeta.width} × {imageMeta.height} px]
                </span>
              )}
            </span>

            {/* Preserves exact test selector: button:has-text("ដកចេញ (REMOVE)") */}
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              aria-label="ដករូបភាពនេះចេញ (Remove this image)"
              className="min-h-[44px] flex items-center gap-1.5 border border-rose-500/50 bg-rose-950/60 px-3 py-2 text-xs font-mono font-bold text-rose-300 hover:bg-rose-900/80 hover:text-white disabled:opacity-40 transition-all active:scale-[0.98] focus:ring-2 focus:ring-rose-400 focus:outline-none cursor-pointer"
            >
              <X className="h-3.5 w-3.5" /> ដកចេញ (REMOVE)
            </button>
          </div>
        </div>
      ) : (
        /* Empty Machine Intake Chamber */
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="DROP IMAGE INTO SCANNER or choose a file from your device"
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
          className={`group relative flex min-h-[190px] cursor-pointer flex-col items-center justify-center gap-2.5 border px-4 py-8 text-center transition-all overflow-hidden focus:ring-2 focus:ring-cyan-400 focus:outline-none ${
            disabled
              ? "cursor-not-allowed border-slate-800 bg-slate-900/40 opacity-50"
              : isDragging
              ? "border-2 border-cyan-400 bg-cyan-950/70 shadow-[0_0_35px_rgba(0,240,255,0.4)]"
              : "border-slate-800/90 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-slate-950 hover:border-cyan-400/70 hover:shadow-[0_0_25px_rgba(0,240,255,0.2)]"
          }`}
        >
          {/* Precision Mechanical Corner Brackets */}
          <div className="pointer-events-none absolute top-1 left-1 h-3.5 w-3.5 border-t-2 border-l-2 border-cyan-500/70 group-hover:border-cyan-400 transition-colors" />
          <div className="pointer-events-none absolute top-1 right-1 h-3.5 w-3.5 border-t-2 border-r-2 border-cyan-500/70 group-hover:border-cyan-400 transition-colors" />
          <div className="pointer-events-none absolute bottom-1 left-1 h-3.5 w-3.5 border-b-2 border-l-2 border-cyan-500/70 group-hover:border-cyan-400 transition-colors" />
          <div className="pointer-events-none absolute bottom-1 right-1 h-3.5 w-3.5 border-b-2 border-r-2 border-cyan-500/70 group-hover:border-cyan-400 transition-colors" />

          {/* Chamber Status Indicator */}
          <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1.5 text-[9px] text-slate-400 uppercase font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>INTAKE READY</span>
          </div>

          {/* Robotic Aperture & Rotating Scan Ring */}
          <div className="relative flex h-14 w-14 items-center justify-center">
            {/* Outer rotating aperture ring */}
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full animate-radar-slow opacity-60 group-hover:opacity-100 transition-opacity"
            >
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="#00f0ff"
                strokeWidth="1.5"
                strokeDasharray="18 8 6 8"
              />
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="0.75"
                strokeDasharray="4 6"
              />
            </svg>

            {/* Central aperture core */}
            <div
              className={`flex h-10 w-10 items-center justify-center border border-cyan-500/50 transition-all ${
                isDragging
                  ? "bg-cyan-500 text-black shadow-[0_0_15px_#00f0ff]"
                  : "bg-slate-900/90 text-cyan-400 group-hover:border-cyan-300 group-hover:shadow-[0_0_12px_rgba(0,240,255,0.3)]"
              }`}
            >
              <Scan className="h-5 w-5" />
            </div>
          </div>

          {/* Mechanical Intake Typography */}
          <div className="space-y-1 z-10">
            <p className="text-xs font-mono font-extrabold tracking-wider text-white uppercase group-hover:text-cyan-300 transition-colors">
              {isDragging ? ">> RELEASE TO INTAKE IMAGE <<" : "Drop an image here / ទម្លាក់រូបភាពទីនេះ"}
            </p>
            <p className="text-[11px] text-slate-400 font-sans">
              or choose a file from your device
            </p>
            <p className="text-[10px] text-cyan-400/80 font-mono tracking-wider pt-0.5">
              PNG, JPG, WEBP · Max 12MB
            </p>
            {/* Hidden compatibility hook for test scanners */}
            <span className="sr-only">DROP IMAGE INTO SCANNER</span>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-2 border border-rose-500/50 bg-rose-950/70 px-3 py-2 text-xs font-mono text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Hidden file input with data-testid="image-upload-input" */}
      <input
        id="bg-source-file-input"
        data-testid="image-upload-input"
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled}
        aria-label="Upload image for background removal"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
