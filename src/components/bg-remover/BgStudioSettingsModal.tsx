"use client";

import React from "react";
import { X, Volume2, VolumeX, Shield, Sliders, Cpu, Sparkles } from "lucide-react";
import { cyberAudio } from "@/lib/cyber-audio";

interface BgStudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioMuted: boolean;
  onToggleAudio: () => void;
  edgeQuality: "fast" | "balanced" | "quality" | "fine_details";
  onChangeEdgeQuality: (quality: "fast" | "balanced" | "fine_details") => void;
}

export function BgStudioSettingsModal({
  isOpen,
  onClose,
  audioMuted,
  onToggleAudio,
  edgeQuality,
  onChangeEdgeQuality,
}: BgStudioSettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl text-slate-200 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h2 id="settings-dialog-title" className="text-base font-bold text-white font-sans">
                Studio Preferences
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                Configure runtime engine, sound effects, and quality presets
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-white transition-colors"
            aria-label="Close settings dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Setting Groups */}
        <div className="space-y-4 text-xs font-sans">
          {/* 1. Audio Synthesizer */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {audioMuted ? (
                  <VolumeX className="h-4 w-4 text-slate-400" />
                ) : (
                  <Volume2 className="h-4 w-4 text-cyan-400" />
                )}
                <div>
                  <div className="font-semibold text-slate-200">Cyber Audio Feedback</div>
                  <div className="text-[11px] text-slate-400">
                    Subtle synthesized clicks &amp; completion cues
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleAudio}
                className={`min-h-[36px] px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
                  audioMuted
                    ? "border-slate-700 bg-slate-800 text-slate-300"
                    : "border-cyan-500/50 bg-cyan-950/80 text-cyan-300"
                }`}
              >
                {audioMuted ? "Muted" : "Active"}
              </button>
            </div>
          </div>

          {/* 2. Default Refinement Quality */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-purple-400" />
              <div>
                <div className="font-semibold text-slate-200">Alpha Matting Refinement</div>
                <div className="text-[11px] text-slate-400">
                  Sub-pixel contour boundary handling around fine flyaway hair
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onChangeEdgeQuality("fast")}
                className={`min-h-[38px] flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                  edgeQuality === "fast"
                    ? "border-cyan-400 bg-cyan-950/60 text-white font-semibold ring-1 ring-cyan-400/30"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                <span className="text-[11px]">Fast (Preview)</span>
                <span className="text-[9px] text-slate-500">&lt; 1 sec</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeEdgeQuality("balanced")}
                className={`min-h-[38px] flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                  edgeQuality === "balanced"
                    ? "border-purple-400 bg-purple-950/60 text-white font-semibold ring-1 ring-purple-400/30"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                <span className="text-[11px]">Balanced</span>
                <span className="text-[9px] text-purple-400/80">Default Pro</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeEdgeQuality("fine_details")}
                className={`min-h-[38px] flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                  edgeQuality === "fine_details" || edgeQuality === "quality"
                    ? "border-emerald-400 bg-emerald-950/60 text-white font-semibold ring-1 ring-emerald-400/30"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                <span className="text-[11px]">Fine Hair</span>
                <span className="text-[9px] text-emerald-400/80">Max Detail</span>
              </button>
            </div>
          </div>

          {/* 3. Privacy & Telemetry Info */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <div>
                <div className="font-semibold text-slate-200">Security &amp; Data Isolation</div>
                <div className="text-[11px] text-slate-400">
                  All image matrix calculations execute inside your local browser WASM runtime. No raw images or customer data are dispatched to remote cloud servers.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
