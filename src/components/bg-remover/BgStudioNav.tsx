"use client";

import React from "react";
import {
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Laptop,
  HelpCircle,
  Settings,
  ShieldCheck,
  Cpu,
  Activity,
} from "lucide-react";

interface BgStudioNavProps {
  theme: "dark" | "light" | "system";
  onToggleTheme: () => void;
  audioMuted: boolean;
  onToggleAudio: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  isProcessing?: boolean;
}

/**
 * Mechanical Workstation Command Deck Header
 * Fits inside the main workspace to the right of the global sidebar.
 * Preserves all test selectors:
 * - data-testid="audio-toggle-btn"
 * - data-testid="theme-toggle-btn"
 * - data-testid="help-modal-btn"
 * - data-testid="settings-modal-btn"
 */
export function BgStudioNav({
  theme,
  onToggleTheme,
  audioMuted,
  onToggleAudio,
  onOpenSettings,
  onOpenHelp,
  isProcessing,
}: BgStudioNavProps) {
  return (
    <div className="relative overflow-hidden border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950 px-4 py-2.5 shadow-lg font-mono">
      {/* Corner mechanical brackets */}
      <div className="pointer-events-none absolute top-0 left-0 h-2.5 w-2.5 border-t-2 border-l-2 border-cyan-400/80" />
      <div className="pointer-events-none absolute top-0 right-0 h-2.5 w-2.5 border-t-2 border-r-2 border-cyan-400/80" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-2.5 w-2.5 border-b-2 border-l-2 border-cyan-400/80" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 border-b-2 border-r-2 border-cyan-400/80" />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Workstation Unit Designation */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center border border-cyan-500/40 bg-slate-900 text-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold tracking-wider text-white text-[11px]">
              <span>WORKSTATION // UNIT-02</span>
              <span className="text-cyan-400 text-[10px]">[BG-REMOVER]</span>
            </div>
            <div className="text-[9px] text-slate-400 flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isProcessing ? "bg-amber-400 animate-ping" : "bg-emerald-400 animate-pulse"
                }`}
              />
              <span className={isProcessing ? "text-amber-300 font-bold" : "text-emerald-400"}>
                {isProcessing ? "INFERENCE MATRIX SCANNING..." : "STATUS: READY FOR INTAKE"}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Engine & Privacy Telemetry */}
        <div className="hidden md:flex items-center gap-2 border border-slate-800 bg-slate-950/80 px-3 py-1 text-[10px]">
          <span className="text-slate-400">ENGINE:</span>
          <span className="text-cyan-300 font-bold">@IMGLY/ISNET_FP16 (WASM)</span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="h-3 w-3" />
            100% ON-DEVICE
          </span>
        </div>

        {/* Right: Instrument Controls */}
        <div className="flex items-center gap-1.5">
          {/* Audio Synthesizer Toggle */}
          <button
            type="button"
            data-testid="audio-toggle-btn"
            onClick={onToggleAudio}
            className={`min-h-[38px] min-w-[38px] flex items-center justify-center border text-xs transition-all cursor-pointer ${
              audioMuted
                ? "border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200"
                : "border-cyan-500/50 bg-cyan-950/70 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.25)]"
            }`}
            title={audioMuted ? "Audio: Off (Muted) — Click to activate" : "Audio: On (Active) — Click to mute"}
            aria-label={audioMuted ? "Unmute audio effects" : "Mute audio effects"}
          >
            {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {/* Theme Switcher */}
          <button
            type="button"
            data-testid="theme-toggle-btn"
            onClick={onToggleTheme}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title={`Theme Mode: ${theme.toUpperCase()}`}
            aria-label="Toggle theme mode"
          >
            {theme === "light" ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : theme === "dark" ? (
              <Moon className="h-4 w-4 text-sky-400" />
            ) : (
              <Laptop className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {/* Guide & Shortcuts */}
          <button
            type="button"
            data-testid="help-modal-btn"
            onClick={onOpenHelp}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
            title="Workstation Manual & Shortcuts"
            aria-label="Open Guide and Shortcuts"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* Preferences / Calibration */}
          <button
            type="button"
            data-testid="settings-modal-btn"
            onClick={onOpenSettings}
            className="min-h-[38px] flex items-center gap-1.5 border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-white transition-colors cursor-pointer"
            title="Workstation Calibration Preferences"
            aria-label="Open Studio Settings"
          >
            <Settings className="h-4 w-4 text-slate-400" />
            <span className="hidden sm:inline font-mono text-[10px] font-bold">CALIBRATE</span>
          </button>
        </div>
      </div>
    </div>
  );
}
