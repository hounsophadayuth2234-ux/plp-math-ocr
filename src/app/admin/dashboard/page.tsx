import "server-only";
import React, { Suspense } from "react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  getDashboardStats,
  getRecentLogins,
  getRateLimitEvents,
} from "@/lib/admin/queries";
import { StatCard } from "../_components/StatCard";
import { RecentActivityTable } from "../_components/RecentActivityTable";
import { EmptyState } from "../_components/EmptyState";
import AdminLoading from "../loading";
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Lock,
} from "lucide-react";

async function DashboardContent() {
  // Defense-in-depth: Authoritative server-side guard directly on page
  const adminUser = await requireSuperAdmin();

  // Load backend data directly
  const [stats, recentLogins, rateLimitInfo] = await Promise.all([
    getDashboardStats(adminUser),
    getRecentLogins(adminUser, 15),
    getRateLimitEvents(adminUser),
  ]);

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
              System Overview
            </h1>
            <span className="inline-flex items-center rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
              SUPER_ADMIN
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Welcome back, {adminUser.displayName || adminUser.username}. Authoritative platform control center.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-800">
          <Lock className="h-3.5 w-3.5 text-emerald-400" />
          <span>RBAC: Tier 1 Super Admin</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">Platform Metrics Overview</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Registered Users"
            value={stats.totalUsers}
            icon={Users}
            subtitle="Indexed accounts in persistent storage"
            isAvailable={stats.isAvailable}
          />
          <StatCard
            title="Active Super Admins"
            value={stats.activeSuperAdmins}
            icon={ShieldCheck}
            subtitle="Accounts with master administrative privilege"
            badge="Protected"
            isAvailable={stats.isAvailable}
          />
          <StatCard
            title="Active Workspace Managers"
            value={stats.activeAdmins}
            icon={Activity}
            subtitle="Tier-2 delegated administrators"
            isAvailable={stats.isAvailable}
          />
        </div>
      </section>

      {/* Two Column Section: Recent Logins & Rate Limit Events */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Recent Logins (Real Data) */}
        <section aria-labelledby="recent-logins-heading" className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="recent-logins-heading" className="text-lg font-semibold text-slate-100">
                Recent Authentication Activity
              </h2>
              <p className="text-xs text-slate-400">
                Authoritative login and session lifecycle events from audit logger.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              Live Stream
            </span>
          </div>

          <RecentActivityTable logins={recentLogins} />
        </section>

        {/* Rate Limit Events (Explicit Placeholder) */}
        <section aria-labelledby="rate-limit-heading" className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="rate-limit-heading" className="text-lg font-semibold text-slate-100">
                Rate Limit Events
              </h2>
              <p className="text-xs text-slate-400">
                Real-time throttling and quota violation telemetry.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
              Pending Backend Stream
            </span>
          </div>

          <EmptyState
            icon={ShieldAlert}
            title="Rate Limit Event Stream"
            description="Rate limits are strictly enforced server-side via sliding windows, but historical violation event streaming is not yet connected to a persistent event bus."
            badgeText={rateLimitInfo.notice}
            backendNote={rateLimitInfo.backendRequirement}
          />
        </section>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <DashboardContent />
    </Suspense>
  );
}
