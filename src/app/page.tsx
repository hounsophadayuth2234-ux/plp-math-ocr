"use client";

import React from "react";
import Link from "next/link";
import {
  Calculator,
  Eraser,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Layers,
  ShieldCheck,
  Zap,
  Users,
  AlertTriangle,
  Brain,
} from "lucide-react";
import { TEAM_MEMBERS } from "@/config/tools";

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-6 min-w-0 max-w-full w-full font-mono text-slate-100">
      {/* ── 1. Operational Command Center Header Plate ── */}
      <div className="relative overflow-hidden border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950 p-6 sm:p-7 shadow-2xl">
        {/* Corner mechanical brackets */}
        <div className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-cyan-400" />
        <div className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-cyan-400" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-cyan-400" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-cyan-400" />

        {/* Decorative rivets */}
        <div className="pointer-events-none absolute top-2 left-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />
        <div className="pointer-events-none absolute top-2 right-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />
        <div className="pointer-events-none absolute bottom-2 left-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />
        <div className="pointer-events-none absolute bottom-2 right-6 h-1 w-1 rounded-full bg-slate-600 border border-slate-500" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5 z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 border border-cyan-500/40 bg-cyan-950/70 px-2.5 py-0.5 text-[10px] text-cyan-300 tracking-wider">
              <span className="h-1.5 w-1.5 bg-cyan-400 animate-pulse" />
              <span>COMMAND CENTER // MATRIX v2.4</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-sans uppercase">
              DYT AI WORKSPACE // ប្រព័ន្ធបញ្ជាការ AI
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
              Unified operational control for mathematical transcription, multi-class foreground vision, and Khmer typography isolation.
              <span className="block text-[11px] text-slate-400 mt-0.5 font-sans">
                ផ្ទាំងបញ្ជាប្រតិបត្តិការ AI រួមបញ្ចូលប្រព័ន្ធបំប្លែងរូបមន្តគណិតវិទ្យា និងកាត់រូបភាពរក្សាអក្សរខ្មែរ
              </span>
            </p>
          </div>

          {/* Quick Technical Telemetry Pill */}
          <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
            <div className="flex items-center gap-2 border border-slate-800 bg-slate-900/90 px-3 py-2 text-slate-200 shadow-sm">
              <Cpu className="h-4 w-4 text-cyan-400" />
              <div className="leading-tight">
                <div className="text-[10px] text-slate-400">CORE STATUS</div>
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  OPERATIONAL
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border border-slate-800 bg-slate-900/90 px-3 py-2 text-slate-200 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              <div className="leading-tight">
                <div className="text-[10px] text-slate-400">SECURITY</div>
                <div className="text-xs font-bold text-indigo-300">
                  ON-DEVICE ZERO RETENTION
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Compact System Status Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
        <div className="flex items-center gap-2 border border-slate-800/80 bg-slate-900/70 px-3 py-2">
          <span className="h-2 w-2 rounded-none bg-emerald-400" />
          <span className="text-slate-400">MOD-01:</span>
          <span className="font-bold text-white truncate">PLP MATH READY</span>
        </div>
        <div className="flex items-center gap-2 border border-slate-800/80 bg-slate-900/70 px-3 py-2">
          <span className="h-2 w-2 rounded-none bg-cyan-400" />
          <span className="text-slate-400">MOD-02:</span>
          <span className="font-bold text-white truncate">VISION ISNET READY</span>
        </div>
        <div className="flex items-center gap-2 border border-slate-800/80 bg-slate-900/70 px-3 py-2">
          <span className="h-2 w-2 rounded-none bg-emerald-400" />
          <span className="text-slate-400">MOD-03:</span>
          <span className="font-bold text-emerald-300 truncate">HD RESIZE READY</span>
        </div>
        <div className="flex items-center gap-2 border border-slate-800/80 bg-slate-900/70 px-3 py-2">
          <span className="h-2 w-2 rounded-none bg-violet-400" />
          <span className="text-slate-400">MOD-04:</span>
          <span className="font-bold text-white truncate">MATH SOLVER READY</span>
        </div>
      </div>

      {/* ── 3. Two Balanced Professional Command Cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* ── Module 01: PLP Math Content ── */}
        <div className="machine-module group relative flex flex-col justify-between border border-cyan-500/30 bg-slate-950/85 p-6 shadow-2xl transition-all duration-300 hover:border-cyan-400 hover:shadow-[0_0_35px_rgba(0,240,255,0.15)]">
          {/* Corner brackets */}
          <div className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-cyan-400" />
          <div className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-cyan-400" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-cyan-400" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-cyan-400" />

          {/* Top header */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-cyan-400/60 bg-cyan-950/80 text-cyan-400">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-mono">
                    MODULE 01 // MATH CORE
                  </span>
                  <h2 className="text-base font-bold text-white font-sans">
                    PLP Math Content
                  </h2>
                </div>
              </div>
              <span className="border border-emerald-500/40 bg-emerald-950/60 text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                ACTIVE
              </span>
            </div>

            {/* Description */}
            <p className="mt-3.5 text-xs text-slate-300 font-sans leading-relaxed">
              Convert mathematical images, handwritten formulas, and multi-line equations into clean LaTeX, strict Jodit HTML (with vertical alignment), and W3C MathML.
            </p>

            {/* Key Capabilities */}
            <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-3.5 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>KaTeX 0.19.0+ verified LaTeX output</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Jodit HTML with strict vertical inline CSS</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Standard W3C MathML &amp; WYSIWYG preview</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Resilient multi-model fallback &amp; retry matrix</span>
              </div>
            </div>
          </div>

          {/* Action Link Button */}
          <div className="mt-6 pt-4 border-t border-slate-800/80">
            <Link
              href="/plp-math-content"
              className="min-h-[46px] group flex w-full items-center justify-between border border-cyan-500/50 bg-gradient-to-r from-cyan-950/90 via-slate-900 to-slate-900 px-4 py-2.5 text-xs font-bold text-cyan-300 transition-all hover:border-cyan-300 hover:text-white hover:shadow-[0_0_15px_rgba(0,240,255,0.25)] focus:ring-2 focus:ring-cyan-400 focus:outline-none"
            >
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-400" />
                <span>OPEN MATH STUDIO (ចូលប្រើប្រាស់)</span>
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* ── Module 02: Background Remover ── */}
        <div className="machine-module group relative flex flex-col justify-between border border-cyan-500/30 bg-slate-950/85 p-6 shadow-2xl transition-all duration-300 hover:border-cyan-400 hover:shadow-[0_0_35px_rgba(0,240,255,0.15)]">
          {/* Corner brackets */}
          <div className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-emerald-400" />
          <div className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-emerald-400" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-emerald-400" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-emerald-400" />

          {/* Top header */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-emerald-400/60 bg-emerald-950/80 text-emerald-400">
                  <Eraser className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-mono">
                    MODULE 02 // VISION CORE
                  </span>
                  <h2 className="text-base font-bold text-white font-sans">
                    Background Remover
                  </h2>
                </div>
              </div>
              <span className="border border-emerald-500/40 bg-emerald-950/60 text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                ACTIVE
              </span>
            </div>

            {/* Description */}
            <p className="mt-3.5 text-xs text-slate-300 font-sans leading-relaxed">
              Multi-class AI foreground extraction isolating real people and preserving Khmer/English typography, diacritics, and logos with 100% on-device WASM execution.
            </p>

            {/* Key Capabilities */}
            <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-3.5 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Person + Text Only union extraction mode</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>12–18px Khmer subscript &amp; diacritic preservation</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>4-Mask inspection (Person, Text, Combined, Cutout)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Manual Keep/Erase correction brush suite</span>
              </div>
            </div>
          </div>

          {/* Action Link Button */}
          <div className="mt-6 pt-4 border-t border-slate-800/80">
            <Link
              href="/bg-remover"
              className="min-h-[46px] group flex w-full items-center justify-between border border-emerald-500/50 bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-900 px-4 py-2.5 text-xs font-bold text-emerald-300 transition-all hover:border-emerald-300 hover:text-white hover:shadow-[0_0_15px_rgba(16,185,129,0.25)] focus:ring-2 focus:ring-emerald-400 focus:outline-none"
            >
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span>OPEN VISION STUDIO (ចូលប្រើប្រាស់)</span>
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Module 04: Khmer Math Solver Card ── */}
      <div className="machine-module group relative flex flex-col border border-violet-500/30 bg-slate-950/85 p-6 shadow-2xl transition-all duration-300 hover:border-violet-400 hover:shadow-[0_0_35px_rgba(139,92,246,0.15)]">
        <div className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-violet-400" />
        <div className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-violet-400" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-violet-400" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-violet-400" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-violet-400/60 bg-violet-950/80 text-violet-400">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] text-violet-400 uppercase tracking-widest font-mono">
                    MODULE 04 // KHMER MATH SOLVER
                  </span>
                  <h2 className="text-base font-bold text-white font-sans">
                    ដោះស្រាយលំហាត់គណិតវិទ្យា
                  </h2>
                </div>
              </div>
              <span className="border border-violet-500/40 bg-violet-950/60 text-violet-300 px-2 py-0.5 text-[10px] font-bold">
                NEW
              </span>
            </div>

            <p className="mt-3.5 text-xs text-slate-300 font-sans leading-relaxed">
              Upload math problem images for AI-powered step-by-step Khmer explanations, answer verification, and multi-problem detection. Supports handwritten, printed Khmer/English, fractions, algebra, geometry, and calculus.
            </p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-slate-800/80 pt-3.5 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                <span>ស្គាល់រូបភាពគណិតវិទ្យា (Printed &amp; Handwritten)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                <span>ផ្ទៀងផ្ទាត់ចម្លើយត្រឹមត្រូវ ឬមិនត្រឹមត្រូវ</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                <span>ពន្យល់ជាភាសាខ្មែរជំហានម្តងៗ</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                <span>ស្គាល់ច្រើនបញ្ហាក្នុងរូបភាពតែមួយ</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800/80">
          <Link
            href="/math-solver"
            className="min-h-[46px] group flex w-full items-center justify-between border border-violet-500/50 bg-gradient-to-r from-violet-950/90 via-slate-900 to-slate-900 px-4 py-2.5 text-xs font-bold text-violet-300 transition-all hover:border-violet-300 hover:text-white hover:shadow-[0_0_15px_rgba(139,92,246,0.25)] focus:ring-2 focus:ring-violet-400 focus:outline-none"
          >
            <span className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-400" />
              <span>OPEN MATH SOLVER (ដោះស្រាយលំហាត់)</span>
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      {/* ── 4. Compact Maintenance Notice ── */}
      <div className="flex items-center gap-3 border border-amber-500/30 bg-amber-950/25 px-4 py-3 text-xs font-mono text-amber-300/90 shadow-[0_0_15px_rgba(245,158,11,0.08)]">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
        <span className="font-semibold text-amber-400">NOTE:</span>
        <span>
          Module 05 (Web Cloner) is temporarily under scheduled maintenance.
        </span>
      </div>

      {/* ── 5. Compact Neural Team Nodes Status Panel ── */}
      <div className="border border-slate-800/90 bg-slate-950/80 p-4 sm:p-5 shadow-xl font-mono text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-cyan-400" />
            <h3 className="font-bold text-white uppercase tracking-wider">
              DYT ECOSYSTEM // Neural Team Nodes
            </h3>
          </div>
          <span className="text-[10px] text-cyan-400 bg-cyan-950/70 border border-cyan-500/30 px-2 py-0.5 font-bold">
            4 NODES CONNECTED
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {TEAM_MEMBERS.map((member) => (
            <div
              key={member.initials}
              className="flex items-center gap-2.5 border border-slate-800 bg-slate-900/60 p-2.5"
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center font-bold text-xs text-slate-950 ${member.color}`}
              >
                {member.initials}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-200 truncate">{member.name}</div>
                <div className="text-[10px] text-slate-400 truncate">{member.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
