/**
 * Silent Activity Tracking Client
 * Fire-and-forget telemetry for user operations. Never blocks the UI or throws.
 */

export interface SilentActivityPayload {
  module: "01_math_ocr" | "02_canvas_cutout" | "03_hd_upscale" | "04_math_solver" | "05_lesson_studio" | "drive_storage" | string;
  action: string;
  title: string;
  details?: Record<string, any>;
}

export function logSilentActivity(payload: SilentActivityPayload): void {
  if (typeof window === "undefined") return;

  try {
    fetch("/api/user/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "include",
    }).catch(() => {});
  } catch {}
}
