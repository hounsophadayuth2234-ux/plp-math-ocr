"use client";

import React, { useState } from "react";
import { Copy, Check, Eye, Code2, FileCode, Binary, AlertTriangle } from "lucide-react";
import { sanitizeJoditHtml } from "@/lib/math-ocr-utils";

interface OutputTabsProps {
  latex: string;
  joditHtml: string;
  mathml: string;
  detectedType: string;
  rawDescription: string;
  transcription?: string;
  uncertainParts?: string[];
  isDemoMode?: boolean;
  elapsedSeconds?: number;
  isStale?: boolean;
}

export type TabId = "latex" | "joditHtml" | "mathml" | "preview";

/**
 * 4-Tab Output Panel:
 *  1. LaTeX Code (copyable, syntax formatted, KaTeX 0.19.0 verified)
 *  2. Jodit HTML / Inline CSS (copyable, sanitized, strict inline CSS)
 *  3. MathML Code (copyable, standard W3C MathML markup)
 *  4. Sandboxed Visual Preview (rendering sanitized Jodit HTML/CSS + SVG in real time)
 */
export function OutputTabs({
  latex,
  joditHtml,
  mathml,
  detectedType,
  rawDescription,
  transcription,
  uncertainParts,
  isDemoMode,
  elapsedSeconds,
  isStale,
}: OutputTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("latex");
  const [copied, setCopied] = useState<TabId | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);

  const sanitizedHtml = sanitizeJoditHtml(joditHtml);

  const copyText = async (text: string, tab: TabId) => {
    setCopyFailed(null);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopied(tab);
        setTimeout(() => setCopied(null), 2000);
      } else {
        throw new Error("Clipboard API not available in this environment.");
      }
    } catch (e: unknown) {
      console.error("Clipboard copy failed:", e);
      const msg = e instanceof Error ? e.message : "Failed to copy to clipboard";
      setCopyFailed(msg);
      setTimeout(() => setCopyFailed(null), 3000);
    }
  };

  const TABS: {
    id: TabId;
    label: string;
    badge: string;
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
    accent: string;
  }[] = [
    {
      id: "latex",
      label: "LaTeX",
      badge: "Option 1",
      icon: FileCode,
      accent: "text-emerald-400",
    },
    {
      id: "joditHtml",
      label: "Jodit HTML",
      badge: "Option 2",
      icon: Code2,
      accent: "text-amber-400",
    },
    {
      id: "mathml",
      label: "MathML",
      badge: "Option 3",
      icon: Binary,
      accent: "text-cyan-400",
    },
    {
      id: "preview",
      label: "Preview",
      badge: "WYSIWYG",
      icon: Eye,
      accent: "text-indigo-400",
    },
  ];

  const currentTabLabel = TABS.find((t) => t.id === activeTab)?.label || "Code";

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl min-w-0 max-w-full w-full">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/70 px-4 py-3 min-w-0 max-w-full">
        <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
          {isStale && (
            <span
              data-testid="math-ocr-stale-badge"
              className="rounded-md bg-slate-700/60 border border-slate-600 px-2.5 py-1 text-xs font-mono text-slate-300"
            >
              [លទ្ធផលមុន / Previous Result]
            </span>
          )}
          <span className="rounded-md bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
            Detected: {detectedType}
          </span>
          {transcription && (
            <span className="rounded-md bg-cyan-500/15 px-2.5 py-1 text-xs font-mono font-medium text-cyan-300 ring-1 ring-cyan-500/30 truncate max-w-full">
              Transcription: {transcription}
            </span>
          )}
          {elapsedSeconds !== undefined && elapsedSeconds > 0 && (
            <span
              className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-mono font-medium text-emerald-300 ring-1 ring-emerald-500/30"
              data-testid="math-ocr-elapsed-badge"
            >
              Elapsed: {elapsedSeconds.toFixed(2)}s
            </span>
          )}
          {uncertainParts && uncertainParts.length > 0 && (
            <span className="rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/30">
              Unclear: {uncertainParts.join(", ")}
            </span>
          )}
          {isDemoMode && (
            <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-500/30">
              Interactive Demo
            </span>
          )}
          <p className="text-xs text-slate-400 max-w-full truncate">{rawDescription}</p>
        </div>

        {/* Quick copy active tab */}
        {activeTab !== "preview" && (
          <div className="flex items-center gap-2 shrink-0">
            {copyFailed && (
              <span className="text-[11px] text-rose-400 font-mono flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Copy failed
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                if (activeTab === "latex") copyText(latex, "latex");
                else if (activeTab === "joditHtml") copyText(sanitizedHtml, "joditHtml");
                else if (activeTab === "mathml") copyText(mathml, "mathml");
              }}
              aria-label={`Copy ${currentTabLabel} to clipboard`}
              title={`Copy ${currentTabLabel} to clipboard`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors focus:ring-2 focus:ring-slate-400 focus:outline-none"
            >
              {copied === activeTab ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy {currentTabLabel}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 4 Tabs Bar - Constrained horizontally on mobile with responsive touch scrolling */}
      <div
        role="tablist"
        aria-label="Math Output Formats"
        className="flex border-b border-slate-800 bg-slate-950/40 overflow-x-auto min-w-0 max-w-full w-full scrollbar-thin"
      >
        {TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              aria-label={tab.label}
              title={tab.label}
              tabIndex={isActive ? 0 : -1}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  const nextTab = TABS[(idx + 1) % TABS.length];
                  setActiveTab(nextTab.id);
                  document.getElementById(`tab-${nextTab.id}`)?.focus();
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  const prevTab = TABS[(idx - 1 + TABS.length) % TABS.length];
                  setActiveTab(prevTab.id);
                  document.getElementById(`tab-${prevTab.id}`)?.focus();
                }
              }}
              className={`flex items-center gap-2 whitespace-nowrap px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-all focus:ring-2 focus:ring-indigo-400 focus:outline-none shrink-0 min-h-[44px] ${
                isActive
                  ? "border-indigo-500 text-white bg-slate-900/80 shadow-xs"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Icon className={`h-4 w-4 ${tab.accent} shrink-0`} aria-hidden="true" />
              <span>{tab.label}</span>
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 shrink-0">
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="min-h-72 min-w-0 max-w-full w-full">
        {/* --- 1. LaTeX Code Panel --- */}
        {activeTab === "latex" && (
          <div
            id="tabpanel-latex"
            role="tabpanel"
            aria-labelledby="tab-latex"
            className="relative flex flex-col h-full min-w-0 max-w-full w-full"
          >
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 bg-slate-950/30 min-w-0 max-w-full">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider truncate">
                Output 1 · LaTeX Math Syntax (KaTeX 0.19.0 Verified)
              </span>
              <button
                type="button"
                data-testid="copy-latex-btn"
                onClick={() => copyText(latex, "latex")}
                aria-label="Copy LaTeX code to clipboard"
                title="Copy LaTeX code to clipboard"
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors focus:ring-2 focus:ring-emerald-400 focus:outline-none shrink-0"
              >
                {copied === "latex" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copy LaTeX</span>
                  </>
                )}
              </button>
            </div>
            <pre className="flex-1 overflow-x-auto p-4 sm:p-5 text-xs sm:text-sm leading-relaxed text-emerald-300 font-mono bg-slate-950/60 whitespace-pre-wrap break-all max-h-96 min-w-0 max-w-full">
              {latex}
            </pre>
            <div className="border-t border-slate-800/60 bg-slate-950/40 px-4 py-2 text-[11px] text-slate-400">
              Compatible with KaTeX (0.19.0+), Overleaf, MathJax, Markdown documents, and standard LaTeX compilers.
            </div>
          </div>
        )}

        {/* --- 2. Jodit HTML / Inline CSS Panel --- */}
        {activeTab === "joditHtml" && (
          <div
            id="tabpanel-joditHtml"
            role="tabpanel"
            aria-labelledby="tab-joditHtml"
            className="relative flex flex-col h-full min-w-0 max-w-full w-full"
          >
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 bg-slate-950/30 min-w-0 max-w-full">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider truncate">
                Output 2 · Jodit HTML + Strict Inline CSS
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  aria-label="Switch to Visual Preview tab"
                  title="Switch to Visual Preview tab"
                  className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors focus:ring-2 focus:ring-slate-400 focus:outline-none"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>View Render</span>
                </button>
                <button
                  type="button"
                  data-testid="copy-jodit-btn"
                  onClick={() => copyText(sanitizedHtml, "joditHtml")}
                  aria-label="Copy Jodit HTML code to clipboard"
                  title="Copy Jodit HTML code to clipboard"
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors focus:ring-2 focus:ring-amber-400 focus:outline-none"
                >
                  {copied === "joditHtml" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copy Jodit HTML</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-x-auto p-4 sm:p-5 text-xs sm:text-sm leading-relaxed text-amber-300 font-mono bg-slate-950/60 whitespace-pre-wrap break-all max-h-96 min-w-0 max-w-full">
              {sanitizedHtml}
            </pre>
            <div className="border-t border-slate-800/60 bg-slate-950/40 px-4 py-2 text-[11px] text-slate-400">
              Paste directly into Jodit WYSIWYG editor in educational LMS platforms. Zero external stylesheets.
            </div>
          </div>
        )}

        {/* --- 3. MathML Code Panel --- */}
        {activeTab === "mathml" && (
          <div
            id="tabpanel-mathml"
            role="tabpanel"
            aria-labelledby="tab-mathml"
            className="relative flex flex-col h-full min-w-0 max-w-full w-full"
          >
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 bg-slate-950/30 min-w-0 max-w-full">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider truncate">
                Output 3 · W3C Standard MathML Markup
              </span>
              <button
                type="button"
                data-testid="copy-mathml-btn"
                onClick={() => copyText(mathml, "mathml")}
                aria-label="Copy MathML code to clipboard"
                title="Copy MathML code to clipboard"
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors focus:ring-2 focus:ring-cyan-400 focus:outline-none shrink-0"
              >
                {copied === "mathml" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copy MathML</span>
                  </>
                )}
              </button>
            </div>
            <pre className="flex-1 overflow-x-auto p-4 sm:p-5 text-xs sm:text-sm leading-relaxed text-cyan-300 font-mono bg-slate-950/60 whitespace-pre-wrap break-all max-h-96 min-w-0 max-w-full">
              {mathml}
            </pre>
            <div className="border-t border-slate-800/60 bg-slate-950/40 px-4 py-2 text-[11px] text-slate-400">
              Standard Mathematical Markup Language with W3C namespace for accessibility, modern browsers, and e-learning.
            </div>
          </div>
        )}

        {/* --- 4. Visual Preview Panel --- */}
        {activeTab === "preview" && (
          <div
            id="tabpanel-preview"
            role="tabpanel"
            aria-labelledby="tab-preview"
            className="flex flex-col h-full min-w-0 max-w-full w-full"
          >
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 bg-slate-950/30 min-w-0 max-w-full">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider truncate">
                Sandboxed Visual Preview · Jodit HTML + Inline CSS
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="copy-preview-btn"
                  onClick={() => copyText(sanitizedHtml, "preview")}
                  aria-label="Copy preview HTML code to clipboard"
                  title="Copy preview HTML code to clipboard"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors focus:ring-2 focus:ring-slate-400 focus:outline-none"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy HTML</span>
                </button>
              </div>
            </div>
            <div className="flex-1 bg-white p-2 min-w-0 max-w-full overflow-hidden">
              <iframe
                title="Jodit HTML Preview"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#ffffff;overflow-wrap:break-word;word-break:break-word;}</style></head><body>${sanitizedHtml}</body></html>`}
                sandbox=""
                className="h-full w-full min-h-72 min-w-0 max-w-full"
                style={{ border: "none", minHeight: "320px", maxWidth: "100%" }}
              />
            </div>
            <div className="border-t border-slate-800/60 bg-slate-950/40 px-4 py-2 text-[11px] text-slate-400">
              ✓ Sandboxed iframe (script-disabled) · Sanitized against active scripts and unsafe content.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
