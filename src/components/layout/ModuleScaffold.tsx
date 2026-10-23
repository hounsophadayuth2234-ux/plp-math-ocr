import React from "react";
import Link from "next/link";
import {
  Calculator,
  Eraser,
  Sparkles,
  ImagePlus,
  Code2,
  Brain,
  Palette,
  CheckCircle2,
  ArrowLeft,
  Terminal,
} from "lucide-react";
import { ToolModule } from "@/config/tools";

const ICON_MAP: Record<ToolModule["iconName"], React.ComponentType<{ className?: string }>> = {
  Calculator,
  Eraser,
  Sparkles,
  ImagePlus,
  Code2,
  Brain,
  Palette,
};

interface ModuleScaffoldProps {
  tool: ToolModule;
  stepNote: string;
}

export function ModuleScaffold({ tool, stepNote }: ModuleScaffoldProps) {
  const Icon = ICON_MAP[tool.iconName];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Quick Return */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard Overview
        </Link>
        <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          {tool.badge}
        </span>
      </div>

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400">
              <span>Module 0{tool.number}</span>
              <span>•</span>
              <span>{tool.engine}</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {tool.title}
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              {tool.description}
            </p>
          </div>

          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.accentColor} text-white shadow-lg`}
          >
            <Icon className="h-7 w-7" />
          </div>
        </div>

        {/* Highlights */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {tool.highlights.map((item) => (
            <div
              key={item}
              className="flex items-start gap-2.5 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-xs text-slate-300"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Route Placeholder Status Card */}
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/80 text-indigo-400">
          <Terminal className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-white">
          Route Initialized ({tool.href})
        </h3>
        <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-slate-400">
          {stepNote}
        </p>
      </div>
    </div>
  );
}
