"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck, Sparkles, KeyRound } from "lucide-react";
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
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-950/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:bg-slate-800 hover:text-white lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            {activeTool ? (
              <>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-400">
                  Module 0{activeTool.number}
                </span>
                <h1 className="text-sm font-semibold text-white sm:text-base">
                  {activeTool.title}
                </h1>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-indigo-400" />
                <h1 className="text-sm font-semibold text-white sm:text-base">
                  All-in-One Internal AI Dashboard
                </h1>
              </>
            )}
          </div>
          <p className="hidden text-xs text-slate-400 sm:block">
            {activeTool
              ? `Powered by ${activeTool.engine}`
              : "Unified multi-tool workspace engineered for your 4-person team"}
          </p>
        </div>
      </div>

      {/* Right Status Pills & Settings Button */}
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300 md:flex">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Interactive Demo / Live API Gateway</span>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 hover:text-white transition-colors"
        >
          <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
          <span>API Keys</span>
        </button>
      </div>
    </header>
  );
}
