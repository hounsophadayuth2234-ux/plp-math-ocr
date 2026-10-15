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
 * 0px border-radius, 1px solid cyan/slate borders, monospace typography, and audio effects.
 */
export function BgUploadZone({
  onFileSelect,
  selectedFile,
  disabled,
  label = "SOURCE INPUT",
  hint = "PNG, JPG, WEBP · MAX 12 MB",
}: BgUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setSizeError(null);
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setSizeError("UNSUPPORTED FORMAT: PLEASE UPLOAD PNG, JPG, OR WEBP.");
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        setSizeError("PAYLOAD EXCEEDS 12 MB HARD LIMIT.");
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
    setSizeError(null);
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
      <div className="flex items-center justify-between text-xs tracking-wider text-slate-400 uppercase">
        <span className="flex items-center gap-1.5 font-bold text-slate-300">
          <span className="h-1.5 w-1.5 bg-cyan-400" />
          {label}
        </span>
        <span className="text-[10px] text-slate-500">{hint}</span>
      </div>

      {selectedFile && previewUrl ? (
        <div className="relative overflow-hidden rounded-none border border-cyan-500/40 bg-slate-950/95 shadow-[0_0_20px_rgba(0,240,255,0.12)]">
          {/* Laser scan line over preview */}
          <div className="animate-laser-scan opacity-60" />
          <div className="pointer-events-none absolute inset-0 cyber-scanlines opacity-20" />

          {/* Corner reticles */}
          <div className="pointer-events-none absolute top-1 left-1 h-2.5 w-2.5 border-t border-l border-cyan-400 z-20" />
          <div className="pointer-events-none absolute top-1 right-1 h-2.5 w-2.5 border-t border-r border-cyan-400 z-20" />
          <div className="pointer-events-none absolute bottom-1 left-1 h-2.5 w-2.5 border-b border-l border-cyan-400 z-20" />
          <div className="pointer-events-none absolute bottom-1 right-1 h-2.5 w-2.5 border-b border-r border-cyan-400 z-20" />

          <img
            src={previewUrl}
            alt="Original upload preview"
            className="max-h-56 w-full object-contain p-3 relative z-10"
          />
          <div className="flex items-center justify-between border-t border-cyan-500/30 bg-slate-900/90 px-4 py-2 relative z-10">
            <span className="flex items-center gap-2 text-xs text-slate-300">
              <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
              <span className="max-w-[180px] truncate font-mono font-medium">
                {selectedFile.name}
              </span>
              <span className="font-mono text-[10px] text-cyan-400/80">
                [{(selectedFile.size / 1024).toFixed(0)} KB]
              </span>
            </span>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="flex items-center gap-1 rounded-none border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-xs font-mono text-rose-300 hover:bg-rose-900/60 hover:text-white disabled:opacity-40 transition-colors active:scale-[0.98]"
            >
              <X className="h-3.5 w-3.5" /> REMOVE
            </button>
          </div>
        </div>
      ) : (
        <div
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
          className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-none border border-dashed px-6 py-10 text-center transition-all overflow-hidden ${
            disabled
              ? "cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-50"
              : isDragging
              ? "border-cyan-400 bg-cyan-950/40 shadow-[0_0_25px_rgba(0,240,255,0.25)]"
              : "border-cyan-500/30 bg-slate-950/70 hover:border-cyan-400/70 hover:bg-slate-900/80 hover:shadow-[0_0_20px_rgba(0,240,255,0.15)]"
          }`}
        >
          {/* Corner target reticles */}
          <div className="pointer-events-none absolute top-1.5 left-1.5 h-3 w-3 border-t border-l border-cyan-400/80" />
          <div className="pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 border-t border-r border-cyan-400/80" />
          <div className="pointer-events-none absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-cyan-400/80" />
          <div className="pointer-events-none absolute bottom-1.5 right-1.5 h-3 w-3 border-b border-r border-cyan-400/80" />

          <div
            className={`flex h-12 w-12 items-center justify-center rounded-none border border-cyan-500/40 ${
              isDragging ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-900 text-slate-400"
            }`}
          >
            <Upload className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              {isDragging ? ">> DROP PAYLOAD TO INGEST <<" : "DRAG & DROP OR CLICK TO INGEST"}
            </p>
            <p className="mt-1 text-[11px] font-mono text-slate-500">
              CLEAN CONTRAST ENHANCES ISNET_FP16 SEGMENTATION
            </p>
          </div>
        </div>
      )}

      {sizeError && (
        <div className="flex items-center gap-2 rounded-none border border-rose-500/50 bg-rose-950/50 px-3 py-2 text-xs font-mono text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {sizeError}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
