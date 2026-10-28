import React from "react";

export default function AdminLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div className="border-b border-slate-800 pb-6">
        <div className="h-8 w-64 bg-slate-800 rounded-md"></div>
        <div className="mt-2 h-4 w-96 bg-slate-800/60 rounded-md"></div>
      </div>

      {/* Metrics grid skeleton */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="h-4 w-28 bg-slate-800 rounded"></div>
            <div className="mt-4 h-8 w-16 bg-slate-800 rounded"></div>
          </div>
        ))}
      </div>

      {/* Tables skeleton */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7 h-64 rounded-xl border border-slate-800 bg-slate-900/40 p-6"></div>
        <div className="lg:col-span-5 h-64 rounded-xl border border-slate-800 bg-slate-900/40 p-6"></div>
      </div>
    </div>
  );
}
