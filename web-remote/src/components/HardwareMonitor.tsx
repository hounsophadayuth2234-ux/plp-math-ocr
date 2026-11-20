'use client';

import React, { useState, useEffect } from 'react';
import { Cpu, MemoryStick, Battery, BatteryCharging, RefreshCw } from 'lucide-react';
import { DeviceTelemetry } from '../lib/types';

interface HardwareMonitorProps {
  telemetry: DeviceTelemetry | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export default function HardwareMonitor({
  telemetry,
  isLoading,
  onRefresh,
}: HardwareMonitorProps) {
  // Use a ticking clock state so render remains strictly pure
  const [currentTime, setCurrentTime] = useState<number>(0);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      setCurrentTime(Date.now());
    }, 0);

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 2000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  // Check online status: Consider online if telemetry updated within the last 25 seconds
  const isOnline = Boolean(
    telemetry?.updated_at &&
    currentTime > 0 &&
    currentTime - new Date(telemetry.updated_at).getTime() < 25000
  );

  let timeAgo = 'syncing...';
  if (telemetry?.updated_at && currentTime > 0) {
    const seconds = Math.floor((currentTime - new Date(telemetry.updated_at).getTime()) / 1000);
    if (seconds < 5) {
      timeAgo = 'just now';
    } else if (seconds < 60) {
      timeAgo = `${seconds}s ago`;
    } else {
      const minutes = Math.floor(seconds / 60);
      timeAgo = `${minutes}m ago`;
    }
  }

  const cpu = telemetry?.cpu_percent ?? 0;
  const ram = telemetry?.ram_percent ?? 0;
  const battery = telemetry?.battery_percent ?? 0;
  const isCharging = telemetry?.is_charging ?? false;

  // Dynamic color coding
  const getCpuColor = (val: number) => {
    if (val >= 85) return 'text-rose-500 border-rose-500/50 shadow-rose-900/30';
    if (val >= 60) return 'text-amber-400 border-amber-400/50 shadow-amber-900/30';
    return 'text-cyan-400 border-cyan-400/50 shadow-cyan-900/30';
  };

  const getRamColor = (val: number) => {
    if (val >= 85) return 'text-rose-500 border-rose-500/50 shadow-rose-900/30';
    if (val >= 70) return 'text-amber-400 border-amber-400/50 shadow-amber-900/30';
    return 'text-fuchsia-400 border-fuchsia-400/50 shadow-fuchsia-900/30';
  };

  const getBatteryColor = (val: number) => {
    if (val <= 20) return 'text-rose-500 border-rose-500/50 shadow-rose-900/30';
    if (val <= 40) return 'text-amber-400 border-amber-400/50 shadow-amber-900/30';
    return 'text-emerald-400 border-emerald-400/50 shadow-emerald-900/30';
  };

  return (
    <div className="w-full bg-cyber-panel/80 backdrop-blur-md border border-cyber-border rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden">
      {/* Top ambient glow line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-80" />

      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center">
            {isOnline ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 relative" />
              </>
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 relative" />
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold font-mono tracking-wider text-zinc-100 uppercase">
              {telemetry?.device_name || 'Dell Latitude 7490'}
            </h2>
            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
              <span className={isOnline ? 'text-emerald-400' : 'text-rose-400'}>
                {isOnline ? 'LINK_ACTIVE' : 'LINK_STANDBY'}
              </span>
              <span>•</span>
              <span>{timeAgo}</span>
            </div>
          </div>
        </div>

        {/* Sync / Refresh button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-cyan-400 transition-all active:scale-95 disabled:opacity-50"
          title="Force refresh telemetry"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>

      {/* Hardware Metrics 3-Card Grid */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {/* CPU % */}
        <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/80 flex flex-col items-center justify-between text-center relative group">
          <div className="flex items-center gap-1 text-[11px] font-mono font-medium text-zinc-400 mb-1">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>CPU</span>
          </div>
          <div className={`text-xl sm:text-2xl font-bold font-mono tracking-tight my-1 ${getCpuColor(cpu).split(' ')[0]}`}>
            {cpu.toFixed(0)}
            <span className="text-xs font-normal text-zinc-500 ml-0.5">%</span>
          </div>
          {/* Progress Mini Bar */}
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, cpu))}%` }}
            />
          </div>
        </div>

        {/* RAM % */}
        <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/80 flex flex-col items-center justify-between text-center relative group">
          <div className="flex items-center gap-1 text-[11px] font-mono font-medium text-zinc-400 mb-1">
            <MemoryStick className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>RAM</span>
          </div>
          <div className={`text-xl sm:text-2xl font-bold font-mono tracking-tight my-1 ${getRamColor(ram).split(' ')[0]}`}>
            {ram.toFixed(0)}
            <span className="text-xs font-normal text-zinc-500 ml-0.5">%</span>
          </div>
          {/* Progress Mini Bar */}
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, ram))}%` }}
            />
          </div>
        </div>

        {/* BATTERY % */}
        <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/80 flex flex-col items-center justify-between text-center relative group">
          <div className="flex items-center gap-1 text-[11px] font-mono font-medium text-zinc-400 mb-1">
            {isCharging ? (
              <BatteryCharging className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            ) : (
              <Battery className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>BATT</span>
          </div>
          <div className={`text-xl sm:text-2xl font-bold font-mono tracking-tight my-1 ${getBatteryColor(battery).split(' ')[0]}`}>
            {battery.toFixed(0)}
            <span className="text-xs font-normal text-zinc-500 ml-0.5">%</span>
          </div>
          {/* Progress Mini Bar */}
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isCharging
                  ? 'bg-gradient-to-r from-emerald-400 to-cyan-400'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, battery))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
