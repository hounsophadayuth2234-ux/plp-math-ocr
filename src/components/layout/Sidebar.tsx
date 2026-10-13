"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calculator,
  Eraser,
  Sparkles,
  ImagePlus,
  Code2,
  Cpu,
  Users,
  X,
  ChevronRight,
} from "lucide-react";
import { CORE_TOOLS, TEAM_MEMBERS, ToolModule } from "@/config/tools";

const ICON_MAP: Record<ToolModule["iconName"], React.ComponentType<{ className?: string }>> = {
  Calculator,
  Eraser,
  Sparkles,
  ImagePlus,
  Code2,
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

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
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-cyan-500/20 bg-slate-950 text-slate-200 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 shadow-[4px_0_30px_rgba(0,0,0,0.7)] ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-cyan-500/20 px-5 bg-slate-950/90">
          <Link href="/" className="flex items-center gap-3" onClick={onClose}>
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-violet-600 text-white shadow-[0_0_15px_rgba(0,240,255,0.4)]">
              <Cpu className="h-5 w-5" />
              <div className="absolute -inset-0.5 rounded-xl border border-cyan-300/40 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-white">
                  PLP math content
                </span>
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wider text-cyan-400 uppercase ring-1 ring-cyan-500/40 shadow-[0_0_6px_rgba(0,240,255,0.2)]">
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
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Close navigation sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {/* Overview Section */}
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              Workspace
            </p>
            <Link
              href="/"
              onClick={onClose}
              className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                pathname === "/"
                  ? "bg-indigo-600/15 text-white ring-1 ring-indigo-500/40"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-3">
                <LayoutDashboard
                  className={`h-4 w-4 ${
                    pathname === "/"
                      ? "text-indigo-400"
                      : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span>ផ្ទាំងគ្រប់គ្រង</span>
              </span>
              {pathname === "/" && (
                <ChevronRight className="h-4 w-4 text-indigo-400" />
              )}
            </Link>
          </div>

          {/* 5 Core Functional Modules */}
          <div>
            <div className="mb-2 flex items-center justify-between px-3">
              <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Core AI Modules (5)
              </p>
            </div>
            <div className="space-y-1.5">
              {CORE_TOOLS.map((tool) => {
                const Icon = ICON_MAP[tool.iconName];
                const isActive =
                  pathname === tool.href || pathname.startsWith(`${tool.href}/`);

                return (
                  <Link
                    key={tool.id}
                    href={tool.href}
                    onClick={onClose}
                    className={`group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-all ${
                      isActive
                        ? "bg-slate-900 text-white shadow-xs ring-1 ring-slate-700/80"
                        : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${
                          tool.accentColor
                        } ${
                          isActive
                            ? "text-white shadow-sm"
                            : "opacity-80 group-hover:opacity-100 text-white"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-slate-500">
                            0{tool.number}
                          </span>
                          <p className="truncate font-medium">
                            {tool.shortTitle}
                          </p>
                        </div>
                        <p className="truncate text-[11px] text-slate-500">
                          {tool.badge}
                        </p>
                      </div>
                    </div>

                    {isActive && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* DYT ECOSYSTEM Nodes Footer */}
        <div className="border-t border-cyan-500/20 p-4 bg-slate-950/80">
          <div className="rounded-xl bg-slate-900/90 p-3.5 ring-1 ring-cyan-500/20 shadow-[0_0_15px_rgba(0,240,255,0.05)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-mono text-xs font-bold text-slate-200">
                  DYT ECOSYSTEM (4 Nodes)
                </span>
              </div>
              <span className="flex items-center gap-1 font-mono text-[10px] font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LINKED
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex -space-x-2">
                {TEAM_MEMBERS.map((member) => (
                  <div
                    key={member.initials}
                    title={`${member.name} — ${member.role}`}
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${member.color} font-mono text-[10px] font-bold text-slate-950 ring-2 ring-slate-950 shadow-[0_0_8px_rgba(0,240,255,0.3)]`}
                  >
                    {member.initials}
                  </div>
                ))}
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-400/90">
                PLP SECURE
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
