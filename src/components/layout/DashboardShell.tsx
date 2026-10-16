"use client";

import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { SettingsModal } from "./SettingsModal";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0 max-w-full w-full">
        <Header
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 max-w-full w-full bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl min-w-0 max-w-full w-full">{children}</div>
        </main>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
