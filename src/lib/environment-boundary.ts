/**
 * environment-boundary.ts
 *
 * Production-Safe Environment Boundary between Browser Web Production and Tauri Native Shell.
 *
 * Invariants:
 * 1. The live web build (https://math.dytcore.com) must NEVER import or execute Tauri-only native modules.
 * 2. If isTauriEnvironment() is false, window.__TAURI__ is never accessed and native commands are never called.
 * 3. Browser execution selects CloudProvider by default.
 * 4. Tauri execution selects LocalTauriProvider.
 * 5. When Force Offline Mode is enabled:
 *    - All cloud API requests (/api/math-ocr, /api/math-solver, /api/lesson-studio, /api/upscale,
 *      /api/bg-remove, /api/remove-bg, /api/upload-to-drive) are strictly blocked at the boundary.
 *    - No silent cloud fallback is permitted.
 *    - If local native backend is unavailable, produces the exact error:
 *      "Offline inference unavailable for this module"
 */

import {
  isForceOfflineMode,
  setForceOfflineMode,
  subscribeForceOfflineMode,
} from "./offline-mode-state";

export { isForceOfflineMode, setForceOfflineMode, subscribeForceOfflineMode };

export type ProviderType = "CloudProvider" | "LocalTauriProvider";

export interface ProviderRoutingDecision {
  module: string;
  provider: ProviderType;
  offlineMode: boolean;
  route: "cloud" | "local_native" | "blocked_offline";
  cloudCallBlocked: boolean;
  reason: string;
}

/**
 * Canonical testable check for Tauri native environment.
 * Evaluates safely across SSR, standard browsers, and Tauri Android WebView.
 * Never throws when window.__TAURI__ is absent.
 */
export function isTauriEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as any;
  return Boolean(
    (win.__TAURI__ && typeof win.__TAURI__.core?.invoke === "function") ||
    win.__TAURI_INTERNALS__
  );
}

/**
 * Returns explicit provider selection:
 * - Browser: CloudProvider
 * - Tauri Android: LocalTauriProvider
 */
export function getEffectiveProvider(): ProviderType {
  return isTauriEnvironment() ? "LocalTauriProvider" : "CloudProvider";
}

/**
 * Checks client network availability.
 * Strictly returns false if Force Offline Mode is active.
 */
export function isNetworkOnline(): boolean {
  if (isForceOfflineMode()) {
    return false;
  }
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * Evaluates the routing decision for any module request.
 * Enforces that cloud calls are blocked when Force Offline Mode is enabled.
 */
export function evaluateProviderRouting(moduleName: string): ProviderRoutingDecision {
  const offlineMode = isForceOfflineMode();
  const isTauri = isTauriEnvironment();
  const provider = getEffectiveProvider();

  if (offlineMode) {
    if (isTauri) {
      return {
        module: moduleName,
        provider: "LocalTauriProvider",
        offlineMode: true,
        route: "local_native",
        cloudCallBlocked: true,
        reason: "Force Offline Mode active: Using Snapdragon 8 Elite native engine.",
      };
    } else {
      return {
        module: moduleName,
        provider: "LocalTauriProvider",
        offlineMode: true,
        route: "blocked_offline",
        cloudCallBlocked: true,
        reason: "Offline inference unavailable for this module",
      };
    }
  }

  // Standard online operation
  if (isTauri) {
    return {
      module: moduleName,
      provider: "LocalTauriProvider",
      offlineMode: false,
      route: "local_native",
      cloudCallBlocked: false,
      reason: "Tauri Android environment: Using on-device accelerated pipeline.",
    };
  }

  return {
    module: moduleName,
    provider: "CloudProvider",
    offlineMode: false,
    route: "cloud",
    cloudCallBlocked: false,
    reason: "Production browser environment: Using cloud API provider.",
  };
}

/**
 * Guard that verifies an outgoing cloud call is allowed.
 * Throws a user-visible Error if blocked by Force Offline Mode.
 */
export function assertCloudCallPermitted(moduleName: string, endpoint: string): void {
  const decision = evaluateProviderRouting(moduleName);
  if (decision.cloudCallBlocked) {
    const errorMsg = decision.reason || "Offline inference unavailable for this module";
    console.warn(`[ProviderBoundary] Blocked cloud call to ${endpoint} for ${moduleName}: ${errorMsg}`);
    throw new Error(errorMsg);
  }
}

