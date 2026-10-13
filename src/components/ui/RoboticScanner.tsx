"use client";

import React, { useEffect, useState } from "react";
import { Cpu, Terminal, Zap, ShieldAlert, Sparkles, Activity } from "lucide-react";

interface RoboticScannerProps {
  active: boolean;
  moduleName?: string;
  steps?: string[];
  subtext?: string;
}

const DEFAULT_STEPS = [
  "INITIALIZING NEURAL SENSORY MATRIX...",
  "ACQUIRING SPATIAL INPUT COORDINATES...",
  "DECODING PIXEL TENSORS & GEOMETRY...",
  "SYNTHESIZING STRICT FORMAT OUTPUT...",
  "FINALIZING PLP ECOSYSTEM PAYLOAD...",
];

export function RoboticScanner({
  active,
  moduleName = "PLP NEURAL ENGINE",
  steps = DEFAULT_STEPS,
  subtext = "High-precision AI processing underway",
}: RoboticScannerProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!active) {
      setCurrentStepIdx(0);
      setLogs([]);
      return;
    }

    setLogs([`[0.00s] >> SYSTEM ONLINE: Connecting to ${moduleName}`]);

    const interval = setInterval(() => {
      setCurrentStepIdx((prev) => {
        const next = prev < steps.length - 1 ? prev + 1 : prev;
        const timestamp = (0.4 + next * 0.75).toFixed(2);
        setLogs((l) => [...l.slice(-4), `[${timestamp}s] >> ${steps[next]}`]);
        return next;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [active, moduleName, steps]);

  if (!active) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/40 bg-slate-950/90 p-6 shadow-[0_0_35px_rgba(0,240,255,0.15)] backdrop-blur-xl">
      {/* Laser Scan Line */}
      <div className="animate-laser-scan" />

      {/* Cyber Grid Overlay */}
      <div className="pointer-events-none absolute inset-0 cyber-grid-bg opacity-30" />

      {/* HUD Header Bar */}
      <div className="relative z-10 flex items-center justify-between border-b border-cyan-500/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950/80 text-cyan-400 ring-1 ring-cyan-500/50">
            <Cpu className="h-5 w-5 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
                {moduleName}
              </span>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 ring-1 ring-cyan-500/30">
                LIVE COMPUTE
              </span>
            </div>
            <p className="text-xs text-slate-400">{subtext}</p>
          </div>
        </div>

        {/* Telemetry metrics */}
        <div className="hidden sm:flex items-center gap-4 font-mono text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 text-cyan-300">
            <Activity className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            <span>NEURAL: 100%</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Zap className="h-3.5 w-3.5" />
            <span>LATENCY: 8ms</span>
          </div>
        </div>
      </div>

      {/* Center Radar & Scanning Visual */}
      <div className="relative z-10 my-6 flex flex-col items-center justify-center gap-4 py-2">
        {/* Holographic Concentric Rings */}
        <div className="relative flex h-28 w-28 items-center justify-center">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border border-dashed border-cyan-500/40 animate-radar" />
          {/* Middle ring */}
          <div className="absolute inset-2 rounded-full border border-cyan-400/30 animate-radar-reverse" />
          {/* Inner pulsating core */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-[0_0_20px_#00f0ff] animate-pulse">
            <Sparkles className="h-6 w-6 text-cyan-100" />
          </div>
          {/* Corner target reticles */}
          <div className="absolute -top-1 -left-1 h-2 w-2 border-t-2 border-l-2 border-cyan-400" />
          <div className="absolute -top-1 -right-1 h-2 w-2 border-t-2 border-r-2 border-cyan-400" />
          <div className="absolute -bottom-1 -left-1 h-2 w-2 border-b-2 border-l-2 border-cyan-400" />
          <div className="absolute -bottom-1 -right-1 h-2 w-2 border-b-2 border-r-2 border-cyan-400" />
        </div>

        {/* Current Stage Indicator */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-cyan-950/60 px-3.5 py-1 text-xs font-semibold text-cyan-300 ring-1 ring-cyan-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>{steps[currentStepIdx]}</span>
          </div>
        </div>
      </div>

      {/* Cyberpunk Live Terminal Log Stream */}
      <div className="relative z-10 rounded-xl border border-slate-800 bg-black/70 p-3.5 font-mono text-[11px] shadow-inner">
        <div className="mb-2 flex items-center justify-between border-b border-slate-800/80 pb-1.5 text-slate-500 text-[10px]">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Terminal className="h-3 w-3 text-cyan-400" />
            TELEMETRY STREAM
          </span>
          <span className="text-emerald-400">STATUS: ACTIVE</span>
        </div>
        <div className="space-y-1 text-slate-300">
          {logs.map((log, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 ${
                i === logs.length - 1 ? "text-cyan-300 font-semibold" : "text-slate-400"
              }`}
            >
              <span className="text-cyan-500/60">&gt;</span>
              <span>{log}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
