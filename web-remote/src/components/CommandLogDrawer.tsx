'use client';

import React, { useState } from 'react';
import { Terminal, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { DeviceCommand } from '../lib/types';

interface CommandLogDrawerProps {
  commands: DeviceCommand[];
}

export default function CommandLogDrawer({ commands }: CommandLogDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getStatusBadge = (status: DeviceCommand['status']) => {
    switch (status) {
      case 'executed':
        return (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
            <CheckCircle2 className="w-3 h-3" />
            <span>EXECUTED</span>
          </span>
        );
      case 'executing':
      case 'pending':
        return (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono animate-pulse">
            <Clock className="w-3 h-3" />
            <span>{status.toUpperCase()}</span>
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-[10px] text-rose-400 font-mono">
            <AlertCircle className="w-3 h-3" />
            <span>FAILED</span>
          </span>
        );
      default:
        return <span className="text-[10px] text-zinc-500 font-mono">{status}</span>;
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full bg-zinc-950/70 border border-zinc-850 rounded-2xl overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-zinc-300 uppercase">
            ACTIVITY AUDIT LOG ({commands.length})
          </span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span className="text-[10px] font-mono">
            {isOpen ? 'COLLAPSE' : 'EXPAND'}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 max-h-56 overflow-y-auto flex flex-col gap-2 border-t border-zinc-900">
          {commands.length === 0 ? (
            <div className="text-center py-4 text-xs font-mono text-zinc-600">
              NO COMMANDS RECORDED IN THIS SESSION
            </div>
          ) : (
            commands.map((cmd) => (
              <div
                key={cmd.id}
                className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-200 tracking-wide">
                      {cmd.command}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {formatTime(cmd.created_at)}
                    </span>
                  </div>
                  {cmd.payload && (
                    <span className="text-[11px] text-zinc-400 truncate max-w-[200px] sm:max-w-xs mt-0.5">
                      {cmd.payload}
                    </span>
                  )}
                  {cmd.error_message && (
                    <span className="text-[10px] text-rose-400 truncate mt-0.5">
                      Err: {cmd.error_message}
                    </span>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {getStatusBadge(cmd.status)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
