'use client';

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  HardDrive,
  Activity,
  Wifi,
  Battery,
  BatteryCharging,
  AppWindow,
  Trash2,
  Search,
  ArrowDown,
  ArrowUp,
  Layers,
} from 'lucide-react';
import { V3Telemetry } from '@/lib/types';
import { killProcess } from '@/lib/tunnelClient';

interface MonitorTabProps {
  tunnelUrl: string;
  pin: string;
}

export function MonitorTab({ tunnelUrl, pin }: MonitorTabProps) {
  const [telemetry, setTelemetry] = useState<V3Telemetry | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const triggerHaptic = (ms = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  // Connect to live telemetry WebSocket
  useEffect(() => {
    if (!tunnelUrl) return;

    const wsUrl = tunnelUrl.replace('https://', 'wss://').replace('http://', 'ws://') +
      `/ws/telemetry?pin=${encodeURIComponent(pin)}`;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as V3Telemetry;
        setTelemetry(data);
      } catch (err) {
        console.warn('Telemetry parse error:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [tunnelUrl, pin]);

  const handleKill = async (pid: number, name: string) => {
    triggerHaptic(30);
    setKillingPid(pid);
    try {
      await killProcess(tunnelUrl, pin, pid);
      setFeedback(`Killed ${name} (PID: ${pid})`);
      if (telemetry) {
        setTelemetry({
          ...telemetry,
          top_processes: telemetry.top_processes.filter((p) => p.pid !== pid),
        });
      }
    } catch {
      setFeedback(`Failed to kill PID ${pid}`);
    } finally {
      setTimeout(() => {
        setKillingPid(null);
        setFeedback(null);
      }, 2000);
    }
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const filteredProcesses = (telemetry?.top_processes || []).filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-24 animate-in fade-in duration-200">
      {/* Live Active Window Banner */}
      <div className="glass-panel rounded-3xl p-4 border border-cyan-500/20 shadow-xl bg-gradient-to-r from-cyan-950/20 via-black to-purple-950/20">
        <div className="flex items-center gap-2 mb-1 text-xs text-cyan-400 font-medium">
          <AppWindow className="w-4 h-4 animate-pulse" />
          <span className="uppercase tracking-wider">Active Foreground Window</span>
        </div>
        <div className="text-sm font-semibold text-zinc-100 truncate font-mono">
          {telemetry?.active_window || 'Desktop / Background'}
        </div>
      </div>

      {/* Real-time Hardware Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* CPU */}
        <div className="glass-panel rounded-3xl p-3.5 border border-white/[0.08] shadow-lg">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="font-medium">CPU Total</span>
            </div>
            <span className="font-mono text-zinc-200 font-bold">{telemetry?.cpu_total ?? '--'}%</span>
          </div>
          <div className="w-full bg-white/[0.08] h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-cyan-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, telemetry?.cpu_total ?? 0)}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-500 mt-1.5 block">
            {telemetry?.cpu_cores?.length ?? 4} Cores Active
          </span>
        </div>

        {/* RAM */}
        <div className="glass-panel rounded-3xl p-3.5 border border-white/[0.08] shadow-lg">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <div className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-violet-400" />
              <span className="font-medium">RAM Memory</span>
            </div>
            <span className="font-mono text-zinc-200 font-bold">{telemetry?.ram_percent ?? '--'}%</span>
          </div>
          <div className="w-full bg-white/[0.08] h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-violet-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, telemetry?.ram_percent ?? 0)}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-400 mt-1.5 block font-mono">
            {telemetry?.ram_used_gb ?? '--'}GB / {telemetry?.ram_total_gb ?? '--'}GB
          </span>
        </div>

        {/* Live Network Speed */}
        <div className="glass-panel rounded-3xl p-3.5 border border-white/[0.08] shadow-lg">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span className="font-medium">Network I/O</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1 text-emerald-400">
              <ArrowDown className="w-3.5 h-3.5" />
              <span>{telemetry?.down_kb_s ?? 0} KB/s</span>
            </div>
            <div className="flex items-center gap-1 text-cyan-400">
              <ArrowUp className="w-3.5 h-3.5" />
              <span>{telemetry?.up_kb_s ?? 0} KB/s</span>
            </div>
          </div>
        </div>

        {/* Battery & Uptime */}
        <div className="glass-panel rounded-3xl p-3.5 border border-white/[0.08] shadow-lg">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
            {telemetry?.is_charging ? (
              <BatteryCharging className="w-4 h-4 text-emerald-400 animate-pulse" />
            ) : (
              <Battery className="w-4 h-4 text-emerald-400" />
            )}
            <span className="font-medium">Battery & Uptime</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
            <span>{telemetry?.battery_percent !== null ? `${telemetry?.battery_percent}%` : '--'}</span>
            <span className="text-[11px] text-zinc-400">
              {telemetry?.uptime_seconds ? formatUptime(telemetry.uptime_seconds) : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Disk Partitions (C:, D:, etc.) */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          <span>Storage Drives</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(telemetry?.disks || []).map((disk) => (
            <div key={disk.device} className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-200">{disk.device}</span>
                <span className="font-mono text-zinc-400">{disk.percent}%</span>
              </div>
              <div className="w-full bg-white/[0.08] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full"
                  style={{ width: `${Math.min(100, disk.percent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                <span>Free: {disk.free_gb} GB</span>
                <span>Total: {disk.total_gb} GB</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top 20 Processes Manager */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-purple-400" />
            <span>Process Manager ({filteredProcesses.length})</span>
          </div>
          {feedback && <span className="text-xs text-cyan-400 animate-in fade-in">{feedback}</span>}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search running processes..."
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-purple-400/50"
          />
        </div>

        {/* Process List */}
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {filteredProcesses.map((proc) => (
            <div
              key={proc.pid}
              className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-semibold text-zinc-200 truncate">{proc.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono">PID: {proc.pid}</span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-mono text-xs bg-white/[0.06] text-zinc-300 px-2 py-0.5 rounded-lg">
                  {proc.memory_mb} MB
                </span>
                <button
                  onClick={() => handleKill(proc.pid, proc.name)}
                  disabled={killingPid === proc.pid}
                  className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 active:scale-90 transition-transform disabled:opacity-40"
                  title="Kill Process"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
