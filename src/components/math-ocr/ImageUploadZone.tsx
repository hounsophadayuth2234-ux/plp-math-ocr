"use client";

import React, { useRef, useState, useCallback } from "react";
import { Upload, X, ImageIcon, AlertCircle } from "lucide-react";

interface ImageUploadZoneProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

/**
 * Drag-and-drop + click-to-upload zone for math problem images.
 * Accepts PNG, JPG, WEBP up to 10MB.
 */
export function ImageUploadZone({ onFileSelect, selectedFile, disabled }: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setSizeError(null);
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        setSizeError("Unsupported format. Please upload PNG, JPG, or WEBP.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setSizeError("File exceeds 10MB. Please upload a smaller image.");
        return;
      }
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      onFileSelect(file);
    },
    [onFileSelect]
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
    setPreviewUrl(null);
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        Upload Math Problem Image
        <span className="ml-2 font-normal normal-case text-slate-500">
          (PNG, JPG, WEBP · max 10 MB)
        </span>
      </label>

      {selectedFile && previewUrl ? (
        /* Preview state with holographic laser scanner */
        <div className="relative overflow-hidden rounded-xl border border-cyan-500/40 bg-slate-950/90 shadow-[0_0_20px_rgba(0,240,255,0.1)]">
          {/* Subtle scanning laser bar across preview */}
          <div className="animate-laser-scan opacity-70" />
          
          <img
            src={previewUrl}
            alt="Uploaded math problem"
            className="max-h-64 w-full object-contain p-3 relative z-10"
          />
          <div className="flex items-center justify-between border-t border-cyan-500/20 bg-slate-900/90 px-4 py-2.5 relative z-10">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
              <span className="max-w-xs truncate font-medium text-slate-200">
                {selectedFile.name}
              </span>
              <span className="font-mono text-cyan-400/80">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
            </div>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-900/60 hover:text-white disabled:opacity-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </div>
      ) : (
        /* Drop zone with cyber borders */
        <div
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all overflow-hidden ${
            disabled
              ? "cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-50"
              : isDragging
              ? "border-cyan-400 bg-cyan-950/30 shadow-[0_0_25px_rgba(0,240,255,0.25)]"
              : "border-cyan-500/30 bg-slate-950/60 hover:border-cyan-400/70 hover:bg-slate-900/80 hover:shadow-[0_0_20px_rgba(0,240,255,0.12)]"
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
            <Upload className={`h-6 w-6 ${isDragging ? "text-indigo-400" : "text-slate-400"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">
              {isDragging ? "Drop image here" : "Drag & drop or click to upload"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Supports handwritten equations, printed formulas, and geometric diagrams
            </p>
          </div>
        </div>
      )}

      {sizeError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
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
