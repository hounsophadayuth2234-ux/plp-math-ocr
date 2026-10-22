"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Volume2,
  VolumeX,
  Shield,
  Sliders,
  Cpu,
  Palette,
  Type,
  Globe,
  Play,
  Check,
} from "lucide-react";
import { cyberAudio, SOUND_PRESETS, SoundPreset } from "@/lib/cyber-audio";
import {
  STUDIO_FONTS,
  STUDIO_THEMES,
  StudioFont,
  StudioTheme,
} from "@/components/bg-remover/BgStudioNav";
import { StudioLocale, SUPPORTED_LOCALES } from "@/lib/i18n";

interface BgStudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioMuted: boolean;
  onToggleAudio: () => void;
  edgeQuality: "fast" | "balanced" | "quality" | "fine_details";
  onChangeEdgeQuality: (quality: "fast" | "balanced" | "fine_details") => void;
  activeFont?: StudioFont;
  onChangeFont?: (font: StudioFont) => void;
  activeStudioTheme?: StudioTheme;
  onChangeStudioTheme?: (theme: StudioTheme) => void;
  activeLocale?: StudioLocale;
  onChangeLocale?: (locale: StudioLocale) => void;
}

export function BgStudioSettingsModal({
  isOpen,
  onClose,
  audioMuted,
  onToggleAudio,
  edgeQuality,
  onChangeEdgeQuality,
  activeFont = "font-kantumruy",
  onChangeFont,
  activeStudioTheme = "cyber-dark",
  onChangeStudioTheme,
  activeLocale = "km",
  onChangeLocale,
}: BgStudioSettingsModalProps) {
  const [activePreset, setActivePreset] = useState<SoundPreset>(() => cyberAudio.getPreset());

  useEffect(() => {
    return cyberAudio.subscribe(() => {
      setActivePreset(cyberAudio.getPreset());
    });
  }, []);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: SoundPreset) => {
    cyberAudio.setPreset(preset, true);
    setActivePreset(preset);
  };

  const handlePreviewPreset = (preset: SoundPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    cyberAudio.previewPreset(preset);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-6 shadow-2xl text-slate-200 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h2 id="settings-dialog-title" className="text-base font-bold text-white font-sans">
                ការកំណត់ស្ទូឌីយោ (Studio Settings)
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                កំណត់ពុម្ពអក្សរ ពណ៌ផ្ទៃ សំឡេង និងគុណភាពកាត់គែម
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
          {/* 1. Workspace Theme Palette (ពណ៌អេក្រង់ការងារ) */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-sky-400" />
              <div>
                <div className="font-semibold text-slate-200">ពណ៌អេក្រង់ការងារ (Workspace Theme)</div>
                <div className="text-[11px] text-slate-400">
                  ប្ដូររចនាប័ទ្មពណ៌នៃផ្ទៃ Dashboard &amp; Workstation
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {STUDIO_THEMES.map((t) => {
                const isSelected = activeStudioTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onChangeStudioTheme?.(t.id);
                      cyberAudio.playClick();
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-sky-500/70 bg-sky-950/70 text-white ring-1 ring-sky-400/40"
                        : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded border border-white/30 shrink-0 shadow-sm"
                      style={{
                        backgroundColor: t.bgColor,
                        borderColor: t.accentColor,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[11px] truncate flex items-center justify-between">
                        <span>{t.nameEn}</span>
                        {isSelected && <Check className="h-3 w-3 text-sky-400 shrink-0" />}
                      </div>
                      <div className="text-[9.5px] text-slate-400 truncate">{t.nameKhmer}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Khmer Typography & Fonts (ពុម្ពអក្សរខ្មែរ) */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-amber-400" />
              <div>
                <div className="font-semibold text-slate-200">ពុម្ពអក្សរខ្មែរ (Khmer Typography)</div>
                <div className="text-[11px] text-slate-400">
                  ជ្រើសរើសពុម្ពអក្សរដែលងាយស្រួលអានបំផុតសម្រាប់អ្នក
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {STUDIO_FONTS.map((f) => {
                const isSelected = activeFont === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onChangeFont?.(f.id);
                      cyberAudio.playClick();
                    }}
                    className={`flex items-start justify-between p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-amber-500/70 bg-amber-950/60 text-white ring-1 ring-amber-400/40"
                        : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-[11px] text-amber-200">{f.nameKhmer}</div>
                      <div className="text-[9.5px] text-slate-400">{f.nameEn}</div>
                      <div className={`text-[11px] text-slate-200 mt-1 truncate ${f.id}`}>
                        {f.sample}
                      </div>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Audio Synthesizer & Sound Themes (សំឡេងប្រព័ន្ធ) */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {audioMuted ? (
                  <VolumeX className="h-4 w-4 text-slate-400" />
                ) : (
                  <Volume2 className="h-4 w-4 text-cyan-400" />
                )}
                <div>
                  <div className="font-semibold text-slate-200">សំឡេងប្រព័ន្ធ (Audio Feedback)</div>
                  <div className="text-[11px] text-slate-400">
                    សំឡេងចុចប៊ូតុង និងសំឡេងជូនដំណឹងពេលកាត់រូបភាពរួចរាល់
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleAudio}
                className={`min-h-[32px] px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
                  audioMuted
                    ? "border-slate-700 bg-slate-800 text-slate-300"
                    : "border-cyan-500/50 bg-cyan-950/80 text-cyan-300"
                }`}
              >
                {audioMuted ? "បិទសំឡេង (Muted)" : "បើកសំឡេង (Active)"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {SOUND_PRESETS.map((p) => {
                const isSelected = activePreset === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPreset(p.id)}
                    className={`flex items-center justify-between p-2 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? "border-cyan-500/60 bg-cyan-950/70 text-white ring-1 ring-cyan-400/30"
                        : "border-slate-800 bg-slate-900/50 text-slate-300 hover:bg-slate-900 hover:border-slate-700"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        {isSelected && <Check className="h-3 w-3 text-cyan-400 shrink-0" />}
                        <span className="font-bold text-[11px] truncate">{p.nameEn}</span>
                      </div>
                      <div className="text-[9.5px] text-slate-400 truncate">{p.nameKhmer}</div>
                    </div>

                    {p.id !== "mute" && (
                      <button
                        type="button"
                        onClick={(e) => handlePreviewPreset(p.id, e)}
                        className="p-1.5 rounded-md hover:bg-cyan-900/60 text-cyan-400 transition-colors shrink-0"
                        title={`Preview ${p.nameEn}`}
                        aria-label={`Preview ${p.nameEn}`}
                      >
                        <Play className="h-3 w-3 fill-current" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Language Selector (ភាសា) */}
          {onChangeLocale && (
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-400" />
                <div>
                  <div className="font-semibold text-slate-200">ភាសាប្រព័ន្ធ (System Language)</div>
                  <div className="text-[11px] text-slate-400">ជ្រើសរើសភាសាសម្រាប់ការបង្ហាញ</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {SUPPORTED_LOCALES.map((loc) => {
                  const isSelected = activeLocale === loc.code;
                  return (
                    <button
                      key={loc.code}
                      type="button"
                      onClick={() => {
                        onChangeLocale(loc.code);
                        cyberAudio.playClick();
                      }}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                        isSelected
                          ? "border-emerald-500/70 bg-emerald-950/70 text-white font-bold ring-1 ring-emerald-400/30"
                          : "border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      <span className="text-base">{loc.flag}</span>
                      <div className="min-w-0 truncate">
                        <div className="text-[11px] truncate">{loc.nativeName}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Alpha Matting Refinement Quality */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-purple-400" />
              <div>
                <div className="font-semibold text-slate-200">គុណភាពកាត់គែម (Alpha Matting Quality)</div>
                <div className="text-[11px] text-slate-400">
                  កម្រិតសម្រួលគែមសក់ និងព្រំដែននៃរូបភាព
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onChangeEdgeQuality("fast")}
                className={`min-h-[40px] flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                  edgeQuality === "fast"
                    ? "border-cyan-400 bg-cyan-950/60 text-white font-semibold ring-1 ring-cyan-400/30"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                <span className="text-[11px]">ល្បឿនលឿន (Fast)</span>
                <span className="text-[9px] text-slate-500">&lt; 10s</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeEdgeQuality("balanced")}
                className={`min-h-[40px] flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                  edgeQuality === "balanced"
                    ? "border-purple-400 bg-purple-950/60 text-white font-semibold ring-1 ring-purple-400/30"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                <span className="text-[11px]">ស្តង់ដារ (Balanced)</span>
                <span className="text-[9px] text-purple-400/80">Default Pro</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeEdgeQuality("fine_details")}
                className={`min-h-[40px] flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                  edgeQuality === "fine_details" || edgeQuality === "quality"
                    ? "border-emerald-400 bg-emerald-950/60 text-white font-semibold ring-1 ring-emerald-400/30"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                <span className="text-[11px]">សក់ល្អិត (Fine Hair)</span>
                <span className="text-[9px] text-emerald-400/80">Max Detail</span>
              </button>
            </div>
          </div>

          {/* 6. Security & Data Isolation */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <div>
                <div className="font-semibold text-slate-200">សុវត្ថិភាពទិន្នន័យ (100% On-Device Privacy)</div>
                <div className="text-[10.5px] text-slate-400 leading-relaxed">
                  រូបភាពដំណើរការក្នុង Browser របស់អ្នកផ្ទាល់ (WASM / WebGPU)។ គ្មានទិន្នន័យត្រូវបានបញ្ជូនទៅម៉ាស៊ីនមេខាងក្រៅឡើយ។
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
            className="rounded-lg bg-cyan-600 px-5 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition-colors shadow-sm cursor-pointer"
          >
            រួចរាល់ (Done)
          </button>
        </div>
      </div>
    </div>
  );
}
