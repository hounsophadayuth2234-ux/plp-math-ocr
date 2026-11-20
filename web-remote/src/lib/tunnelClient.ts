import { supabase } from './supabase';
import { FilesResponse } from './types';

export type ConnectionStatus = 'connected' | 'connecting' | 'offline';

let currentStatus: ConnectionStatus = 'connecting';
const statusListeners = new Set<(status: ConnectionStatus) => void>();

let controlSocket: WebSocket | null = null;
const controlQueue: string[] = [];
let onControlResponseCallback: ((data: Record<string, unknown>) => void) | null = null;

let activeTunnelUrl: string | null = null;
let currentPin: string = '123456';
let reconnectTimer: NodeJS.Timeout | null = null;
let connectTimeoutTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;

export function getConnectionStatus(): ConnectionStatus {
  return currentStatus;
}

function setConnectionStatus(status: ConnectionStatus) {
  if (currentStatus !== status) {
    currentStatus = status;
    statusListeners.forEach((cb) => {
      try {
        cb(status);
      } catch (err) {
        console.warn('Status listener error:', err);
      }
    });
  }
}

export function onConnectionStatusChange(cb: (status: ConnectionStatus) => void): () => void {
  statusListeners.add(cb);
  cb(currentStatus);
  return () => {
    statusListeners.delete(cb);
  };
}

export async function fetchLiveTunnelUrl(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('device_commands')
      .select('payload')
      .eq('command', 'TUNNEL_URL')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return (data.payload as string).replace(/\/$/, '');
  } catch (err) {
    console.warn('Failed to fetch tunnel URL from Supabase:', err);
    return null;
  }
}

export function subscribeToTunnelUpdates(onNewTunnel: (url: string) => void): () => void {
  const channel = supabase
    .channel('tunnel_url_listener')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'device_commands',
        filter: 'command=eq.TUNNEL_URL',
      },
      (payload) => {
        const newUrl = payload.new?.payload;
        if (newUrl) {
          const clean = (newUrl as string).replace(/\/$/, '');
          activeTunnelUrl = clean;
          onNewTunnel(clean);
          // Auto-reconnect with new URL
          initControlWebSocket(clean, currentPin);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function initControlWebSocket(
  tunnelUrl: string,
  pin: string,
  onResponse?: (data: Record<string, unknown>) => void
): WebSocket {
  if (onResponse) onControlResponseCallback = onResponse;
  activeTunnelUrl = tunnelUrl;
  currentPin = pin;

  if (controlSocket) {
    if (controlSocket.readyState === WebSocket.OPEN) {
      setConnectionStatus('connected');
      return controlSocket;
    }
    if (controlSocket.readyState === WebSocket.CONNECTING) {
      setConnectionStatus('connecting');
      return controlSocket;
    }
    try {
      controlSocket.close();
    } catch {
      // Ignored
    }
  }

  setConnectionStatus('connecting');

  if (connectTimeoutTimer) {
    clearTimeout(connectTimeoutTimer);
  }

  const wsUrl =
    tunnelUrl.replace('https://', 'wss://').replace('http://', 'ws://') +
    `/ws/control?pin=${encodeURIComponent(pin)}`;

  const ws = new WebSocket(wsUrl);

  // 4-second connection timeout: if socket doesn't open within 4s, trigger reconnect
  connectTimeoutTimer = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn('[Control WS] Connection timed out after 4000ms.');
      try {
        ws.close();
      } catch {
        // Ignored
      }
      handleDisconnect();
    }
  }, 4000);

  ws.onopen = () => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    console.log('[Control WS] Connected to live PC control channel.');
    reconnectAttempts = 0;
    setConnectionStatus('connected');

    // Flush queued messages
    while (controlQueue.length > 0) {
      const msg = controlQueue.shift();
      if (msg) ws.send(msg);
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as Record<string, unknown>;
      if (onControlResponseCallback) {
        onControlResponseCallback(data);
      }
    } catch {
      // Non-json message
    }
  };

  ws.onclose = () => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    controlSocket = null;
    console.log('[Control WS] Disconnected.');
    handleDisconnect();
  };

  ws.onerror = (err) => {
    console.warn('[Control WS] Error:', err);
    // Onerror will naturally trigger onclose
  };

  controlSocket = ws;
  return ws;
}

