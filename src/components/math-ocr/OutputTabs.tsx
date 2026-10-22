"use client";

import React, { useState } from "react";
import { Copy, Check, Eye, Code2, FileCode, Binary, Download, FileText } from "lucide-react";
import { sanitizeJoditHtml } from "@/lib/math-ocr-utils";
import { sanitizeMathHtml, sanitizeMathLatex, sanitizeMathMLMarkup } from "@/lib/math-ocr-normalizer";

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

export type TabId = "preview" | "text" | "latex" | "joditHtml" | "mathml";

export function OutputTabs({
  latex,
  joditHtml,
  mathml,
  detectedType,
  rawDescription,
  transcription,
  uncertainParts,
  isDemoMode: _isDemoMode,
  elapsedSeconds,
  isStale,
}: OutputTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("preview");
  const [copied, setCopied] = useState<TabId | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);

  const cleanLatex = sanitizeMathLatex(latex);
  const cleanHtml = sanitizeMathHtml(joditHtml || sanitizeJoditHtml(joditHtml));
  const cleanMathML = sanitizeMathMLMarkup(mathml);
  const cleanText = transcription || rawDescription || cleanLatex;

  const copyText = async (text: string, tab: TabId) => {
    setCopyFailed(null);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(tab);
        setTimeout(() => setCopied(null), 2000);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
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

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
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
      id: "preview",
      label: "Visual Preview",
      badge: "WYSIWYG",
      icon: Eye,
      accent: "text-indigo-400",
    },
    {
      id: "text",
      label: "Extracted Text",
      badge: "Text",
      icon: FileText,
      accent: "text-sky-400",
    },
    {
      id: "latex",
      label: "LaTeX",
      badge: "LaTeX",
      icon: FileCode,
      accent: "text-emerald-400",
    },
    {
      id: "joditHtml",
      label: "Sanitized HTML",
      badge: "HTML",
      icon: Code2,
      accent: "text-amber-400",
    },
    {
      id: "mathml",
      label: "MathML",
      badge: "MathML",
      icon: Binary,
      accent: "text-cyan-400",
    },
  ];

  return (
    <div className="relative z-10 flex flex-col rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl min-w-0 max-w-full w-full font-sans">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 min-w-0 max-w-full bg-slate-900/60">
        <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
          {isStale && (
            <span
              data-testid="math-ocr-stale-badge"
              className="rounded-md bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs font-mono text-slate-300"
            >
              [លទ្ធផលមុន / Previous Result]
            </span>
          )}
          <span className="rounded-lg bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-300 border border-indigo-500/30">
            Detected: {detectedType}
          </span>
          {elapsedSeconds !== undefined && elapsedSeconds > 0 && (
            <span
              className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-mono font-medium text-emerald-300 border border-emerald-500/30"
              data-testid="math-ocr-elapsed-badge"
            >
              Elapsed: {elapsedSeconds.toFixed(2)}s
            </span>
          )}
          {uncertainParts && uncertainParts.length > 0 && (
            <span className="rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300 border border-amber-500/30">
              Unclear: {uncertainParts.join(", ")}
            </span>
          )}
          {copyFailed && (
            <span className="rounded-lg bg-rose-500/20 px-2.5 py-1 text-xs font-semibold text-rose-300 border border-rose-500/30">
              {copyFailed}
            </span>
          )}
        </div>
      </div>

      {/* 5 Tab Navigation Bar */}
      <div
        role="tablist"
        aria-label="Math Output Formats"
        className="flex border-b border-slate-800 bg-slate-950/80 overflow-x-auto min-w-0 max-w-full w-full scrollbar-thin"
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
              className={`flex items-center gap-2 whitespace-nowrap px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0 min-h-[44px] ${
                isActive
                  ? "border-cyan-400 text-white bg-cyan-950/30"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Icon className={`h-4 w-4 ${tab.accent} shrink-0`} aria-hidden="true" />
              <span>{tab.label}</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 shrink-0">
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="min-h-72 min-w-0 max-w-full w-full">
        {/* --- 1. Visual Preview Tab --- */}
        {activeTab === "preview" && (
          <div
            id="tabpanel-preview"
            role="tabpanel"
            aria-labelledby="tab-preview"
            className="flex flex-col h-full min-w-0 max-w-full w-full"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 bg-slate-900/40 min-w-0 max-w-full">
              <span className="text-xs font-semibold text-slate-300 truncate">
                Visual Preview (Sandboxed WYSIWYG Rendering)
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="copy-preview-btn"
                  onClick={() => copyText(cleanHtml, "preview")}
                  aria-label="Copy preview HTML to clipboard"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  {copied === "preview" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>បានចម្លងរួចរាល់</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy HTML</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(cleanHtml, "equation.html", "text/html")}
                  aria-label="Download HTML file"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Download</span>
                </button>
              </div>
            </div>
            <div className="flex-1 bg-white p-4 min-w-0 max-w-full overflow-hidden">
              <iframe
                title="Jodit HTML Preview"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#ffffff;overflow-wrap:break-word;word-break:break-word;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;}</style></head><body>${cleanHtml}</body></html>`}
                sandbox=""
                className="h-full w-full min-h-72 min-w-0 max-w-full"
                style={{ border: "none", minHeight: "320px", maxWidth: "100%" }}
              />
            </div>
            <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-2 text-[11px] text-slate-400">
              ✓ Sandboxed visual output rendered directly with inline styling.
            </div>
          </div>
        )}

        {/* --- 2. Extracted Text Tab --- */}
        {activeTab === "text" && (
          <div
            id="tabpanel-text"
            role="tabpanel"
            aria-labelledby="tab-text"
            className="flex flex-col h-full min-w-0 max-w-full w-full"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 bg-slate-900/40 min-w-0 max-w-full">
              <span className="text-xs font-semibold text-slate-300 truncate">
                Extracted Text / Mathematical Content
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="copy-text-btn"
                  onClick={() => copyText(cleanText, "text")}
                  aria-label="Copy extracted text to clipboard"
                  className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  {copied === "text" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>បានចម្លងរួចរាល់</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>ចម្លង Text</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(cleanText, "extracted-text.txt", "text/plain")}
                  aria-label="Download text file"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-sky-400" />
                  <span className="hidden sm:inline">Download</span>
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-x-auto p-4 sm:p-5 text-xs sm:text-sm leading-relaxed text-sky-300 font-mono bg-slate-950/80 whitespace-pre-wrap break-all max-h-96 min-w-0 max-w-full">
              {cleanText}
            </pre>
            <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-2 text-[11px] text-slate-400">
              Clean Unicode text extracted from OCR with Khmer character &amp; mathematical symbol preservation.
            </div>
          </div>
        )}

        {/* --- 3. LaTeX Tab --- */}
        {activeTab === "latex" && (
          <div
            id="tabpanel-latex"
            role="tabpanel"
            aria-labelledby="tab-latex"
            className="flex flex-col h-full min-w-0 max-w-full w-full"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 bg-slate-900/40 min-w-0 max-w-full">
              <span className="text-xs font-semibold text-slate-300 truncate">
                LaTeX Math Syntax (KaTeX 0.19.0+ Verified)
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="copy-latex-btn"
                  onClick={() => copyText(cleanLatex, "latex")}
                  aria-label="Copy LaTeX code to clipboard"
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 shrink-0"
                >
                  {copied === "latex" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>បានចម្លងរួចរាល់</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>ចម្លង LaTeX</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(cleanLatex, "equation.tex", "text/plain")}
                  aria-label="Download LaTeX file"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Download</span>
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-x-auto p-4 sm:p-5 text-xs sm:text-sm leading-relaxed text-emerald-300 font-mono bg-slate-950/80 whitespace-pre-wrap break-all max-h-96 min-w-0 max-w-full">
              {cleanLatex}
            </pre>
            <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-2 text-[11px] text-slate-400">
              Compatible with KaTeX, Overleaf, MathJax, Markdown documents, and standard LaTeX compilers.
            </div>
          </div>
        )}

        {/* --- 4. Sanitized HTML Tab --- */}
        {activeTab === "joditHtml" && (
          <div
            id="tabpanel-joditHtml"
            role="tabpanel"
            aria-labelledby="tab-joditHtml"
            className="flex flex-col h-full min-w-0 max-w-full w-full"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 bg-slate-900/40 min-w-0 max-w-full">
              <span className="text-xs font-semibold text-slate-300 truncate">
                Sanitized HTML + Strict Inline CSS
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="copy-jodit-btn"
                  onClick={() => copyText(cleanHtml, "joditHtml")}
                  aria-label="Copy Jodit HTML to clipboard"
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  {copied === "joditHtml" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>បានចម្លងរួចរាល់</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>ចម្លង HTML</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(cleanHtml, "equation.html", "text/html")}
                  aria-label="Download HTML file"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Download</span>
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-x-auto p-4 sm:p-5 text-xs sm:text-sm leading-relaxed text-amber-300 font-mono bg-slate-950/80 whitespace-pre-wrap break-all max-h-96 min-w-0 max-w-full">
              {cleanHtml}
            </pre>
            <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-2 text-[11px] text-slate-400">
              Paste directly into Jodit or other rich-text LMS editors. Preserves vertical alignment with zero external CSS dependencies.
            </div>
          </div>
        )}

        {/* --- 5. MathML Tab --- */}
        {activeTab === "mathml" && (
          <div
            id="tabpanel-mathml"
            role="tabpanel"
            aria-labelledby="tab-mathml"
            className="flex flex-col h-full min-w-0 max-w-full w-full"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 bg-slate-900/40 min-w-0 max-w-full">
              <span className="text-xs font-semibold text-slate-300 truncate">
                W3C Standard MathML Markup
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="copy-mathml-btn"
                  onClick={() => copyText(cleanMathML, "mathml")}
                  aria-label="Copy MathML code to clipboard"
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0"
                >
                  {copied === "mathml" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>បានចម្លងរួចរាល់</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>ចម្លង MathML</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(cleanMathML, "equation.xml", "application/xml")}
                  aria-label="Download MathML file"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Download</span>
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-x-auto p-4 sm:p-5 text-xs sm:text-sm leading-relaxed text-cyan-300 font-mono bg-slate-950/80 whitespace-pre-wrap break-all max-h-96 min-w-0 max-w-full">
              {cleanMathML}
            </pre>
            <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-2 text-[11px] text-slate-400">
              Standard Mathematical Markup Language (W3C) for accessibility, screen readers, and modern browser rendering.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
