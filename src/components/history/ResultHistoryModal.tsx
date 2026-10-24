"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  History,
  Database,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  FileText,
  Code,
  Copy,
  Trash2,
  X,
  Search,
  Filter,
  Eye,
} from "lucide-react";

export interface HistoryItem {
  cacheKey: string;
  userId: string;
  module: string;
  grade?: string;
  mode?: string;
  language?: string;
  summary: string;
  modelName: string;
  promptVersion: string;
  createdAt: number;
  lastAccessedAt: number;
  status: "completed" | "partial" | "failed";
  driveFileIds: Record<string, string>;
  driveLinks: Record<string, string>;
  outputFields: any;
  source?: "cache" | "gemini" | "worker";
}

interface ResultHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModule?: string;
  onSelectRecord?: (record: HistoryItem) => void;
}

const MODULE_LABELS: Record<string, { labelKh: string; labelEn: string; color: string }> = {
  module01_math_ocr: {
    labelKh: "ម៉ូឌុល ០១៖ Math OCR",
    labelEn: "Module 01: Math OCR",
    color: "from-cyan-500 to-blue-600 border-cyan-500/40 text-cyan-300",
  },
  module02_bg_remover: {
    labelKh: "ម៉ូឌុល ០២៖ លុបផ្ទៃខាងក្រោយ",
    labelEn: "Module 02: BG Remover",
    color: "from-emerald-500 to-teal-600 border-emerald-500/40 text-emerald-300",
  },
  module03_image_upscaler: {
    labelKh: "ម៉ូឌុល ០៣៖ ពង្រីកគុណភាព 4x HD",
    labelEn: "Module 03: HD Upscaler",
    color: "from-amber-500 to-orange-600 border-amber-500/40 text-amber-300",
  },
  module04_math_solver: {
    labelKh: "ម៉ូឌុល ០៤៖ ដោះស្រាយលំហាត់",
    labelEn: "Module 04: Math Solver",
    color: "from-violet-500 to-indigo-600 border-violet-500/40 text-violet-300",
  },
  module05_lesson_studio: {
    labelKh: "ម៉ូឌុល ០៥៖ បង្កើតមេរៀន និងកិច្ចការ",
    labelEn: "Module 05: Lesson Studio",
    color: "from-rose-500 to-pink-600 border-rose-500/40 text-rose-300",
  },
};

