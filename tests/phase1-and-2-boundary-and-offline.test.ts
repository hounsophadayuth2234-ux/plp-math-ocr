import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isTauriEnvironment,
  getEffectiveProvider,
  isNetworkOnline,
  isForceOfflineMode,
  setForceOfflineMode,
  evaluateProviderRouting,
  assertCloudCallPermitted,
} from "../src/lib/environment-boundary";
import {
  solveMathWithHybridFallback,
  ocrMathWithHybridFallback,
  generateLessonWithHybridFallback,
} from "../src/lib/tauri-fallback-bridge";
import { uploadImageToDrive } from "../src/lib/drive-upload-client";

describe("PHASE 1 & PHASE 2 — Environment Boundary & Force Offline Mode Routing", () => {
  // Mock localStorage for node environment
  const storageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  beforeEach(() => {
    storageMock.clear();
    // Setup globals for test environment
    (globalThis as any).localStorage = storageMock;
    (globalThis as any).window = {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    delete (globalThis as any).__TAURI__;
    delete (globalThis as any).__TAURI_INTERNALS__;
    setForceOfflineMode(false);
  });

  afterEach(() => {
    setForceOfflineMode(false);
    delete (globalThis as any).__TAURI__;
    delete (globalThis as any).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 1: Canonical Environment Boundary
  // ─────────────────────────────────────────────────────────────
  describe("Phase 1: Canonical isTauriEnvironment() Boundary", () => {
    it("1.1 isTauriEnvironment() returns false in standard browser/node environment without Tauri globals", () => {
      expect(isTauriEnvironment()).toBe(false);
    });

    it("1.2 getEffectiveProvider() returns CloudProvider in browser mode", () => {
      expect(getEffectiveProvider()).toBe("CloudProvider");
    });

    it("1.3 isTauriEnvironment() returns true when window.__TAURI__.core.invoke is present", () => {
      (globalThis as any).window.__TAURI__ = {
        core: {
          invoke: vi.fn(),
        },
      };
      expect(isTauriEnvironment()).toBe(true);
      expect(getEffectiveProvider()).toBe("LocalTauriProvider");
    });

    it("1.4 isTauriEnvironment() returns true when window.__TAURI_INTERNALS__ is present", () => {
      (globalThis as any).window.__TAURI_INTERNALS__ = {};
      expect(isTauriEnvironment()).toBe(true);
      expect(getEffectiveProvider()).toBe("LocalTauriProvider");
    });

    it("1.5 Browser execution safely evaluates when window is undefined (SSR safety)", () => {
      const origWin = (globalThis as any).window;
      delete (globalThis as any).window;
      expect(isTauriEnvironment()).toBe(false);
      expect(getEffectiveProvider()).toBe("CloudProvider");
      (globalThis as any).window = origWin;
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 2: Force Offline Mode & Provider Routing
  // ─────────────────────────────────────────────────────────────
  describe("Phase 2: Force Offline Mode Persistence & Route Protection", () => {
    it("2.1 Force Offline toggle persists state locally in localStorage without cloud requests", () => {
      expect(isForceOfflineMode()).toBe(false);
      setForceOfflineMode(true);
      expect(isForceOfflineMode()).toBe(true);
      expect(storageMock.getItem("dyt_force_offline_mode")).toBe("true");

      setForceOfflineMode(false);
      expect(isForceOfflineMode()).toBe(false);
      expect(storageMock.getItem("dyt_force_offline_mode")).toBe("false");
    });

    it("2.2 isNetworkOnline() strictly returns false when Force Offline Mode is enabled", () => {
      setForceOfflineMode(true);
      expect(isNetworkOnline()).toBe(false);
      setForceOfflineMode(false);
    });

    it("2.3 evaluateProviderRouting reports correct telemetry and blocks cloud in browser offline mode", () => {
      setForceOfflineMode(true);
      const decision = evaluateProviderRouting("Module 04: Khmer Math Solver");
      expect(decision.offlineMode).toBe(true);
      expect(decision.provider).toBe("LocalTauriProvider");
      expect(decision.route).toBe("blocked_offline");
      expect(decision.cloudCallBlocked).toBe(true);
      expect(decision.reason).toBe("Offline inference unavailable for this module");
    });

    it("2.4 assertCloudCallPermitted throws when Force Offline Mode is active", () => {
      setForceOfflineMode(true);
      expect(() => {
        assertCloudCallPermitted("Module 01: Math OCR", "/api/math-ocr");
      }).toThrow("Offline inference unavailable for this module");
    });

    it("2.5 uploadImageToDrive is strictly blocked when Force Offline Mode is active (Zero network calls)", async () => {
      setForceOfflineMode(true);
      const fetchSpy = vi.fn();
      (globalThis as any).fetch = fetchSpy;

      await expect(
        uploadImageToDrive({
          filename: "test_doc.png",
          content: "sample",
        })
      ).rejects.toThrow("Cloud upload blocked: Force Offline Mode is enabled.");

      // Verify zero fetch requests were initiated
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("2.6 Module 04: solveMathWithHybridFallback returns exact 'Offline inference unavailable for this module' in browser offline mode with ZERO cloud calls", async () => {
      setForceOfflineMode(true);
      const fetchSpy = vi.fn();
      (globalThis as any).fetch = fetchSpy;

      const result = await solveMathWithHybridFallback({
        promptText: "គណនា 25 + 38",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Offline inference unavailable for this module");
      expect(result.isOfflineFallback).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("2.7 Module 01: ocrMathWithHybridFallback returns exact 'Offline inference unavailable for this module' in browser offline mode with ZERO cloud calls", async () => {
      setForceOfflineMode(true);
      const fetchSpy = vi.fn();
      (globalThis as any).fetch = fetchSpy;

      const result = await ocrMathWithHybridFallback({
        sourceText: "f(x) = x^2",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Offline inference unavailable for this module");
      expect(result.isOfflineFallback).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("2.8 Module 05: generateLessonWithHybridFallback returns exact 'Offline inference unavailable for this module' in browser offline mode with ZERO cloud calls", async () => {
      setForceOfflineMode(true);
      const fetchSpy = vi.fn();
      (globalThis as any).fetch = fetchSpy;

      const result = await generateLessonWithHybridFallback({
        mode: "visual_svg",
        prompt: "Fraction 3/4 circle",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Offline inference unavailable for this module");
      expect(result.isOfflineFallback).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("2.9 Tauri native mode routes to local engine when Force Offline Mode is enabled", async () => {
      setForceOfflineMode(true);
      const invokeMock = vi.fn().mockResolvedValue({
        problem_statement_km: "គណនា 25 + 38",
        steps: [{ title_km: "ជំហានទី១", formula_latex: "25 + 38 = 63" }],
        final_answer: 63,
      });

      (globalThis as any).window.__TAURI__ = {
        core: {
          invoke: invokeMock,
        },
      };

      const result = await solveMathWithHybridFallback({
        promptText: "គណនា 25 + 38",
      });

      expect(result.success).toBe(true);
      expect(result.isOfflineFallback).toBe(true);
      expect(invokeMock).toHaveBeenCalledWith(
        "solve_math_khmer",
        expect.objectContaining({
          spec: expect.objectContaining({
            question_km: "គណនា 25 + 38",
          }),
        })
      );
    });
  });
});

