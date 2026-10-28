import "server-only";
import type { Metadata } from "next";
import React, { Suspense } from "react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { AdminSidebar } from "./_components/AdminSidebar";
import AdminLoading from "./loading";

export const metadata: Metadata = {
  title: "Super Admin Dashboard | PLP Math Content",
  description: "Administrative control center for PLP Math Content platform.",
  robots: {
    index: false,
    follow: false,
  },
};

async function AdminShell({ children }: { children: React.ReactNode }) {
  const adminUser = await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      <AdminSidebar userDisplayName={adminUser.displayName || adminUser.username} />
      <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
