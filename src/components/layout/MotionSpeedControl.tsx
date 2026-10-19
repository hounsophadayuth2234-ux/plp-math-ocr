"use client";

import React, { useEffect, useState } from "react";
import { Gauge, Play, Pause, Zap } from "lucide-react";
import {
  MotionSpeed,
  getInitialMotionSpeed,
  saveMotionSpeed,
  applyMotionSpeedToDocument,
} from "@/lib/motion-speed";

interface MotionSpeedControlProps {
  compact?: boolean;
}

export function MotionSpeedControl({ compact = false }: MotionSpeedControlProps) {
  const [speed, setSpeed] = useState<MotionSpeed>(() => getInitialMotionSpeed());

  useEffect(() => {
    applyMotionSpeedToDocument(speed);

    const handleCustomChange = (e: Event) => {
      const detail = (e as CustomEvent<{ speed: MotionSpeed }>).detail;
      if (detail?.speed) {
        setSpeed(detail.speed);
      }
    };

    window.addEventListener("motion-speed-change", handleCustomChange);

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleReducedMotion = (e: MediaQueryListEvent) => {
      if (e.matches) {
        saveMotionSpeed("paused");
      }
    };
    mediaQuery.addEventListener?.("change", handleReducedMotion);

    return () => {
      window.removeEventListener("motion-speed-change", handleCustomChange);
      mediaQuery.removeEventListener?.("change", handleReducedMotion);
    };
  }, [speed]);

  const handleSelect = (newSpeed: MotionSpeed) => {
    setSpeed(newSpeed);
    saveMotionSpeed(newSpeed);
  };

  const OPTIONS: { id: MotionSpeed; label: string; icon?: React.ReactNode }[] = [
    { id: "slow", label: "Slow" },
    { id: "normal", label: "Normal" },
    { id: "fast", label: "Fast" },
    { id: "paused", label: "Pause" },
  ];

  if (compact) {
    return (
      <div
        role="group"
        aria-label="Background formula motion speed"
        className="inline-flex items-center rounded-lg border border-cyan-500/30 bg-slate-950/60 p-0.5 font-mono text-[11px] shadow-inner backdrop-blur-md"
      >
        <span className="hidden sm:inline-flex items-center gap-1 px-2 text-[10px] uppercase tracking-wider text-cyan-400/80">
          <Gauge className="h-3 w-3 text-cyan-400" aria-hidden="true" />
          <span>Motion</span>
        </span>
        {OPTIONS.map((opt) => {
          const isSelected = speed === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelect(opt.id)}
              aria-pressed={isSelected}
              title={`Set formula motion speed to ${opt.label}`}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
                isSelected
                  ? "bg-cyan-500/25 text-cyan-300 shadow-[0_0_8px_rgba(0,240,255,0.3)] ring-1 ring-cyan-400/50"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt.id === "paused" ? (
                <span className="inline-flex items-center gap-1">
                  <Pause className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>Pause</span>
                </span>
              ) : opt.id === "fast" ? (
                <span className="inline-flex items-center gap-0.5">
                  <Zap className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
                  <span>Fast</span>
                </span>
              ) : (
                opt.label
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 font-mono text-xs font-semibold text-slate-300">
          <Gauge className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          <span>Background Motion Speed</span>
        </label>
        <span className="font-mono text-[11px] font-bold uppercase text-cyan-400">
          {speed}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {OPTIONS.map((opt) => {
          const isSelected = speed === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelect(opt.id)}
              aria-pressed={isSelected}
              className={`flex flex-col items-center justify-center rounded-xl p-2.5 text-xs font-mono transition-all border ${
                isSelected
                  ? "border-cyan-400/60 bg-cyan-950/50 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.25)] ring-1 ring-cyan-400/40"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              {opt.id === "paused" ? (
                <Pause className="mb-1 h-3.5 w-3.5 text-amber-400" />
              ) : opt.id === "fast" ? (
                <Zap className="mb-1 h-3.5 w-3.5 text-cyan-400" />
              ) : opt.id === "slow" ? (
                <Play className="mb-1 h-3.5 w-3.5 text-indigo-400" />
              ) : (
                <Gauge className="mb-1 h-3.5 w-3.5 text-emerald-400" />
              )}
              <span className="font-semibold">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
