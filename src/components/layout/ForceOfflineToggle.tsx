"use client";

import React, { useEffect, useState } from "react";
import { Zap, Wifi, WifiOff } from "lucide-react";
import {
  isForceOfflineMode,
  setForceOfflineMode,
  subscribeForceOfflineMode,
} from "@/lib/offline-mode-state";

export function ForceOfflineToggle() {
  const [offline, setOffline] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOffline(isForceOfflineMode());
    const unsubscribe = subscribeForceOfflineMode((val) => {
      setOffline(val);
    });
    return unsubscribe;
  }, []);

  const handleToggle = () => {
    const next = !offline;
    setOffline(next);
    setForceOfflineMode(next);
  };

  if (!mounted) {
    return (
      <div className="h-8 w-28 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={
        offline
          ? "Force Offline Active: Network requests are blocked. Strictly using on-device Snapdragon 8 Elite 7B / NPU."
          : "Cloud Hybrid Active: Tap to Force Offline Mode (strictly test Snapdragon 8 Elite 7B without turning off Wi-Fi)."
      }
      aria-label="Force Offline Mode Toggle"
      className={`relative inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
        offline
          ? "bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)] hover:bg-amber-500/25"
          : "bg-slate-900/80 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white"
      }`}
    >
      {offline ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          <span className="hidden sm:inline">OFFLINE 7B</span>
          <span className="sm:hidden">7B</span>
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <Wifi className="h-3.5 w-3.5 text-slate-400" />
          <span className="hidden sm:inline text-slate-400">HYBRID</span>
          <span className="sm:hidden text-slate-400">ON</span>
        </>
      )}
    </button>
  );
}

