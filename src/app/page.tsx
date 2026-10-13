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
              ជ្រើសរើសម៉ូឌុលខាងក្រោម ឬតាម Sidebar ខាងឆ្វេងដើម្បីចាប់ផ្ដើមដំណើរការ
            </p>
          </div>
          <span className="hidden sm:inline-flex rounded font-mono text-[10px] text-cyan-400 border border-cyan-500/30 bg-cyan-950/40 px-2 py-1">
            STATUS: ACTIVE (5/5)
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {CORE_TOOLS.map((tool) => {
            const Icon = ICON_MAP[tool.iconName];

            return (
              <Link
                key={tool.id}
                href={tool.href}
                className="group relative flex flex-col justify-between rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400 hover:bg-slate-900/90 hover:shadow-[0_0_25px_rgba(0,240,255,0.18)]"
              >
                {/* Tech corner reticle */}
                <div className="absolute top-2 right-2 h-2 w-2 border-t border-r border-cyan-500/40 group-hover:border-cyan-400" />
                <div className="absolute bottom-2 left-2 h-2 w-2 border-b border-l border-cyan-500/40 group-hover:border-cyan-400" />

                <div>
                  {/* Card Top Bar */}
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${tool.accentColor} text-white shadow-lg shadow-cyan-500/10 group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-cyan-500/30 bg-slate-950 px-2.5 py-1 font-mono text-[11px] font-semibold text-cyan-300">
                        {tool.badge}
                      </span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 transition-colors group-hover:border-cyan-400 group-hover:text-cyan-300">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="mt-5">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                      Module 0{tool.number}
                    </span>
                    <h4 className="mt-1 text-base font-bold text-white group-hover:text-cyan-200 transition-colors">
                      {tool.title}
                    </h4>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {tool.description}
                    </p>
                  </div>
                </div>

                {/* Highlights List */}
                <div className="mt-5 space-y-2 border-t border-slate-800/80 pt-4">
                  {tool.highlights.map((highlight) => (
                    <div
                      key={highlight}
                      className="flex items-center gap-2 text-xs text-slate-300"
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
