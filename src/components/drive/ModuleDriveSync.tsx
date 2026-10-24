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
} from "lucide-react";
import type { DriveUploadFileRecord } from "@/lib/drive-upload-client";

export type DriveSyncStatus = "idle" | "pending" | "uploaded" | "failed";

export interface ModuleDriveSyncProps {
  moduleName: string;
  saveToDrive: boolean;
  onToggleSave: (enabled: boolean) => void;
  status: DriveSyncStatus;
  uploadedRecord: DriveUploadFileRecord | null;
  errorMessage: string | null;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function ModuleDriveSync({
  moduleName,
  saveToDrive,
  onToggleSave,
  status,
  uploadedRecord,
  errorMessage,
  onRetry,
  compact = false,
  className = "",
}: ModuleDriveSyncProps) {
  return (
    <div
      className={`rounded-xl border border-slate-700/60 bg-slate-900/70 backdrop-blur-md p-4 transition-all duration-200 shadow-sm ${className}`}
    >
      {/* Header and User Setting Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">
                Google Drive Storage (DYT_Math_Images)
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                <Lock className="w-2.5 h-2.5" /> Private
              </span>
            </div>
            {!compact && (
              <p className="text-xs text-slate-400">
                {moduleName}: រក្សាទុកស្វ័យប្រវត្តិតាមការយល់ព្រមរបស់អ្នក (Save to Drive with consent)
              </p>
            )}
          </div>
        </div>

        {/* User Toggle Setting */}
        <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition-colors">
          <input
            type="checkbox"
            checked={saveToDrive}
            onChange={(e) => onToggleSave(e.target.checked)}
            className="w-4 h-4 text-sky-500 rounded border-slate-600 bg-slate-900 focus:ring-sky-500/30 focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-xs font-medium text-slate-200">
            {saveToDrive ? "រក្សាទុកក្នុង Drive (Enabled)" : "កុំរក្សាទុក (Do not save)"}
          </span>
        </label>
      </div>

      {/* Dynamic Status Presentation */}
      <div className="mt-3 pt-3 border-t border-slate-800/80">
        {status === "idle" && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <span>
              {saveToDrive
                ? "រួចរាល់សម្រាប់ការរក្សាទុកពេលដំណើរការរូបភាព (Ready to save upon processing)"
                : "មុខងាររក្សាទុកត្រូវបានបិទតាមជម្រើសរបស់អ្នក (Drive saving disabled by user preference)"}
            </span>
          </div>
        )}

        {status === "pending" && (
          <div className="flex items-center gap-2.5 text-xs text-sky-300 bg-sky-950/40 border border-sky-800/40 px-3 py-2 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
            <div className="flex-1">
              <span className="font-medium">កំពុងបញ្ជូនទៅកាន់ Google Drive...</span>
              <span className="text-slate-400 ml-1.5 text-[11px]">(មិនរារាំងមុខងារ AI ឡើយ)</span>
            </div>
          </div>
        )}

        {status === "uploaded" && uploadedRecord && (
          <div className="space-y-2 text-xs bg-emerald-950/30 border border-emerald-800/40 px-3 py-2.5 rounded-lg text-emerald-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold text-emerald-300">
                  បានរក្សាទុកក្នុង Google Drive ដោយជោគជ័យ
                </span>
              </div>
              {uploadedRecord.webViewLink && (
                <a
                  href={uploadedRecord.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium transition-colors border border-emerald-500/30"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>បើកមើលក្នុង Drive (Open)</span>
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-300 bg-slate-900/60 p-2 rounded border border-emerald-900/40 font-mono">
              <div className="truncate">
                <span className="text-slate-400 font-sans">ឈ្មោះឯកសារ: </span>
                <span className="text-slate-200">{uploadedRecord.name}</span>
              </div>
              <div className="truncate">
                <span className="text-slate-400 font-sans">Drive File ID: </span>
                <span className="text-emerald-400 select-all">{uploadedRecord.id}</span>
              </div>
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="space-y-2 text-xs bg-amber-950/30 border border-amber-800/40 px-3 py-2.5 rounded-lg text-amber-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-300">
                    មិនអាចរក្សាទុកក្នុង Google Drive បានទេ (Drive Notice)
                  </div>
                  <p className="text-slate-300 text-[11px] mt-0.5">
                    {errorMessage || "Unknown network or authorization error occurred during upload."}
                  </p>
                  <p className="text-emerald-400/90 text-[11px] mt-1 font-sans">
                    ✓ មុខងារដំណើរការរូបភាព AI នៅតែដំណើរការជោគជ័យធម្មតា (Core AI result preserved)
                  </p>
                </div>
              </div>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-medium transition-colors border border-amber-500/30 shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>សាកល្បងម្ដងទៀត</span>
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
