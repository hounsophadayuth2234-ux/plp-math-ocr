"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  X,
  Image as ImageIcon,
  Globe,
  Lock,
  Code2,
} from "lucide-react";

export interface UploadedDriveFile {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
  folderId: string;
}

export interface DriveUploaderProps {
  defaultFolderId?: string;
  onUploadSuccess?: (file: UploadedDriveFile) => void;
  className?: string;
}

const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
];

export function DriveUploader({
  defaultFolderId,
  onUploadSuccess,
  className = "",
}: DriveUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [makePublic, setMakePublic] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Upload States
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedDriveFile | null>(null);

  // Copy state
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (previewUrl) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch {}
      }
    };
  }, [previewUrl]);

  const handleFile = useCallback((file: File) => {
    setError(null);
    setUploadedFile(null);

    const type = file.type?.toLowerCase() || "";
    if (type && !ACCEPTED_MIME_TYPES.includes(type)) {
      setError("សូមជ្រើសរើសឯកសាររូបភាពជា PNG, JPG, WEBP, GIF ឬ SVG។ (Unsupported image format)");
      return;
    }

    if (file.size === 0) {
      setError("ឯកសារទទេ (0 bytes) មិនអាច Upload បានទេ។ (Empty file)");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError("ទំហំឯកសារធំជាង ២៥MB។ សូមជ្រើសរើសឯកសារតូចជាងនេះ។ (Max file size is 25MB)");
      return;
    }

    setSelectedFile(file);
    setFilename(file.name);

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {}
      setPreviewUrl(null);
    }
    setFilename("");
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("សូមជ្រើសរើសរូបភាពជាមុនសិន។ (Please select a file first)");
      return;
    }

    setIsUploading(true);
    setUploadProgress(15);
    setError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("filename", filename.trim() || selectedFile.name);
    formData.append("makePublic", makePublic ? "true" : "false");
    if (defaultFolderId) {
      formData.append("folderId", defaultFolderId);
    }

    try {
      setUploadProgress(45);

      const response = await fetch("/api/upload-to-drive", {
        method: "POST",
        body: formData,
      });

      setUploadProgress(85);

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.details || "Failed to upload file to Google Drive");
      }

      setUploadProgress(100);
      setUploadedFile(data.file);
      if (onUploadSuccess && data.file) {
        onUploadSuccess(data.file);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = async (text: string, type: "link" | "snippet") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "link") {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedSnippet(true);
        setTimeout(() => setCopiedSnippet(false), 2000);
      }
    } catch {
      console.warn("Clipboard access denied");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      className={`rounded-2xl border border-slate-700/60 bg-slate-900/80 p-6 backdrop-blur-xl shadow-2xl text-slate-100 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-lg shadow-cyan-500/20 text-white">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Google Drive Uploader
              <span className="rounded-full bg-cyan-950/80 border border-cyan-500/40 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                v3 Cloud
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              បញ្ចូលរូបភាពទៅកាន់ Google Drive ដោយផ្ទាល់ និងសុវត្ថិភាព
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Drive Connected</span>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div className="mt-6">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !selectedFile && !isUploading && fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all duration-200 ${
            isDragging
              ? "border-cyan-400 bg-cyan-950/30 scale-[1.01]"
              : selectedFile
              ? "border-slate-700 bg-slate-800/40"
              : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/30 cursor-pointer"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME_TYPES.join(",")}
            onChange={handleInputChange}
            disabled={isUploading}
            className="hidden"
          />

          {!selectedFile ? (
            <div className="flex flex-col items-center text-center space-y-3 py-4">
              <div className="rounded-full bg-slate-800 p-4 text-cyan-400 ring-1 ring-slate-700 shadow-inner">
                <ImageIcon className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-200">
                  <span className="text-cyan-400 underline decoration-cyan-400/50 underline-offset-2">
                    ចុចដើម្បីជ្រើសរើស
                  </span>{" "}
                  ឬអូសទម្លាក់រូបភាពទីនេះ
                </p>
                <p className="text-xs text-slate-400">
                  PNG, JPG, WEBP, GIF, SVG (អតិបរមា ២៥ MB)
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                {previewUrl ? (
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400">
                    <FileText className="h-8 w-8 text-cyan-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatFileSize(selectedFile.size)} • {selectedFile.type || "image"}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded bg-cyan-950/80 px-2 py-0.5 text-[10px] font-medium text-cyan-400 border border-cyan-800/40">
                      ត្រៀមរួចរាល់
                    </span>
                  </div>
                </div>
              </div>

              {!isUploading && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile();
                  }}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-colors"
                  title="Remove file"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File Details & Options */}
      {selectedFile && (
        <div className="mt-5 space-y-4 rounded-xl border border-slate-800 bg-slate-800/30 p-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              ឈ្មោះឯកសារលើ Google Drive (Filename)
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              disabled={isUploading}
              placeholder="e.g. math_exercise_grade_3.png"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={makePublic}
                onChange={(e) => setMakePublic(e.target.checked)}
                disabled={isUploading}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
              />
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                {makePublic ? (
                  <Globe className="h-3.5 w-3.5 text-cyan-400" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                )}
                ធ្វើឱ្យសាធារណៈ (Make Public / Anyone with link can view)
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">បរាជ័យក្នុងការ Upload (Upload Error)</p>
            <p className="mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {isUploading && (
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-xs text-slate-400">
            <span>កំពុងបញ្ជូនទៅ Google Drive...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Button */}
      <div className="mt-5">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 font-semibold text-sm shadow-lg transition-all duration-200 ${
            !selectedFile || isUploading
              ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              : "bg-gradient-to-r from-cyan-600 hover:from-cyan-500 to-blue-600 hover:to-blue-500 text-white shadow-cyan-600/25 active:scale-[0.99] border border-cyan-400/30"
          }`}
        >
          {isUploading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin text-white" />
              <span>កំពុង Upload...</span>
            </>
          ) : (
            <>
              <UploadCloud className="h-4 w-4" />
              <span>Upload to Drive</span>
            </>
          )}
        </button>
      </div>

      {/* Uploaded Success Result Display */}
      {uploadedFile && (
        <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-5 space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="h-5 w-5" />
              <span>Upload ជោគជ័យទៅ Google Drive!</span>
            </div>
            <span className="rounded bg-emerald-950 px-2 py-0.5 text-[11px] font-mono text-emerald-300 border border-emerald-800/60">
              {formatFileSize(uploadedFile.size)}
            </span>
          </div>

          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-500">File ID:</span>
              <span className="font-mono text-slate-200 select-all">{uploadedFile.fileId}</span>
            </div>

            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-500">ឈ្មោះឯកសារ:</span>
              <span className="font-medium text-slate-200">{uploadedFile.name}</span>
            </div>

            {uploadedFile.webViewLink && (
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                <a
                  href={uploadedFile.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 underline underline-offset-2 truncate font-medium"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">មើលឯកសារលើ Google Drive (View on Drive)</span>
                </a>

                <button
                  type="button"
                  onClick={() => copyToClipboard(uploadedFile.webViewLink!, "link")}
                  className="flex items-center gap-1 shrink-0 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700"
                  title="Copy Link"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Code Snippet for embedding / reusing */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1 font-medium">
                <Code2 className="h-3.5 w-3.5 text-cyan-400" />
                កូដគំរូសម្រាប់ប្រើប្រាស់ (Snippet):
              </span>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    uploadedFile.webViewLink
                      ? `<img src="${uploadedFile.webViewLink}" alt="${uploadedFile.name}" />`
                      : `fileId: ${uploadedFile.fileId}`,
                    "snippet"
                  )
                }
                className="text-cyan-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                {copiedSnippet ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedSnippet ? "ចម្លងរួច!" : "Copy Snippet"}
              </button>
            </div>
            <pre className="rounded-lg bg-slate-950 p-2.5 text-[11px] font-mono text-cyan-300 overflow-x-auto border border-slate-800/80">
              {uploadedFile.webViewLink
                ? `<img src="${uploadedFile.webViewLink}" alt="${uploadedFile.name}" />`
                : `// Google Drive File ID: ${uploadedFile.fileId}`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
