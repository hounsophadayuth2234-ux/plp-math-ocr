import { supabase } from './supabase';
import { FilesResponse } from './types';

export type ConnectionStatus = 'connected' | 'connecting' | 'offline';

export interface DiagnosticInfo {
  tunnelUrl: string | null;
  status: ConnectionStatus;
  lastErrorReason: string;
  heartbeatAgeSec: number | null;
  reconnectAttempts: number;
}

let currentStatus: ConnectionStatus = 'connecting';
let diagnosticReason: string = 'Initializing connection...';
let latestHeartbeatAgeSec: number | null = null;
const statusListeners = new Set<(status: ConnectionStatus) => void>();
const diagListeners = new Set<(diag: DiagnosticInfo) => void>();

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

export function getDiagnosticInfo(): DiagnosticInfo {
  return {
    tunnelUrl: activeTunnelUrl,
    status: currentStatus,
    lastErrorReason: diagnosticReason,
    heartbeatAgeSec: latestHeartbeatAgeSec,
    reconnectAttempts,
  };
}

function notifyDiagnosticChange() {
  const diag = getDiagnosticInfo();
  diagListeners.forEach((cb) => {
    try {
      cb(diag);
    } catch {
      // Ignored
    }
  });
}

export function setDiagnosticReason(reason: string) {
  diagnosticReason = reason;
  notifyDiagnosticChange();
}

export function onDiagnosticChange(cb: (diag: DiagnosticInfo) => void): () => void {
  diagListeners.add(cb);
  cb(getDiagnosticInfo());
  return () => {
    diagListeners.delete(cb);
  };
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
    notifyDiagnosticChange();
  }
}

export function onConnectionStatusChange(cb: (status: ConnectionStatus) => void): () => void {
  statusListeners.add(cb);
  cb(currentStatus);
  return () => {
    statusListeners.delete(cb);
  };
}

export function getDirectServerUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  const port = window.location.port;
  // If hosted on pc_server.py (port 8765) or accessed via Tailscale (100.x.y.z) or LAN IP
  if (port === '8765' || host.startsWith('100.') || host.startsWith('10.') || host.startsWith('192.168.')) {
    return window.location.origin;
  }
  // If origin is not a remote vercel deployment or standard next dev
  if (!window.location.origin.includes('vercel.app') && !window.location.origin.includes('localhost:3000')) {
    return window.location.origin;
  }
  return null;
}

export async function fetchLiveTunnelUrl(): Promise<string | null> {
  const direct = getDirectServerUrl();
  if (direct) {
    activeTunnelUrl = direct;
    notifyDiagnosticChange();
    return direct;
  }

  try {
    const { data, error } = await supabase
      .from('device_commands')
      .select('payload')
      .eq('command', 'TUNNEL_URL')
      .eq('status', 'active')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    const cleanUrl = (data.payload as string).replace(/\/$/, '');
    activeTunnelUrl = cleanUrl;
    notifyDiagnosticChange();
    return cleanUrl;
  } catch (err) {
    console.warn('Failed to fetch tunnel URL from Supabase:', err);
    return null;
  }
}

export async function fetchHeartbeatAge(): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('device_telemetry')
      .select('updated_at')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data || !data.updated_at) return null;
    const lastTime = new Date(data.updated_at).getTime();
    const ageSeconds = Math.max(0, Math.round((Date.now() - lastTime) / 1000));
    latestHeartbeatAgeSec = ageSeconds;
    notifyDiagnosticChange();
    return ageSeconds;
  } catch {
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
        const newStatus = payload.new?.status;
        if (newUrl && newStatus === 'active') {
          const clean = (newUrl as string).replace(/\/$/, '');
          activeTunnelUrl = clean;
          onNewTunnel(clean);
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
  setDiagnosticReason(`Connecting to ${tunnelUrl}...`);

  if (connectTimeoutTimer) {
    clearTimeout(connectTimeoutTimer);
  }

  const wsUrl =
    tunnelUrl.replace('https://', 'wss://').replace('http://', 'ws://') +
    `/ws/control?pin=${encodeURIComponent(pin)}`;

  const ws = new WebSocket(wsUrl);

  // 10-second timeout: accounts for mobile carrier DNS lookup + direct connection handshake
  connectTimeoutTimer = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn('[Control WS] Connection timed out after 10000ms.');
      setDiagnosticReason('Connection Timeout (10s exceeded)');
      try {
        ws.close();
      } catch {
        // Ignored
      }
      handleDisconnect();
    }
  }, 10000);

  ws.onopen = () => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    console.log('[Control WS] Connected to live PC control channel.');
    reconnectAttempts = 0;
    setConnectionStatus('connected');
    setDiagnosticReason('WebSocket Connected');

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

  ws.onclose = (ev) => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    controlSocket = null;
    const reason = ev.code ? `WS Closed (Code ${ev.code}${ev.reason ? ': ' + ev.reason : ''})` : 'WS Disconnected';
    console.log('[Control WS]', reason);
    setDiagnosticReason(reason);
    handleDisconnect();
  };

  ws.onerror = (err) => {
    console.warn('[Control WS] Error:', err);
    setDiagnosticReason('CORS / Network Error (Tunnel Unreachable)');
  };

  controlSocket = ws;
  return ws;
}

