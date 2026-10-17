"use client";

import React from "react";
import { X, HelpCircle, Check, Sparkles, Keyboard, MousePointerClick, ShieldCheck } from "lucide-react";

interface BgStudioHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BgStudioHelpModal({ isOpen, onClose }: BgStudioHelpModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl text-slate-200 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div>
              <h2 id="help-dialog-title" className="text-base font-bold text-white font-sans">
                AI Background Studio Guide
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                Best practices for extracting people and Khmer poster typography
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-white transition-colors"
            aria-label="Close guide dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 text-xs font-sans">
          {/* Quick 4-Step Process */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono">
              // Step-by-Step Poster Extraction
            </h3>
            <div className="space-y-2.5 text-slate-300">
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-950 border border-cyan-500/50 text-[10px] font-bold text-cyan-300">
                  1
                </span>
                <div>
                  <div className="font-semibold text-white">Upload Poster or Photo</div>
                  <div className="text-[11px] text-slate-400">
                    Drag and drop your poster, flyer, or photo into the Upload Zone (PNG, JPG, WEBP).
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-950 border border-cyan-500/50 text-[10px] font-bold text-cyan-300">
                  2
                </span>
                <div>
                  <div className="font-semibold text-white">Select "Person + Text Only"</div>
                  <div className="text-[11px] text-slate-400">
                    Ensures dual-channel segmentation: real humans and printed typography are isolated, while background graphics and borders are dropped.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-950 border border-cyan-500/50 text-[10px] font-bold text-cyan-300">
                  3
                </span>
                <div>
                  <div className="font-semibold text-white">Inspect 4 Mask Channels</div>
                  <div className="text-[11px] text-slate-400">
                    Switch between <strong>Person Mask</strong>, <strong>Text Mask</strong>, <strong>Combined Keep Mask</strong>, and <strong>Cutout Preview</strong> to verify zero missing strokes.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-950 border border-cyan-500/50 text-[10px] font-bold text-cyan-300">
                  4
                </span>
                <div>
                  <div className="font-semibold text-white">Touch-up Missed Strokes &amp; Export</div>
                  <div className="text-[11px] text-slate-400">
                    If tiny Khmer diacritics (ស្រៈ, វណ្ណយុត្តិ) were skipped, paint them back with the <strong>Keep Brush</strong>. Export a crisp transparent PNG without color contamination.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-slate-200">
              <Keyboard className="h-4 w-4 text-amber-400" />
              <span className="font-semibold text-xs">Keyboard Shortcuts &amp; Canvas Controls</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center justify-between rounded-lg bg-slate-950/60 p-2 border border-slate-800">
                <span className="text-slate-400">Undo Stroke</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                  Ctrl + Z
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-950/60 p-2 border border-slate-800">
                <span className="text-slate-400">Redo Stroke</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                  Ctrl + Y
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-950/60 p-2 border border-slate-800">
                <span className="text-slate-400">Brush Size</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                  [ and ]
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-950/60 p-2 border border-slate-800">
                <span className="text-slate-400">Pan Canvas</span>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                  Space + Drag
                </kbd>
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
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
