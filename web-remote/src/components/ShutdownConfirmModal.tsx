'use client';

import React from 'react';
import { Power, RotateCw, X } from 'lucide-react';

interface PowerConfirmModalProps {
  isOpen: boolean;
  actionType: 'shutdown' | 'restart';
  isExecuting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PowerConfirmModal({
  isOpen,
  actionType,
  isExecuting,
  onConfirm,
  onCancel,
}: PowerConfirmModalProps) {
  if (!isOpen) return null;

  const isShutdown = actionType === 'shutdown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-fadeIn">
      <div className="w-full max-w-sm bg-[#12151f] border border-white/[0.1] rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        {/* Top danger strip */}
        <div
          className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
            isShutdown
              ? 'from-rose-500 via-amber-500 to-rose-500'
              : 'from-amber-500 via-yellow-400 to-amber-500'
          }`}
        />

        <button
          onClick={onCancel}
          disabled={isExecuting}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
            isShutdown
              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
              : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
          }`}
        >
          {isShutdown ? (
            <Power className="w-6 h-6 animate-pulse" />
          ) : (
            <RotateCw className="w-6 h-6 animate-spin" />
          )}
        </div>

        <h3 className="text-base font-bold text-zinc-100 tracking-wide uppercase mb-1">
          {isShutdown ? 'Shutdown Dell Laptop?' : 'Restart Dell Laptop?'}
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed mb-6">
          This command will initiate a full Windows {isShutdown ? 'shutdown' : 'restart'} on{' '}
          <span className="text-zinc-200 font-semibold">Dell Latitude 7490</span> in 5 seconds.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isExecuting}
            className="flex-1 py-3 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-xs font-semibold text-zinc-300 transition-all active:scale-95 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isExecuting}
            className={`flex-1 py-3 px-4 rounded-xl text-white font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${
              isShutdown
                ? 'bg-rose-600 hover:bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.35)]'
                : 'bg-amber-600 hover:bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
            }`}
          >
            {isExecuting ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isShutdown ? (
              <Power className="w-4 h-4" />
            ) : (
              <RotateCw className="w-4 h-4" />
            )}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
