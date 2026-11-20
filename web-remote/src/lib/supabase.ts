import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { CommandType, DeviceCommand, DeviceTelemetry } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project-id') &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.includes('your-supabase');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

// Singleton broadcast channel for real-time ~50-150ms commands over WebSockets
let liveChannel: RealtimeChannel | null = null;
const responseListeners: Array<(type: string, data: unknown) => void> = [];

export function getBroadcastChannel(): RealtimeChannel {
  if (!liveChannel) {
    liveChannel = supabase.channel('remote-control-live', {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    liveChannel
      .on('broadcast', { event: 'agent_response' }, (payload) => {
        const body = (payload.payload || {}) as Record<string, unknown>;
        const respType = (body.type as string) || '';
        const respData = body.data;
        responseListeners.forEach((listener) => {
          try {
            listener(respType, respData);
          } catch (err) {
            console.error('Error in agent response listener:', err);
          }
        });
      })
      .subscribe((status) => {
        console.log(`[Supabase Broadcast] Channel 'remote-control-live' status:`, status);
      });
  }
  return liveChannel;
}

/**
 * Register a listener for responses from Dell (e.g. CLIPBOARD_DATA, PROCESSES_DATA)
 */
export function subscribeToAgentResponses(callback: (type: string, data: unknown) => void): () => void {
  responseListeners.push(callback);
  getBroadcastChannel(); // Ensure channel is active
  return () => {
    const idx = responseListeners.indexOf(callback);
    if (idx >= 0) responseListeners.splice(idx, 1);
  };
}

/**
 * Send ultra-low latency command via Supabase Realtime Broadcast (~50-150ms).
 */
export async function sendBroadcastCommand(command: string, payload: Record<string, unknown> = {}): Promise<void> {
  const channel = getBroadcastChannel();
  await channel.send({
    type: 'broadcast',
    event: 'cmd',
    payload: {
      command,
      ...payload,
      sent_at: Date.now(),
    },
  });
}

/**
 * Insert persistent/audited command into device_commands table (fallback / audit log).
 */
export async function sendDeviceCommand(command: CommandType | string, payload: string | null = null): Promise<DeviceCommand> {
  // Also send via broadcast for immediate response
  try {
    let parsedPayload: Record<string, unknown> = {};
    if (payload) {
      try {
        parsedPayload = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        parsedPayload = { text: payload, url: payload, message: payload };
      }
    }
    await sendBroadcastCommand(command, parsedPayload);
  } catch (err) {
    console.warn('Broadcast send failed, falling back purely to DB:', err);
  }

  const { data, error } = await supabase
    .from('device_commands')
    .insert([
      {
        command,
        payload,
        status: 'pending',
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(error.message || `Failed to dispatch ${command}`);
  }

  return data as DeviceCommand;
}

/**
 * Fetch the single telemetry row for Dell Latitude (id: 1).
 */
export async function fetchLatestTelemetry(): Promise<DeviceTelemetry | null> {
  const { data, error } = await supabase
    .from('device_telemetry')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    return null;
  }

  return data as DeviceTelemetry;
}

/**
 * Fetch recent commands for the activity audit log.
 */
export async function fetchRecentCommands(limit = 8): Promise<DeviceCommand[]> {
  const { data, error } = await supabase
    .from('device_commands')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data || []) as DeviceCommand[];
}
