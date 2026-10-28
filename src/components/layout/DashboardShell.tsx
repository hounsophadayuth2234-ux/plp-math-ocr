"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { SettingsModal } from "./SettingsModal";
import { HelpGuideModal } from "./HelpGuideModal";
import { MechanicalCyberBackground } from "@/components/ui/MechanicalCyberBackground";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Standalone external-style bypass: When on /login or /admin, bypass DashboardShell completely.
  // Do NOT render user sidebar, top navigation, or user dashboard frames.
  if (
    pathname === "/login" ||
    pathname?.startsWith("/login/") ||
    pathname === "/admin" ||
    pathname?.startsWith("/admin/")
  ) {
    return <>{children}</>;
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden flex h-screen w-full bg-slate-950 text-slate-100">
      {/* Shared Mechanical Cyber Technology Animated Background Layer (z-0) */}
      <MechanicalCyberBackground />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative flex flex-1 flex-col overflow-hidden min-w-0 max-w-full w-full">
        <Header
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />

        <div className="relative flex-1 min-h-0 overflow-hidden">
          {/* Interactive Content Scroll Layer (z-10) */}
          <main className="relative z-10 h-full overflow-y-auto overflow-x-hidden min-w-0 max-w-full w-full p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl min-w-0 max-w-full w-full">{children}</div>
          </main>
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <HelpGuideModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
    </div>
  );
}
