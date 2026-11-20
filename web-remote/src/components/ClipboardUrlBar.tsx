'use client';

import React, { useState } from 'react';
import { Clipboard, ExternalLink, X, ClipboardPaste } from 'lucide-react';
import { CommandType } from '../lib/types';

interface ClipboardUrlBarProps {
  onSendCommandWithPayload: (command: CommandType, payload: string) => void;
  isExecuting: boolean;
}

export default function ClipboardUrlBar({
  onSendCommandWithPayload,
  isExecuting,
}: ClipboardUrlBarProps) {
  const [inputText, setInputText] = useState('');

  const triggerVibrate = (pattern: number[]) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore mobile browser restrictions
      }
    }
  };

  const handlePasteFromPhone = async () => {
    triggerVibrate([20]);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) setInputText(text);
      }
    } catch {
      // Permission denied or not supported on this context
    }
  };

  const handlePushClipboard = () => {
    if (!inputText.trim()) return;
    triggerVibrate([30]);
    onSendCommandWithPayload('CLIPBOARD', inputText);
  };

  const handleOpenUrl = () => {
    if (!inputText.trim()) return;
    triggerVibrate([30]);
    onSendCommandWithPayload('OPEN_URL', inputText.trim());
  };

  return (
    <div className="w-full bg-cyber-panel/90 backdrop-blur-md border border-cyber-border rounded-2xl p-4 sm:p-5 shadow-xl relative flex flex-col gap-3">
      {/* Label and paste helper */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
          <span>PAYLOAD TRANSFER</span>
        </span>
        <button
          type="button"
          onClick={handlePasteFromPhone}
          className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 active:scale-95"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span>PASTE FROM PHONE</span>
        </button>
      </div>

      {/* Input area */}
      <div className="relative flex items-center">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste URL, snippet, or text to send..."
          disabled={isExecuting}
          className="w-full bg-zinc-950/80 border border-zinc-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-zinc-100 placeholder-zinc-600 rounded-xl px-3.5 py-3 text-xs sm:text-sm font-mono transition-all outline-none pr-10"
        />

        {inputText && (
          <button
            type="button"
            onClick={() => setInputText('')}
            className="absolute right-3 p-1 rounded text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dual action trigger buttons */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        {/* Push to PC Clipboard */}
        <button
          type="button"
          disabled={!inputText.trim() || isExecuting}
          onClick={handlePushClipboard}
          className="py-3 px-3 rounded-xl bg-zinc-900/90 hover:bg-cyan-950/30 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 text-xs font-mono font-bold uppercase flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:bg-zinc-900"
        >
          <Clipboard className="w-4 h-4 text-cyan-400" />
          <span className="truncate">CLIPBOARD</span>
        </button>

        {/* Open Link on PC */}
        <button
          type="button"
          disabled={!inputText.trim() || isExecuting}
          onClick={handleOpenUrl}
          className="py-3 px-3 rounded-xl bg-zinc-900/90 hover:bg-emerald-950/30 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 text-xs font-mono font-bold uppercase flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:bg-zinc-900"
        >
          <ExternalLink className="w-4 h-4 text-emerald-400" />
          <span className="truncate">OPEN LINK</span>
        </button>
      </div>
    </div>
  );
}
