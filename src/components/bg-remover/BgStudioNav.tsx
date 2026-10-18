"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Volume2,
  VolumeX,
  HelpCircle,
  Settings,
  ShieldCheck,
  Cpu,
  Type,
  Palette,
  Play,
  Check,
  ChevronDown,
  Globe,
} from "lucide-react";
import { cyberAudio, SOUND_PRESETS, SoundPreset } from "@/lib/cyber-audio";
import { StudioLocale, SUPPORTED_LOCALES } from "@/lib/i18n";

export type StudioFont =
  | "font-kantumruy"
  | "font-battambang"
  | "font-hanuman"
  | "font-noto-khmer"
  | "font-mono-tech";

export interface StudioFontInfo {
  id: StudioFont;
  nameKhmer: string;
  nameEn: string;
  sample: string;
}

export const STUDIO_FONTS: StudioFontInfo[] = [
  {
    id: "font-kantumruy",
    nameKhmer: "កន្ទុំរុយ ប្រូ (Kantumruy Pro)",
    nameEn: "Modern Sans",
    sample: "អក្សរខ្មែរស្អាតឥតខ្ចោះ 123",
  },
  {
    id: "font-battambang",
    nameKhmer: "បាត់ដំបង (Battambang)",
    nameEn: "Classic Khmer",
    sample: "អក្សរខ្មែរបុរាណ 123",
  },
  {
    id: "font-hanuman",
    nameKhmer: "ហនុមាន (Hanuman)",
    nameEn: "Editorial Serif",
    sample: "សៀវភៅនិងអត្ថបទ 123",
  },
  {
    id: "font-noto-khmer",
    nameKhmer: "ណូតូ សាន (Noto Sans Khmer)",
    nameEn: "Clean Google Sans",
    sample: "រាងអក្សរច្បាស់ 123",
  },
  {
    id: "font-mono-tech",
    nameKhmer: "ម៉ូណូស្ពេស (Cyber Monospace)",
    nameEn: "Cyber / Tech",
    sample: "SYSTEM_CODE_123",
  },
];

export type StudioTheme =
  | "cyber-dark"
  | "pitch-black"
  | "deep-emerald"
  | "midnight-purple"
  | "ocean-blue"
  | "clean-light";

export interface StudioThemeInfo {
  id: StudioTheme;
  nameKhmer: string;
  nameEn: string;
  bgColor: string;
  accentColor: string;
}

export const STUDIO_THEMES: StudioThemeInfo[] = [
  {
    id: "cyber-dark",
    nameKhmer: "ស៊ីបឺ ងងឹត (Default)",
    nameEn: "Cyber Dark",
    bgColor: "#030712",
    accentColor: "#00f0ff",
  },
  {
    id: "pitch-black",
    nameKhmer: "ខ្មៅសុទ្ធ (Pure OLED)",
    nameEn: "Pure Pitch Black",
    bgColor: "#000000",
    accentColor: "#10b981",
  },
  {
    id: "deep-emerald",
    nameKhmer: "ត្បូងមរកត (Matrix)",
    nameEn: "Deep Emerald",
    bgColor: "#021810",
    accentColor: "#10b981",
  },
  {
    id: "midnight-purple",
    nameKhmer: "ពណ៌ស្វាយអធ្រាត្រ (Synthwave)",
    nameEn: "Midnight Purple",
    bgColor: "#0c0418",
    accentColor: "#c084fc",
  },
  {
    id: "ocean-blue",
    nameKhmer: "ខៀវសមុទ្រជ្រៅ (Deep Tech)",
    nameEn: "Ocean Blue",
    bgColor: "#021226",
    accentColor: "#38bdf8",
  },
  {
    id: "clean-light",
    nameKhmer: "ស្ទូឌីយោពណ៌ស (Daylight Studio)",
    nameEn: "Clean Light Studio",
    bgColor: "#f8fafc",
    accentColor: "#0284c7",
  },
];

interface BgStudioNavProps {
  theme: "dark" | "light" | "system";
  onToggleTheme: () => void;
  audioMuted: boolean;
  onToggleAudio: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  isProcessing?: boolean;
  activeFont?: StudioFont;
  onChangeFont?: (font: StudioFont) => void;
  activeStudioTheme?: StudioTheme;
  onChangeStudioTheme?: (theme: StudioTheme) => void;
  activeLocale?: StudioLocale;
  onChangeLocale?: (locale: StudioLocale) => void;
}

