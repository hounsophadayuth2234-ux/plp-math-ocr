'use client';

import React, { useState } from 'react';
import { X, RefreshCw, ZoomIn, MousePointerClick } from 'lucide-react';
import { sendBroadcastCommand } from '@/lib/supabase';

interface ScreenshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  screenshotUrl: string | null;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

interface ClickFeedback {
  id: number;
  x: number;
  y: number;
  pctX: string;
  pctY: string;
}

export function ScreenshotModal({
  isOpen,
  onClose,
  screenshotUrl,
  onRefresh,
  isRefreshing,
}: ScreenshotModalProps) {
  const [tapToClickEnabled, setTapToClickEnabled] = useState(true);
  const [clickRipples, setClickRipples] = useState<ClickFeedback[]>([]);
  const [lastAction, setLastAction] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tapToClickEnabled) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const x_ratio = Math.max(0, Math.min(1, x / rect.width));
    const y_ratio = Math.max(0, Math.min(1, y / rect.height));

    const rippleId = Date.now();
    setClickRipples((prev) => [
      ...prev,
      {
        id: rippleId,
        x,
        y,
        pctX: `${(x_ratio * 100).toFixed(1)}%`,
        pctY: `${(y_ratio * 100).toFixed(1)}%`,
      },
    ]);

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20);
    }

    try {
      await sendBroadcastCommand('MOUSE_CLICK_AT', {
        x_ratio,
        y_ratio,
        button: 'left',
      });
      setLastAction(`Clicked at ${(x_ratio * 100).toFixed(0)}%, ${(y_ratio * 100).toFixed(0)}%`);
    } catch (err) {
      console.error('Failed to send click at ratio:', err);
    }

    setTimeout(() => {
      setClickRipples((prev) => prev.filter((r) => r.id !== rippleId));
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0d1017] border border-white/[0.1] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="font-semibold text-sm text-zinc-100">Live Dell Screen</h3>
            {lastAction && (
              <span className="text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full ml-1">
                {lastAction}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTapToClickEnabled(!tapToClickEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                tapToClickEnabled
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-white/[0.04] text-zinc-400 border border-white/[0.08]'
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              <span>Tap-to-Click</span>
            </button>

            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 disabled:opacity-40 transition-colors"
              title="Refresh screen"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image Area */}
        <div className="relative flex-1 overflow-auto bg-black flex items-center justify-center p-2 min-h-[260px]">
          {screenshotUrl ? (
            <div
              onClick={handleImageClick}
              className={`relative inline-block max-w-full max-h-full rounded-xl overflow-hidden cursor-crosshair select-none ${
                tapToClickEnabled ? 'ring-1 ring-cyan-500/30' : ''
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotUrl}
                alt="Dell Screen"
                className="w-full h-auto object-contain max-h-[65vh] block rounded-xl"
                draggable={false}
              />

              {/* Click Ripple Indicators */}
              {clickRipples.map((ripple) => (
                <div
                  key={ripple.id}
                  style={{ left: ripple.x, top: ripple.y }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                >
                  <div className="w-8 h-8 rounded-full border-2 border-cyan-400 bg-cyan-400/30 animate-ping" />
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-lg" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-8 text-zinc-500">
              <ZoomIn className="w-10 h-10 mx-auto mb-2 opacity-40 text-cyan-400" />
              <p className="text-sm">No screenshot captured yet.</p>
              <p className="text-xs text-zinc-600 mt-1">Tap refresh to grab Dell screen.</p>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-3 border-t border-white/[0.08] bg-white/[0.02] flex items-center justify-between text-xs text-zinc-400">
          <span>{tapToClickEnabled ? '⚡ Tap screen image to click at that point' : 'Viewing mode'}</span>
          <button
            onClick={onRefresh}
            className="text-cyan-400 font-medium hover:underline text-xs"
          >
            {isRefreshing ? 'Capturing...' : 'Capture Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
