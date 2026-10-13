"use client";

import React, { useState } from "react";
import { Copy, Check, Eye, EyeOff, Code2, FileCode, Binary, Sparkles } from "lucide-react";

interface OutputTabsProps {
  latex: string;
  joditHtml: string;
  mathml: string;
  detectedType: string;
  rawDescription: string;
  isDemoMode?: boolean;
}

export type TabId = "latex" | "joditHtml" | "mathml" | "preview";

/**
 * 4-Tab Output Panel:
 *  1. LaTeX Code (copyable, syntax formatted)
 *  2. Jodit HTML / Inline CSS (copyable, optimized for Jodit Editor)
 *  3. MathML Code (copyable, standard W3C MathML markup)
 *  4. Sandboxed Visual Preview (rendering the Jodit HTML/CSS + SVG in real time)
 */
export function OutputTabs({
  latex,
  joditHtml,
  mathml,
  detectedType,
  rawDescription,
  isDemoMode,
}: OutputTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("latex");
  const [copied, setCopied] = useState<TabId | null>(null);

  const copyText = async (text: string, tab: TabId) => {
    await navigator.clipboard.writeText(text);
    setCopied(tab);
    setTimeout(() => setCopied(null), 2000);
  };

  const TABS: {
    id: TabId;
    label: string;
    badge: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
  }[] = [
    {
      id: "latex",
      label: "LaTeX Code",
      badge: "Option 1",
      icon: FileCode,
      accent: "text-emerald-400",
    },
    {
      id: "joditHtml",
      label: "Jodit HTML / Inline CSS",
      badge: "Option 2",
      icon: Code2,
      accent: "text-amber-400",
    },
    {
      id: "mathml",
      label: "MathML Code",
      badge: "Option 3",
      icon: Binary,
      accent: "text-cyan-400",
    },
    {
      id: "preview",
      label: "Visual Preview",
      badge: "WYSIWYG",
      icon: Eye,
      accent: "text-indigo-400",
    },
  ];

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/70 px-4 py-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="rounded-md bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
            Detected: {detectedType}
          </span>
          {isDemoMode && (
            <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-500/30">
              Interactive Demo
            </span>
          )}
          <p className="text-xs text-slate-400 max-w-xl truncate">{rawDescription}</p>
        </div>

        {/* Quick copy active tab */}
        {activeTab !== "preview" && (
          <button
            type="button"
            onClick={() => {
              if (activeTab === "latex") copyText(latex, "latex");
              else if (activeTab === "joditHtml") copyText(joditHtml, "joditHtml");
              else if (activeTab === "mathml") copyText(mathml, "mathml");
            }}
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
          >
            {copied === activeTab ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy {TABS.find((t) => t.id === activeTab)?.label}
              </>
            )}
          </button>
        )}
      </div>

      {/* 4 Tabs Bar */}
      <div className="flex border-b border-slate-800 bg-slate-950/40 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 whitespace-nowrap px-4 sm:px-5 py-3 text-xs sm:text-sm font-medium border-b-2 transition-all ${
                isActive
                  ? "border-indigo-500 text-white bg-slate-900/80 shadow-xs"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Icon className={`h-4 w-4 ${tab.accent}`} />
              <span>{tab.label}</span>
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="min-h-72">
        {/* --- 1. LaTeX Code Panel --- */}
        {activeTab === "latex" && (
          <div className="relative flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 bg-slate-950/30">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Output 1 · Standard LaTeX Math Syntax
              </span>
              <button
                type="button"
                onClick={() => copyText(latex, "latex")}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
                {copied === "latex" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy LaTeX
                  </>
                )}
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-sm leading-relaxed text-emerald-300 font-mono bg-slate-950/60 whitespace-pre-wrap break-all max-h-96">
              {latex}
            </pre>
            <div className="border-t border-slate-800/60 bg-slate-950/40 px-4 py-2 text-[11px] text-slate-400">
              Use in Overleaf, KaTeX, MathJax, Markdown documents, or LaTeX compilers.
            </div>
          </div>
        )}

        {/* --- 2. Jodit HTML / Inline CSS Panel --- */}
        {activeTab === "joditHtml" && (
          <div className="relative flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 bg-slate-950/30">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Output 2 · Jodit Editor HTML + Strict Inline CSS (Vertical Arithmetic &amp; Inline SVG)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" /> View Render
                </button>
                <button
                  type="button"
                  onClick={() => copyText(joditHtml, "joditHtml")}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  {copied === "joditHtml" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-amber-400" /> Copied to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy Jodit HTML
                    </>
                  )}
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-sm leading-relaxed text-amber-300 font-mono bg-slate-950/60 whitespace-pre-wrap break-all max-h-96">
              {joditHtml}
            </pre>
            <div className="border-t border-slate-800/60 bg-slate-950/40 px-4 py-2 text-[11px] text-slate-400">
              Paste directly into Jodit WYSIWYG editor in educational LMS platforms. Zero external stylesheets.
            </div>
          </div>
        )}

        {/* --- 3. MathML Code Panel --- */}
        {activeTab === "mathml" && (
          <div className="relative flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 bg-slate-950/30">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Output 3 · W3C Standard MathML Markup
              </span>
              <button
                type="button"
                onClick={() => copyText(mathml, "mathml")}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              >
                {copied === "mathml" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-cyan-400" /> Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy MathML
                  </>
                )}
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-sm leading-relaxed text-cyan-300 font-mono bg-slate-950/60 whitespace-pre-wrap break-all max-h-96">
              {mathml}
            </pre>
            <div className="border-t border-slate-800/60 bg-slate-950/40 px-4 py-2 text-[11px] text-slate-400">
              Standard Mathematical Markup Language for web accessibility, modern browsers, Word, and e-learning platforms.
            </div>
          </div>
        )}

        {/* --- 4. Visual Preview Panel --- */}
        {activeTab === "preview" && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 bg-slate-950/30">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Sandboxed Visual Preview · Jodit HTML + Inline CSS
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyText(joditHtml, "joditHtml")}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy HTML
                </button>
              </div>
            </div>
            <div className="flex-1 bg-white p-2">
              <iframe
                title="Jodit HTML Preview"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#ffffff;}</style></head><body>${joditHtml}</body></html>`}
                sandbox="allow-same-origin"
                className="h-full w-full min-h-72"
                style={{ border: "none", minHeight: "320px" }}
              />
            </div>
            <div className="border-t border-slate-800/60 bg-slate-950/40 px-4 py-2 text-[11px] text-slate-400">
              ✓ Sandboxed iframe · Perfectly reflects how the arithmetic/geometry displays in the Jodit editor.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
