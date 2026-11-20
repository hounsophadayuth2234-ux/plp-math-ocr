'use client';

import React, { useState, useEffect } from 'react';
import {
  Clipboard,
  Copy,
  ArrowDownToLine,
  ArrowUpFromLine,
  Activity,
  Trash2,
  Bell,
  Volume2,
  RefreshCw,
  CheckCircle,
  History,
  Sparkles,
} from 'lucide-react';
import { ProcessItem, DeviceCommand } from '@/lib/types';
import {
  sendBroadcastCommand,
  sendDeviceCommand,
  subscribeToAgentResponses,
  fetchRecentCommands,
} from '@/lib/supabase';

export function ToolsTab() {
  // Clipboard states
  const [pushClipboardText, setPushClipboardText] = useState('');
  const [pulledClipboardText, setPulledClipboardText] = useState('');
  const [isPullingClipboard, setIsPullingClipboard] = useState(false);
  const [copiedToPhone, setCopiedToPhone] = useState(false);

  // Process manager states
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [isScanningProcs, setIsScanningProcs] = useState(false);
  const [killingPid, setKillingPid] = useState<number | null>(null);

  // Alert states
  const [alertMessage, setAlertMessage] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [alertSent, setAlertSent] = useState(false);

  // Activity Log
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [showLog, setShowLog] = useState(false);

  const triggerHaptic = (ms = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  // Listen to broadcast responses from Dell agent
  useEffect(() => {
    const unsubscribe = subscribeToAgentResponses((type, data) => {
      if (type === 'CLIPBOARD_DATA') {
        const text = (data as { text?: string })?.text ?? '';
        setPulledClipboardText(text);
        setIsPullingClipboard(false);
        triggerHaptic(20);
      } else if (type === 'PROCESSES_DATA') {
        const list = ((data as { processes?: ProcessItem[] })?.processes ?? []) as ProcessItem[];
        setProcesses(list);
        setIsScanningProcs(false);
        triggerHaptic(20);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Fetch recent DB commands
  const loadCommands = async () => {
    const list = await fetchRecentCommands(10);
    setCommands(list);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCommands();
    }, 0);
    const interval = setInterval(loadCommands, 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // 1. Push to PC Clipboard
  const handlePushClipboard = async () => {
    if (!pushClipboardText.trim()) return;
    triggerHaptic(20);
    await sendDeviceCommand('CLIPBOARD', pushClipboardText);
    setPushClipboardText('');
  };

  // 2. Pull from PC Clipboard
  const handlePullClipboard = async () => {
    triggerHaptic(20);
    setIsPullingClipboard(true);
    await sendBroadcastCommand('GET_CLIPBOARD');
    setTimeout(() => setIsPullingClipboard(false), 4000);
  };

  // Copy pulled text to phone clipboard
  const handleCopyPulled = async () => {
    if (!pulledClipboardText) return;
    try {
      await navigator.clipboard.writeText(pulledClipboardText);
      setCopiedToPhone(true);
      triggerHaptic(15);
      setTimeout(() => setCopiedToPhone(false), 2000);
    } catch (err) {
      console.warn('Could not copy to phone clipboard:', err);
    }
  };

  // Scan top processes
  const handleScanProcesses = async () => {
    triggerHaptic(20);
    setIsScanningProcs(true);
    await sendBroadcastCommand('GET_TOP_PROCESSES');
    setTimeout(() => setIsScanningProcs(false), 4000);
  };

  // Kill specific PID
  const handleKillPid = async (pid: number) => {
    triggerHaptic(30);
    setKillingPid(pid);
    await sendBroadcastCommand('KILL_PROCESS', { pid });
    setProcesses((prev) => prev.filter((p) => p.pid !== pid));
    setTimeout(() => setKillingPid(null), 1000);
  };

  // Clean RAM (>500MB Chrome/Node)
  const handleCleanRam = async () => {
    triggerHaptic(25);
    await sendDeviceCommand('CLEAN_RAM');
    handleScanProcesses();
  };

  // Send Remote Alert
  const handleSendAlert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!alertMessage.trim()) return;
    triggerHaptic(25);
    await sendBroadcastCommand('ALERT_POPUP', {
      message: alertMessage.trim(),
      tts: ttsEnabled,
    });
    setAlertSent(true);
    setAlertMessage('');
    setTimeout(() => setAlertSent(false), 2000);
  };

  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-200">
      {/* 2-Way Clipboard Sync */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Clipboard className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              2-Way Clipboard Sync
            </h3>
          </div>
          <button
            onClick={handlePullClipboard}
            disabled={isPullingClipboard}
            className="flex items-center gap-1 text-[11px] text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-xl border border-cyan-500/30 disabled:opacity-50"
          >
            <ArrowDownToLine className={`w-3 h-3 ${isPullingClipboard ? 'animate-bounce' : ''}`} />
            <span>{isPullingClipboard ? 'Pulling...' : 'Pull from Dell'}</span>
          </button>
        </div>

        {/* Push to PC Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={pushClipboardText}
            onChange={(e) => setPushClipboardText(e.target.value)}
            placeholder="Type text to push to Dell's clipboard..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400/50"
          />
          <button
            onClick={handlePushClipboard}
            disabled={!pushClipboardText.trim()}
            className="px-3.5 py-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs flex items-center gap-1 active:scale-95 disabled:opacity-40"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>Push</span>
          </button>
        </div>

        {/* Pulled text box */}
        {pulledClipboardText && (
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Dell Current Clipboard:</span>
              <button
                onClick={handleCopyPulled}
                className="flex items-center gap-1 text-cyan-400 hover:underline"
              >
                {copiedToPhone ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedToPhone ? 'Copied to Phone!' : 'Copy to Phone'}</span>
              </button>
            </div>
            <div className="text-xs text-zinc-200 font-mono bg-black/40 p-2.5 rounded-xl break-all max-h-24 overflow-y-auto">
              {pulledClipboardText}
            </div>
          </div>
        )}
      </div>

      {/* Live Process Manager */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Live Process Manager
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCleanRam}
              className="text-[11px] px-2.5 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center gap-1 active:scale-95"
            >
              <Sparkles className="w-3 h-3" />
              <span>Clean &gt;500MB</span>
            </button>

            <button
              onClick={handleScanProcesses}
              disabled={isScanningProcs}
              className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 disabled:opacity-40"
              title="Scan processes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningProcs ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {processes.length > 0 ? (
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {processes.map((proc) => (
              <div
                key={proc.pid}
                className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-medium text-zinc-200 truncate">{proc.name}</span>
                  <span className="text-[10px] text-zinc-500">PID: {proc.pid}</span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono text-zinc-300 text-xs bg-white/[0.05] px-2 py-0.5 rounded-lg">
                    {proc.memory_mb} MB
                  </span>
                  <button
                    onClick={() => handleKillPid(proc.pid)}
                    disabled={killingPid === proc.pid}
                    className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 active:scale-90 transition-transform"
                    title="Terminate process"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-4 text-xs text-zinc-500">
            Tap the refresh icon to scan top memory processes.
          </div>
        )}
      </div>

      {/* Remote Alert / Find PC */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Remote Alert / Find PC
            </h3>
          </div>

          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-xl border transition-colors ${
              ttsEnabled
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-white/[0.03] border-white/[0.06] text-zinc-500'
            }`}
          >
            <Volume2 className="w-3 h-3" />
            <span>Voice TTS {ttsEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <form onSubmit={handleSendAlert} className="flex gap-2">
          <input
            type="text"
            value={alertMessage}
            onChange={(e) => setAlertMessage(e.target.value)}
            placeholder="Type message to alert Dell (popup + TTS)..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400/50"
          />
          <button
            type="submit"
            disabled={!alertMessage.trim()}
            className="px-3.5 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center gap-1 active:scale-95 disabled:opacity-40"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Alert</span>
          </button>
        </form>

        {alertSent && (
          <div className="text-xs text-emerald-400 flex items-center gap-1 animate-in fade-in">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Alert sent to Dell Latitude!</span>
          </div>
        )}
      </div>

      {/* Expandable Activity Audit Log */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl">
        <button
          onClick={() => setShowLog(!showLog)}
          className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold uppercase tracking-wider">Command Audit Log</span>
          </div>
          <span className="text-[11px] text-zinc-500">{showLog ? 'Hide' : 'Show Recent'}</span>
        </button>

        {showLog && (
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1 animate-in fade-in">
            {commands.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-2">No commands logged yet.</p>
            ) : (
              commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] text-[11px]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        cmd.status === 'executed'
                          ? 'bg-emerald-400'
                          : cmd.status === 'executing'
                          ? 'bg-cyan-400 animate-pulse'
                          : cmd.status === 'failed'
                          ? 'bg-rose-500'
                          : 'bg-amber-400'
                      }`}
                    />
                    <span className="font-mono font-medium text-zinc-200">{cmd.command}</span>
                  </div>
                  <span className="text-zinc-500 font-mono">
                    {new Date(cmd.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