export function ResultHistoryModal({
  isOpen,
  onClose,
  currentModule,
  onSelectRecord,
}: ResultHistoryModalProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterModule, setFilterModule] = useState<string>(currentModule || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        filterModule && filterModule !== "all"
          ? `/api/history?module=${encodeURIComponent(filterModule)}`
          : "/api/history";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
      }
    } catch (err) {
      console.warn("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  }, [filterModule]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  const handleRetryStorage = async (cacheKey: string) => {
    setRetryingKey(cacheKey);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_storage", cacheKey }),
      });
      const data = await res.json();
      if (data.success) {
        fetchHistory();
      }
    } catch (err) {
      console.warn("Failed to retry storage:", err);
    } finally {
      setRetryingKey(null);
    }
  };

  const handleCopy = (text: string, id: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (!isOpen) return null;

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.summary.toLowerCase().includes(q) ||
      item.module.toLowerCase().includes(q) ||
      (item.grade && item.grade.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-md">
              <History className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-sans">
                  ប្រវត្តិលទ្ធផល និងឃ្លាំងផ្ទុក (Result History)
                </h2>
                <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-xs font-mono font-medium text-indigo-300 border border-indigo-500/30">
                  Google Drive + Redis Cache
                </span>
              </div>
              <p className="text-xs text-slate-400">
                រក្សាទុកជាស្វ័យប្រវត្តិក្នង Folder <strong className="text-cyan-400">DYT_Math_Images</strong> និងដកស្រង់លឿនដោយមិនប្រើប្រាស់ API Gemini ឡើងវិញ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="Close History Modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/40 px-6 py-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-850 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">ម៉ូឌុលទាំងអស់ (All Modules)</option>
              <option value="module01_math_ocr">Module 01: Math OCR</option>
              <option value="module02_bg_remover">Module 02: BG Remover</option>
              <option value="module03_image_upscaler">Module 03: HD Upscaler</option>
              <option value="module04_math_solver">Module 04: Math Solver</option>
              <option value="module05_lesson_studio">Module 05: Lesson Studio</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="ស្វែងរកតាមលំហាត់..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 rounded-lg border border-slate-700 bg-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={fetchHistory}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-850 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>ផ្ទុកឡើងវិញ</span>
            </button>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-cyan-400 mb-3" />
              <p className="text-sm">កំពុងផ្ទុកប្រវត្តិលទ្ធផលពី Redis Index...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Database className="h-10 w-10 text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-300">មិនទាន់មានលទ្ធផលដែលបានរក្សាទុកនៅឡើយទេ</p>
              <p className="text-xs text-slate-500 mt-1">
                រាល់ពេលដែលអ្នកដំណើរការលំហាត់ ឬរូបភាព ប្រព័ន្ធនឹងរក្សាទុកក្នុង Google Drive និង Redis ដោយស្វ័យប្រវត្តិ។
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const modInfo = MODULE_LABELS[item.module] || {
                labelKh: item.module,
                labelEn: item.module,
                color: "from-slate-600 to-slate-700 border-slate-600 text-slate-300",
              };
              const dateStr = new Date(item.createdAt).toLocaleString("km-KH", {
                dateStyle: "medium",
                timeStyle: "short",
              });
              const fileCount = Object.keys(item.driveFileIds || {}).length;

              return (
                <div
                  key={item.cacheKey}
                  className="group rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700 hover:bg-slate-950"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-[280px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-sans font-semibold ${modInfo.color}`}
                        >
                          {modInfo.labelKh}
                        </span>

                        <span className="text-[11px] font-mono text-slate-400">{dateStr}</span>

                        {item.status === "completed" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>រក្សាទុកក្នុង Google Drive</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">
                            <AlertCircle className="h-3 w-3" />
                            <span>រក្សាទុកបានមួយផ្នែក (Partial)</span>
                          </span>
                        )}

                        <span className="rounded bg-cyan-950/40 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300 border border-cyan-800/40">
                          {item.modelName}
                        </span>
                      </div>

                      <p className="text-sm font-medium text-slate-200 line-clamp-2 font-sans">
                        {item.summary}
                      </p>

                      {/* Drive File IDs Pill List */}
                      {fileCount > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-400">
                          <span className="text-slate-500 font-mono">Folder: DYT_Math_Images:</span>
                          {Object.entries(item.driveFileIds).map(([type, fileId]) => {
                            const link = item.driveLinks?.[type];
                            return (
                              <a
                                key={type}
                                href={link || `https://drive.google.com/file/d/${fileId}/view`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded border border-slate-700/80 bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-cyan-400 hover:border-cyan-500 hover:text-cyan-300 transition-colors"
                              >
                                <span>{type}</span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {onSelectRecord && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectRecord(item);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-cyan-500 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>បើកមើលលទ្ធផល</span>
                        </button>
                      )}

                      {item.status !== "completed" && (
                        <button
                          type="button"
                          onClick={() => handleRetryStorage(item.cacheKey)}
                          disabled={retryingKey === item.cacheKey}
                          className="flex items-center gap-1 rounded-lg border border-amber-600/40 bg-amber-950/30 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-900/40 transition-colors"
                          title="ព្យាយាមរក្សាទុកក្នុង Google Drive ឡើងវិញដោយមិនដំណើរការ Gemini ឡើងវិញ"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${retryingKey === item.cacheKey ? "animate-spin" : ""}`}
                          />
                          <span>ព្យាយាមរក្សាទុកឡើងវិញ</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/60 px-6 py-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>ស្វ័យប្រវត្តិកាត់បន្ថយការប្រើប្រាស់ Gemini API (Cached Invariant)</span>
          </div>

          <div className="font-mono text-[11px] text-slate-500">
            សរុប {filteredItems.length} លទ្ធផល
          </div>
        </div>
      </div>
    </div>
  );
}
