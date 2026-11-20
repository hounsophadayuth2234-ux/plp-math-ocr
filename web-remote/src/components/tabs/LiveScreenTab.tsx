'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Maximize,
  Minimize,
  MousePointer,
  Touchpad,
  Keyboard,
  Send,
  Radio,
  WifiOff,
  RefreshCw,
  Camera,
} from 'lucide-react';
import { sendControlCommand, onDiagnosticChange, DiagnosticInfo } from '@/lib/tunnelClient';

interface LiveScreenTabProps {
  tunnelUrl: string;
  pin: string;
  onRetry?: () => void;
}

type ControlMode = 'touch' | 'cursor';
type QualityPreset = 'low' | 'medium' | 'high';

export function LiveScreenTab({ tunnelUrl, pin, onRetry }: LiveScreenTabProps) {
  const [controlMode, setControlMode] = useState<ControlMode>('touch');
  const [quality, setQuality] = useState<QualityPreset>('medium');
  const [fps, setFps] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isTimedOut, setIsTimedOut] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showKeyboard, setShowKeyboard] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [diagInfo, setDiagInfo] = useState<DiagnosticInfo | null>(null);
  const [isFetchingSnapshot, setIsFetchingSnapshot] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenWsRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(0);

  // Subscribe to live diagnostics
  useEffect(() => {
    const unsub = onDiagnosticChange((diag) => {
      setDiagInfo(diag);
    });
    return () => unsub();
  }, []);

  // Touch tracking refs
  const touchStartRef = useRef<{ x: number; y: number; time: number; fingerCount: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const cursorLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const scrollLastYRef = useRef<number | null>(null);

  const triggerHaptic = (ms = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  // HTTP snapshot fallback fetcher
  const fetchFallbackSnapshot = useCallback(async () => {
    if (!tunnelUrl) return;
    setIsFetchingSnapshot(true);
    try {
      const resp = await fetch(`${tunnelUrl}/api/frame?pin=${encodeURIComponent(pin)}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const img = new Image();
      const objUrl = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(img, 0, 0);
        }
        URL.revokeObjectURL(objUrl);
      };
      img.src = objUrl;
    } catch (err) {
      console.warn('Fallback snapshot error:', err);
    } finally {
      setIsFetchingSnapshot(false);
    }
  }, [tunnelUrl, pin]);

  // Connect to live screen WebSocket
  useEffect(() => {
    if (!tunnelUrl) {
      const resetTimer = setTimeout(() => {
        setIsConnected(false);
        setIsTimedOut(true);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    const resetTimeoutTimer = setTimeout(() => {
      setIsTimedOut(false);
    }, 0);

    const wsUrl = tunnelUrl.replace('https://', 'wss://').replace('http://', 'ws://') +
      `/ws/screen?pin=${encodeURIComponent(pin)}&quality=${quality}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'blob';
    screenWsRef.current = ws;

    // 15-second connection timeout: accounts for 5G DNS lookup + TLS handshake
    const timeoutTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        setIsConnected(false);
        setIsTimedOut(true);
      }
    }, 15000);

    ws.onopen = () => {
      clearTimeout(timeoutTimer);
      setIsConnected(true);
      setIsTimedOut(false);
      lastFpsTimeRef.current = Date.now();
      console.log('[Screen WS] Connected to live desktop video feed.');
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        const blob = event.data;
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          const canvas = canvasRef.current;
          if (canvas) {
            if (canvas.width !== img.width || canvas.height !== img.height) {
              canvas.width = img.width;
              canvas.height = img.height;
            }
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
            }
          }
          URL.revokeObjectURL(url);
        };
        img.src = url;

        // Calculate FPS
        frameCountRef.current += 1;
        const now = Date.now();
        if (now - lastFpsTimeRef.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }
      }
    };

    ws.onclose = () => {
      clearTimeout(timeoutTimer);
      setIsConnected(false);
      setIsTimedOut(true);
      setFps(0);
    };

    ws.onerror = (err) => {
      clearTimeout(timeoutTimer);
      setIsConnected(false);
      setIsTimedOut(true);
      console.warn('[Screen WS] Error:', err);
    };

    return () => {
      clearTimeout(resetTimeoutTimer);
      clearTimeout(timeoutTimer);
      ws.close();
      screenWsRef.current = null;
    };
  }, [tunnelUrl, pin, quality]);

  // Switch quality preset dynamically
  const handleQualityChange = (newPreset: QualityPreset) => {
    setQuality(newPreset);
    if (screenWsRef.current && screenWsRef.current.readyState === WebSocket.OPEN) {
      screenWsRef.current.send(JSON.stringify({ action: 'set_preset', preset: newPreset }));
    }
  };

  // Toggle Fullscreen Landscape
  const toggleFullscreen = async () => {
    try {
      if (!isFullscreen) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        }
        setIsFullscreen(true);
        // Try orientation lock if supported
        const screenAny = window.screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } };
        if (screenAny?.orientation?.lock) {
          screenAny.orientation.lock('landscape').catch(() => {});
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(!isFullscreen);
    }
  };

  // Touch Handlers for Direct-Touch Mode & Precision Cursor Mode
  const getCanvasCoordinates = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x_ratio: 0, y_ratio: 0, clientX: 0, clientY: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return {
      x_ratio: Math.max(0, Math.min(1, x / rect.width)),
      y_ratio: Math.max(0, Math.min(1, y / rect.height)),
      clientX,
      clientY,
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touchCount = e.touches.length;

    if (touchCount === 2) {
      // 2-finger touch for scroll
      scrollLastYRef.current = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      return;
    }

    const { x_ratio, y_ratio, clientX, clientY } = getCanvasCoordinates(e);
    const now = Date.now();

    touchStartRef.current = {
      x: clientX,
      y: clientY,
      time: now,
      fingerCount: touchCount,
    };

    if (controlMode === 'touch') {
      // Start 450ms long-press timer for Right Click
      longPressTimerRef.current = setTimeout(() => {
        triggerHaptic(30);
        sendControlCommand({ type: 'right_click', x_ratio, y_ratio });
        longPressTimerRef.current = null;
      }, 450);
    } else {
      // Cursor mode
      cursorLastPosRef.current = { x: clientX, y: clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    // Cancel long press if moved
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // 2-finger scroll
    if (e.touches.length === 2 && scrollLastYRef.current !== null) {
      const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dy = scrollLastYRef.current - currentY;
      scrollLastYRef.current = currentY;
      if (Math.abs(dy) > 2) {
        sendControlCommand({ type: 'scroll', dy: Math.round(dy * 3) });
      }
      return;
    }

    if (controlMode === 'touch') {
      // Dragging on screen
      const { x_ratio, y_ratio } = getCanvasCoordinates(e);
      sendControlCommand({ type: 'mouse_move_abs', x_ratio, y_ratio });
    } else {
      // Relative cursor movement
      const touch = e.touches[0];
      if (cursorLastPosRef.current) {
        const rawDx = touch.clientX - cursorLastPosRef.current.x;
        const rawDy = touch.clientY - cursorLastPosRef.current.y;
        cursorLastPosRef.current = { x: touch.clientX, y: touch.clientY };
        sendControlCommand({ type: 'mouse_move_rel', dx: Math.round(rawDx * 1.5), dy: Math.round(rawDy * 1.5) });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    scrollLastYRef.current = null;
    cursorLastPosRef.current = null;

    if (!touchStartRef.current) return;

    const now = Date.now();
    const elapsed = now - touchStartRef.current.time;

    // Tap detection (under 250ms)
    if (elapsed < 250 && touchStartRef.current.fingerCount === 1) {
      const { x_ratio, y_ratio } = getCanvasCoordinates(e);

      if (now - lastTapTimeRef.current < 280) {
        // Double tap
        triggerHaptic(25);
        if (controlMode === 'touch') {
          sendControlCommand({ type: 'double_tap', x_ratio, y_ratio });
        } else {
          sendControlCommand({ type: 'double_tap' });
        }
      } else {
        // Single tap
        triggerHaptic(15);
        if (controlMode === 'touch') {
          sendControlCommand({ type: 'tap', x_ratio, y_ratio });
        } else {
          sendControlCommand({ type: 'tap' });
        }
      }
      lastTapTimeRef.current = now;
    }

    touchStartRef.current = null;
  };

  // Keyboard Typing
  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText) return;
    triggerHaptic(15);
    sendControlCommand({ type: 'type_text', text: inputText });
    setInputText('');
  };

  const handleQuickKey = (key: string) => {
    triggerHaptic(15);
    sendControlCommand({ type: 'key_press', key });
  };

  const handleQuickHotkey = (combo: string) => {
    triggerHaptic(15);
    sendControlCommand({ type: 'hotkey', combo });
  };

  return (
    <div className={`space-y-2 pb-24 ${isFullscreen ? 'fixed inset-0 z-50 bg-black p-0 m-0 pb-0' : ''}`}>
      {/* Top Stream Status & Control Bar */}
      {!isFullscreen && (
        <div className="flex items-center justify-between px-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="font-semibold text-zinc-300">Live Video Stream</span>
            {fps > 0 && (
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full font-mono font-bold">
                {fps} FPS
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quality Selector */}
            <div className="flex bg-white/[0.04] p-0.5 rounded-xl border border-white/[0.06]">
              {(['low', 'medium', 'high'] as QualityPreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handleQualityChange(p)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono uppercase transition-all ${
                    quality === p ? 'bg-cyan-500 text-black font-bold' : 'text-zinc-400'
                  }`}
                >
                  {p === 'low' ? '480p' : p === 'medium' ? '720p' : '1080p'}
                </button>
              ))}
            </div>

            {/* Mode Toggle */}
            <button
              onClick={() => {
                triggerHaptic(15);
                setControlMode(controlMode === 'touch' ? 'cursor' : 'touch');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                controlMode === 'touch'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
              }`}
            >
              {controlMode === 'touch' ? <Touchpad className="w-3.5 h-3.5" /> : <MousePointer className="w-3.5 h-3.5" />}
              <span>{controlMode === 'touch' ? 'Touch' : 'Cursor'}</span>
            </button>

            {/* Fullscreen Landscape Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.08]"
              title="Fullscreen Landscape Mode"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Live Video Canvas Area */}
      <div
        className={`relative w-full rounded-2xl overflow-hidden bg-black border border-white/[0.08] shadow-2xl flex items-center justify-center select-none ${
          isFullscreen ? 'h-full rounded-none border-0' : 'aspect-[16/10] max-h-[62vh]'
        }`}
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full h-full object-contain cursor-crosshair block"
        />

        {!isConnected && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-4 select-none z-10 overflow-y-auto">
            {isTimedOut || !tunnelUrl ? (
              <div className="flex flex-col items-center w-full max-w-[340px]">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-2 shadow-lg shadow-rose-500/10 animate-pulse">
                  <WifiOff className="w-5 h-5" />
                </div>
                <h3 className="text-xs font-bold text-zinc-100 tracking-wider uppercase">
                  PC OFFLINE / RECONNECTING...
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5 max-w-[280px] leading-relaxed">
                  WebSocket signal interrupted over 5G. Auto-reconnecting in background...
                </p>

                {/* Live Diagnostic Box */}
                <div className="mt-3 w-full rounded-xl bg-white/[0.03] border border-white/10 p-2.5 text-left font-mono text-[10px] space-y-1 backdrop-blur-md">
                  <div className="flex justify-between items-center text-zinc-400 border-b border-white/5 pb-1 mb-1">
                    <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[9px]">LIVE 5G DIAGNOSTICS</span>
                    <span className="text-cyan-400 font-medium">Dell Latitude Link</span>
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span className="text-zinc-500">Attempted URL:</span>
                    <span className="truncate max-w-[170px] text-zinc-200" title={tunnelUrl || 'None'}>
                      {tunnelUrl ? tunnelUrl.replace('https://', '').replace('.trycloudflare.com', '') : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span className="text-zinc-500">Dell Heartbeat:</span>
                    <span className={diagInfo?.heartbeatAgeSec !== null && diagInfo?.heartbeatAgeSec !== undefined && diagInfo.heartbeatAgeSec < 20 ? 'text-emerald-400' : 'text-amber-400'}>
                      {diagInfo?.heartbeatAgeSec !== null && diagInfo?.heartbeatAgeSec !== undefined ? `${diagInfo.heartbeatAgeSec}s ago` : 'Checking...'}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span className="text-zinc-500">Failure Reason:</span>
                    <span className="text-rose-400 font-medium truncate max-w-[170px]" title={diagInfo?.lastErrorReason || 'Handshake Pending'}>
                      {diagInfo?.lastErrorReason || 'Handshake Pending'}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span className="text-zinc-500">Retries:</span>
                    <span className="text-zinc-400">{diagInfo?.reconnectAttempts || 0}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 w-full">
                  {onRetry && (
                    <button
                      onClick={() => {
                        triggerHaptic(20);
                        onRetry();
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs tracking-wider shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>RETRY NOW</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      triggerHaptic(15);
                      fetchFallbackSnapshot();
                    }}
                    disabled={isFetchingSnapshot}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border border-white/10 font-medium text-xs active:scale-95 transition-all"
                    title="Fetch single JPEG frame over standard HTTP"
                  >
                    <Camera className={`w-3.5 h-3.5 ${isFetchingSnapshot ? 'animate-spin' : ''}`} />
                    <span>{isFetchingSnapshot ? 'GRABBING...' : 'SNAPSHOT'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Radio className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
                <p className="text-sm font-semibold text-zinc-200">Connecting to Live Dell Stream...</p>
                <p className="text-xs text-zinc-500 mt-1">Negotiating 5G / Cloudflare WebSocket</p>
              </div>
            )}
          </div>
        )}

        {/* Floating Toggle Controls in Fullscreen */}
        {isFullscreen && (
          <div className="absolute top-3 right-3 flex items-center gap-2 z-50">
            <button
              onClick={() => setControlMode(controlMode === 'touch' ? 'cursor' : 'touch')}
              className="p-2 rounded-xl bg-black/60 backdrop-blur-md text-cyan-300 border border-white/[0.1]"
            >
              {controlMode === 'touch' ? <Touchpad className="w-4 h-4" /> : <MousePointer className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowKeyboard(!showKeyboard)}
              className="p-2 rounded-xl bg-black/60 backdrop-blur-md text-zinc-300 border border-white/[0.1]"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-black/60 backdrop-blur-md text-zinc-300 border border-white/[0.1]"
            >
              <Minimize className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Floating Collapsible Quick Action Toolbar */}
      <div className="glass-panel rounded-2xl p-2.5 border border-white/[0.08] shadow-xl space-y-2">
        {/* Shortcut Chips */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-0.5">
          <button
            onClick={() => handleQuickHotkey('win+d')}
            className="glass-btn px-2.5 py-1.5 rounded-xl text-[11px] font-mono text-zinc-300 active:bg-cyan-500/20"
          >
            Win+D
          </button>
          <button
            onClick={() => handleQuickHotkey('alt+tab')}
            className="glass-btn px-2.5 py-1.5 rounded-xl text-[11px] font-mono text-zinc-300 active:bg-cyan-500/20"
          >
            Alt+Tab
          </button>
          <button
            onClick={() => handleQuickKey('esc')}
            className="glass-btn px-2.5 py-1.5 rounded-xl text-[11px] font-mono text-zinc-300 active:bg-cyan-500/20"
          >
            Esc
          </button>
          <button
            onClick={() => handleQuickKey('enter')}
            className="glass-btn px-2.5 py-1.5 rounded-xl text-[11px] font-mono text-zinc-300 active:bg-cyan-500/20"
          >
            Enter
          </button>
          <button
            onClick={() => handleQuickKey('backspace')}
            className="glass-btn px-2.5 py-1.5 rounded-xl text-[11px] font-mono text-zinc-300 active:bg-cyan-500/20"
          >
            ⌫
          </button>
          <button
            onClick={() => {
              triggerHaptic(20);
              sendControlCommand({ type: 'right_click' });
            }}
            className="glass-btn px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-cyan-300 border-cyan-500/30"
          >
            R-Click
          </button>
        </div>

        {/* Text Typing Bar (Khmer & Unicode) */}
        <form onSubmit={handleSendText} className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type text directly to Dell (Khmer / English)..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400/50"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs flex items-center gap-1 active:scale-95 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Type</span>
          </button>
        </form>
      </div>
    </div>
  );
}
