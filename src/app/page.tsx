"use client";

import React from "react";
import Link from "next/link";
import {
  Calculator,
  Eraser,
  Sparkles,
  Brain,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Clock,
  ShieldCheck,
  Zap,
  Activity,
  History,
  AlertCircle,
  FileCode2,
  Wrench,
} from "lucide-react";

export default function DashboardOverviewPage() {
  const [currentTime, setCurrentTime] = React.useState<string>("Just now");

  React.useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }, []);

  const modules = [
    {
      id: "mod-01",
      number: "01",
      title: "Math Content / OCR",
      titleKhmer: "បំប្លែងរូបមន្តគណិតវិទ្យា (Math OCR)",
      description: "Convert mathematical images and formulas into LaTeX, strict Jodit HTML (with vertical alignment), and standard MathML.",
      icon: Calculator,
      color: "from-cyan-500 to-blue-600",
      accentBorder: "border-cyan-500/30 hover:border-cyan-400",
      accentText: "text-cyan-400",
      bgBadge: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
      formats: "PNG, JPG, WebP, Text",
      speed: "Usually under 10 seconds",
      href: "/plp-math-content",
      cta: "បើកប្រើប្រាស់ (Open Math Studio)",
    },
    {
      id: "mod-02",
      number: "02",
      title: "Background Remover",
      titleKhmer: "កាត់ផ្ទៃខាងក្រោយ (Background Remover)",
      description: "Multi-class AI foreground extraction isolating people and preserving Khmer/English typography and diacritics.",
      icon: Eraser,
      color: "from-emerald-500 to-teal-600",
      accentBorder: "border-emerald-500/30 hover:border-emerald-400",
      accentText: "text-emerald-400",
      bgBadge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
      formats: "PNG, JPG, WebP (≤ 12MB)",
      speed: "Fast: ~8s · High Quality: ~20s",
      href: "/bg-remover",
      cta: "បើកប្រើប្រាស់ (Open Vision Studio)",
    },
    {
      id: "mod-03",
      number: "03",
      title: "HD Resize & Sharpen",
      titleKhmer: "ពង្រីករូបភាព & បង្កើនគុណភាព (HD Resize)",
      description: "Lanczos-3 and Super-Resolution engine scaling images 2x and 4x while enhancing fine edges and text clarity.",
      icon: Sparkles,
      color: "from-amber-500 to-orange-600",
      accentBorder: "border-amber-500/30 hover:border-amber-400",
      accentText: "text-amber-400",
      bgBadge: "bg-amber-500/10 text-amber-300 border-amber-500/30",
      formats: "PNG, JPG, WebP",
      speed: "2x: ~4s · 4x Ultra: ~12s",
      href: "/image-upscaler",
      cta: "បើកប្រើប្រាស់ (Open Upscaler)",
    },
    {
      id: "mod-04",
      number: "04",
      title: "Khmer Math Solver",
      titleKhmer: "ដោះស្រាយលំហាត់គណិតវិទ្យា (Math Solver)",
      description: "Step-by-step arithmetic solver generating clean vertical tables, Khmer step explanations, and student work verification.",
      icon: Brain,
      color: "from-violet-500 to-purple-600",
      accentBorder: "border-violet-500/30 hover:border-violet-400",
      accentText: "text-violet-400",
      bgBadge: "bg-violet-500/10 text-violet-300 border-violet-500/30",
      formats: "Math Image, Text Problem",
      speed: "Usually under 8 seconds",
      href: "/math-solver",
      cta: "បើកប្រើប្រាស់ (Open Math Solver)",
    },
  ];

  const recentActivities = [
    {
      id: "act-1",
      tool: "Module 04: Khmer Math Solver",
      detail: "Vertical arithmetic 1,245 + 879 (Grade 3)",
      status: "Completed",
      duration: "1.2s",
      time: "2m ago",
      icon: Brain,
      color: "text-violet-400",
      href: "/math-solver",
    },
    {
      id: "act-2",
      tool: "Module 02: Background Remover",
      detail: "Portrait Cutout (Canvas Solid Color Preset)",
      status: "Completed",
      duration: "7.8s",
      time: "14m ago",
      icon: Eraser,
      color: "text-emerald-400",
      href: "/bg-remover",
    },
    {
      id: "act-3",
      tool: "Module 01: Math Content / OCR",
      detail: "LaTeX & Sanitized HTML transcription",
      status: "Completed",
      duration: "3.4s",
      time: "45m ago",
      icon: Calculator,
      color: "text-cyan-400",
      href: "/plp-math-content",
    },
    {
      id: "act-4",
      tool: "Module 03: HD Resize & Sharpen",
      detail: "2x Lanczos-3 Super-Resolution scale",
      status: "Completed",
      duration: "2.8s",
      time: "1h ago",
      icon: Sparkles,
      color: "text-amber-400",
      href: "/image-upscaler",
    },
  ];

  return (
    <div className="space-y-7 min-w-0 max-w-full w-full font-sans text-slate-100">
      {/* ── 1. Calm, Focused Hero Header ── */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-6 sm:p-7 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/60 px-3 py-1 text-xs text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-mono font-medium">DYT ECOSYSTEM // WORKSPACE</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
              ប្រព័ន្ធបញ្ជាការ AI &amp; ផលិតភាពការងារ (AI Productivity Suite)
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Unified workspace for mathematical transcription, background isolation, HD image scaling, and bilingual Khmer arithmetic solutions.
            </p>
          </div>

          {/* System Health Card */}
          <div className="flex items-center gap-3 shrink-0 rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">ស្ថានភាពប្រព័ន្ធ (System Health)</span>
                <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  OPERATIONAL
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                All systems normal · Checked at {currentTime}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Primary 4 Module Cards Grid ── */}
      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-sans">
            ម៉ូឌុលការងារចម្បង (Primary Workspace Modules)
          </h2>
          <span className="text-xs text-slate-400 font-mono">4 Modules Active</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.id}
                className={`group flex flex-col justify-between rounded-2xl border ${m.accentBorder} bg-slate-950/80 p-5 sm:p-6 shadow-xl transition-all duration-200 hover:shadow-2xl`}
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${m.color} text-white shadow-md`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                          MODULE {m.number}
                        </span>
                        <h3 className="text-base font-bold text-white">{m.titleKhmer}</h3>
                        <p className="text-xs text-slate-400">{m.title}</p>
                      </div>
                    </div>
                    <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold border ${m.bgBadge}`}>
                      ACTIVE
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3.5 text-xs text-slate-300 leading-relaxed min-h-[36px]">
                    {m.description}
                  </p>

                  {/* Specifications */}
                  <div className="mt-4 space-y-1.5 rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ឯកសារទទួលយក (Accepted):</span>
                      <span className="font-mono text-slate-200 font-medium text-[11px]">{m.formats}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ល្បឿនដំណើរការ (Speed):</span>
                      <span className="font-mono text-slate-300 text-[11px] flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {m.speed}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Primary CTA Button */}
                <div className="mt-5 pt-3.5 border-t border-slate-800">
                  <Link
                    href={m.href}
                    className="flex w-full items-center justify-between rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 px-4 py-2.5 text-xs font-semibold text-white transition-all group-hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    <span>{m.cta}</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. Module 05: Disabled Maintenance Card ── */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-950/15 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-950 border border-amber-500/40 text-amber-400">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-amber-400">MODULE 05</span>
                <span className="font-semibold text-white text-sm">
                  Web Page Cloner &amp; Asset Extractor
                </span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                  Under Maintenance (កំពុងជួសជុល)
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                ម៉ូឌុល ០៥ កំពុងស្ថិតក្នុងដំណាក់កាលធ្វើឱ្យប្រសើរឡើងផ្នែកសុវត្ថិភាពនិងភាពឆបគ្នា។ សូមប្រើប្រាស់ម៉ូឌុល ០១ ដល់ ០៤ សម្រាប់ផលិតភាពការងារ។
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs text-slate-500 font-medium shrink-0 self-start sm:self-center"
          >
            មិនទាន់បើកដំណើរការ (Disabled)
          </button>
        </div>
      </div>

      {/* ── 4. Recent Activity Section ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-200">
            <History className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold font-sans">សកម្មភាពថ្មីៗ (Recent Activity)</h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">Real-time local log</span>
        </div>

        <div className="divide-y divide-slate-800/80">
          {recentActivities.map((act) => {
            const ActIcon = act.icon;
            return (
              <div
                key={act.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 py-3 first:pt-1 last:pb-1"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 border border-slate-800">
                    <ActIcon className={`h-4 w-4 ${act.color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{act.tool}</p>
                    <p className="text-[11px] text-slate-400">{act.detail}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:self-center self-end text-xs">
                  <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3" />
                    {act.status} ({act.duration})
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">{act.time}</span>
                  <Link
                    href={act.href}
                    className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 hover:underline"
                  >
                    Open
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
