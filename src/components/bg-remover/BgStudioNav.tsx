"use client";

import React from "react";
import Link from "next/link";
import {
  Sparkles,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Laptop,
  HelpCircle,
  Settings,
  ArrowLeft,
  ShieldCheck,
  Cpu,
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
    <header className="sticky top-0 z-30 flex h-14 w-full shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-3 sm:px-6 backdrop-blur-md shadow-sm">
      {/* Brand & Identity */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 group text-slate-300 hover:text-white transition-colors"
          title="Return to Dashboard"
          aria-label="Return to Dashboard"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 via-sky-500 to-indigo-600 text-white shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-transform group-hover:scale-105">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-sans font-bold text-sm tracking-tight text-white">
                AI Background Studio
              </span>
              <span className="hidden sm:inline-flex items-center rounded-full bg-cyan-950/80 border border-cyan-500/40 px-1.5 py-0.2 text-[9px] font-semibold text-cyan-300">
                PRO
              </span>
            </div>
            <span className="hidden md:inline-block text-[10px] text-slate-400 font-sans">
              Person + Khmer Text Protected
            </span>
          </div>
        </Link>
      </div>

      {/* Center Status: Local AI Telemetry */}
      <div className="hidden lg:flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs">
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
              isProcessing ? "bg-amber-400" : "bg-emerald-400"
            }`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              isProcessing ? "bg-amber-500" : "bg-emerald-500"
            }`}
          />
        </span>
        <span className="text-slate-300 font-mono text-[11px]">
          {isProcessing ? "Inference Active (WASM)" : "Browser AI (WASM) · Ready"}
        </span>
        <span className="text-slate-600">|</span>
        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-sans">
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
          100% On-Device
        </span>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Sound Toggle Button */}
        <button
          type="button"
          data-testid="audio-toggle-btn"
          onClick={onToggleAudio}
          className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border text-xs transition-all ${
            audioMuted
              ? "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200"
              : "border-cyan-500/40 bg-cyan-950/60 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.2)]"
          }`}
          title={audioMuted ? "Sound: Off (Muted) — Click to enable" : "Sound: On (Active) — Click to mute"}
          aria-label={audioMuted ? "Unmute audio effects" : "Mute audio effects"}
        >
          {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

        {/* Theme Toggle Button */}
        <button
          type="button"
          data-testid="theme-toggle-btn"
          onClick={onToggleTheme}
          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 transition-colors"
          title={`Theme: ${theme.toUpperCase()} — Click to switch`}
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

        {/* Help & Guide Modal Button */}
        <button
          type="button"
          data-testid="help-modal-btn"
          onClick={onOpenHelp}
          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 transition-colors"
          title="Guide & Keyboard Shortcuts"
          aria-label="Open Guide and Shortcuts"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {/* Settings Modal Button */}
        <button
          type="button"
          data-testid="settings-modal-btn"
          onClick={onOpenSettings}
          className="min-h-[38px] flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
          title="Studio Preferences"
          aria-label="Open Studio Settings"
        >
          <Settings className="h-4 w-4 text-slate-400" />
          <span className="hidden sm:inline font-sans font-medium text-[11px]">Settings</span>
        </button>
      </div>
    </header>
  );
}
