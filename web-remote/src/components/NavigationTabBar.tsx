'use client';

import React from 'react';
import { Monitor, Activity, Folder, Sliders } from 'lucide-react';

export type TabKey = 'screen' | 'monitor' | 'files' | 'tools';

interface NavigationTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export function NavigationTabBar({ activeTab, onTabChange }: NavigationTabBarProps) {
  const tabs = [
    { key: 'screen' as TabKey, label: 'Screen', icon: Monitor },
    { key: 'monitor' as TabKey, label: 'Monitor', icon: Activity },
    { key: 'files' as TabKey, label: 'Files & Apps', icon: Folder },
    { key: 'tools' as TabKey, label: 'Power & Tools', icon: Sliders },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-safe pt-2 bg-[#080a0f]/90 backdrop-blur-2xl border-t border-white/[0.08]">
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
                  ? 'bg-cyan-500/15 text-cyan-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 active:bg-white/[0.04]'
              }`}
            >
              <Icon className={`w-5 h-5 mb-1 transition-transform ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[10px] tracking-tight truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
