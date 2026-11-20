'use client';

import React, { useState, useEffect } from 'react';
import {
  Lock,
  Moon,
  MonitorOff,
  Sun,
  RotateCw,
  Power,
  Clipboard,
  Copy,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Volume2,
  CheckCircle,
} from 'lucide-react';
import { sendControlCommand, sendRemoteAlert, initControlWebSocket } from '@/lib/tunnelClient';

interface PowerToolsTabProps {
  tunnelUrl: string;
  pin: string;
  onRequestPowerAction: (action: 'shutdown' | 'restart') => void;
}

export function PowerToolsTab({ tunnelUrl, pin, onRequestPowerAction }: PowerToolsTabProps) {
  // Clipboard
  const [pushText, setPushText] = useState<string>('');
  const [pulledText, setPulledText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isPulling, setIsPulling] = useState<boolean>(false);

  // Alert & TTS
  const [alertMsg, setAlertMsg] = useState<string>('');
  const [tts, setTts] = useState<boolean>(true);
  const [alertDone, setAlertDone] = useState<boolean>(false);

  // Power action active feedback
  const [activeBtn, setActiveBtn] = useState<string | null>(null);

  useEffect(() => {
    if (tunnelUrl) {
      initControlWebSocket(tunnelUrl, pin, (data) => {
        if (data.type === 'clipboard_data') {
          setPulledText((data.text as string) || '');
          setIsPulling(false);
        }
      });
    }
  }, [tunnelUrl, pin]);

  const triggerHaptic = (ms = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  const handleAction = (name: string, cmd: Record<string, unknown>) => {
    triggerHaptic(20);
    setActiveBtn(name);
    sendControlCommand(cmd);
    setTimeout(() => setActiveBtn(null), 600);
  };

  const handlePushClipboard = () => {
    if (!pushText.trim()) return;
    triggerHaptic(20);
    sendControlCommand({ type: 'clipboard_push', text: pushText.trim() });
    setPushText('');
  };

  const handlePullClipboard = () => {
    triggerHaptic(20);
    setIsPulling(true);
    sendControlCommand({ type: 'clipboard_pull' });
    setTimeout(() => setIsPulling(false), 2000);
  };

  const handleCopyPulled = async () => {
    if (!pulledText) return;
    try {
      await navigator.clipboard.writeText(pulledText);
      setCopied(true);
      triggerHaptic(15);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignored
    }
  };

  const handleSendAlert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!alertMsg.trim()) return;
    triggerHaptic(25);
    try {
      await sendRemoteAlert(tunnelUrl, pin, alertMsg.trim(), tts);
      setAlertDone(true);
      setAlertMsg('');
      setTimeout(() => setAlertDone(false), 2500);
    } catch {
      // Handled
    }
  };

  return (
    <div className="space-y-4 pb-24 animate-in fade-in duration-200">
      {/* Power & Display Controls */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-3">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
          Power & Screen Controls
        </h3>

        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={() => handleAction('lock', { type: 'lock' })}
            className={`glass-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center ${
              activeBtn === 'lock' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-200'
            }`}
          >
            <Lock className="w-5 h-5 text-cyan-400" />
            <span className="text-xs font-medium">Lock PC</span>
          </button>

          <button
            onClick={() => handleAction('sleep', { type: 'sleep' })}
            className={`glass-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center ${
              activeBtn === 'sleep' ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-200'
            }`}
          >
            <Moon className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-medium">Sleep</span>
          </button>

          <button
            onClick={() => handleAction('screen_off', { type: 'screen_off' })}
            className={`glass-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center ${
              activeBtn === 'screen_off' ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-200'
            }`}
          >
            <MonitorOff className="w-5 h-5 text-purple-400" />
            <span className="text-xs font-medium">Screen Off</span>
          </button>

          <button
            onClick={() => handleAction('wake_screen', { type: 'wake_screen' })}
            className={`glass-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center ${
              activeBtn === 'wake_screen' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-200'
            }`}
          >
            <Sun className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-medium">Wake Screen</span>
          </button>

          <button
            onClick={() => onRequestPowerAction('restart')}
            className="glass-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center text-zinc-200 hover:text-amber-300"
          >
            <RotateCw className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-medium">Restart</span>
          </button>

          <button
            onClick={() => onRequestPowerAction('shutdown')}
            className="glass-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center text-zinc-200 hover:text-rose-400"
          >
            <Power className="w-5 h-5 text-rose-400" />
            <span className="text-xs font-medium">Shutdown</span>
          </button>
        </div>
      </div>

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
            disabled={isPulling}
            className="flex items-center gap-1 text-[11px] text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-xl border border-cyan-500/30"
          >
            <ArrowDownToLine className={`w-3 h-3 ${isPulling ? 'animate-bounce' : ''}`} />
            <span>{isPulling ? 'Pulling...' : 'Pull from Dell'}</span>
          </button>
        </div>

        {/* Push Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={pushText}
            onChange={(e) => setPushText(e.target.value)}
            placeholder="Push text to Dell clipboard..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400/50"
          />
          <button
            onClick={handlePushClipboard}
            disabled={!pushText.trim()}
            className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs flex items-center gap-1 active:scale-95 disabled:opacity-40"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>Push</span>
          </button>
        </div>

        {/* Pulled text display */}
        {pulledText && (
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Dell Current Clipboard:</span>
              <button onClick={handleCopyPulled} className="flex items-center gap-1 text-cyan-400 hover:underline">
                {copied ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied to Phone!' : 'Copy to Phone'}</span>
              </button>
            </div>
            <div className="text-xs text-zinc-200 font-mono bg-black/40 p-2.5 rounded-xl break-all max-h-24 overflow-y-auto">
              {pulledText}
            </div>
          </div>
        )}
      </div>

      {/* Remote Alert & Voice Message */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Remote Popup Alert / TTS
            </h3>
          </div>

          <button
            onClick={() => setTts(!tts)}
            className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-xl border transition-colors ${
              tts ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-white/[0.03] text-zinc-500 border-white/[0.06]'
            }`}
          >
            <Volume2 className="w-3 h-3" />
            <span>Voice {tts ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <form onSubmit={handleSendAlert} className="flex gap-2">
          <input
            type="text"
            value={alertMsg}
            onChange={(e) => setAlertMsg(e.target.value)}
            placeholder="Type message to alert Dell..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400/50"
          />
          <button
            type="submit"
            disabled={!alertMsg.trim()}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs active:scale-95 disabled:opacity-40"
          >
            Alert
          </button>
        </form>

        {alertDone && (
          <div className="text-xs text-emerald-400 flex items-center gap-1 animate-in fade-in">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Alert dispatched to Dell desktop!</span>
          </div>
        )}
      </div>
    </div>
  );
}
