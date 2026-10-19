"use client";

export type MotionSpeed = "slow" | "normal" | "fast" | "paused";

export const MOTION_STORAGE_KEY = "dyt_bg_motion_speed";

export function getInitialMotionSpeed(): MotionSpeed {
  if (typeof window === "undefined") return "normal";
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return "paused";
    }
    const saved = localStorage.getItem(MOTION_STORAGE_KEY) as MotionSpeed | null;
    if (saved && ["slow", "normal", "fast", "paused"].includes(saved)) {
      return saved;
    }
  } catch {
    // Ignore localStorage access failures
  }
  return "normal";
}

export function applyMotionSpeedToDocument(speed: MotionSpeed) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-motion-speed", speed);
  if (document.body) {
    document.body.setAttribute("data-motion-speed", speed);
  }
}

export function saveMotionSpeed(speed: MotionSpeed) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, speed);
    } catch {
      // Ignore
    }
  }
  applyMotionSpeedToDocument(speed);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("motion-speed-change", { detail: { speed } })
    );
  }
}