function handleDisconnect() {
  setConnectionStatus('offline');

  if (reconnectTimer) clearTimeout(reconnectTimer);

  const delay = Math.min(10000, 2000 * Math.pow(1.5, reconnectAttempts));
  reconnectAttempts++;

  console.log(`[Auto-Reconnect] Scheduling retry in ${delay}ms (attempt #${reconnectAttempts})...`);
  reconnectTimer = setTimeout(async () => {
    try {
      const direct = getDirectServerUrl();
      if (direct) {
        console.log('[Auto-Reconnect] Retrying direct Tailscale/Local connection to:', direct);
        setDiagnosticReason(`Retrying direct connection to ${direct}...`);
        activeTunnelUrl = direct;
        initControlWebSocket(direct, currentPin);
        return;
      }

      console.log('[Auto-Reconnect] Querying Supabase for latest active TUNNEL_URL...');
      const freshUrl = await fetchLiveTunnelUrl();
      await fetchHeartbeatAge();
      if (freshUrl) {
        activeTunnelUrl = freshUrl;
        initControlWebSocket(freshUrl, currentPin);
      } else {
        setDiagnosticReason('No active TUNNEL_URL row found in Supabase');
        handleDisconnect();
      }
    } catch (err) {
      console.warn('[Auto-Reconnect] Error during retry:', err);
      setDiagnosticReason('Query Error during reconnect');
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
  setDiagnosticReason('Forced Reconnect initiated...');

  try {
    const [url] = await Promise.all([fetchLiveTunnelUrl(), fetchHeartbeatAge()]);
    if (url) {
      activeTunnelUrl = url;
      initControlWebSocket(url, currentPin);
      return url;
    }
    setDiagnosticReason('Supabase returned no active tunnel URL');
    setConnectionStatus('offline');
    return null;
  } catch (err) {
    console.warn('Manual reconnect failed:', err);
    setDiagnosticReason(`Reconnect failed: ${err instanceof Error ? err.message : String(err)}`);
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
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const t0 = performance.now();
    const resp = await fetch(`${tunnelUrl}/api/ping?pin=${encodeURIComponent(pin)}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    const dt = Math.round(performance.now() - t0);
    clearTimeout(timeoutId);
    if (!resp.ok) {
      if (resp.status === 401) {
        setDiagnosticReason('HTTP 401 Unauthorized (Incorrect PIN)');
      } else {
        setDiagnosticReason(`HTTP Error ${resp.status}: ${resp.statusText}`);
      }
      throw new Error(`Ping failed with status ${resp.status}`);
    }
    const data = await resp.json();
    return { latencyMs: dt, activeWindow: data.active_window };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      setDiagnosticReason('HTTP Ping Timeout (6000ms exceeded)');
    } else {
      setDiagnosticReason(`CORS / Network Error: ${err instanceof Error ? err.message : 'Unreachable'}`);
    }
    throw err;
  }
}

export function getFrameSnapshotUrl(tunnelUrl: string, pin: string): string {
  return `${tunnelUrl}/api/frame?pin=${encodeURIComponent(pin)}&t=${Date.now()}`;
}

export async function fetchFiles(tunnelUrl: string, pin: string, dirPath?: string): Promise<FilesResponse> {
  const query = dirPath ? `&path=${encodeURIComponent(dirPath)}` : '';
  const resp = await fetch(`${tunnelUrl}/api/files?pin=${encodeURIComponent(pin)}${query}`, {
    cache: 'no-store',
  });
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
