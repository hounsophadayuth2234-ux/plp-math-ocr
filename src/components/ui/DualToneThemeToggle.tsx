"use client";

import React, { useState, useEffect } from "react";
import { Palette, Sparkles, Check, Sun, Moon } from "lucide-react";

export type DualToneThemeId =
  | "cyber-gold"
  | "sapphire-amber"
  | "emerald-gold"
  | "amethyst-rose"
  | "clean-dual-light";

export interface DualToneThemeInfo {
  id: DualToneThemeId;
  nameKhmer: string;
  nameEn: string;
  primaryTone: string;
  secondaryTone: string;
  badge: string;
  isLight?: boolean;
}

export const DUAL_TONE_THEMES: DualToneThemeInfo[] = [
  {
    id: "cyber-gold",
    nameKhmer: "ស៊ីបឺ ខៀវរន្ទះ & មាសរាជវង្ស",
    nameEn: "Electric Cyan & Royal Gold",
    primaryTone: "#00f0ff",
    secondaryTone: "#fbbf24",
    badge: "Default Dual-Tone",
  },
  {
    id: "sapphire-amber",
    nameKhmer: "ខៀវសមុទ្រ & អាំប៊ើរជ្រៅ",
    nameEn: "Deep Sapphire & Amber Orange",
    primaryTone: "#38bdf8",
    secondaryTone: "#f97316",
    badge: "Ocean Sunset",
  },
  {
    id: "emerald-gold",
    nameKhmer: "ត្បូងមរកត & មាសធម្មជាតិ",
    nameEn: "Matrix Emerald & Pure Gold",
    primaryTone: "#10b981",
    secondaryTone: "#f59e0b",
    badge: "Emerald Luxury",
  },
  {
    id: "amethyst-rose",
    nameKhmer: "ស្វាយអធ្រាត្រ & ផ្កាឈូកនីអុង",
    nameEn: "Synth Amethyst & Neon Rose",
    primaryTone: "#c084fc",
    secondaryTone: "#fb7185",
    badge: "Synthwave",
  },
  {
    id: "clean-dual-light",
    nameKhmer: "ពន្លឺថ្ងៃ & ស្ទូឌីយោពណ៌ស",
    nameEn: "Daylight Dual Studio",
    primaryTone: "#0284c7",
    secondaryTone: "#d97706",
    badge: "Daylight Studio",
    isLight: true,
  },
];

const STORAGE_KEY = "dyt_dual_theme";

export function applyDualToneTheme(themeId: DualToneThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", themeId);
  try {
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch {}
}

export function getSavedDualToneTheme(): DualToneThemeId {
  if (typeof window === "undefined") return "cyber-gold";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as DualToneThemeId;
    if (saved && DUAL_TONE_THEMES.some((t) => t.id === saved)) {
      return saved;
    }
  } catch {}
  return "cyber-gold";
}

interface DualToneThemeToggleProps {
  compact?: boolean;
}

export function DualToneThemeToggle({ compact = false }: DualToneThemeToggleProps) {
  const [activeTheme, setActiveTheme] = useState<DualToneThemeId>("cyber-gold");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const current = getSavedDualToneTheme();
    setActiveTheme(current);
    applyDualToneTheme(current);
  }, []);

  const handleSelect = (id: DualToneThemeId) => {
    setActiveTheme(id);
    applyDualToneTheme(id);
    setDropdownOpen(false);
  };

  const currentTheme = DUAL_TONE_THEMES.find((t) => t.id === activeTheme) || DUAL_TONE_THEMES[0];

  if (compact) {
    return (
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          aria-label="ប្តូរពណ៌ Dual-Tone Theme"
          title={`បច្ចុប្បន្ន៖ ${currentTheme.nameKhmer} (${currentTheme.nameEn})`}
          className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-sans font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 group"
        >
          {/* Dual-tone color indicator dots */}
          <div className="flex items-center -space-x-1">
            <span
              className="h-3 w-3 rounded-full border border-slate-900 shadow-sm"
              style={{ backgroundColor: currentTheme.primaryTone }}
            />
            <span
              className="h-3 w-3 rounded-full border border-slate-900 shadow-sm"
              style={{ backgroundColor: currentTheme.secondaryTone }}
            />
          </div>
          <span className="hidden lg:inline text-xs font-semibold text-slate-200">
            {currentTheme.nameKhmer.split("&")[0]?.trim() || "Dual-Tone"}
          </span>
          <Palette className="h-3.5 w-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
        </button>

        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl border border-slate-800 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-slate-800/80 mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span>ជ្រើសរើសពណ៌ប្រព័ន្ធ (Dual-Tone)</span>
                </div>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  5 Themes
                </span>
              </div>

              <div className="space-y-1">
                {DUAL_TONE_THEMES.map((theme) => {
                  const isSelected = activeTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleSelect(theme.id)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-xs transition-all ${
                        isSelected
                          ? "bg-slate-800/90 text-white shadow-inner border border-slate-700/80"
                          : "text-slate-300 hover:bg-slate-900 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center -space-x-1 shrink-0">
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-slate-950 shadow-sm"
                            style={{ backgroundColor: theme.primaryTone }}
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-slate-950 shadow-sm"
                            style={{ backgroundColor: theme.secondaryTone }}
                          />
                        </div>
                        <div className="truncate">
                          <div className="font-semibold text-slate-200 text-xs truncate">
                            {theme.nameKhmer}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {theme.nameEn}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {theme.isLight ? (
                          <Sun className="h-3 w-3 text-amber-400" />
                        ) : (
                          <Moon className="h-3 w-3 text-cyan-400" />
                        )}
                        {isSelected && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Expanded card view for SettingsModal or Profile Hub
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {DUAL_TONE_THEMES.map((theme) => {
          const isSelected = activeTheme === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleSelect(theme.id)}
              className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all text-left ${
                isSelected
                  ? "border-amber-400/60 bg-slate-900/90 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/30"
                  : "border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/80 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center p-1 shrink-0 shadow-inner"
                  style={{
                    background: `linear-gradient(135deg, ${theme.primaryTone}33, ${theme.secondaryTone}33)`,
                    border: `1px solid ${theme.primaryTone}66`,
                  }}
                >
                  <div className="flex items-center -space-x-1.5">
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-slate-950 shadow"
                      style={{ backgroundColor: theme.primaryTone }}
                    />
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-slate-950 shadow"
                      style={{ backgroundColor: theme.secondaryTone }}
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="font-semibold text-slate-100 text-xs truncate">
                    {theme.nameKhmer}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {theme.nameEn}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isSelected ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full">
                    <Check className="h-2.5 w-2.5" />
                    ជ្រើសរើស
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono">
                    {theme.badge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
