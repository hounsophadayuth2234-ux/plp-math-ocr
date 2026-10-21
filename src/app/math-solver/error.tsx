"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, ArrowLeft } from "lucide-react";

export default function MathSolverErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error internally for debugging without exposing to students
    console.error("MathSolver route error boundary caught error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-slate-900 p-6 shadow-2xl text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-950/60 border border-amber-500/40 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="text-lg font-bold text-white font-sans">
          ការបង្កើតដំណោះស្រាយមិនបានសម្រេច
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed font-sans">
          ការបង្កើតដំណោះស្រាយមិនបានសម្រេច។ សូមពិនិត្យបញ្ហា ហើយសាកល្បងម្ដងទៀត។
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
          >
            <RotateCcw className="w-4 h-4" />
            សាកល្បងម្ដងទៀត (Retry)
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            ត្រឡប់ក្រោយ
          </Link>
        </div>
      </div>
    </div>
  );
}
