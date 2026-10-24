"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  FolderCheck,
  FolderX,
  Unlink,
  Link2,
  RefreshCw,
  Mail,
  ShieldCheck,
  ExternalLink,
  History,
  FileImage,
} from "lucide-react";

export interface DriveStatusResponse {
  success: boolean;
  connected: boolean;
  email?: string;
  connectedAt?: number;
  folderId?: string;
  folderName?: string;
  folderAccessible?: boolean;
  folderError?: string;
  error?: string;
}

export interface DriveHistoryItem {
  id: string;
  userId: string;
  module: string;
  filename: string;
  mimeType: string;
  size: number;
  resultDriveFileId?: string;
  webViewLink?: string;
  folderId: string;
  status: "pending" | "uploaded" | "failed";
  createdAt: number;
}

export function GoogleDriveOAuthSettings() {
  const [status, setStatus] = useState<DriveStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const [history, setHistory] = useState<DriveHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/auth/google-drive/status", { cache: "no-store" });
      const data: DriveStatusResponse = await res.json();
      setStatus(data);
    } catch (err: unknown) {
      console.error("Failed to load Google Drive status:", err);
      setStatus({ success: false, connected: false, error: "Cannot check status" });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch("/api/drive-history", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.records)) {
        setHistory(data.records);
      }
    } catch (err: unknown) {
      console.warn("Failed to load drive history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Check URL parameters for OAuth redirect feedback
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const driveStatus = params.get("drive_status");
      const driveWarning = params.get("drive_warning");
      const folderError = params.get("folder_error");
      const driveError = params.get("drive_error");

      if (driveStatus === "connected") {
        setNotice({
          type: "success",
          message: "Google Drive បានភ្ជាប់ដោយជោគជ័យ! អ្នកអាចរក្សាទុកឯកសារដោយប្រើទំហំផ្ទុកផ្ទាល់ខ្លួនបានហើយ។",
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (driveWarning === "folder_inaccessible") {
        setNotice({
          type: "warning",
          message:
            folderError ||
            "Google Drive បានភ្ជាប់ ប៉ុន្តែមិនអាចចូលប្រើ Folder DYT_Math_Images បានទេ។ សូមពិនិត្យសិទ្ធិចែករំលែក Folder។",
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (driveError) {
        setNotice({
          type: "error",
          message: `ការភ្ជាប់ Google Drive បានបរាជ័យ៖ ${driveError}`,
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [fetchStatus]);

  const handleDisconnect = async () => {
    if (!confirm("តើអ្នកពិតជាចង់ផ្តាច់ Google Drive មែនទេ? (ឯកសារដែលមានស្រាប់នឹងមិនត្រូវបានលុបឡើយ)")) {
      return;
    }

    try {
      setDisconnecting(true);
      const res = await fetch("/api/auth/google-drive/disconnect", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotice({
          type: "success",
          message: "Google Drive ត្រូវបានផ្តាច់ដោយជោគជ័យ។",
        });
        await fetchStatus();
      } else {
        throw new Error(data.error || "Failed to disconnect");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setNotice({
        type: "error",
        message: `មិនអាចផ្តាច់ Google Drive បានទេ៖ ${msg}`,
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleConnect = () => {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/api/auth/google-drive/connect?returnTo=${returnTo}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="mb-8 rounded-2xl border border-slate-700/60 bg-slate-900/90 p-6 backdrop-blur-xl shadow-2xl text-slate-100">
      {/* Top Banner / Alerts */}
      {notice && (
        <div
          className={`mb-5 rounded-xl border p-4 text-sm flex items-start gap-3 transition-all ${
            notice.type === "success"
              ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-200"
              : notice.type === "warning"
              ? "bg-amber-950/50 border-amber-500/40 text-amber-200"
              : "bg-rose-950/50 border-rose-500/40 text-rose-200"
          }`}
        >
          {notice.type === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />}
          {notice.type === "warning" && <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />}
          {notice.type === "error" && <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />}
          <div className="flex-1 font-medium">{notice.message}</div>
          <button
            onClick={() => setNotice(null)}
            className="text-xs opacity-60 hover:opacity-100 font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Settings Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              ការកំណត់ Google Drive Storage
            </h2>
            {loading ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400">
                <RefreshCw className="h-3 w-3 animate-spin" /> កំពុងពិនិត្យ...
              </span>
            ) : status?.connected ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 border border-emerald-500/40 text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Google Drive បានភ្ជាប់
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-400">
                មិនទាន់ភ្ជាប់
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            ប្រើប្រាស់ Google OAuth 2.0 ដើម្បីផ្ទុកឯកសារដោយផ្ទាល់ក្នុងទំហំផ្ទុកផ្ទាល់ខ្លួនរបស់អ្នក (Personal Storage Quota)
          </p>
        </div>

        {/* Action Button: Connect / Disconnect */}
        <div className="flex items-center gap-2">
          {status?.connected ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 hover:text-white transition disabled:opacity-50"
            >
              {disconnecting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> កំពុងផ្តាច់...
                </>
              ) : (
                <>
                  <Unlink className="h-4 w-4 text-rose-400" /> ផ្តាច់ Google Drive
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-indigo-500 transition active:scale-95 disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" /> ភ្ជាប់ Google Drive
            </button>
          )}

          <button
            onClick={() => {
              fetchStatus();
              if (showHistory) fetchHistory();
            }}
            title="ពិនិត្យស្ថានភាពឡើងវិញ"
            className="p-2 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-400 hover:text-white transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Connected Account & Folder Inspection Area */}
      {status?.connected && (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Account Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-1.5 font-medium">
                <Mail className="h-3.5 w-3.5 text-blue-400" /> គណនី Google ដែលបានភ្ជាប់
              </span>
              <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                <ShieldCheck className="h-3 w-3" /> OAuth 2.0 Secure
              </span>
            </div>
            <div className="font-semibold text-white text-sm truncate">
              {status.email || "Google Account Connected"}
            </div>
            {status.connectedAt && (
              <div className="text-[11px] text-slate-500 mt-1">
                ភ្ជាប់នៅ៖ {new Date(status.connectedAt).toLocaleString("km-KH")}
              </div>
            )}
          </div>

          {/* Target Folder Card */}
          <div
            className={`rounded-xl border p-4 transition ${
              status.folderAccessible
                ? "border-emerald-500/30 bg-emerald-950/20"
                : "border-amber-500/40 bg-amber-950/30"
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                {status.folderAccessible ? (
                  <FolderCheck className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <FolderX className="h-3.5 w-3.5 text-amber-400" />
                )}
                Folder គោលដៅ៖ DYT_Math_Images
              </span>
              {status.folderAccessible ? (
                <span className="rounded-full bg-emerald-950 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  ចូលប្រើប្រាស់បាន
                </span>
              ) : (
                <span className="rounded-full bg-amber-950 border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  ត្រូវការផ្ទៀងផ្ទាត់សិទ្ធិ
                </span>
              )}
            </div>

            <div className="font-mono text-xs text-slate-300 truncate">
              ID: {status.folderId || "1dS_Ul_WnVCCbJAKsn6CAT0vy9AB8Yx8f"}
            </div>

            {!status.folderAccessible && (
              <div className="mt-2 text-[11px] text-amber-300 bg-amber-950/50 p-2 rounded border border-amber-500/30">
                {status.folderError ||
                  "មិនអាចរកឃើញ Folder នេះនៅក្នុងគណនី Google របស់អ្នកឡើយ។ សូមប្រាកដថាអ្នកបានចែករំលែកសិទ្ធិ Folder DYT_Math_Images មកកាន់គណនីនេះ។"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Box if disconnected */}
      {!status?.connected && !loading && (
        <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-950/20 p-4 text-xs text-blue-200">
          <p className="font-semibold text-blue-300 mb-1">
            ហេតុអ្វីត្រូវភ្ជាប់គណនី Google Drive ផ្ទាល់ខ្លួន?
          </p>
          <p className="text-slate-300 leading-relaxed">
            គណនីសេវាកម្ម Service Account គ្មានទំហំផ្ទុក (0 Storage Quota) សម្រាប់ Drive ផ្ទាល់ខ្លួនឡើយ។
            ការភ្ជាប់តាមរយៈ Google OAuth 2.0 អនុញ្ញាតឱ្យឯកសាររូបភាពដែល Upload ត្រូវបានរក្សាទុកដោយផ្ទាល់ក្នុង Folder{" "}
            <span className="font-mono text-cyan-300">DYT_Math_Images</span> ដោយប្រើទំហំផ្ទុក Google Drive ផ្ទាល់ខ្លួនរបស់អ្នក។
          </p>
        </div>
      )}

      {/* History Toggle Bar */}
      <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
        <button
          onClick={() => {
            const next = !showHistory;
            setShowHistory(next);
            if (next && history.length === 0) {
              fetchHistory();
            }
          }}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          <History className="h-4 w-4 text-indigo-400" />
          {showHistory ? "លាក់ប្រវត្តិ Upload (Hide History)" : "បង្ហាញប្រវត្តិ Upload (View Upload History)"}
        </button>

        <span className="text-[11px] text-slate-500">
          ឯកសារទាំងអស់ត្រូវបានកំណត់ជា Private តាមលំនាំដើម
        </span>
      </div>

      {/* History Records Table */}
      {showHistory && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-300">
              ប្រវត្តិនៃការ Upload រូបភាពកន្លងមក ({history.length} ឯកសារ)
            </h3>
            <button
              onClick={fetchHistory}
              disabled={loadingHistory}
              className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${loadingHistory ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {loadingHistory ? (
            <div className="py-6 text-center text-xs text-slate-500">កំពុងទាញយកទិន្នន័យ...</div>
          ) : history.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              មិនទាន់មានទិន្នន័យ Upload នៅឡើយទេ។
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-2">ម៉ូឌុល</th>
                  <th className="pb-2">ឈ្មោះឯកសារ</th>
                  <th className="pb-2">ទំហំ</th>
                  <th className="pb-2">កាលបរិច្ឆេទ</th>
                  <th className="pb-2">ស្ថានភាព</th>
                  <th className="pb-2 text-right">តំណភ្ជាប់</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/50">
                    <td className="py-2.5 font-medium text-cyan-300">{item.module}</td>
                    <td className="py-2.5 text-slate-200 flex items-center gap-1.5 truncate max-w-[200px]">
                      <FileImage className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{item.filename}</span>
                    </td>
                    <td className="py-2.5 text-slate-400 font-mono">{formatFileSize(item.size)}</td>
                    <td className="py-2.5 text-slate-400">
                      {new Date(item.createdAt).toLocaleString("km-KH", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.status === "uploaded"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30"
                            : item.status === "pending"
                            ? "bg-amber-950 text-amber-300"
                            : "bg-rose-950 text-rose-300"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {item.webViewLink ? (
                        <a
                          href={item.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                        >
                          បើក <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-slate-600 font-mono text-[10px]">
                          {item.resultDriveFileId || "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
