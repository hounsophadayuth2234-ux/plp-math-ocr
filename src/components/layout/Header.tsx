"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Menu, KeyRound } from "lucide-react";
import { CORE_TOOLS } from "@/config/tools";

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
}

export function Header({ onOpenSidebar, onOpenSettings }: HeaderProps) {
  const pathname = usePathname();
  const activeTool = CORE_TOOLS.find(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`)
  );

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-cyan-500/20 bg-slate-950/90 px-4 backdrop-blur-md sm:px-6 lg:px-8 shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="rounded-lg border border-cyan-500/30 bg-slate-900/90 p-2 text-cyan-300 hover:bg-cyan-950 hover:text-white lg:hidden focus:ring-2 focus:ring-cyan-400 focus:outline-none"
          aria-label="Open navigation menu"
          title="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        {activeTool ? (
          <div>
            <h1 className="text-sm font-bold text-white sm:text-base tracking-wide">
              {activeTool.title}
            </h1>
            <p className="hidden text-xs text-slate-400 sm:block">
              {activeTool.id === "plp-math-content"
                ? "Convert math images and text into LaTeX, Jodit HTML, and MathML"
                : activeTool.description.slice(0, 60)}
            </p>
          </div>
        ) : (
          <div>
            <h1 className="text-sm font-bold text-white sm:text-base tracking-wide">
              PLP Math Content
            </h1>
            <p className="hidden text-xs text-slate-400 sm:block">
              Convert math images and text into LaTeX, Jodit HTML, and MathML
            </p>
          </div>
        )}
      </div>

      {/* Settings Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="open-settings-modal-btn"
          onClick={onOpenSettings}
          aria-label="Open API Keys settings"
          title="Open API Keys settings"
          className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-mono font-semibold text-cyan-300 hover:bg-cyan-900/50 hover:text-white transition-all shadow-[0_0_12px_rgba(0,240,255,0.15)] focus:ring-2 focus:ring-cyan-400 focus:outline-none"
        >
          <KeyRound className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <span>API Keys</span>
        </button>
      </div>
    </header>
  );
}
