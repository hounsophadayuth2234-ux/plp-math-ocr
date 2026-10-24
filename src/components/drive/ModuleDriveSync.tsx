"use client";

import React from "react";
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  RefreshCw,
  HardDrive,
  Lock,
  Folder,
  ArrowUpRight,
} from "lucide-react";
import type { DriveUploadFileRecord } from "@/lib/drive-upload-client";

export type DriveSyncStatus = "idle" | "pending" | "uploaded" | "failed";

export interface ModuleDriveSyncProps {
  moduleName: string;
  status: DriveSyncStatus;
  uploadedRecords?: DriveUploadFileRecord[];
  uploadedRecord?: DriveUploadFileRecord | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
  cached?: boolean;
  cacheKey?: string;
  onOpenHistory?: () => void;
  // Deprecated/optional backward-compat parameters:
  saveToDrive?: boolean;
  onToggleSave?: (enabled: boolean) => void;
}

export function ModuleDriveSync({
  moduleName,
  status,
  uploadedRecords,
  uploadedRecord,
  errorMessage,
  onRetry,
  compact = false,
  className = "",
  cached,
  cacheKey: _cacheKey,
  onOpenHistory,
}: ModuleDriveSyncProps) {
  // Aggregate records for multi-output modules
  const allRecords: DriveUploadFileRecord[] = React.useMemo(() => {
    if (uploadedRecords && uploadedRecords.length > 0) {
      return uploadedRecords;
    }
    if (uploadedRecord) {
      return [uploadedRecord];
    }
    return [];
  }, [uploadedRecords, uploadedRecord]);

  const isNotConnectedError =
    errorMessage &&
    (errorMessage.includes("មិនទាន់ត្រូវបានភ្ជាប់") ||
      errorMessage.toLowerCase().includes("not connected") ||
      errorMessage.toLowerCase().includes("oauth") ||
      errorMessage.includes("401"));

  return (
    <div
      className={`rounded-xl border border-slate-700/60 bg-slate-900/70 backdrop-blur-md p-4 transition-all duration-200 shadow-sm ${className}`}
    >
      {/* Read-Only Status Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">
                Google Drive Storage: <span className="text-emerald-400">Automatic</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                <Folder className="w-2.5 h-2.5 text-sky-400" />
                Folder: DYT_Math_Images
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                <Lock className="w-2.5 h-2.5" /> Private
              </span>
              {cached === true && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                  💾 បានយកពីលទ្ធផលដែលបានរក្សាទុក (Cached)
                </span>
              )}
              {cached === false && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
                  ⚡ ដំណើរការថ្មីតាម Gemini AI
                </span>
              )}
            </div>
            {!compact && (
              <p className="text-xs text-slate-400 mt-0.5">
                {moduleName}: រក្សាទុកស្វ័យប្រវត្តិនូវរូបភាពដើម និងលទ្ធផលទាំងអស់ក្នុង Google Drive
              </p>
            )}
          </div>
        </div>

        {/* Action Links: History and Admin -> Google Drive Storage */}
        <div className="flex items-center gap-2">
          {onOpenHistory ? (
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-medium border border-slate-700/80 transition-colors shadow-xs"
              title="View saved results for this module"
            >
              <span>ប្រវត្តិ (History)</span>
            </button>
          ) : (
            <a
              href="/history"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-medium border border-slate-700/80 transition-colors shadow-xs"
              title="View saved results for this module"
            >
              <span>ប្រវត្តិ (History)</span>
            </a>
          )}
          <a
            href="/admin?tab=drive"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-sky-300 hover:text-sky-200 text-xs font-medium border border-slate-700/80 transition-colors shadow-xs"
            title="Manage Google Drive Connection & Settings in Admin Portal"
          >
            <span>Admin → Google Drive Storage</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
          </a>
        </div>
      </div>

      {/* Dynamic Status Presentation */}
      <div className="mt-3 pt-3 border-t border-slate-800/80">
        {status === "idle" && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>
              រក្សាទុកស្វ័យប្រវត្តិទៅកាន់ Google Drive (DYT_Math_Images) ពេលដំណើរការ (Automatic saving active)
            </span>
          </div>
        )}

        {status === "pending" && (
          <div className="flex items-center gap-2.5 text-xs text-sky-300 bg-sky-950/40 border border-sky-800/40 px-3 py-2.5 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
            <div className="flex-1 flex flex-wrap items-center justify-between gap-1">
              <div>
                <span className="font-medium">កំពុងបញ្ជូនទៅកាន់ Google Drive (Folder: DYT_Math_Images)...</span>
                <span className="text-slate-400 ml-1.5 text-[11px]">(Uploading — មិនរារាំងមុខងារ AI ឡើយ)</span>
              </div>
              <span className="text-[11px] font-mono text-sky-400">Uploading</span>
            </div>
          </div>
        )}

        {status === "uploaded" && allRecords.length > 0 && (
          <div className="space-y-2 text-xs bg-emerald-950/30 border border-emerald-800/40 px-3 py-2.5 rounded-lg text-emerald-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold text-emerald-300">
                  បានរក្សាទុកក្នុង Google Drive ដោយជោគជ័យ ({allRecords.length} ឯកសារ / Upload succeeded)
                </span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                Folder: DYT_Math_Images
              </span>
            </div>

            <div className="space-y-1.5 mt-2">
              {allRecords.map((rec, idx) => (
                <div
                  key={rec.id || idx}
                  className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-900/80 p-2 rounded border border-emerald-900/40 font-mono"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-400 font-sans shrink-0">#{idx + 1}</span>
                    <span className="text-slate-200 truncate font-sans max-w-[200px] sm:max-w-[320px]" title={rec.name}>
                      {rec.name}
                    </span>
                    {rec.size > 0 && (
                      <span className="text-slate-400 text-[10px]">
                        ({(rec.size / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-auto">
                    {rec.webViewLink && (
                      <a
                        href={rec.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-sans font-medium transition-colors border border-emerald-500/30"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>បើកមើល (View)</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="space-y-2 text-xs bg-amber-950/30 border border-amber-800/40 px-3 py-2.5 rounded-lg text-amber-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-amber-300">
                    មិនអាចរក្សាទុកក្នុង Google Drive បានទេ (Upload failed)
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    {errorMessage || "Unknown network or authorization error occurred during upload."}
                  </p>

                  {isNotConnectedError && (
                    <div className="pt-1">
                      <a
                        href="/admin?tab=drive"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-sans font-medium border border-sky-500/40 transition-colors"
                      >
                        <span>ភ្ជាប់ Google Drive របស់អ្នកនៅក្នុង Admin Portal</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  <p className="text-emerald-400/90 text-[11px] font-sans">
                    ✓ មុខងារដំណើរការរូបភាព AI នៅតែដំណើរការជោគជ័យធម្មតា (Core AI result preserved)
                  </p>
                </div>
              </div>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-medium transition-colors border border-amber-500/30 shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>សាកល្បងម្ដងទៀត (Retry)</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ModuleDriveSync;
