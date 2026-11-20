'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Laptop } from 'lucide-react';
import PinLockScreen from '../components/PinLockScreen';
import PowerConfirmModal from '../components/ShutdownConfirmModal';
import { ScreenshotModal } from '../components/ScreenshotModal';
import { NavigationTabBar, TabKey } from '../components/NavigationTabBar';
import { ControlTab } from '../components/tabs/ControlTab';
import { TrackpadTab } from '../components/tabs/TrackpadTab';
import { LauncherTab } from '../components/tabs/LauncherTab';
import { ToolsTab } from '../components/tabs/ToolsTab';
import {
  supabase,
  sendDeviceCommand,
  fetchLatestTelemetry,
} from '../lib/supabase';
import { DeviceTelemetry } from '../lib/types';

export default function MobileRemotePage() {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [hasMounted, setHasMounted] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabKey>('control');

  const [telemetry, setTelemetry] = useState<DeviceTelemetry | null>(null);
  const [powerModalState, setPowerModalState] = useState<{
    isOpen: boolean;
    action: 'shutdown' | 'restart';
    isExecuting: boolean;
  }>({
    isOpen: false,
    action: 'shutdown',
    isExecuting: false,
  });

  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState<boolean>(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  const showToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((cur) => (cur?.text === text ? null : cur));
    }, 3000);
  }, []);

  // Restore session asynchronously on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        const session = sessionStorage.getItem('cyber_remote_unlocked');
        if (session === 'true') {
          setIsUnlocked(true);
        }
        setHasMounted(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Load telemetry
  const loadTelemetry = useCallback(async () => {
    try {
      const data = await fetchLatestTelemetry();
      if (data) {
        setTelemetry(data);
      }
    } catch {
      // Handled silently
    }
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;

    const timer = setTimeout(() => {
      loadTelemetry();
    }, 0);

    // Subscribe to Postgres changes on device_telemetry
    const telemetrySub = supabase
      .channel('public:device_telemetry_live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_telemetry',
          filter: 'id=eq.1',
        },
        (payload) => {
          if (payload.new) {
            setTelemetry(payload.new as DeviceTelemetry);
          }
        }
      )
      .subscribe();

    // Fallback polling every 5s
    const poller = setInterval(loadTelemetry, 5000);

    return () => {
      clearTimeout(timer);
      clearInterval(poller);
      supabase.removeChannel(telemetrySub);
    };
  }, [isUnlocked, loadTelemetry]);

  const handleUnlock = () => {
    setIsUnlocked(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('cyber_remote_unlocked', 'true');
    }
    showToast('Authenticated // Dell Latitude Link Active', 'success');
  };

  const handleLockSession = () => {
    setIsUnlocked(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('cyber_remote_unlocked');
    }
    showToast('Session locked', 'info');
  };

  // Trigger screenshot capture
  const handleTriggerScreenshot = async () => {
    setIsCapturingScreenshot(true);
    showToast('Capturing Dell screen...', 'info');
    try {
      await sendDeviceCommand('SCREENSHOT');
      setTimeout(async () => {
        await loadTelemetry();
        setIsCapturingScreenshot(false);
        setIsScreenshotModalOpen(true);
        showToast('Screen view captured!', 'success');
      }, 1800);
    } catch {
      setIsCapturingScreenshot(false);
      showToast('Screenshot capture failed', 'error');
    }
  };

  // Power action confirm
  const handleConfirmPower = async () => {
    setPowerModalState((prev) => ({ ...prev, isExecuting: true }));
    const cmd = powerModalState.action === 'shutdown' ? 'SHUTDOWN' : 'RESTART';
    try {
      await sendDeviceCommand(cmd);
      showToast(`${cmd} dispatched in 5s!`, 'success');
    } catch {
      showToast(`Failed to dispatch ${cmd}`, 'error');
    } finally {
      setTimeout(() => {
        setPowerModalState({ isOpen: false, action: 'shutdown', isExecuting: false });
      }, 600);
    }
  };

  if (!hasMounted) {
    return (
      <div className="min-h-screen bg-[#080a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isUnlocked) {
    return <PinLockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="min-h-screen bg-[#080a0f] text-zinc-100 flex flex-col justify-between selection:bg-cyan-500/30">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 px-4 pt-safe pb-2 bg-[#080a0f]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Laptop className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs tracking-wider uppercase text-zinc-100">
                  DELL × HONOR WIN
                </span>
                <span className="text-[10px] bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-extrabold px-1.5 py-0.2 rounded">
                  V2.0 PRO
                </span>
              </div>
              <p className="text-[10px] text-zinc-500">Ultra-Low Latency Broadcast</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleLockSession}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 border border-white/[0.06] transition-colors"
              title="Lock remote session"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Global Toast */}
        {toastMessage && (
          <div
            className={`mt-2 py-1.5 px-3 rounded-xl text-center text-xs font-medium animate-in fade-in transition-all ${
              toastMessage.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : toastMessage.type === 'error'
                ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
            }`}
          >
            {toastMessage.text}
          </div>
        )}
      </header>

      {/* Main Tab Content */}
      <main className="flex-1 max-w-md w-full mx-auto px-3.5 pt-3">
        {activeTab === 'control' && (
          <ControlTab
            telemetry={telemetry}
            onOpenScreenshot={() => setIsScreenshotModalOpen(true)}
            onRequestPowerAction={(action) =>
              setPowerModalState({ isOpen: true, action, isExecuting: false })
            }
            onTriggerScreenshot={handleTriggerScreenshot}
            isScreenshotting={isCapturingScreenshot}
          />
        )}

        {activeTab === 'trackpad' && <TrackpadTab />}

        {activeTab === 'launcher' && <LauncherTab />}

        {activeTab === 'tools' && <ToolsTab />}
      </main>

      {/* Screenshot Modal with Tap-to-Click */}
      <ScreenshotModal
        isOpen={isScreenshotModalOpen}
        onClose={() => setIsScreenshotModalOpen(false)}
        screenshotUrl={telemetry?.screenshot_url ?? null}
        onRefresh={handleTriggerScreenshot}
        isRefreshing={isCapturingScreenshot}
      />

      {/* Power Confirm Modal (Shutdown / Restart) */}
      <PowerConfirmModal
        isOpen={powerModalState.isOpen}
        actionType={powerModalState.action}
        isExecuting={powerModalState.isExecuting}
        onConfirm={handleConfirmPower}
        onCancel={() =>
          setPowerModalState({ isOpen: false, action: 'shutdown', isExecuting: false })
        }
      />

      {/* Bottom Fixed Navigation Bar */}
      <NavigationTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
