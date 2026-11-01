/**
 * offline-mode-state.ts
 *
 * Global Client State Manager for Force Offline Mode.
 * Allows instant on-device testing of Snapdragon 8 Elite 7B model and NPU/GPU pipelines
 * by strictly blocking cloud network requests without requiring the device to disable Wi-Fi.
 */

const STORAGE_KEY = "dyt_force_offline_mode";
const EVENT_NAME = "dyt-force-offline-changed";

export function isForceOfflineMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setForceOfflineMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { enabled } })
    );
  } catch (err) {
    console.error("[OfflineState] Failed to persist force offline state:", err);
  }
}

export function subscribeForceOfflineMode(
  callback: (enabled: boolean) => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ enabled: boolean }>;
    callback(customEvent.detail?.enabled ?? isForceOfflineMode());
  };

  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      callback(e.newValue === "true");
    }
  });

  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

