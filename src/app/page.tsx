import React from "react";
import Link from "next/link";
import {
  Calculator,
  Eraser,
  Sparkles,
  ImagePlus,
  Code2,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import { CORE_TOOLS, TEAM_MEMBERS, ToolModule } from "@/config/tools";

const ICON_MAP: Record<ToolModule["iconName"], React.ComponentType<{ className?: string }>> = {
  Calculator,
  Eraser,
  Sparkles,
  ImagePlus,
  Code2,
};

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-8">
      {/* 5 Core Functional Modules Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-cyan-400 font-mono text-sm">&gt;&gt;</span>
              <span>ម៉ូឌុលដំណើរការស្នូល (Core Modules)</span>
            </h3>
            <p className="text-xs text-slate-400">
              ម៉ូឌុល 01 (Math OCR) កំពុងដំណើរការយ៉ាងពេញលេញ។ ម៉ូឌុលផ្សេងទៀតត្រូវបានផ្អាកបណ្ដោះអាសន្នដើម្បីធានាស្ថិរភាព។
            </p>
          </div>
          <span className="hidden sm:inline-flex rounded font-mono text-[10px] text-emerald-400 border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1">
            STATUS: MODULE 01 ACTIVE
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {CORE_TOOLS.map((tool) => {
            const Icon = ICON_MAP[tool.iconName];

            if (tool.disabled) {
              return (
                <div
                  key={tool.id}
                  className="relative flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-950/40 p-6 opacity-50 select-none cursor-not-allowed"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/60 text-slate-500">
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
                        ផ្អាកបណ្ដោះអាសន្ន
                      </span>
                    </div>

                    <div className="mt-5">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Module 0{tool.number}
                      </span>
                      <h4 className="mt-1 text-base font-bold text-slate-400">
                        {tool.title}
                      </h4>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">
                        {tool.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2 border-t border-slate-900 pt-4">
                    <p className="text-[11px] font-mono text-slate-500">
                      Module paused to focus on Module 01 transcription
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={tool.id}
                href={tool.href}
                className="group relative flex flex-col justify-between rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400 hover:bg-slate-900 hover:shadow-[0_0_30px_rgba(0,240,255,0.22)] ring-1 ring-cyan-500/20"
              >
                {/* Tech corner reticle */}
                <div className="absolute top-2 right-2 h-2.5 w-2.5 border-t-2 border-r-2 border-cyan-400" />
                <div className="absolute bottom-2 left-2 h-2.5 w-2.5 border-b-2 border-l-2 border-cyan-400" />

                <div>
                  {/* Card Top Bar */}
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${tool.accentColor} text-white shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-cyan-500/40 bg-cyan-950/60 px-2.5 py-1 font-mono text-[11px] font-semibold text-cyan-300 shadow-[0_0_8px_rgba(0,240,255,0.2)]">
                        {tool.badge}
                      </span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/30 bg-slate-950 text-cyan-400 transition-colors group-hover:border-cyan-400 group-hover:text-white">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="mt-5">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                      Module 0{tool.number} · ACTIVE
                    </span>
                    <h4 className="mt-1 text-base font-bold text-white group-hover:text-cyan-200 transition-colors">
                      {tool.title}
                    </h4>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">
                      {tool.description}
                    </p>
                  </div>
                </div>

                {/* Highlights List */}
                <div className="mt-5 space-y-2 border-t border-slate-800/80 pt-4">
                  {tool.highlights.map((highlight) => (
                    <div
                      key={highlight}
                      className="flex items-center gap-2 text-xs text-slate-200"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      <span className="truncate">{highlight}</span>
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* DYT ECOSYSTEM Team Roster Strip */}
      <section className="rounded-2xl border border-cyan-500/20 bg-slate-900/50 p-5 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              DYT ECOSYSTEM — Neural Team Nodes
            </h4>
            <p className="text-xs text-slate-400">
              Shared access to Gemini Vision, Math OCR, and High-Resolution AI Processing Engines
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono">
            {TEAM_MEMBERS.map((member) => (
              <div
                key={member.initials}
                className="flex items-center gap-2.5 rounded-xl border border-cyan-500/20 bg-slate-950/70 px-3 py-2 shadow-[0_0_8px_rgba(0,240,255,0.05)]"
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${member.color} text-xs font-bold text-slate-950`}
                >
                  {member.initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-200">
                    {member.name}
                  </p>
                  <p className="truncate text-[10px] text-cyan-400/80">
                    {member.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
