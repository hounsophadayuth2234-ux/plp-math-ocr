import React from "react";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | string | null;
  icon: LucideIcon;
  subtitle?: string;
  badge?: string;
  isAvailable?: boolean;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  badge,
  isAvailable = true,
}: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md transition-all hover:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">{title}</span>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        {isAvailable && value !== null ? (
          <span className="text-3xl font-bold tracking-tight text-slate-100">
            {typeof value === "number" ? value.toLocaleString() : value}
          </span>
        ) : (
          <span className="text-base font-semibold text-amber-400/90 italic">
            Not available yet
          </span>
        )}

        {badge && (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
            {badge}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-2 text-xs text-slate-400">
          {subtitle}
        </p>
      )}
    </div>
  );
}
