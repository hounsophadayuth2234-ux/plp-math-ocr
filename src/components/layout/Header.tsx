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
          className="rounded-lg border border-cyan-500/30 bg-slate-900/90 p-2 text-cyan-300 hover:bg-cyan-950 hover:text-white lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {activeTool && (
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-cyan-950/80 px-2.5 py-0.5 font-mono text-xs font-bold text-cyan-400 ring-1 ring-cyan-500/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]">
                MOD 0{activeTool.number}
              </span>
              <h1 className="text-sm font-bold text-white sm:text-base tracking-wide">
                {activeTool.title}
              </h1>
            </div>
            <p className="hidden text-xs text-slate-400 sm:block font-mono">
              // {activeTool.engine}
            </p>
          </div>
        )}
      </div>

      {/* Settings Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-mono font-semibold text-cyan-300 hover:bg-cyan-900/50 hover:text-white transition-all shadow-[0_0_12px_rgba(0,240,255,0.15)]"
        >
          <KeyRound className="h-3.5 w-3.5 text-cyan-400" />
          <span>API Keys</span>
        </button>
      </div>
    </header>
  );
}
