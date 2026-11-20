'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Laptop, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import PinLockScreen from '../components/PinLockScreen';
import PowerConfirmModal from '../components/ShutdownConfirmModal';
import { NavigationTabBar, TabKey } from '../components/NavigationTabBar';
import { LiveScreenTab } from '../components/tabs/LiveScreenTab';
import { MonitorTab } from '../components/tabs/MonitorTab';
import { FilesTab } from '../components/tabs/FilesTab';
import { PowerToolsTab } from '../components/tabs/PowerToolsTab';
import {
  fetchLiveTunnelUrl,
  subscribeToTunnelUpdates,
  initControlWebSocket,
  checkPing,
  sendControlCommand,
  onConnectionStatusChange,
  forceReconnect,
  ConnectionStatus,
} from '../lib/tunnelClient';

export default function MobileRemotePage() {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [hasMounted, setHasMounted] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabKey>('screen');
  const [tunnelUrl, setTunnelUrl] = useState<string>('');
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [isConnectingTunnel, setIsConnectingTunnel] = useState<boolean>(false);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [activeWindow, setActiveWindow] = useState<string>('');

  const [powerModalState, setPowerModalState] = useState<{
    isOpen: boolean;
    action: 'shutdown' | 'restart';
    isExecuting: boolean;
  }>({
    isOpen: false,
    action: 'shutdown',
    isExecuting: false,
  });

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  const PIN = process.env.NEXT_PUBLIC_ACCESS_PIN || '123456';

  const showToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((cur) => (cur?.text === text ? null : cur));
    }, 3000);
  }, []);

  // Restore session
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

  // Discover Cloudflare Tunnel URL from Supabase
  const discoverTunnel = useCallback(async () => {
    setIsConnectingTunnel(true);
    try {
      const url = await fetchLiveTunnelUrl();
      if (url) {
        setTunnelUrl(url);
        initControlWebSocket(url, PIN);
        try {
          const pingRes = await checkPing(url, PIN);
          setPingMs(pingRes.latencyMs);
          if (pingRes.activeWindow) setActiveWindow(pingRes.activeWindow);
        } catch {
          // Handled
        }
      }
    } catch {
      // Ignored
    } finally {
      setIsConnectingTunnel(false);
    }
  }, [PIN]);

  const handleManualRetry = useCallback(async () => {
    showToast('Re-discovering Dell tunnel...', 'info');
    setIsConnectingTunnel(true);
    try {
      const fresh = await forceReconnect(PIN);
      if (fresh) {
        setTunnelUrl(fresh);
        try {
          const ping = await checkPing(fresh, PIN);
          setPingMs(ping.latencyMs);
          if (ping.activeWindow) setActiveWindow(ping.activeWindow);
          showToast('Live connection restored!', 'success');
        } catch {
          showToast('Dell is currently unreachable. Retrying in background...', 'error');
        }
      } else {
        showToast('No active tunnel found in Supabase.', 'error');
      }
    } finally {
      setIsConnectingTunnel(false);
    }
  }, [PIN, showToast]);

  useEffect(() => {
    if (!isUnlocked) return;

    const timer = setTimeout(() => {
      discoverTunnel();
    }, 0);

    const unsubStatus = onConnectionStatusChange((status) => {
      setConnStatus(status);
    });

    const unsub = subscribeToTunnelUpdates((newUrl) => {
      setTunnelUrl(newUrl);
      initControlWebSocket(newUrl, PIN);
      showToast('New Live Tunnel connected!', 'success');
    });

    const pingInterval = setInterval(async () => {
      if (tunnelUrl && connStatus === 'connected') {
        try {
          const res = await checkPing(tunnelUrl, PIN);
          setPingMs(res.latencyMs);
          if (res.activeWindow) setActiveWindow(res.activeWindow);
        } catch {
          setPingMs(null);
        }
      }
    }, 6000);

    return () => {
      clearTimeout(timer);
      unsubStatus();
      unsub();
      clearInterval(pingInterval);
    };
  }, [isUnlocked, tunnelUrl, connStatus, PIN, discoverTunnel, showToast]);

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

  const handleConfirmPower = async () => {
    setPowerModalState((prev) => ({ ...prev, isExecuting: true }));
    const cmd = powerModalState.action;
    try {
      sendControlCommand({ type: cmd });
      showToast(`${cmd.toUpperCase()} command sent!`, 'success');
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
      <header className="sticky top-0 z-30 px-3 pt-safe pb-2 bg-[#080a0f]/85 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
              <Laptop className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs tracking-wider uppercase text-zinc-100 truncate">
                  DELL × HONOR WIN
                </span>
                <span className="text-[10px] bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-extrabold px-1.5 py-0.2 rounded flex-shrink-0">
                  V3.0 PRO
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 truncate">
                {connStatus === 'connected'
                  ? (activeWindow ? `Open: ${activeWindow}` : 'Live Connected')
                  : connStatus === 'connecting'
                  ? 'Reconnecting to Dell...'
                  : 'PC Offline / Signal Lost'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Live Connection Pill */}
            {connStatus === 'connected' ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                <Wifi className="w-3 h-3 animate-pulse" />
                <span>{pingMs !== null ? `${pingMs}ms` : 'Live Connected'}</span>
              </span>
            ) : connStatus === 'connecting' ? (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-mono">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Reconnecting...</span>
              </span>
            ) : (
              <button
                onClick={handleManualRetry}
                disabled={isConnectingTunnel}
                className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/30 hover:bg-rose-500/20 transition-all font-mono"
                title="Click to reconnect to Dell"
              >
                <WifiOff className="w-3 h-3" />
                <span>{isConnectingTunnel ? 'Connecting...' : 'PC Offline • Retry'}</span>
              </button>
            )}

            <button
              onClick={handleLockSession}
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 border border-white/[0.06] transition-colors"
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
      <main className="flex-1 max-w-md w-full mx-auto px-3 pt-2">
        {activeTab === 'screen' && (
          <LiveScreenTab tunnelUrl={tunnelUrl} pin={PIN} onRetry={handleManualRetry} />
        )}

        {activeTab === 'monitor' && <MonitorTab tunnelUrl={tunnelUrl} pin={PIN} />}

        {activeTab === 'files' && <FilesTab tunnelUrl={tunnelUrl} pin={PIN} />}

        {activeTab === 'tools' && (
          <PowerToolsTab
            tunnelUrl={tunnelUrl}
            pin={PIN}
            onRequestPowerAction={(action) =>
              setPowerModalState({ isOpen: true, action, isExecuting: false })
            }
          />
        )}
      </main>

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

      {/* Fixed 4-Tab Bottom Navigation Bar */}
      <NavigationTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
