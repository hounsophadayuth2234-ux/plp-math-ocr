import { supabase } from './supabase';
import { FilesResponse } from './types';

let controlSocket: WebSocket | null = null;
const controlQueue: string[] = [];
let onControlResponseCallback: ((data: Record<string, unknown>) => void) | null = null;

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
          onNewTunnel((newUrl as string).replace(/\/$/, ''));
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

  if (controlSocket && (controlSocket.readyState === WebSocket.OPEN || controlSocket.readyState === WebSocket.CONNECTING)) {
    return controlSocket;
  }

  const wsUrl = tunnelUrl.replace('https://', 'wss://').replace('http://', 'ws://') + `/ws/control?pin=${encodeURIComponent(pin)}`;

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[Control WS] Connected to live PC control channel.');
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
    controlSocket = null;
    console.log('[Control WS] Disconnected.');
  };

  ws.onerror = (err) => {
    console.warn('[Control WS] Error:', err);
  };

  controlSocket = ws;
  return ws;
}

export function sendControlCommand(cmd: Record<string, unknown>, tunnelUrl?: string, pin?: string): void {
  const msg = JSON.stringify(cmd);
  if (controlSocket && controlSocket.readyState === WebSocket.OPEN) {
    controlSocket.send(msg);
  } else {
    controlQueue.push(msg);
    if (tunnelUrl && pin && (!controlSocket || controlSocket.readyState === WebSocket.CLOSED)) {
      initControlWebSocket(tunnelUrl, pin);
    }
  }
}

export async function checkPing(tunnelUrl: string, pin: string): Promise<{ latencyMs: number; activeWindow?: string }> {
  const t0 = performance.now();
  const resp = await fetch(`${tunnelUrl}/api/ping?pin=${encodeURIComponent(pin)}`);
  const dt = Math.round(performance.now() - t0);
  if (!resp.ok) {
    throw new Error(`Ping failed with status ${resp.status}`);
  }
  const data = await resp.json();
  return { latencyMs: dt, activeWindow: data.active_window };
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
