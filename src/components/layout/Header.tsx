"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, KeyRound, Shield, User, LogOut } from "lucide-react";
import { CORE_TOOLS } from "@/config/tools";
import { MotionSpeedControl } from "@/components/layout/MotionSpeedControl";

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
}

interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "USER";
}

export function Header({ onOpenSidebar, onOpenSettings }: HeaderProps) {
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

      {/* Motion Speed, User Info, Admin Link, Settings & Logout Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <MotionSpeedControl compact={true} />

        {/* User Badge */}
        {currentUser && (
          <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-1 text-xs">
            <User className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span className="text-slate-300 font-medium">{currentUser.displayName}</span>
            <span
              className={`rounded px-1.5 py-0.2 text-[10px] font-mono font-bold uppercase tracking-wider ${
                currentUser.role === "ADMIN"
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {currentUser.role}
            </span>
          </div>
        )}

        {/* Admin Panel Link for Admins */}
        {currentUser?.role === "ADMIN" && pathname !== "/admin" && (
          <Link
            href="/admin"
            data-testid="header-admin-link"
            className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-950/40 px-3 py-1.5 text-xs font-mono font-semibold text-indigo-300 hover:bg-indigo-900/50 hover:text-white transition-all shadow-[0_0_12px_rgba(99,102,241,0.2)] focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            <Shield className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
            <span className="hidden sm:inline">Admin Panel</span>
          </Link>
        )}

        <button
          type="button"
          data-testid="open-settings-modal-btn"
          onClick={onOpenSettings}
          aria-label="Open API Keys settings"
          title="Open API Keys settings"
          className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-mono font-semibold text-cyan-300 hover:bg-cyan-900/50 hover:text-white transition-all shadow-[0_0_12px_rgba(0,240,255,0.15)] focus:ring-2 focus:ring-cyan-400 focus:outline-none"
        >
          <KeyRound className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <span className="hidden sm:inline">API Keys</span>
        </button>

        <button
          type="button"
          data-testid="logout-gate-btn"
          onClick={handleLogout}
          aria-label="Logout and lock application"
          title="Logout and lock application"
          className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/30 px-2.5 py-1.5 text-xs font-mono font-semibold text-rose-300 hover:bg-rose-900/50 hover:text-white transition-all shadow-[0_0_12px_rgba(244,63,94,0.15)] focus:ring-2 focus:ring-rose-400 focus:outline-none"
        >
          <LogOut className="h-3 w-3" />
          <span className="hidden sm:inline">ចាកចេញ</span>
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}
