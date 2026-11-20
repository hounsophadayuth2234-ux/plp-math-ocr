'use client';

import React, { useState } from 'react';
import {
  Globe,
  Video,
  Folder,
  Activity,
  FileText,
  Calculator,
  Code2,
  ShieldAlert,
  Volume2,
  VolumeX,
  Sun,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  ExternalLink,
  Minimize,
  Maximize,
  XSquare,
  Layers,
} from 'lucide-react';
import { sendBroadcastCommand } from '@/lib/supabase';

export function LauncherTab() {
  const [customTarget, setCustomTarget] = useState('');
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [brightness, setBrightness] = useState(70);
  const [isPlaying, setIsPlaying] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const triggerHaptic = (ms = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  const notify = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 1500);
  };

  // Launch pre-configured app
  const handleLaunch = (app: string, label: string) => {
    triggerHaptic(20);
    sendBroadcastCommand('APP_LAUNCH', { app });
    notify(`Launched ${label}`);
  };

  // Launch custom URL or executable
  const handleCustomLaunch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customTarget.trim()) return;
    triggerHaptic(20);
    sendBroadcastCommand('APP_LAUNCH', { app: 'custom', custom: customTarget.trim() });
    notify(`Opening ${customTarget.trim()}`);
    setCustomTarget('');
  };

  // Boss Key
  const handleBossKey = () => {
    triggerHaptic(30);
    sendBroadcastCommand('BOSS_KEY');
    setIsMuted(true);
    notify('Boss Key: Minimized & Muted');
  };

  // Volume slider change
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (newVol > 0 && isMuted) setIsMuted(false);
    sendBroadcastCommand('SET_VOLUME', { volume: newVol });
  };

  // Mute toggle
  const handleMuteToggle = () => {
    triggerHaptic(20);
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    sendBroadcastCommand('MEDIA_KEY', { action: 'mute' });
    notify(nextMute ? 'Audio Muted' : 'Audio Unmuted');
  };

  // Brightness change
  const handleBrightnessChange = (newBri: number) => {
    setBrightness(newBri);
    sendBroadcastCommand('SET_BRIGHTNESS', { brightness: newBri });
  };

  // Media keys
  const handleMediaKey = (action: string) => {
    triggerHaptic(20);
    if (action === 'playpause') setIsPlaying(!isPlaying);
    sendBroadcastCommand('MEDIA_KEY', { action });
    notify(`Media: ${action}`);
  };

  // Window actions
  const handleWindowAction = (action: string, label: string) => {
    triggerHaptic(20);
    sendBroadcastCommand('WINDOW_ACTION', { action });
    notify(label);
  };

  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-200">
      {/* Boss Key & Notification banner */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={handleBossKey}
          className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500/20 via-rose-600/30 to-purple-600/20 border border-rose-500/40 text-rose-300 font-bold text-xs uppercase flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
        >
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>Boss Key (Win+D & Mute)</span>
        </button>

        {feedbackMsg && (
          <div className="glass-pill px-3 py-2 rounded-2xl text-xs text-cyan-300 border border-cyan-500/30 animate-in fade-in">
            {feedbackMsg}
          </div>
        )}
      </div>

      {/* Quick App Launcher Grid */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">
          Quick App Launcher
        </h3>

        <div className="grid grid-cols-4 gap-2.5">
          {[
            { id: 'chrome', label: 'Chrome', icon: Globe, color: 'text-amber-400' },
            { id: 'youtube', label: 'YouTube', icon: Video, color: 'text-rose-500' },
            { id: 'explorer', label: 'Explorer', icon: Folder, color: 'text-yellow-400' },
            { id: 'taskmgr', label: 'Task Mgr', icon: Activity, color: 'text-emerald-400' },
            { id: 'notepad', label: 'Notepad', icon: FileText, color: 'text-blue-400' },
            { id: 'calc', label: 'Calc', icon: Calculator, color: 'text-teal-400' },
            { id: 'vscode', label: 'VS Code', icon: Code2, color: 'text-cyan-400' },
            { id: 'alt+tab', label: 'Switch', icon: Layers, color: 'text-violet-400', isWindow: true },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() =>
                  item.isWindow
                    ? handleWindowAction('switch', 'Switched App')
                    : handleLaunch(item.id, item.label)
                }
                className="glass-btn p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center active:bg-cyan-500/20 active:border-cyan-500/40"
              >
                <Icon className={`w-5 h-5 ${item.color}`} />
                <span className="text-[11px] font-medium text-zinc-300">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom URL or App Input Bar */}
        <form onSubmit={handleCustomLaunch} className="flex gap-2 mt-3 pt-3 border-t border-white/[0.06]">
          <input
            type="text"
            value={customTarget}
            onChange={(e) => setCustomTarget(e.target.value)}
            placeholder="Open URL or command (e.g. netflix.com)..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400/50"
          />
          <button
            type="submit"
            disabled={!customTarget.trim()}
            className="px-3.5 py-2 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 flex items-center gap-1 disabled:opacity-40"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span>Open</span>
          </button>
        </form>
      </div>

      {/* Media & Hardware Controls */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
          Media & Hardware Deck
        </h3>

        {/* Volume Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <div className="flex items-center gap-1.5">
              <button onClick={handleMuteToggle} className="p-1 rounded-lg hover:bg-white/[0.05]">
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                )}
              </button>
              <span className="font-medium">Master Volume</span>
            </div>
            <span className="font-mono text-zinc-400">{isMuted ? 'Muted' : `${volume}%`}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
            className="w-full h-1.5 bg-white/[0.08] rounded-lg accent-cyan-400 cursor-pointer"
          />
        </div>

        {/* Brightness Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <div className="flex items-center gap-1.5">
              <Sun className="w-4 h-4 text-amber-400" />
              <span className="font-medium">Screen Brightness</span>
            </div>
            <span className="font-mono text-zinc-400">{brightness}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={brightness}
            onChange={(e) => handleBrightnessChange(parseInt(e.target.value))}
            className="w-full h-1.5 bg-white/[0.08] rounded-lg accent-amber-400 cursor-pointer"
          />
        </div>

        {/* Media Playback Controls */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => handleMediaKey('prev')}
            className="p-3 rounded-2xl glass-btn text-zinc-300 hover:text-white"
            title="Previous Track"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleMediaKey('playpause')}
            className="p-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
            title="Play / Pause"
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
          </button>
          <button
            onClick={() => handleMediaKey('next')}
            className="p-3 rounded-2xl glass-btn text-zinc-300 hover:text-white"
            title="Next Track"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Window Controls */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">
          Active Window Controls
        </h3>

        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => handleWindowAction('switch', 'Switched Window (Alt+Tab)')}
            className="glass-btn p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-center"
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] text-zinc-300">Alt+Tab</span>
          </button>

          <button
            onClick={() => handleWindowAction('minimize', 'Window Minimized')}
            className="glass-btn p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-center"
          >
            <Minimize className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] text-zinc-300">Minimize</span>
          </button>

          <button
            onClick={() => handleWindowAction('maximize', 'Window Max/Restore')}
            className="glass-btn p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-center"
          >
            <Maximize className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] text-zinc-300">Maximize</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Close active window (Alt+F4)?')) {
                handleWindowAction('close', 'Closed Window (Alt+F4)');
              }
            }}
            className="glass-btn p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-center text-rose-400 hover:text-rose-300 active:bg-rose-500/20"
          >
            <XSquare className="w-4 h-4" />
            <span className="text-[10px]">Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
