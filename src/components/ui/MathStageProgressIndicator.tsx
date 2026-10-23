"use client";

import React, { useEffect, useState, useRef } from "react";
import { CheckCircle2, Clock, Activity, Timer } from "lucide-react";

export interface MathStageProgressIndicatorProps {
  active: boolean;
  moduleName?: string;
  elapsedSeconds?: number;
  subtext?: string;
  onCancel?: () => void;
}

export const STAGES = [
  {
    id: 1,
    titleKhmer: "កំពុងអាននិងវិភាគរូបភាព/ប្រធានលំហាត់... (Analyzing input...)",
    desc: "ស្កេន និងបំប្លែងទិន្នន័យរូបភាព/អត្ថបទដើម",
    durationSec: 3.5,
  },
  {
    id: 2,
    titleKhmer: "កំពុងបង្កើតទម្រង់គណិតវិទ្យា និងដំណោះស្រាយ... (Generating math & steps...)",
    desc: "គណនា រៀបចំជំហានដំណោះស្រាយ និងពិនិត្យភាពត្រឹមត្រូវ",
    durationSec: 9.0,
  },
  {
    id: 3,
    titleKhmer: "កំពុងរៀបចំទម្រង់ HTML / LaTeX... (Formatting output...)",
    desc: "រចនាទម្រង់បោះពុម្ព KaTeX, MathML និង Jodit HTML ស្អាត",
    durationSec: 15.0,
  },
];

export function MathStageProgressIndicator({
  active,
  moduleName = "PLP MATH AI MATRIX",
  elapsedSeconds,
  subtext = "កំពុងដំណើរការតាមរយៈបញ្ញាសិប្បនិម្មិត Gemini API កម្រិតខ្ពស់",
  onCancel,
}: MathStageProgressIndicatorProps) {
  const [internalElapsed, setInternalElapsed] = useState<number>(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startTimeRef.current = null;
      return;
    }

    if (startTimeRef.current === null) {
      startTimeRef.current = performance.now();
    }

    const interval = setInterval(() => {
      if (startTimeRef.current !== null) {
        setInternalElapsed((performance.now() - startTimeRef.current) / 1000);
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [active]);

  if (!active) return null;

  const currentElapsed = elapsedSeconds !== undefined ? elapsedSeconds : internalElapsed;

  // Determine current active stage index (0, 1, or 2)
  let activeStageIdx = 0;
  if (currentElapsed >= 9.0) {
    activeStageIdx = 2;
  } else if (currentElapsed >= 3.5) {
    activeStageIdx = 1;
  } else {
    activeStageIdx = 0;
  }

  // Smooth progress calculation (advances steadily towards 95% over ~14s)
  const progressPct = Math.min(
    95,
    Math.max(
      8,
      Math.round(
        activeStageIdx === 0
          ? 10 + (currentElapsed / 3.5) * 25
          : activeStageIdx === 1
          ? 35 + ((currentElapsed - 3.5) / 5.5) * 35
          : 70 + Math.min(25, ((currentElapsed - 9.0) / 6.0) * 25)
      )
    )
  );

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="math-stage-progress-indicator"
      className="relative overflow-hidden rounded-2xl border border-cyan-500/35 bg-slate-950/90 p-5 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all"
    >
      {/* Background ambient pulse */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Header Bar */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-cyan-500/20 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300">
              {moduleName}
            </span>
          </div>
          <p className="text-xs text-slate-300 font-sans leading-relaxed">{subtext}</p>
        </div>

        {/* Expectation Badge & Live Elapsed Counter */}
        <div className="flex flex-wrap items-center gap-2 sm:self-center font-mono text-xs">
          {/* Calm Expectation Badge */}
          <div
            data-testid="stage-expectation-badge"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-2.5 py-1 text-[11px] text-amber-300 shadow-sm"
          >
            <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
            <span>ជាធម្មតា ៨–១៥ វិនាទីសម្រាប់លំហាត់ស្មុគស្មាញ / Usually 8–15s for complex problems</span>
          </div>

          {/* Live Elapsed Counter */}
          <div
            data-testid="stage-elapsed-counter"
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-2.5 py-1 text-[11px] font-bold text-cyan-300 font-mono shadow-sm"
          >
            <Timer className="h-3.5 w-3.5 text-cyan-400 animate-pulse shrink-0" aria-hidden="true" />
            <span>{currentElapsed.toFixed(1)}s</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative z-10 my-4 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1 text-cyan-300">
            <Activity className="h-3 w-3 text-cyan-400 animate-pulse" aria-hidden="true" />
            <span>ដំណើរការដំណាក់កាលទី {activeStageIdx + 1} នៃ {STAGES.length}</span>
          </span>
          <span className="font-bold text-white">{progressPct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 transition-all duration-300 ease-out shadow-[0_0_12px_rgba(0,240,255,0.5)]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 3 Calm Progress Stages */}
      <div className="relative z-10 space-y-2 pt-1 font-sans">
        {STAGES.map((stage, idx) => {
          const isCompleted = idx < activeStageIdx;
          const isCurrent = idx === activeStageIdx;

          return (
            <div
              key={stage.id}
              data-testid={`stage-step-${stage.id}`}
              className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${
                isCompleted
                  ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                  : isCurrent
                  ? "border-cyan-400/60 bg-cyan-950/40 text-cyan-100 shadow-[0_0_20px_rgba(0,240,255,0.1)] ring-1 ring-cyan-400/30"
                  : "border-slate-800/80 bg-slate-900/30 text-slate-400 opacity-60"
              }`}
            >
              {/* Status Icon */}
              <div className="mt-0.5 shrink-0">
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                ) : isCurrent ? (
                  <div className="relative flex h-5 w-5 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-400" />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded-full border border-slate-600 bg-slate-800/80 flex items-center justify-center text-[10px] font-mono text-slate-500">
                    {stage.id}
                  </div>
                )}
              </div>

              {/* Stage Text */}
              <div className="flex-1 space-y-0.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs sm:text-sm font-bold tracking-tight ${
                      isCompleted
                        ? "text-emerald-300"
                        : isCurrent
                        ? "text-cyan-200"
                        : "text-slate-400"
                    }`}
                  >
                    {stage.titleKhmer}
                  </span>
                  <span className="text-[10px] font-mono shrink-0 uppercase px-1.5 py-0.5 rounded border border-cyan-500/20 bg-slate-950/40">
                    {isCompleted ? "រួចរាល់" : isCurrent ? "កំពុងដំណើរការ" : "រង់ចាំ"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">{stage.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel button if provided */}
      {onCancel && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-mono text-rose-300 hover:text-rose-100 hover:underline transition-colors focus:outline-none"
          >
            បោះបង់ (Cancel)
          </button>
        </div>
      )}
    </div>
  );
}
