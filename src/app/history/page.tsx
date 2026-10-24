"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  History,
  Database,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  ArrowLeft,
  Eye,
  FileText,
  Code,
  Copy,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";

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

const MODULE_ROUTES: Record<string, string> = {
  module01_math_ocr: "/plp-math-content",
  module02_bg_remover: "/bg-remover",
  module03_image_upscaler: "/image-upscaler",
  module04_math_solver: "/math-solver",
  module05_lesson_studio: "/lesson-studio",
};

const MODULE_LABELS: Record<string, { labelKh: string; color: string }> = {
  module01_math_ocr: {
    labelKh: "ម៉ូឌុល ០១៖ Math OCR",
    color: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300",
  },
  module02_bg_remover: {
    labelKh: "ម៉ូឌុល ០២៖ លុបផ្ទៃខាងក្រោយ",
    color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  },
  module03_image_upscaler: {
    labelKh: "ម៉ូឌុល ០៣៖ ពង្រីកគុណភាព 4x HD",
    color: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  },
  module04_math_solver: {
    labelKh: "ម៉ូឌុល ០៤៖ ដោះស្រាយលំហាត់",
    color: "bg-violet-500/10 border-violet-500/30 text-violet-300",
  },
  module05_lesson_studio: {
    labelKh: "ម៉ូឌុល ០៥៖ បង្កើតមេរៀន និងកិច្ចការ",
    color: "bg-rose-500/10 border-rose-500/30 text-rose-300",
  },
};

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterModule, setFilterModule] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<HistoryItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
    fetchHistory();
  }, [fetchHistory]);

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
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

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
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>ផ្ទាំងគ្រប់គ្រង</span>
            </Link>
            <span className="text-slate-600">/</span>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-cyan-400" />
              <h1 className="text-base font-bold text-white font-sans">
                ប្រវត្តិលទ្ធផល និងឃ្លាំងផ្ទុក (Result History)
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-mono text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Auto-Cache & Drive Active
            </span>
          </div>
        </header>

        {/* Filter & Search Bar */}
        <div className="border-b border-slate-800 bg-slate-900/40 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
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
                placeholder="ស្វែងរកតាមលំហាត់ ឬខ្លឹមសារ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 rounded-lg border border-slate-700 bg-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
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

        {/* Main Content List */}
        <div className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-4">
          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-cyan-400 mb-3" />
              <p className="text-sm font-sans">កំពុងទាញយកប្រវត្តិលទ្ធផលពី Redis Cache...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
              <Database className="h-12 w-12 text-slate-600 mb-3" />
              <h3 className="text-base font-semibold text-slate-300 font-sans">មិនទាន់មានលទ្ធផលដែលបានរក្សាទុក</h3>
              <p className="text-xs text-slate-500 max-w-md text-center mt-1">
                រាល់ពេលដែលអ្នកដំណើរការលំហាត់ ឬរូបភាព លទ្ធផលនឹងត្រូវរក្សាទុកក្នុង Google Drive (DYT_Math_Images) និង Redis ដោយស្វ័យប្រវត្តិ។
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const modInfo = MODULE_LABELS[item.module] || {
                labelKh: item.module,
                color: "bg-slate-800 border-slate-700 text-slate-300",
              };
              const routeHref = MODULE_ROUTES[item.module] || "/";
              const dateStr = new Date(item.createdAt).toLocaleString("km-KH", {
                dateStyle: "medium",
                timeStyle: "short",
              });
              const fileCount = Object.keys(item.driveFileIds || {}).length;

              return (
                <div
                  key={item.cacheKey}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition-all hover:border-slate-700 hover:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-[280px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold ${modInfo.color}`}
                        >
                          {modInfo.labelKh}
                        </span>

                        <span className="text-xs font-mono text-slate-400">{dateStr}</span>

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

                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-cyan-300 border border-slate-700">
                          {item.modelName}
                        </span>
                      </div>

                      <h3 className="text-sm font-medium text-slate-200 line-clamp-2 font-sans leading-relaxed">
                        {item.summary}
                      </h3>

                      {/* Google Drive Artifacts Pill Links */}
                      {fileCount > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          <span className="text-slate-500 font-mono text-[11px]">Folder DYT_Math_Images:</span>
                          {Object.entries(item.driveFileIds).map(([type, fileId]) => {
                            const link = item.driveLinks?.[type];
                            return (
                              <a
                                key={type}
                                href={link || `https://drive.google.com/file/d/${fileId}/view`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-slate-950 px-2 py-1 font-mono text-[10px] text-cyan-400 hover:border-cyan-500 hover:text-cyan-300 transition-colors"
                              >
                                <span>{type}</span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={routeHref}
                        className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-cyan-500 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>បើកក្នុងម៉ូឌុល</span>
                      </Link>

                      {item.status !== "completed" && (
                        <button
                          type="button"
                          onClick={() => handleRetryStorage(item.cacheKey)}
                          disabled={retryingKey === item.cacheKey}
                          className="flex items-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-950/30 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-900/40 transition-colors"
                          title="ព្យាយាមរក្សាទុកក្នុង Google Drive ឡើងវិញដោយមិនដំណើរការ Gemini ឡើងវិញ"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${retryingKey === item.cacheKey ? "animate-spin" : ""}`}
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
      </main>
    </div>
  );
}
