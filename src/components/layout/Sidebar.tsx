"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calculator,
  Eraser,
  Sparkles,
  ImagePlus,
  Code2,
  Brain,
  Cpu,
  Shield,
  X,
  ChevronRight,
  ChevronDown,
  Clock,
  Activity,
  History,
  Palette,
} from "lucide-react";
import { CORE_TOOLS, TEAM_MEMBERS, ToolModule } from "@/config/tools";

const ICON_MAP: Record<ToolModule["iconName"], React.ComponentType<{ className?: string }>> = {
  Calculator,
  Eraser,
  Sparkles,
  ImagePlus,
  Code2,
  Brain,
  Palette,
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [checkedTime, setCheckedTime] = useState<string>("Just now");

  React.useEffect(() => {
    setCheckedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }, []);

  React.useEffect(() => {
    let mounted = true;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.authenticated && data.user?.role === "ADMIN") {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [pathname]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const recentTools = [
    { name: "OCR to LaTeX", href: "/plp-math-content", icon: Calculator, color: "text-cyan-400" },
    { name: "Canvas Cutout", href: "/bg-remover", icon: Eraser, color: "text-emerald-400" },
    { name: "4x HD Upscale", href: "/image-upscaler", icon: Sparkles, color: "text-amber-400" },
    { name: "Khmer Math Solver", href: "/math-solver", icon: Brain, color: "text-violet-400" },
    { name: "Lesson & Visual Studio", href: "/lesson-studio", icon: Palette, color: "text-rose-400" },
  ];

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800 bg-slate-950/95 text-slate-200 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 shadow-xl ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5 bg-slate-950/40 backdrop-blur-sm">
          <Link href="/" className="flex items-center gap-3" onClick={onClose}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-violet-600 text-white shadow-md">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-white font-sans">
                  PLP Math Content
                </span>
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wider text-cyan-400 uppercase border border-cyan-500/30">
                  PLP
                </span>
              </div>
              <p className="font-mono text-[10px] font-semibold tracking-wider text-cyan-400/80 uppercase">
                DYT ECOSYSTEM
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Close navigation sidebar"
            title="Close navigation sidebar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation Content */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {/* Section 1: Dashboard Overview */}
          <div>
            <Link
              href="/"
              onClick={onClose}
              className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                pathname === "/"
                  ? "bg-indigo-600/20 text-white border border-indigo-500/40"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <LayoutDashboard
                  className={`h-4 w-4 ${
                    pathname === "/" ? "text-indigo-400" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span className="font-sans">ផ្ទាំងគ្រប់គ្រង (Dashboard)</span>
              </span>
              {pathname === "/" && <ChevronRight className="h-4 w-4 text-indigo-400" />}
            </Link>
          </div>

          {/* Section 2: Workspace Modules 01–05 */}
          <div>
            <div className="mb-2 px-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase font-sans">
                ម៉ូឌុលការងារ (Modules 01–05)
              </p>
            </div>
            <div className="space-y-1.5">
              {CORE_TOOLS.filter((tool) => !tool.disabled).map((tool) => {
                const Icon = ICON_MAP[tool.iconName];
                const isActive =
                  pathname === tool.href || pathname.startsWith(`${tool.href}/`);

                return (
                  <Link
                    key={tool.id}
                    href={tool.href}
                    onClick={onClose}
                    style={{
                      WebkitBackdropFilter: "blur(10px) saturate(140%)",
                      backdropFilter: "blur(10px) saturate(140%)",
                    }}
                    className={`group relative flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
                      isActive
                        ? "sidebar-module-glass is-active text-white border border-cyan-500/50 bg-cyan-950/30"
                        : "sidebar-module-glass text-slate-200 hover:text-white hover:bg-slate-900/60"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${
                          tool.accentColor
                        } text-white`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-mono ${
                              isActive ? "text-cyan-300 font-bold" : "text-slate-400 group-hover:text-cyan-300"
                            }`}
                          >
                            0{tool.number}
                          </span>
                          <p className="truncate font-medium font-sans text-xs">{tool.shortTitle}</p>
                        </div>
                        <p className="truncate text-[10px] text-slate-400">{tool.badge}</p>
                      </div>
                    </div>

                    {isActive && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400 animate-pulse" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Section 3: Recent Tools / Quick Access */}
          <div>
            <div className="mb-2 px-3">
              <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase font-sans flex items-center gap-1.5">
                <History className="h-3 w-3 text-slate-400" />
                <span>ឧបករណ៍ញឹកញាប់ (Recent Tools)</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 px-1">
              {recentTools.map((t) => {
                const ToolIcon = t.icon;
                return (
                  <Link
                    key={t.name}
                    href={t.href}
                    onClick={onClose}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-800/80 bg-slate-900/40 p-2 text-[11px] text-slate-300 hover:bg-slate-850 hover:text-white transition-colors"
                  >
                    <ToolIcon className={`h-3 w-3 ${t.color} shrink-0`} />
                    <span className="truncate">{t.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Section 4: Truthful System Status */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-sans font-medium text-[11px]">
                ប្រព័ន្ធស្នូលដំណើរការធម្មតា
              </span>
              <span className="flex items-center gap-1 text-emerald-400 font-medium font-mono text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Core Active
              </span>
            </div>
            <div className="text-[10px] text-amber-300/90 font-mono leading-tight">
              Module 01–04 Active • Module 05 Under Maintenance
            </div>
            <p className="text-[10px] text-slate-400 pt-0.5 flex items-center gap-1 font-mono">
              <Clock className="h-3 w-3 text-slate-400" />
              <span>Checked: {checkedTime}</span>
            </p>
          </div>
        </nav>

        {/* Collapsed-by-Default Diagnostics Drawer */}
        <div className="border-t border-slate-800 p-3 bg-slate-950/70">
          <button
            type="button"
            onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
            className="flex w-full items-center justify-between rounded-lg p-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-2 font-mono text-[11px]">
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              <span>ការវិភាគ (Diagnostics)</span>
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                diagnosticsOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {diagnosticsOpen && (
            <div className="mt-2.5 rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs space-y-2 font-mono">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Cluster:</span>
                <span className="text-cyan-300">DYT-ECOSYSTEM</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">WASM Runtime:</span>
                <span className="text-emerald-400">ONNX Ready</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Nodes (4):</span>
                <div className="flex -space-x-1.5">
                  {TEAM_MEMBERS.map((member) => (
                    <div
                      key={member.initials}
                      title={`${member.name} — ${member.role}`}
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${member.color} text-[9px] font-bold text-slate-950 ring-1 ring-slate-900`}
                    >
                      {member.initials}
                    </div>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <div className="pt-2 border-t border-slate-800">
                  <Link
                    href="/admin"
                    onClick={onClose}
                    className="flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                  >
                    <Shield className="h-3 w-3" />
                    <span>Admin Management Hub &rarr;</span>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
