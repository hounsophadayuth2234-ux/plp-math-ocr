'use client';

import React, { useState, useEffect } from 'react';
import {
  Folder,
  File,
  HardDrive,
  Download,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
  Globe,
  Video,
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
} from 'lucide-react';
import { FileItem } from '@/lib/types';
import { fetchFiles, openFileOnPC, getDownloadUrl, sendControlCommand } from '@/lib/tunnelClient';

interface FilesTabProps {
  tunnelUrl: string;
  pin: string;
}

export function FilesTab({ tunnelUrl, pin }: FilesTabProps) {
  const [currentPath, setCurrentPath] = useState<string>('root');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [drives, setDrives] = useState<FileItem[]>([]);
  const [shortcuts, setShortcuts] = useState<FileItem[]>([]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Hardware deck states
  const [volume, setVolume] = useState<number>(50);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [brightness, setBrightness] = useState<number>(70);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [customCommand, setCustomCommand] = useState<string>('');

  const triggerHaptic = (ms = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  const loadDirectory = async (dirPath?: string) => {
    if (!tunnelUrl) return;
    setIsLoading(true);
    try {
      const resp = await fetchFiles(tunnelUrl, pin, dirPath);
      setCurrentPath(resp.current_path);
      setParentPath(resp.parent_path);
      if (resp.drives) setDrives(resp.drives);
      if (resp.shortcuts) setShortcuts(resp.shortcuts);
      setItems(resp.items || []);
    } catch (err) {
      console.warn('Failed to load directory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDirectory('root');
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tunnelUrl, pin]);

  const handleItemClick = (item: FileItem) => {
    triggerHaptic(15);
    if (item.is_dir) {
      loadDirectory(item.path);
    } else {
      setSelectedFile(item);
    }
  };

  const handleOpenFileOnPC = async (filePath: string) => {
    triggerHaptic(20);
    try {
      await openFileOnPC(tunnelUrl, pin, filePath);
      setActionNotice('Opened on Dell desktop!');
    } catch {
      setActionNotice('Failed to open on PC');
    } finally {
      setTimeout(() => setActionNotice(null), 2500);
      setSelectedFile(null);
    }
  };

  // Hardware & App controls
  const handleAppLaunch = (app: string) => {
    triggerHaptic(20);
    sendControlCommand({ type: 'app_launch', app });
    setActionNotice(`Launched ${app}`);
    setTimeout(() => setActionNotice(null), 2000);
  };

  const handleCustomLaunch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customCommand.trim()) return;
    triggerHaptic(20);
    sendControlCommand({ type: 'app_launch', app: 'custom', custom: customCommand.trim() });
    setActionNotice(`Opened ${customCommand.trim()}`);
    setCustomCommand('');
    setTimeout(() => setActionNotice(null), 2000);
  };

  const handleVolume = (vol: number) => {
    setVolume(vol);
    if (vol > 0 && isMuted) setIsMuted(false);
    sendControlCommand({ type: 'set_volume', volume: vol });
  };

  const handleMute = () => {
    triggerHaptic(20);
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    sendControlCommand({ type: 'toggle_mute' });
  };

  const handleBrightness = (bri: number) => {
    setBrightness(bri);
    sendControlCommand({ type: 'set_brightness', brightness: bri });
  };

  const handleMedia = (action: string) => {
    triggerHaptic(20);
    if (action === 'playpause') setIsPlaying(!isPlaying);
    sendControlCommand({ type: 'media_key', action });
  };

  const handleBossKey = () => {
    triggerHaptic(30);
    setIsMuted(true);
    sendControlCommand({ type: 'boss_key' });
    setActionNotice('Boss Mode: Win+D & Audio Muted');
    setTimeout(() => setActionNotice(null), 2000);
  };

  return (
    <div className="space-y-4 pb-24 animate-in fade-in duration-200">
      {/* Boss Key & Quick Action Notice */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={handleBossKey}
          className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500/20 via-rose-600/30 to-purple-600/20 border border-rose-500/40 text-rose-300 font-bold text-xs uppercase flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
        >
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>Boss Key (Win+D & Mute)</span>
        </button>

        {actionNotice && (
          <div className="glass-pill px-3 py-2 rounded-2xl text-xs text-cyan-300 border border-cyan-500/30 animate-in fade-in">
            {actionNotice}
          </div>
        )}
      </div>

      {/* Remote File Explorer */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-3">
        {/* Explorer Header & Navigation Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {currentPath !== 'root' && (
              <button
                onClick={() => loadDirectory(parentPath || 'root')}
                className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300"
                title="Go up one folder"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-xs font-mono text-zinc-300 truncate" title={currentPath}>
              {currentPath === 'root' ? 'Drives & Shortcuts' : currentPath}
            </span>
          </div>

          <button
            onClick={() => loadDirectory(currentPath)}
            disabled={isLoading}
            className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 disabled:opacity-40"
            title="Refresh folder"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>

        {/* Root View: Drives & System Shortcuts */}
        {currentPath === 'root' && (
          <div className="space-y-3">
            {/* Drives */}
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider px-1">
                Drives
              </span>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {drives.map((d) => (
                  <button
                    key={d.path}
                    onClick={() => handleItemClick(d)}
                    className="glass-btn p-3 rounded-2xl flex items-center gap-2 text-left"
                  >
                    <HardDrive className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-zinc-200 truncate">{d.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Shortcuts */}
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider px-1">
                Quick Folders
              </span>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {shortcuts.map((s) => (
                  <button
                    key={s.path}
                    onClick={() => handleItemClick(s)}
                    className="glass-btn p-3 rounded-2xl flex items-center gap-2 text-left"
                  >
                    <Folder className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-zinc-200 truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Directory Item List */}
        {currentPath !== 'root' && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {items.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">Folder is empty.</p>
            ) : (
              items.map((item) => (
                <div
                  key={item.path}
                  onClick={() => handleItemClick(item)}
                  className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-xs cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    {item.is_dir ? (
                      <Folder className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    )}
                    <span className="text-zinc-200 truncate font-medium">{item.name}</span>
                  </div>

                  {!item.is_dir && item.size_bytes !== undefined && (
                    <span className="text-[10px] text-zinc-500 font-mono flex-shrink-0">
                      {item.size_bytes > 1024 * 1024
                        ? `${(item.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                        : `${Math.round(item.size_bytes / 1024)} KB`}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected File Action Modal */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm glass-panel rounded-3xl p-5 border border-white/[0.1] shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-cyan-500/15 text-cyan-400">
                <File className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm text-zinc-100 truncate">{selectedFile.name}</h4>
                <p className="text-[11px] text-zinc-500 font-mono truncate">{selectedFile.path}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleOpenFileOnPC(selectedFile.path)}
                className="py-3 px-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open on Dell</span>
              </button>

              <a
                href={getDownloadUrl(tunnelUrl, pin, selectedFile.path)}
                download={selectedFile.name}
                className="py-3 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] text-zinc-200 font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </a>
            </div>

            <button
              onClick={() => setSelectedFile(null)}
              className="w-full py-2.5 rounded-2xl text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Quick App Launcher Grid */}
      <div className="glass-panel rounded-3xl p-4 border border-white/[0.08] shadow-xl space-y-3">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
          App Launcher & Media Deck
        </h3>

        <div className="grid grid-cols-4 gap-2">
          {[
            { id: 'chrome', label: 'Chrome', icon: Globe, color: 'text-amber-400' },
            { id: 'youtube', label: 'YouTube', icon: Video, color: 'text-rose-500' },
            { id: 'explorer', label: 'Explorer', icon: Folder, color: 'text-yellow-400' },
            { id: 'taskmgr', label: 'Task Mgr', icon: Activity, color: 'text-emerald-400' },
            { id: 'notepad', label: 'Notepad', icon: FileText, color: 'text-blue-400' },
            { id: 'calc', label: 'Calc', icon: Calculator, color: 'text-teal-400' },
            { id: 'vscode', label: 'VS Code', icon: Code2, color: 'text-cyan-400' },
          ].map((app) => {
            const Icon = app.icon;
            return (
              <button
                key={app.id}
                onClick={() => handleAppLaunch(app.id)}
                className="glass-btn p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-center"
              >
                <Icon className={`w-5 h-5 ${app.color}`} />
                <span className="text-[10px] font-medium text-zinc-300">{app.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom URL or Command Launcher */}
        <form onSubmit={handleCustomLaunch} className="flex gap-2 pt-2 border-t border-white/[0.06]">
          <input
            type="text"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            placeholder="Launch URL or app name..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400/50"
          />
          <button
            type="submit"
            disabled={!customCommand.trim()}
            className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] text-xs font-semibold text-zinc-200 disabled:opacity-40"
          >
            Open
          </button>
        </form>

        {/* Audio & Brightness Sliders */}
        <div className="space-y-3 pt-2">
          {/* Volume */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-300">
              <div className="flex items-center gap-1.5">
                <button onClick={handleMute} className="p-1 hover:bg-white/[0.05] rounded-lg">
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
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
              onChange={(e) => handleVolume(parseInt(e.target.value))}
              className="w-full h-1.5 bg-white/[0.08] rounded-lg accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Brightness */}
          <div className="space-y-1">
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
              onChange={(e) => handleBrightness(parseInt(e.target.value))}
              className="w-full h-1.5 bg-white/[0.08] rounded-lg accent-amber-400 cursor-pointer"
            />
          </div>

          {/* Media Playback Keys */}
          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={() => handleMedia('prev')}
              className="p-2.5 rounded-xl glass-btn text-zinc-300"
              title="Previous"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleMedia('playpause')}
              className="p-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-lg shadow-cyan-500/20 active:scale-95"
              title="Play / Pause"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>
            <button
              onClick={() => handleMedia('next')}
              className="p-2.5 rounded-xl glass-btn text-zinc-300"
              title="Next"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
