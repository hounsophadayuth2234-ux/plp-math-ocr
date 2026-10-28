import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  badgeText?: string;
  backendNote?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  badgeText = "Placeholder: data source not yet connected",
  backendNote,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center backdrop-blur-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/80 text-slate-400 border border-slate-700">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>

      <div className="mt-3">
        <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 border border-amber-500/20">
          {badgeText}
        </span>
      </div>

      <h3 className="mt-3 text-base font-semibold text-slate-200">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-400">{description}</p>

      {backendNote && (
        <div className="mt-4 max-w-lg rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left">
          <p className="text-xs font-mono text-slate-400">
            <span className="text-indigo-400 font-semibold">Backend Work: </span>
            {backendNote}
          </p>
        </div>
      )}
    </div>
  );
}
