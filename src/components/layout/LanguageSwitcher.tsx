"use client";

import React, { useState, useEffect } from "react";
import { Globe, Check } from "lucide-react";
import { StudioLocale, getSavedLocale, saveLocale } from "@/lib/i18n";

export function LanguageSwitcher() {
  const [currentLocale, setCurrentLocale] = useState<StudioLocale>(() => {
    if (typeof window !== "undefined") {
      return getSavedLocale();
    }
    return "km";
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleLocaleChange = () => {
      setCurrentLocale(getSavedLocale());
    };
    window.addEventListener("locale_changed", handleLocaleChange);
    return () => window.removeEventListener("locale_changed", handleLocaleChange);
  }, []);

  const handleSelect = (locale: StudioLocale) => {
    saveLocale(locale);
    setCurrentLocale(locale);
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent("locale_changed", { detail: { locale } }));
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="ជ្រើសរើសភាសា (Change Language)"
        className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        <Globe className="h-3.5 w-3.5 text-cyan-400" />
        <span className="font-sans font-semibold">
          {currentLocale === "km" ? "ខ្មែរ" : "English"}
        </span>
        <span className="text-[10px] uppercase font-mono text-slate-400">
          {currentLocale === "km" ? "KM" : "EN"}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-0 mt-1.5 w-40 origin-top-right rounded-xl border border-slate-800 bg-slate-950 p-1.5 shadow-xl shadow-black/80 z-40 focus:outline-none"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => handleSelect("km")}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                currentLocale === "km"
                  ? "bg-cyan-950/60 text-cyan-300 font-semibold"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2">
                <span>🇰🇭</span>
                <span className="font-sans">ខ្មែរ (Khmer)</span>
              </span>
              {currentLocale === "km" && <Check className="h-3.5 w-3.5 text-cyan-400" />}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleSelect("en")}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                currentLocale === "en"
                  ? "bg-cyan-950/60 text-cyan-300 font-semibold"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2">
                <span>🇺🇸</span>
                <span className="font-sans">English</span>
              </span>
              {currentLocale === "en" && <Check className="h-3.5 w-3.5 text-cyan-400" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