export function BgStudioNav({
  theme,
  onToggleTheme,
  audioMuted,
  onToggleAudio,
  onOpenSettings,
  onOpenHelp,
  isProcessing,
  activeFont = "font-kantumruy",
  onChangeFont,
  activeStudioTheme = "cyber-dark",
  onChangeStudioTheme,
  activeLocale = "km",
  onChangeLocale,
}: BgStudioNavProps) {
  const [activePreset, setActivePreset] = useState<SoundPreset>(() => cyberAudio.getPreset());
  const [openDropdown, setOpenDropdown] = useState<"sound" | "font" | "theme" | "lang" | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return cyberAudio.subscribe(() => {
      setActivePreset(cyberAudio.getPreset());
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectPreset = (preset: SoundPreset) => {
    cyberAudio.setPreset(preset, true);
    setActivePreset(preset);
  };

  const handlePreviewPreset = (preset: SoundPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    cyberAudio.previewPreset(preset);
  };

  const currentPresetInfo = SOUND_PRESETS.find((p) => p.id === activePreset) || SOUND_PRESETS[0];
  const currentFontInfo = STUDIO_FONTS.find((f) => f.id === activeFont) || STUDIO_FONTS[0];
  const currentThemeInfo = STUDIO_THEMES.find((t) => t.id === activeStudioTheme) || STUDIO_THEMES[0];
  const currentLocaleInfo = SUPPORTED_LOCALES.find((l) => l.code === (activeLocale || "km")) || SUPPORTED_LOCALES[0];

  return (
    <div
      ref={containerRef}
      className="relative overflow-visible border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950 px-4 py-2.5 shadow-lg font-mono z-30"
    >
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
        <div className="hidden lg:flex items-center gap-2 border border-slate-800 bg-slate-950/80 px-3 py-1 text-[10px]">
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
          {/* 1. Multi-Sound Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === "sound" ? null : "sound")}
              className={`min-h-[38px] flex items-center gap-1.5 border px-2.5 py-1 text-xs transition-all cursor-pointer ${
                activePreset === "mute" || audioMuted
                  ? "border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200"
                  : "border-cyan-500/50 bg-cyan-950/70 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
              }`}
              title="Select Sound Theme Preset"
              aria-label="Sound theme selector"
            >
              {activePreset === "mute" || audioMuted ? (
                <VolumeX className="h-4 w-4 shrink-0" />
              ) : (
                <Volume2 className="h-4 w-4 shrink-0" />
              )}
              <span className="hidden sm:inline font-mono text-[10px] font-bold">
                {audioMuted ? "MUTED" : currentPresetInfo.nameEn}
              </span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {openDropdown === "sound" && (
              <div className="absolute left-0 top-full mt-1.5 w-64 rounded-none border border-cyan-500/50 bg-[#030712] p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5 text-[10px] text-slate-400">
                  <span className="font-bold text-cyan-400 uppercase tracking-wider">
                    {"//"} SOUND THEMES (សំឡេង)
                  </span>
                  <button
                    type="button"
                    data-testid="audio-toggle-btn"
                    onClick={onToggleAudio}
                    className="text-[9px] text-slate-300 hover:text-white underline cursor-pointer"
                  >
                    {audioMuted ? "Unmute" : "Mute All"}
                  </button>
                </div>

                <div className="space-y-1">
                  {SOUND_PRESETS.map((p) => {
                    const isSelected = activePreset === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPreset(p.id)}
                        className={`flex items-center justify-between p-1.5 text-xs transition-colors cursor-pointer border ${
                          isSelected
                            ? "border-cyan-500/60 bg-cyan-950/70 text-white"
                            : "border-transparent bg-slate-900/40 text-slate-300 hover:bg-slate-900 hover:border-slate-700"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            {isSelected && <Check className="h-3 w-3 text-cyan-400 shrink-0" />}
                            <span className="font-bold text-[11px] truncate">{p.nameEn}</span>
                          </div>
                          <div className="text-[9px] text-slate-400 truncate">{p.nameKhmer}</div>
                        </div>

                        {p.id !== "mute" && (
                          <button
                            type="button"
                            onClick={(e) => handlePreviewPreset(p.id, e)}
                            className="p-1 rounded hover:bg-cyan-900/40 text-cyan-400 transition-colors shrink-0"
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
            )}
          </div>

          {/* 2. Font Selector (ប្តូរពុម្ពអក្សរ) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === "font" ? null : "font")}
              className="min-h-[38px] flex items-center gap-1.5 border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-white transition-colors cursor-pointer"
              title="Change Khmer & UI Font (ប្តូរពុម្ពអក្សរ)"
              aria-label="Font switcher"
            >
              <Type className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="hidden sm:inline font-mono text-[10px] font-bold">
                {currentFontInfo.nameEn}
              </span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {openDropdown === "font" && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-64 rounded-none border border-amber-500/50 bg-[#030712] p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="border-b border-slate-800 pb-1.5 mb-1.5 text-[10px] text-slate-400">
                  <span className="font-bold text-amber-400 uppercase tracking-wider">
                    {"//"} TYPOGRAPHY (ប្តូរពុម្ពអក្សរ)
                  </span>
                </div>

                <div className="space-y-1">
                  {STUDIO_FONTS.map((f) => {
                    const isSelected = activeFont === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => {
                          onChangeFont?.(f.id);
                          cyberAudio.playClick();
                          setOpenDropdown(null);
                        }}
                        className={`p-1.5 text-xs transition-colors cursor-pointer border ${
                          isSelected
                            ? "border-amber-500/60 bg-amber-950/60 text-white"
                            : "border-transparent bg-slate-900/40 text-slate-300 hover:bg-slate-900 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px]">{f.nameKhmer}</span>
                          {isSelected && <Check className="h-3 w-3 text-amber-400" />}
                        </div>
                        <div className={`text-[11px] text-slate-300 mt-0.5 truncate ${f.id}`}>
                          {f.sample}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 3. Theme / Screen Color Switcher (ប្តូរពណ៌អេក្រង់) */}
          <div className="relative">
            <button
              type="button"
              data-testid="theme-toggle-btn"
              onClick={() => setOpenDropdown(openDropdown === "theme" ? null : "theme")}
              className="min-h-[38px] flex items-center gap-1.5 border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-white transition-colors cursor-pointer"
              title="Theme Color Palette (ប្តូរពណ៌អេក្រង់)"
              aria-label="Theme color switcher"
            >
              <Palette className="h-4 w-4 text-sky-400 shrink-0" />
              <span
                className="h-2 w-2 rounded-full shrink-0 border border-white/40"
                style={{ backgroundColor: currentThemeInfo.accentColor }}
              />
              <span className="hidden sm:inline font-mono text-[10px] font-bold">
                {currentThemeInfo.nameEn}
              </span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {openDropdown === "theme" && (
              <div className="absolute right-0 top-full mt-1.5 w-64 rounded-none border border-sky-500/50 bg-[#030712] p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5 text-[10px] text-slate-400">
                  <span className="font-bold text-sky-400 uppercase tracking-wider">
                    {"//"} WORKSPACE COLOR (ប្តូរពណ៌អេក្រង់)
                  </span>
                  <button
                    type="button"
                    onClick={onToggleTheme}
                    className="text-[9px] text-slate-300 hover:text-white underline cursor-pointer"
                  >
                    {theme === "light" ? "Dark Mode" : "Light Mode"}
                  </button>
                </div>

                <div className="space-y-1">
                  {STUDIO_THEMES.map((t) => {
                    const isSelected = activeStudioTheme === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          onChangeStudioTheme?.(t.id);
                          cyberAudio.playClick();
                          setOpenDropdown(null);
                        }}
                        className={`flex items-center justify-between p-1.5 text-xs transition-colors cursor-pointer border ${
                          isSelected
                            ? "border-sky-500/60 bg-sky-950/60 text-white"
                            : "border-transparent bg-slate-900/40 text-slate-300 hover:bg-slate-900 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-3.5 w-3.5 rounded border border-white/30 shrink-0 shadow-sm"
                            style={{
                              backgroundColor: t.bgColor,
                              borderColor: t.accentColor,
                            }}
                          />
                          <div className="truncate">
                            <div className="font-bold text-[11px] truncate">{t.nameEn}</div>
                            <div className="text-[9px] text-slate-400 truncate">{t.nameKhmer}</div>
                          </div>
                        </div>
                        {isSelected && <Check className="h-3 w-3 text-sky-400 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4. Language Selector */}
          <div className="relative">
            <button
              type="button"
              data-testid="language-selector-btn"
              onClick={() => setOpenDropdown(openDropdown === "lang" ? null : "lang")}
              className="min-h-[38px] flex items-center gap-1.5 border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300 hover:border-emerald-500/40 hover:text-white transition-colors cursor-pointer"
              title="Change Language (ប្តូរភាសា)"
              aria-label="Language selector"
            >
              <Globe className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline font-mono text-[10px] font-bold">
                {currentLocaleInfo.flag} {currentLocaleInfo.nativeName}
              </span>
              <span className="sm:hidden text-xs">
                {currentLocaleInfo.flag}
              </span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {openDropdown === "lang" && (
              <div className="absolute right-0 top-full mt-1.5 w-60 rounded-none border border-emerald-500/50 bg-[#030712] p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="border-b border-slate-800 pb-1.5 mb-1.5 text-[10px] text-slate-400">
                  <span className="font-bold text-emerald-400 uppercase tracking-wider">
                    {"//"} LANGUAGE (ជ្រើសរើសភាសា)
                  </span>
                </div>

                <div className="space-y-1">
                  {SUPPORTED_LOCALES.map((loc) => {
                    const isSelected = (activeLocale || "km") === loc.code;
                    return (
                      <div
                        key={loc.code}
                        onClick={() => {
                          onChangeLocale?.(loc.code);
                          cyberAudio.playClick();
                          setOpenDropdown(null);
                        }}
                        className={`flex items-center justify-between p-1.5 text-xs transition-colors cursor-pointer border ${
                          isSelected
                            ? "border-emerald-500/60 bg-emerald-950/60 text-white font-bold"
                            : "border-transparent bg-slate-900/40 text-slate-300 hover:bg-slate-900 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-sm">{loc.flag}</span>
                          <span className="text-[11px] font-medium">{loc.nativeName}</span>
                          <span className="text-[9.5px] text-slate-400">({loc.englishName})</span>
                        </div>
                        {isSelected && <Check className="h-3 w-3 text-emerald-400 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 5. Guide & Shortcuts (?) */}
          <button
            type="button"
            data-testid="help-modal-btn"
            onClick={onOpenHelp}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors cursor-pointer"
            title="Workstation Quick Guide & Shortcuts (?)"
            aria-label="Open Guide and Shortcuts"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* 5. Preferences / Calibration */}
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
