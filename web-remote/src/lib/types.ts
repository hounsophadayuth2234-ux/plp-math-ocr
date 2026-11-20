export type CommandType = string;

export interface DiskPartition {
  device: string;
  mountpoint: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  percent: number;
}

export interface ProcessItem {
  pid: number;
  name: string;
  memory_mb: number;
  cpu_percent?: number;
}

export interface V3Telemetry {
  cpu_total: number;
  cpu_cores: number[];
  ram_total_gb: number;
  ram_used_gb: number;
  ram_percent: number;
  disks: DiskPartition[];
  down_kb_s: number;
  up_kb_s: number;
  battery_percent: number | null;
  is_charging: boolean | null;
  uptime_seconds: number;
  active_window: string;
  top_processes: ProcessItem[];
  timestamp: number;
}

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes?: number;
  modified_iso?: string;
  ext?: string;
  is_drive?: boolean;
}

export interface FilesResponse {
  current_path: string;
  parent_path: string | null;
  drives?: FileItem[];
  shortcuts?: FileItem[];
  items: FileItem[];
}

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
  command: string;
  payload: string | null;
  status: 'pending' | 'executing' | 'executed' | 'failed' | 'active';
  created_at: string;
  executed_at: string | null;
  error_message: string | null;
}
