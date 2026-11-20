'use client';

import React from 'react';
import { LayoutDashboard, MousePointer, PlaySquare, Wrench } from 'lucide-react';

export type TabKey = 'control' | 'trackpad' | 'launcher' | 'tools';

interface NavigationTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export function NavigationTabBar({ activeTab, onTabChange }: NavigationTabBarProps) {
  const tabs = [
    { key: 'control' as TabKey, label: 'Control', icon: LayoutDashboard },
    { key: 'trackpad' as TabKey, label: 'Trackpad', icon: MousePointer },
    { key: 'launcher' as TabKey, label: 'Launcher', icon: PlaySquare },
    { key: 'tools' as TabKey, label: 'Tools', icon: Wrench },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-safe pt-2 bg-[#090b11]/85 backdrop-blur-2xl border-t border-white/[0.08]">
      <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                  navigator.vibrate(10);
                }
                onTabChange(tab.key);
              }}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all duration-200 ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 active:bg-white/[0.04]'
              }`}
            >
              <Icon className={`w-5 h-5 mb-1 transition-transform ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[11px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
