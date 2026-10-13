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
  Layers,
  Lock,
  Zap,
  Users,
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
      {/* Top Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
              <Lock className="h-3.5 w-3.5" />
              <span>Private 4-Person Team AI Workbench</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Welcome to NexusAI Internal Studio
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              A centralized Next.js + TypeScript suite uniting math OCR &amp;
              Jodit-ready inline HTML generation, instant background segmentation,
              4K super-resolution upscaling, prompt-based image synthesis, and
              DOM/CSS web element cloning.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-center">
              <Layers className="mx-auto h-4 w-4 text-indigo-400" />
              <p className="mt-1.5 text-xl font-bold text-white">5</p>
              <p className="text-[11px] text-slate-400">Core Modules</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-center">
              <Users className="mx-auto h-4 w-4 text-emerald-400" />
              <p className="mt-1.5 text-xl font-bold text-white">4</p>
              <p className="text-[11px] text-slate-400">Team Seats</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-center">
              <Zap className="mx-auto h-4 w-4 text-amber-400" />
              <p className="mt-1.5 text-xl font-bold text-white">API</p>
              <p className="text-[11px] text-slate-400">App Router</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5 Core Functional Modules Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Core AI Functional Modules
            </h3>
            <p className="text-xs text-slate-400">
              Select a module below or from the left sidebar to launch its workspace
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {CORE_TOOLS.map((tool) => {
            const Icon = ICON_MAP[tool.iconName];

            return (
              <Link
                key={tool.id}
                href={tool.href}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-800/90 bg-slate-900/60 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900 hover:shadow-xl hover:shadow-indigo-950/20"
              >
                <div>
                  {/* Card Top Bar */}
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tool.accentColor} text-white shadow-md`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-slate-800/90 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                        {tool.badge}
                      </span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 transition-colors group-hover:border-indigo-500/40 group-hover:text-white">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="mt-5">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                      Module 0{tool.number}
                    </span>
                    <h4 className="mt-1 text-base font-bold text-white group-hover:text-indigo-200">
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
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span className="truncate">{highlight}</span>
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Team Roster Strip */}
      <section className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">
              Authorized 4-Person Team Roster
            </h4>
            <p className="text-xs text-slate-400">
              Shared access to Gemini Vision, Image Processing, and Scraper pipelines
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TEAM_MEMBERS.map((member) => (
              <div
                key={member.initials}
                className="flex items-center gap-2.5 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2"
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${member.color} text-xs font-bold text-white`}
                >
                  {member.initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-200">
                    {member.name}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
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
