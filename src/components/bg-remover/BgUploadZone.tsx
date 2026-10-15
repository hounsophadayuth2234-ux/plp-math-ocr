"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { Upload, X, ImageIcon, AlertCircle } from "lucide-react";

interface BgUploadZoneProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
  label?: string;
  hint?: string;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Reusable drag-and-drop upload zone for the Background Removal module.
 */
export function BgUploadZone({
  onFileSelect,
  selectedFile,
  disabled,
  label = "Upload Image",
  hint = "PNG, JPG, WEBP · max 12 MB",
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
        setSizeError("Unsupported format. Please upload PNG, JPG, or WEBP.");
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        setSizeError("File exceeds 12 MB limit.");
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
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleClear = () => {
    setSizeError(null);
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
      setPreviewUrl(null);
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
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
        <span className="ml-2 font-normal normal-case text-slate-500">({hint})</span>
      </label>

      {selectedFile && previewUrl ? (
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/40 bg-slate-950/90 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
          {/* Subtle scanning laser bar across preview */}
          <div className="animate-laser-scan opacity-70" />

          <img
            src={previewUrl}
            alt="Original upload preview"
            className="max-h-56 w-full object-contain p-3 relative z-10"
          />
          <div className="flex items-center justify-between border-t border-emerald-500/20 bg-slate-900/90 px-4 py-2 relative z-10">
            <span className="flex items-center gap-2 text-xs text-slate-400">
              <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
              <span className="max-w-[180px] truncate font-medium text-slate-200">
                {selectedFile.name}
              </span>
              <span className="font-mono text-emerald-400/80">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
            </span>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-900/60 hover:text-white disabled:opacity-40 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all overflow-hidden ${
            disabled
              ? "cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-50"
              : isDragging
              ? "border-emerald-400 bg-emerald-950/30 shadow-[0_0_25px_rgba(16,185,129,0.25)]"
              : "border-emerald-500/30 bg-slate-950/60 hover:border-emerald-400/70 hover:bg-slate-900/80 hover:shadow-[0_0_20px_rgba(16,185,129,0.12)]"
          }`}
        >
          {/* Corner target reticles */}
          <div className="absolute top-1 left-1 h-2 w-2 border-t-2 border-l-2 border-emerald-500/50" />
          <div className="absolute top-1 right-1 h-2 w-2 border-t-2 border-r-2 border-emerald-500/50" />
          <div className="absolute bottom-1 left-1 h-2 w-2 border-b-2 border-l-2 border-emerald-500/50" />
          <div className="absolute bottom-1 right-1 h-2 w-2 border-b-2 border-r-2 border-emerald-500/50" />
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isDragging ? "bg-emerald-500/20" : "bg-slate-800"}`}>
            <Upload className={`h-6 w-6 ${isDragging ? "text-emerald-400" : "text-slate-400"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">
              {isDragging ? "Drop image here" : "Drag & drop or click to upload"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Works best with clear subject/background contrast
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
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}
