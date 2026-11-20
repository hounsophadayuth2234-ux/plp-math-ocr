'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldAlert, ShieldCheck, Lock, Delete, RotateCcw } from 'lucide-react';

interface PinLockScreenProps {
  onUnlock: () => void;
}

export default function PinLockScreen({ onUnlock }: PinLockScreenProps) {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);

  const EXPECTED_PIN = process.env.NEXT_PUBLIC_ACCESS_PIN || '123456';

  const triggerVibrate = useCallback((pattern: number[]) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore mobile browser restrictions
      }
    }
  }, []);

  const handleVerify = useCallback(
    (enteredPin: string) => {
      if (enteredPin === EXPECTED_PIN) {
        setSuccess(true);
        setError(false);
        triggerVibrate([40, 30, 80]);
        setTimeout(() => {
          onUnlock();
        }, 300);
      } else {
        setError(true);
        triggerVibrate([100, 50, 100]);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 800);
      }
    },
    [EXPECTED_PIN, onUnlock, triggerVibrate]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= 6 || error || success) return;
      triggerVibrate([20]);
      const nextPin = pin + digit;
      setPin(nextPin);

      if (nextPin.length === 6) {
        handleVerify(nextPin);
      }
    },
    [pin, error, success, handleVerify, triggerVibrate]
  );

  const handleDelete = useCallback(() => {
    if (error || success) return;
    triggerVibrate([20]);
    setPin((prev) => prev.slice(0, -1));
  }, [error, success, triggerVibrate]);

  const handleClear = useCallback(() => {
    if (error || success) return;
    triggerVibrate([25]);
    setPin('');
  }, [error, success, triggerVibrate]);

  // Keep latest callbacks in refs for stable keyboard handler
  const actionsRef = useRef({ handleDigit, handleDelete, handleClear });
  useEffect(() => {
    actionsRef.current = { handleDigit, handleDelete, handleClear };
  });

  // Keyboard support for desktop / laptops
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        actionsRef.current.handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        actionsRef.current.handleDelete();
      } else if (e.key === 'Escape') {
        actionsRef.current.handleClear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-cyber-bg/95 backdrop-blur-xl px-6 py-8 text-center select-none">
      {/* Header telemetry badge */}
      <div className="w-full flex items-center justify-between max-w-sm pt-2">
        <div className="flex items-center gap-2 text-xs font-mono text-cyan-400/80">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          SYS_SEC_GATEWAY
        </div>
        <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">
          PROTOCOL v4.9
        </span>
      </div>

      {/* Main Lock Display */}
      <div className="flex flex-col items-center max-w-sm w-full my-auto">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 border ${
            error
              ? 'bg-rose-950/60 border-rose-500 text-rose-400 glow-red animate-shake'
              : success
              ? 'bg-emerald-950/60 border-emerald-500 text-emerald-400 glow-green'
              : 'bg-zinc-900/80 border-cyan-500/40 text-cyan-400 glow-cyan'
          }`}
        >
          {error ? (
            <ShieldAlert className="w-8 h-8 animate-bounce" />
          ) : success ? (
            <ShieldCheck className="w-8 h-8" />
          ) : (
            <Lock className="w-8 h-8" />
          )}
        </div>

        <h1 className="text-xl font-bold font-mono tracking-widest text-zinc-100 uppercase">
          DELL LATITUDE 7490
        </h1>
        <p className="text-xs text-zinc-400 font-mono mt-1 mb-8">
          {error
            ? 'ACCESS DENIED // CODE MISMATCH'
            : success
            ? 'ACCESS GRANTED // INITIALIZING...'
            : 'ENTER 6-DIGIT SECURITY PIN'}
        </p>

        {/* 6 Dots Indicator */}
        <div className="flex items-center justify-center gap-3 mb-10">
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-200 border ${
                  error
                    ? 'border-rose-500 bg-rose-500 shadow-[0_0_8px_#ff003c]'
                    : isFilled
                    ? 'border-cyan-400 bg-cyan-400 shadow-[0_0_10px_#00f0ff]'
                    : 'border-zinc-700 bg-zinc-900/60'
                }`}
              />
            );
          })}
        </div>

        {/* Cyberpad 3x4 */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-16 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 active:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/50 text-xl font-mono font-bold text-zinc-100 shadow-sm active:scale-95 transition-all flex items-center justify-center focus:outline-none"
            >
              {digit}
            </button>
          ))}

          {/* Reset / Clear */}
          <button
            type="button"
            onClick={handleClear}
            className="h-16 rounded-xl bg-zinc-950/50 hover:bg-zinc-900 active:bg-rose-950/40 border border-zinc-800/80 text-zinc-400 active:text-rose-400 text-xs font-mono font-semibold uppercase flex flex-col items-center justify-center gap-1 active:scale-95 transition-all focus:outline-none"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="text-[10px]">CLR</span>
          </button>

          {/* Zero */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-16 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 active:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/50 text-xl font-mono font-bold text-zinc-100 shadow-sm active:scale-95 transition-all flex items-center justify-center focus:outline-none"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={handleDelete}
            className="h-16 rounded-xl bg-zinc-950/50 hover:bg-zinc-900 active:bg-zinc-800 border border-zinc-800/80 text-zinc-400 active:text-zinc-200 text-xs font-mono font-semibold uppercase flex flex-col items-center justify-center gap-1 active:scale-95 transition-all focus:outline-none"
          >
            <Delete className="w-4 h-4" />
            <span className="text-[10px]">DEL</span>
          </button>
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-[11px] font-mono text-zinc-600 max-w-sm">
        Honor Win Mobile Remote • Encrypted Session
      </div>
    </div>
  );
}
