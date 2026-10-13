"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Code2, Send, Loader2, AlertCircle,
  Globe, Copy, Check, Eye, FileCode, ChevronDown, ChevronUp,
  Clock, ExternalLink,
} from "lucide-react";
import { RoboticScanner } from "@/components/ui/RoboticScanner";
import type { ScrapeSuccess, ScrapeError } from "@/app/api/web-scraper/route";

// -----------------------------------------------------------
// Copyable code block
// -----------------------------------------------------------
function CodeBlock({ code, language, label }: { code: string; language: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const colorMap: Record<string, string> = {
    html: "text-amber-300",
    css: "text-cyan-300",
    bundle: "text-emerald-300",
  };

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-2.5">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied!</>
          ) : (
            <><Copy className="h-3.5 w-3.5" /> Copy</>
          )}
        </button>
      </div>
      <pre className={`overflow-auto p-4 text-xs leading-relaxed font-mono bg-slate-950/40 whitespace-pre-wrap break-all max-h-64 ${colorMap[language] ?? "text-slate-300"}`}>
        {code || "(empty)"}
      </pre>
      <div className="border-t border-slate-800 bg-slate-950/20 px-4 py-2">
        <p className="text-[11px] text-slate-500">
          {code.length.toLocaleString()} characters
        </p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Output panel: three tabs — Preview | HTML | CSS | Bundle
// -----------------------------------------------------------
type OutputTab = "preview" | "html" | "css" | "bundle";

