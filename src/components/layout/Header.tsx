"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Settings, HelpCircle, Shield, User, LogOut } from "lucide-react";
import { CORE_TOOLS } from "@/config/tools";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
  onOpenHelp?: () => void;
}

interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "USER";
}

export function Header({ onOpenSidebar, onOpenSettings, onOpenHelp }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.authenticated && data.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [pathname]);

  const activeTool = CORE_TOOLS.find(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`)
  );

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await fetch("/api/auth/gate", { method: "DELETE" });
    } finally {
      router.push("/login?logged_out=1");
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur-md sm:px-6 lg:px-8 shadow-md">
      {/* ── Left: Brand & Mobile Menu ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="rounded-xl border border-slate-800 bg-slate-900/90 p-2 text-slate-300 hover:bg-slate-800 hover:text-white lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          aria-label="Open navigation menu"
          title="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        {pathname === "/admin" ? (
          <div>
            <h1 className="text-sm font-bold text-white sm:text-base tracking-wide flex items-center gap-2">
              <Shield className="h-4 w-4 text-cyan-400" />
              <span>Admin Management Hub</span>
            </h1>
            <p className="hidden text-xs text-slate-400 sm:block">
              User accounts, access controls, and security audit telemetry
            </p>
          </div>
        ) : activeTool ? (
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
              DYT ECOSYSTEM
            </h1>
            <p className="hidden text-xs text-slate-400 sm:block">
              Advanced AI Workspace Platform
            </p>
          </div>
        )}
      </div>

      {/* ── Right: De-cluttered Top Bar (Brand, Language, Help, Settings, User/Logout) ── */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* 1. Language Selector */}
        <LanguageSwitcher />

        {/* 2. Help / Guide trigger */}
        {onOpenHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            aria-label="ជំនួយ និងការណែនាំ (Help & Guide)"
            title="ជំនួយ និងការណែនាំ (Help & Guide)"
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-sans font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <HelpCircle className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
            <span className="hidden md:inline">ជំនួយ</span>
            <span className="hidden md:inline text-slate-400">(Help)</span>
          </button>
        )}

        {/* 3. Settings button */}
        <button
          type="button"
          data-testid="open-settings-modal-btn"
          onClick={onOpenSettings}
          aria-label="ការកំណត់ (Settings)"
          title="ការកំណត់ (Settings)"
          className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-sans font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <Settings className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <span className="hidden sm:inline">ការកំណត់</span>
          <span className="hidden sm:inline text-slate-400">(Settings)</span>
        </button>

        {/* 4. User Profile */}
        {currentUser && (
          <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-xs">
            <User className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span className="text-slate-300 font-medium">{currentUser.displayName || currentUser.username}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${
                currentUser.role === "ADMIN"
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {currentUser.role}
            </span>
          </div>
        )}

        {/* 5. Logout */}
        <button
          type="button"
          data-testid="logout-gate-btn"
          onClick={handleLogout}
          aria-label="Logout and lock application"
          title="Logout and lock application"
          className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/30 px-2.5 py-1.5 text-xs font-sans font-medium text-rose-300 hover:bg-rose-900/50 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">ចាកចេញ</span>
          <span className="text-[11px] text-rose-400/80">(Logout)</span>
        </button>
      </div>
    </header>
  );
}
