"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log generic error reference securely to console without leaking details in UI
    console.error("[admin-error-boundary] Caught admin segment error:", error?.digest || "internal");
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>

      <h2 className="mt-4 text-xl font-bold text-slate-100">
        Administrative Interface Error
      </h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        An unexpected error occurred while loading this administrative view. System security invariants have remained intact.
      </p>

      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 transition-colors"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry Request
      </button>
    </div>
  );
}