function ScraperOutput({ result, onClear }: { result: ScrapeSuccess; onClear: () => void }) {
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const [showBundle, setShowBundle] = useState(false);

  const TABS: { id: OutputTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "preview", label: "Live Preview", icon: Eye },
    { id: "html", label: "HTML", icon: Code2 },
    { id: "css", label: "Scoped CSS", icon: FileCode },
    { id: "bundle", label: "Full Bundle", icon: Code2 },
  ];

  return (
    <div className="space-y-4">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="h-4 w-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{result.title}</p>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors"
            >
              {result.url.slice(0, 60)}{result.url.length > 60 ? "…" : ""}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          {new Date(result.scrapedAt).toLocaleTimeString()}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-rose-950/50 hover:text-rose-300 transition-colors"
        >
          Clear Result
        </button>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="flex border-b border-slate-800 bg-slate-950/40 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-cyan-500 text-white bg-slate-900/60"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-64">
          {/* Live Preview */}
          {activeTab === "preview" && (
            <div className="flex flex-col">
              <div className="border-b border-slate-800 bg-slate-950/30 px-4 py-2.5 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                  Sandboxed iframe · scripts blocked
                </span>
              </div>
              <div className="bg-white" style={{ minHeight: 400 }}>
                <iframe
                  title="Scraped page preview"
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;overflow-x:hidden;}</style></head><body>${result.bundle}</body></html>`}
                  sandbox="allow-same-origin"
                  className="w-full"
                  style={{ border: "none", minHeight: 400 }}
                />
              </div>
              <div className="border-t border-slate-800 bg-slate-950/40 px-4 py-2">
                <p className="text-[11px] text-slate-500">
                  ✓ Scripts removed · Event handlers stripped · External hrefs neutralized
                </p>
              </div>
            </div>
          )}

          {/* HTML */}
          {activeTab === "html" && (
            <div className="p-4">
              <CodeBlock code={result.html} language="html" label="Sanitized HTML Structure" />
            </div>
          )}

          {/* Scoped CSS */}
          {activeTab === "css" && (
            <div className="p-4">
              <CodeBlock code={result.css} language="css" label="Scoped CSS (prefixed with .nexusai-cloned)" />
            </div>
          )}

          {/* Full Bundle */}
          {activeTab === "bundle" && (
            <div className="p-4 space-y-3">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200/80">
                <p className="font-medium text-cyan-300 mb-1">Self-Contained Bundle</p>
                This output includes both the scoped CSS{" "}
                <code className="text-cyan-300">&lt;style&gt;</code> block and the wrapped HTML in a{" "}
                <code className="text-cyan-300">.nexusai-cloned</code> div. Paste directly into any
                page without style leakage.
              </div>
              <CodeBlock code={result.bundle} language="bundle" label="Full HTML+CSS Bundle (paste-ready)" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Quick-use URL examples
// -----------------------------------------------------------
const EXAMPLE_URLS = [
  { url: "https://example.com", hint: "Simple minimal page" },
  { url: "https://httpbin.org/html", hint: "Plain HTML test page" },
  { url: "https://tailwindcss.com", hint: "Modern CSS framework site" },
];

// -----------------------------------------------------------
// Main Page
// -----------------------------------------------------------
export default function WebClonerPage() {
  const [url, setUrl] = useState("");
  const [selector, setSelector] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeSuccess | null>(null);

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/web-scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), selector: selector.trim() || undefined }),
      });

      const data: ScrapeSuccess | ScrapeError = await response.json();

      if (!response.ok || "error" in data) {
        setError((data as ScrapeError).error);
        return;
      }

      setResult(data as ScrapeSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard Overview
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950/60 p-6 sm:p-8 shadow-[0_0_35px_rgba(0,240,255,0.1)]">
        <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-25" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between relative z-10">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-400">
              <span className="rounded bg-cyan-950/80 px-2 py-0.5 border border-cyan-500/40">MODULE 05</span><span>·</span>
              <span>Server-Side DOM Extractor · Cheerio + CSS Sanitizer</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              ចម្លងកូដគេហទំព័រ (Web Cloner)
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              បញ្ចូល URL គេហទំព័រណាមួយដើម្បីទាញយក{" "}
              <span className="font-semibold text-cyan-400">Sanitized HTML DOM</span> និង{" "}
              <span className="font-semibold text-blue-400">Scoped CSS</span>។ អាចមើល
              Sandboxed Live Preview និងចម្លងកូដទាំងស្រុងបានភ្លាមៗ។
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
            <Code2 className="h-7 w-7" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 relative z-10 font-mono">
          {[
            { label: "DOM Extraction", desc: "Cheerio-powered server-side parsing" },
            { label: "CSS Scoping", desc: "All rules prefixed to prevent leakage" },
            { label: "Sandboxed Preview", desc: "Safe iframe with scripts removed" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-cyan-500/20 bg-slate-950/70 p-3 text-xs shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              <span className="font-bold text-cyan-300">{c.label}</span>
              <p className="mt-0.5 text-slate-400 font-sans">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Controls */}
        <form onSubmit={handleScrape} className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-400">1</span>
              Target URL
            </h3>

            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/50">
                <Globe className="h-4 w-4 shrink-0 text-slate-500" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                  placeholder="https://example.com"
                  className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none disabled:opacity-50"
                />
              </div>
              {/* Example URLs */}
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_URLS.map((ex) => (
                  <button
                    key={ex.url}
                    type="button"
                    onClick={() => setUrl(ex.url)}
                    disabled={isLoading}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors disabled:opacity-50"
                    title={ex.hint}
                  >
                    {ex.url.replace("https://", "")}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced: CSS Selector */}
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced((p) => !p)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-slate-300 hover:bg-slate-800/50 transition-colors"
              >
                <span>Advanced — CSS Selector (optional)</span>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showAdvanced && (
                <div className="border-t border-slate-800 p-4 space-y-2">
                  <input
                    type="text"
                    value={selector}
                    onChange={(e) => setSelector(e.target.value)}
                    disabled={isLoading}
                    placeholder=".main-content, #hero, header, nav…"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                  />
                  <p className="text-[11px] text-slate-500">
                    Leave empty to auto-extract{" "}
                    <code className="text-cyan-400">&lt;main&gt;</code>,{" "}
                    <code className="text-cyan-400">&lt;article&gt;</code>, or{" "}
                    <code className="text-cyan-400">&lt;body&gt;</code> (in priority order).
                  </p>
                </div>
              )}
            </div>

            {/* Security note */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 text-xs text-slate-400 space-y-1">
              <p className="font-medium text-slate-300">Security & Sanitization</p>
              <div className="space-y-0.5">
                {[
                  "SSRF protection — internal IPs blocked",
                  "Scripts, iframes, and event handlers removed",
                  "CSS rules scoped to .nexusai-cloned wrapper",
                  "15s fetch timeout per request",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!url.trim() || isLoading}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Scraping & Extracting…</>
              ) : (
                <><Send className="h-4 w-4" /> Clone Web Element</>
              )}
            </button>
          </div>
        </form>

        {/* Right: Output */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">Scraping failed</p>
                <p className="mt-0.5 text-xs opacity-80">{error}</p>
              </div>
            </div>
          )}

          {/* High-Tech Robotic Processing Scanner */}
          {isLoading && (
            <RoboticScanner
              active={true}
              moduleName="PLP DOM CLONER // CHEERIO PARSER"
              steps={[
                "DISPATCHING HEADLESS HTTP REQUEST...",
                "RESOLVING REMOTE DOM TREE & SANITIZING SCRIPTS...",
                "AGGREGATING EXTERNAL STYLESHEETS & INLINE CSS...",
                "PREFIXING CSS SELECTORS WITH .nexusai-cloned...",
                "GENERATING SANDBOXED PREVIEW BUNDLE...",
              ]}
              subtext="Parsing remote DOM structure, extracting styling rules, and enforcing sandbox security"
            />
          )}

          {result && !isLoading && (
            <ScraperOutput result={result} onClear={() => { setResult(null); setUrl(""); setSelector(""); }} />
          )}

          {!result && !isLoading && !error && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                <Globe className="h-7 w-7 text-cyan-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">Cloned code will appear here</h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-400">
                Enter a URL and click{" "}
                <span className="font-semibold text-cyan-400">"Clone Web Element"</span>. Inspect
                the live preview, raw HTML, scoped CSS, and self-contained bundle.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