function handleDisconnect() {
  setConnectionStatus('offline');

  if (reconnectTimer) clearTimeout(reconnectTimer);

  // Exponential backoff: 2s, 4s, 8s, max 10s
  const delay = Math.min(10000, 2000 * Math.pow(1.5, reconnectAttempts));
  reconnectAttempts++;

  console.log(`[Auto-Reconnect] Scheduling retry in ${delay}ms (attempt #${reconnectAttempts})...`);
  reconnectTimer = setTimeout(async () => {
    try {
      console.log('[Auto-Reconnect] Querying Supabase for latest TUNNEL_URL...');
      const freshUrl = await fetchLiveTunnelUrl();
      if (freshUrl) {
        activeTunnelUrl = freshUrl;
        initControlWebSocket(freshUrl, currentPin);
      } else {
        handleDisconnect();
      }
    } catch (err) {
      console.warn('[Auto-Reconnect] Error during retry:', err);
      handleDisconnect();
    }
  }, delay);
}

export async function forceReconnect(pin?: string): Promise<string | null> {
  if (pin) currentPin = pin;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);

  setConnectionStatus('connecting');
  reconnectAttempts = 0;

  try {
    const url = await fetchLiveTunnelUrl();
    if (url) {
      activeTunnelUrl = url;
      initControlWebSocket(url, currentPin);
      return url;
    }
    setConnectionStatus('offline');
    return null;
  } catch (err) {
    console.warn('Manual reconnect failed:', err);
    setConnectionStatus('offline');
    return null;
  }
}

export function sendControlCommand(cmd: Record<string, unknown>, tunnelUrl?: string, pin?: string): void {
  const msg = JSON.stringify(cmd);
  if (controlSocket && controlSocket.readyState === WebSocket.OPEN) {
    controlSocket.send(msg);
  } else {
    controlQueue.push(msg);
    if ((tunnelUrl || activeTunnelUrl) && (pin || currentPin)) {
      initControlWebSocket(tunnelUrl || activeTunnelUrl!, pin || currentPin);
    }
  }
}

export async function checkPing(tunnelUrl: string, pin: string): Promise<{ latencyMs: number; activeWindow?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const t0 = performance.now();
    const resp = await fetch(`${tunnelUrl}/api/ping?pin=${encodeURIComponent(pin)}`, {
      signal: controller.signal,
    });
    const dt = Math.round(performance.now() - t0);
    clearTimeout(timeoutId);
    if (!resp.ok) {
      throw new Error(`Ping failed with status ${resp.status}`);
    }
    const data = await resp.json();
    return { latencyMs: dt, activeWindow: data.active_window };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function fetchFiles(tunnelUrl: string, pin: string, dirPath?: string): Promise<FilesResponse> {
  const query = dirPath ? `&path=${encodeURIComponent(dirPath)}` : '';
  const resp = await fetch(`${tunnelUrl}/api/files?pin=${encodeURIComponent(pin)}${query}`);
  if (!resp.ok) {
    throw new Error(`Failed to list files: ${resp.statusText}`);
  }
  return (await resp.json()) as FilesResponse;
}

export async function openFileOnPC(tunnelUrl: string, pin: string, filePath: string): Promise<void> {
  const resp = await fetch(`${tunnelUrl}/api/open-file?pin=${encodeURIComponent(pin)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to open file on PC: ${resp.statusText}`);
  }
}

export function getDownloadUrl(tunnelUrl: string, pin: string, filePath: string): string {
  return `${tunnelUrl}/api/download?pin=${encodeURIComponent(pin)}&path=${encodeURIComponent(filePath)}`;
}

export async function killProcess(tunnelUrl: string, pin: string, pid: number): Promise<void> {
  const resp = await fetch(`${tunnelUrl}/api/kill-process?pin=${encodeURIComponent(pin)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to kill process: ${resp.statusText}`);
  }
}

export async function sendRemoteAlert(tunnelUrl: string, pin: string, message: string, tts = true): Promise<void> {
  const resp = await fetch(`${tunnelUrl}/api/alert?pin=${encodeURIComponent(pin)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tts }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to send alert: ${resp.statusText}`);
  }
}
