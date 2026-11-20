'use client';

import React, { useState, useEffect } from 'react';
import {
  Lock,
  Moon,
  MonitorOff,
  Sun,
  RotateCw,
  Power,
  Camera,
  Maximize2,
  Cpu,
  HardDrive,
  BatteryCharging,
  Battery,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { DeviceTelemetry } from '@/lib/types';
import { sendBroadcastCommand } from '@/lib/supabase';

interface ControlTabProps {
  telemetry: DeviceTelemetry | null;
  onOpenScreenshot: () => void;
  onRequestPowerAction: (action: 'shutdown' | 'restart') => void;
  onTriggerScreenshot: () => Promise<void>;
  isScreenshotting: boolean;
}

export function ControlTab({
  telemetry,
  onOpenScreenshot,
  onRequestPowerAction,
  onTriggerScreenshot,
  isScreenshotting,
}: ControlTabProps) {
  const [activeBtn, setActiveBtn] = useState<string | null>(null);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const isOnline = Boolean(
    telemetry && now > 0 && now - new Date(telemetry.updated_at).getTime() < 30000
  );

  const handleAction = async (name: string, fn: () => Promise<unknown>) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    setActiveBtn(name);
    try {
      await fn();
    } catch (err) {
      console.error(`Error executing ${name}:`, err);
    } finally {
      setTimeout(() => setActiveBtn(null), 500);
    }
  };

  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-200">
      {/* Top Status Pill Card */}
      <div className="glass-panel rounded-3xl p-4 shadow-xl border border-white/[0.08]">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-zinc-600'
              }`}
            />
            <span className="text-xs font-semibold tracking-wide text-zinc-200 uppercase">
              Dell Latitude 7490
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            {isOnline ? (
              <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full text-[11px] font-medium">
                <Wifi className="w-3 h-3" /> Live Sync
              </span>
            ) : (
              <span className="flex items-center gap-1 text-zinc-400 bg-white/[0.04] px-2.5 py-0.5 rounded-full text-[11px]">
                <WifiOff className="w-3 h-3" /> Standby
              </span>
            )}
          </div>
        </div>

        {/* 3 Metric Pills: CPU, RAM, BATTERY */}
        <div className="grid grid-cols-3 gap-2">
          {/* CPU */}
          <div className="bg-white/[0.03] rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 text-zinc-400 text-[11px] mb-1">
              <Cpu className="w-3 h-3 text-cyan-400" />
              <span>CPU</span>
            </div>
            <span className="text-base font-bold text-zinc-100 font-mono">
              {telemetry?.cpu_percent ?? '--'}%
            </span>
            <div className="w-full bg-white/[0.08] h-1 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, telemetry?.cpu_percent ?? 0)}%` }}
              />
            </div>
          </div>

          {/* RAM */}
          <div className="bg-white/[0.03] rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 text-zinc-400 text-[11px] mb-1">
              <HardDrive className="w-3 h-3 text-violet-400" />
              <span>RAM</span>
            </div>
            <span className="text-base font-bold text-zinc-100 font-mono">
              {telemetry?.ram_percent ?? '--'}%
            </span>
            <div className="w-full bg-white/[0.08] h-1 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-violet-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, telemetry?.ram_percent ?? 0)}%` }}
              />
            </div>
          </div>

          {/* Battery */}
          <div className="bg-white/[0.03] rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 text-zinc-400 text-[11px] mb-1">
              {telemetry?.is_charging ? (
                <BatteryCharging className="w-3 h-3 text-emerald-400 animate-pulse" />
              ) : (
                <Battery className="w-3 h-3 text-emerald-400" />
              )}
              <span>BAT</span>
            </div>
            <span className="text-base font-bold text-zinc-100 font-mono">
              {telemetry?.battery_percent !== null && telemetry?.battery_percent !== undefined
                ? `${telemetry.battery_percent}%`
                : '--'}
            </span>
            <div className="w-full bg-white/[0.08] h-1 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, telemetry?.battery_percent ?? 0)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Power & Display Action Grid */}
      <div className="glass-panel rounded-3xl p-4 shadow-xl border border-white/[0.08]">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">
          Power & Screen Controls
        </h3>

        <div className="grid grid-cols-3 gap-2.5">
          {/* LOCK */}
          <button
            onClick={() => handleAction('LOCK', () => sendBroadcastCommand('LOCK'))}
            className={`glass-btn rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center ${
              activeBtn === 'LOCK' ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'text-zinc-200'
            }`}
          >
            <Lock className="w-5 h-5 text-cyan-400" />
            <span className="text-xs font-medium">Lock PC</span>
          </button>

          {/* SLEEP */}
          <button
            onClick={() => handleAction('SLEEP', () => sendBroadcastCommand('SLEEP'))}
            className={`glass-btn rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center ${
              activeBtn === 'SLEEP' ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'text-zinc-200'
            }`}
          >
            <Moon className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-medium">Sleep</span>
          </button>

          {/* SCREEN OFF */}
          <button
            onClick={() => handleAction('SCREEN_OFF', () => sendBroadcastCommand('SCREEN_OFF'))}
            className={`glass-btn rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center ${
              activeBtn === 'SCREEN_OFF' ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'text-zinc-200'
            }`}
          >
            <MonitorOff className="w-5 h-5 text-purple-400" />
            <span className="text-xs font-medium">Screen Off</span>
          </button>

          {/* WAKE SCREEN */}
          <button
            onClick={() => handleAction('WAKE_SCREEN', () => sendBroadcastCommand('WAKE_SCREEN'))}
            className={`glass-btn rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center ${
              activeBtn === 'WAKE_SCREEN' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'text-zinc-200'
            }`}
          >
            <Sun className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-medium">Wake Screen</span>
          </button>

          {/* RESTART */}
          <button
            onClick={() => onRequestPowerAction('restart')}
            className="glass-btn rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center text-zinc-200 hover:text-amber-300"
          >
            <RotateCw className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-medium">Restart</span>
          </button>

          {/* SHUTDOWN */}
          <button
            onClick={() => onRequestPowerAction('shutdown')}
            className="glass-btn rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center text-zinc-200 hover:text-rose-400"
          >
            <Power className="w-5 h-5 text-rose-400" />
            <span className="text-xs font-medium">Shutdown</span>
          </button>
        </div>
      </div>

      {/* Interactive Live Screen Card */}
      <div className="glass-panel rounded-3xl p-4 shadow-xl border border-white/[0.08]">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Live Desktop View
            </h3>
          </div>

          <button
            onClick={onTriggerScreenshot}
            disabled={isScreenshotting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            <Camera className={`w-3.5 h-3.5 ${isScreenshotting ? 'animate-spin' : ''}`} />
            <span>{isScreenshotting ? 'Capturing...' : 'Capture View'}</span>
          </button>
        </div>

        {/* Thumbnail Preview with Tap-to-Click launcher */}
        <div
          onClick={onOpenScreenshot}
          className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/60 border border-white/[0.06] cursor-pointer group"
        >
          {telemetry?.screenshot_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={telemetry.screenshot_url}
                alt="Dell Screen Preview"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-3">
                <span className="text-[11px] text-zinc-300 bg-black/60 px-2 py-0.5 rounded-lg backdrop-blur-md">
                  Tap to Open Interactive Screen
                </span>
                <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  <Maximize2 className="w-3.5 h-3.5" />
                </span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-2 p-4">
              <Camera className="w-8 h-8 opacity-40 text-cyan-400" />
              <p className="text-xs text-center text-zinc-400">
                No screenshot yet. Tap &apos;Capture View&apos; above.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
