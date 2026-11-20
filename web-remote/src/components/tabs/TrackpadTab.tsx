'use client';

import React, { useState, useRef } from 'react';
import {
  Send,
  CornerDownLeft,
  Delete,
  Mouse,
  Move,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { sendBroadcastCommand } from '@/lib/supabase';

export function TrackpadTab() {
  const [sensitivity, setSensitivity] = useState(1.4);
  const [keyboardText, setKeyboardText] = useState('');
  const [isDraggingMode, setIsDraggingMode] = useState(false);
  const [tapFeedback, setTapFeedback] = useState<string | null>(null);

  // Touch tracking refs
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number; fingerCount: number } | null>(null);
  const lastTapReleaseTimeRef = useRef<number>(0);
  const lastSendTimeRef = useRef<number>(0);
  const scrollLastYRef = useRef<number | null>(null);

  // Trigger brief haptic vibration
  const triggerHaptic = (ms = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  const showFeedback = (text: string) => {
    setTapFeedback(text);
    setTimeout(() => setTapFeedback(null), 800);
  };

  // Touch handlers for main trackpad
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const touchCount = e.touches.length;
    const firstTouch = e.touches[0];
    const now = Date.now();

    touchStartRef.current = {
      x: firstTouch.clientX,
      y: firstTouch.clientY,
      time: now,
      fingerCount: touchCount,
    };
    lastTouchRef.current = { x: firstTouch.clientX, y: firstTouch.clientY };

    // Check for double-tap & hold (Drag mode)
    if (touchCount === 1 && now - lastTapReleaseTimeRef.current < 280) {
      setIsDraggingMode(true);
      triggerHaptic(30);
      showFeedback('Drag Mode (Holding)');
      sendBroadcastCommand('MOUSE_CLICK', { button: 'down' });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!lastTouchRef.current || e.touches.length > 2) return;

    const firstTouch = e.touches[0];
    const currentX = firstTouch.clientX;
    const currentY = firstTouch.clientY;

    const rawDx = currentX - lastTouchRef.current.x;
    const rawDy = currentY - lastTouchRef.current.y;

    lastTouchRef.current = { x: currentX, y: currentY };

    const now = Date.now();
    // Throttle ~35ms for silky 30fps mouse movement over WebSockets
    if (now - lastSendTimeRef.current >= 35) {
      lastSendTimeRef.current = now;
      const dx = Math.round(rawDx * sensitivity);
      const dy = Math.round(rawDy * sensitivity);

      if (dx !== 0 || dy !== 0) {
        sendBroadcastCommand('MOUSE_MOVE', { dx, dy });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const now = Date.now();

    if (isDraggingMode) {
      setIsDraggingMode(false);
      sendBroadcastCommand('MOUSE_CLICK', { button: 'up' });
      triggerHaptic(20);
      showFeedback('Dropped');
    } else if (touchStartRef.current) {
      const elapsed = now - touchStartRef.current.time;
      const movedX = Math.abs((lastTouchRef.current?.x || 0) - touchStartRef.current.x);
      const movedY = Math.abs((lastTouchRef.current?.y || 0) - touchStartRef.current.y);

      // Tap detection (under 250ms and moved less than 10px)
      if (elapsed < 250 && movedX < 10 && movedY < 10) {
        if (touchStartRef.current.fingerCount === 2) {
          // 2-finger tap = Right Click
          triggerHaptic(25);
          showFeedback('Right Click');
          sendBroadcastCommand('MOUSE_CLICK', { button: 'right' });
        } else if (touchStartRef.current.fingerCount === 1) {
          // 1-finger tap = Left Click
          triggerHaptic(15);
          showFeedback('Left Click');
          sendBroadcastCommand('MOUSE_CLICK', { button: 'left' });
        }
      }
    }

    lastTapReleaseTimeRef.current = now;
    touchStartRef.current = null;
    lastTouchRef.current = null;
  };

  // Scroll Strip handlers
  const handleScrollTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      scrollLastYRef.current = e.touches[0].clientY;
    }
  };

  const handleScrollTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (scrollLastYRef.current === null || e.touches.length === 0) return;

    const currentY = e.touches[0].clientY;
    const dy = scrollLastYRef.current - currentY; // Invert: drag up scrolls down
    scrollLastYRef.current = currentY;

    if (Math.abs(dy) > 2) {
      // Scale scroll step
      const scrollUnits = Math.round(dy * 4);
      sendBroadcastCommand('MOUSE_SCROLL', { dy: scrollUnits });
    }
  };

  const handleScrollTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    scrollLastYRef.current = null;
  };

  // Dedicated button clicks
  const handleLeftClick = () => {
    triggerHaptic(20);
    sendBroadcastCommand('MOUSE_CLICK', { button: 'left' });
  };

  const handleRightClick = () => {
    triggerHaptic(20);
    sendBroadcastCommand('MOUSE_CLICK', { button: 'right' });
  };

  const handleDoubleClick = () => {
    triggerHaptic(30);
    sendBroadcastCommand('MOUSE_CLICK', { button: 'double' });
  };

  // Keyboard typing
  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyboardText) return;
    triggerHaptic(15);
    await sendBroadcastCommand('KEY_TYPE', { text: keyboardText });
    setKeyboardText('');
  };

  const handleShortcut = (combo: string) => {
    triggerHaptic(15);
    sendBroadcastCommand('KEY_COMBO', { combo });
  };

  return (
    <div className="space-y-3 pb-20 animate-in fade-in duration-200">
      {/* Trackpad Container */}
      <div className="glass-panel rounded-3xl p-3 border border-white/[0.08] shadow-2xl relative">
        <div className="flex items-center justify-between mb-2 px-2 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Mouse className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-zinc-300">Glass Touchpad</span>
            {tapFeedback && (
              <span className="text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full ml-1">
                {tapFeedback}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Sens:</span>
            <input
              type="range"
              min="0.6"
              max="2.5"
              step="0.1"
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="w-16 h-1 bg-white/[0.1] rounded-lg accent-cyan-400 cursor-pointer"
            />
            <span className="w-6 text-zinc-300 text-right">{sensitivity.toFixed(1)}x</span>
          </div>
        </div>

        {/* Touchpad Area + Vertical Scroll Strip */}
        <div className="relative flex h-[280px] w-full rounded-2xl overflow-hidden border border-white/[0.06] bg-black/40">
          {/* Main Touch Area */}
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'none' }}
            className={`flex-1 relative flex items-center justify-center cursor-crosshair select-none ${
              isDraggingMode ? 'bg-cyan-500/10 ring-2 ring-cyan-400/50' : 'hover:bg-white/[0.02]'
            }`}
          >
            <div className="text-center pointer-events-none select-none opacity-25 flex flex-col items-center gap-1">
              <Move className="w-8 h-8 text-cyan-300" />
              <span className="text-[11px] text-zinc-400">
                1-finger Move • Tap Click • 2-finger Right Click
              </span>
            </div>
          </div>

          {/* Right-Edge Vertical Scroll Strip */}
          <div
            onTouchStart={handleScrollTouchStart}
            onTouchMove={handleScrollTouchMove}
            onTouchEnd={handleScrollTouchEnd}
            style={{ touchAction: 'none' }}
            className="w-10 bg-white/[0.03] border-l border-white/[0.08] flex flex-col items-center justify-center text-zinc-500 hover:bg-white/[0.06] transition-colors cursor-ns-resize select-none"
            title="Vertical Scroll Strip"
          >
            <ArrowUp className="w-3.5 h-3.5 mb-2 opacity-50" />
            <div className="w-1 h-8 rounded-full bg-cyan-400/40" />
            <ArrowDown className="w-3.5 h-3.5 mt-2 opacity-50" />
          </div>
        </div>

        {/* Dedicated Mouse Click Buttons Below */}
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          <button
            onClick={handleLeftClick}
            className="glass-btn py-3 rounded-2xl text-xs font-semibold text-zinc-200 active:bg-cyan-500/20 active:text-cyan-300 active:border-cyan-500/40"
          >
            L-CLICK
          </button>
          <button
            onClick={handleDoubleClick}
            className="glass-btn py-3 rounded-2xl text-xs font-semibold text-zinc-300 active:bg-indigo-500/20"
          >
            DBL-CLICK
          </button>
          <button
            onClick={handleRightClick}
            className="glass-btn py-3 rounded-2xl text-xs font-semibold text-zinc-200 active:bg-cyan-500/20 active:text-cyan-300 active:border-cyan-500/40"
          >
            R-CLICK
          </button>
        </div>
      </div>

      {/* Remote Keyboard & Hotkey Bar */}
      <div className="glass-panel rounded-3xl p-3 border border-white/[0.08] shadow-xl space-y-2.5">
        <form onSubmit={handleSendText} className="flex gap-2">
          <input
            type="text"
            value={keyboardText}
            onChange={(e) => setKeyboardText(e.target.value)}
            placeholder="Type text to Dell (Unicode / Khmer)..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400/50"
          />
          <button
            type="submit"
            disabled={!keyboardText.trim()}
            className="px-4 py-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>

        {/* Quick Shortcut Chips */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[
            { label: 'Enter', combo: 'enter', icon: CornerDownLeft },
            { label: 'Backspace', combo: 'backspace', icon: Delete },
            { label: 'Esc', combo: 'esc' },
            { label: 'Tab', combo: 'tab' },
            { label: 'Win', combo: 'win' },
            { label: 'Alt+Tab', combo: 'alt+tab' },
            { label: 'Ctrl+C', combo: 'ctrl+c' },
            { label: 'Ctrl+V', combo: 'ctrl+v' },
            { label: 'Ctrl+Z', combo: 'ctrl+z' },
            { label: '↑', combo: 'up' },
            { label: '↓', combo: 'down' },
            { label: '←', combo: 'left' },
            { label: '→', combo: 'right' },
          ].map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.combo}
                onClick={() => handleShortcut(chip.combo)}
                className="glass-btn px-2.5 py-1.5 rounded-xl text-[11px] font-mono text-zinc-300 hover:text-white flex items-center gap-1 active:bg-cyan-500/20 active:border-cyan-500/40"
              >
                {Icon && <Icon className="w-3 h-3" />}
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
