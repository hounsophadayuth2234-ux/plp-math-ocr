'use client';

import React from 'react';
import { Lock, Moon, Power, Sparkles, Camera, Loader2 } from 'lucide-react';
import { CommandType } from '../lib/types';

interface ActionGridProps {
  onTriggerCommand: (command: CommandType) => void;
  activeCommand: CommandType | null;
  onOpenShutdownModal: () => void;
  onTriggerScreenshot: () => void;
}

export default function ActionGrid({
  onTriggerCommand,
  activeCommand,
  onOpenShutdownModal,
  onTriggerScreenshot,
}: ActionGridProps) {
  const triggerVibrate = (pattern: number[]) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore mobile browser restrictions
      }
    }
  };

  const handleActionClick = (command: CommandType) => {
    triggerVibrate([30]);
    if (command === 'SHUTDOWN') {
      onOpenShutdownModal();
    } else if (command === 'SCREENSHOT') {
      onTriggerScreenshot();
    } else {
      onTriggerCommand(command);
    }
  };

  const actions = [
    {
      id: 'LOCK' as CommandType,
      label: 'LOCK SCREEN',
      description: 'Instant LockWorkStation',
      icon: Lock,
      color: 'text-cyan-400',
      border: 'border-cyan-500/30 hover:border-cyan-400/80',
      bg: 'bg-zinc-900/70 hover:bg-cyan-950/20 active:bg-cyan-950/40',
      glow: 'hover:shadow-[0_0_20px_rgba(0,240,255,0.25)]',
      badge: 'CYAN_GUARD',
    },
    {
      id: 'SLEEP' as CommandType,
      label: 'SLEEP MODE',
      description: 'Low-power suspend',
      icon: Moon,
      color: 'text-purple-400',
      border: 'border-purple-500/30 hover:border-purple-400/80',
      bg: 'bg-zinc-900/70 hover:bg-purple-950/20 active:bg-purple-950/40',
      glow: 'hover:shadow-[0_0_20px_rgba(168,85,247,0.25)]',
      badge: 'SUSPEND',
    },
    {
      id: 'CLEAN_RAM' as CommandType,
      label: 'PURGE RAM',
      description: 'Kill heavy Chrome/Node (>500MB)',
      icon: Sparkles,
      color: 'text-emerald-400',
      border: 'border-emerald-500/30 hover:border-emerald-400/80',
      bg: 'bg-zinc-900/70 hover:bg-emerald-950/20 active:bg-emerald-950/40',
      glow: 'hover:shadow-[0_0_20px_rgba(0,255,159,0.25)]',
      badge: 'OPT_MEMORY',
    },
    {
      id: 'SCREENSHOT' as CommandType,
      label: 'CAPTURE VIEW',
      description: 'Desktop snapshot & preview',
      icon: Camera,
      color: 'text-amber-400',
      border: 'border-amber-500/30 hover:border-amber-400/80',
      bg: 'bg-zinc-900/70 hover:bg-amber-950/20 active:bg-amber-950/40',
      glow: 'hover:shadow-[0_0_20px_rgba(255,234,0,0.25)]',
      badge: 'LIVE_PNG',
    },
    {
      id: 'SHUTDOWN' as CommandType,
      label: 'SHUTDOWN PC',
      description: '5-second timed power off',
      icon: Power,
      color: 'text-rose-400',
      border: 'border-rose-500/40 hover:border-rose-500',
      bg: 'bg-zinc-900/70 hover:bg-rose-950/30 active:bg-rose-950/50',
      glow: 'hover:shadow-[0_0_25px_rgba(255,0,60,0.35)]',
      badge: 'PWR_CRITICAL',
    },
  ];

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase">
          HARDWARE CONTROLS
        </span>
        <span className="text-[10px] font-mono text-zinc-500">
          TOUCH TRIGGERED
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {actions.slice(0, 4).map((act) => {
          const Icon = act.icon;
          const isCurrentActive = activeCommand === act.id;

          return (
            <button
              key={act.id}
              type="button"
              disabled={Boolean(activeCommand)}
              onClick={() => handleActionClick(act.id)}
              className={`p-4 rounded-2xl border transition-all duration-200 text-left flex flex-col justify-between min-h-[115px] active:scale-95 disabled:opacity-50 select-none ${act.border} ${act.bg} ${act.glow}`}
            >
              <div className="flex items-center justify-between w-full">
                <div className={`p-2.5 rounded-xl bg-black/40 border border-zinc-800 ${act.color}`}>
                  {isCurrentActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-850">
                  {act.badge}
                </span>
              </div>

              <div>
                <div className={`text-xs sm:text-sm font-bold font-mono tracking-wider text-zinc-100 uppercase ${act.color}`}>
                  {act.label}
                </div>
                <div className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">
                  {act.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Shutdown Full Width Button */}
      {(() => {
        const act = actions[4];
        const Icon = act.icon;
        const isCurrentActive = activeCommand === act.id;

        return (
          <button
            type="button"
            disabled={Boolean(activeCommand)}
            onClick={() => handleActionClick(act.id)}
            className={`p-4 rounded-2xl border transition-all duration-200 text-left flex items-center justify-between active:scale-98 disabled:opacity-50 select-none ${act.border} ${act.bg} ${act.glow}`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 ${act.color}`}>
                {isCurrentActive ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="text-sm font-bold font-mono tracking-wider text-rose-400 uppercase">
                  {act.label}
                </div>
                <div className="text-[11px] font-mono text-zinc-400">
                  {act.description} (Requires Confirmation)
                </div>
              </div>
            </div>

            <span className="text-[10px] font-mono tracking-widest text-rose-400 uppercase px-2 py-1 rounded bg-rose-950/80 border border-rose-500/40">
              ARMED
            </span>
          </button>
        );
      })()}
    </div>
  );
}
