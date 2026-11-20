export type CommandType =
  | 'MOUSE_MOVE'
  | 'MOUSE_CLICK'
  | 'MOUSE_CLICK_AT'
  | 'MOUSE_SCROLL'
  | 'KEY_TYPE'
  | 'KEY_COMBO'
  | 'WINDOW_ACTION'
  | 'APP_LAUNCH'
  | 'MEDIA_KEY'
  | 'SET_VOLUME'
  | 'SET_BRIGHTNESS'
  | 'SCREEN_OFF'
  | 'WAKE_SCREEN'
  | 'BOSS_KEY'
  | 'LOCK'
  | 'SLEEP'
  | 'SHUTDOWN'
  | 'RESTART'
  | 'CLIPBOARD'
  | 'OPEN_URL'
  | 'CLEAN_RAM'
  | 'SCREENSHOT'
  | 'KILL_PROCESS'
  | 'ALERT_POPUP'
  | 'GET_CLIPBOARD'
  | 'GET_TOP_PROCESSES';

export interface DeviceTelemetry {
  id: number;
  device_name: string;
  cpu_percent: number;
  ram_percent: number;
  battery_percent: number | null;
  is_charging: boolean | null;
  screenshot_url: string | null;
  updated_at: string;
}

export interface DeviceCommand {
  id: number;
  command: CommandType | string;
  payload: string | null;
  status: 'pending' | 'executing' | 'executed' | 'failed';
  created_at: string;
  executed_at: string | null;
  error_message: string | null;
}

export interface ProcessItem {
  pid: number;
  name: string;
  memory_mb: number;
}
