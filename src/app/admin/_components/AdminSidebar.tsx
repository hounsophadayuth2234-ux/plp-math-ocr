"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  FileText,
  Menu,
  X,
  Shield,
  ExternalLink,
} from "lucide-react";

interface AdminSidebarProps {
  userDisplayName?: string;
}

export function AdminSidebar({ userDisplayName }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    {
      name: "Dashboard",
      href: "/admin/dashboard",
      icon: LayoutDashboard,
      active: pathname === "/admin/dashboard",
      disabled: false,
    },
    {
      name: "Users",
      icon: Users,
      disabled: true,
      badge: "Coming soon",
    },
    {
      name: "Rate Limits",
      icon: ShieldAlert,
      disabled: true,
      badge: "Coming soon",
    },
    {
      name: "Audit Logs",
      icon: FileText,
      disabled: true,
      badge: "Coming soon",
    },
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-slate-950 p-4 border-r border-slate-800">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-slate-800/80 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-100">Super Admin</h2>
            <p className="text-[11px] text-slate-400">PLP Math Platform</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav aria-label="Admin Navigation" className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <div
                  key={item.name}
                  aria-disabled="true"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium text-slate-400 cursor-not-allowed bg-slate-900/30 opacity-70"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-slate-400 border border-slate-700/60">
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href!}
                aria-current={item.active ? "page" : undefined}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                  item.active
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold shadow-sm"
                    : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-800/80 pt-4">
        <Link
          href="/"
          className="flex items-center justify-between rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 transition-colors"
        >
          <span>Return to Workspace</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        {userDisplayName && (
          <div className="mt-3 px-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Authenticated as</p>
            <p className="text-xs font-medium text-slate-300 truncate">{userDisplayName}</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-400" />
          <span className="text-sm font-bold text-slate-100">Super Admin</span>
        </div>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-64 shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop Persistent Sidebar */}
      <aside className="hidden w-64 shrink-0 md:block min-h-screen">
        {sidebarContent}
      </aside>
    </>
  );
}
