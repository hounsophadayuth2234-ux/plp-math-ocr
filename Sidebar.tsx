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
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800/80 bg-slate-950 text-slate-200 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-5">
          <Link href="/" className="flex items-center gap-3" onClick={onClose}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">
                  NexusAI Hub
                </span>
                <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-indigo-400 uppercase ring-1 ring-indigo-500/30">
                  Internal
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                4-Person Team AI Workbench
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
                <span>Dashboard Overview</span>
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

        {/* 4-Person Team Workspace Footer */}
        <div className="border-t border-slate-800/80 p-4">
          <div className="rounded-xl bg-slate-900/90 p-3.5 ring-1 ring-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Team Workspace (4 Seats)
                </span>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex -space-x-2">
                {TEAM_MEMBERS.map((member) => (
                  <div
                    key={member.initials}
                    title={`${member.name} — ${member.role}`}
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${member.color} text-[10px] font-bold text-white ring-2 ring-slate-950`}
                  >
                    {member.initials}
                  </div>
                ))}
              </div>
              <span className="text-[11px] text-slate-400">Private Mode</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
