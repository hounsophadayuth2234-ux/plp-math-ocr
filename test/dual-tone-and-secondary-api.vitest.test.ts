import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DUAL_TONE_THEMES,
  applyDualToneTheme,
  getSavedDualToneTheme,
} from "@/components/ui/DualToneThemeToggle";
import {
  getPrimaryGeminiKey,
  getSecondaryGeminiKey,
  getDualApiConfigStatus,
  maskApiKey,
  executeWithDualApiFailover,
  dispatchBackgroundSync,
} from "@/lib/gemini-dual-api";

describe("Phase 3: Dual-Tone UI Theme & Secondary API Failover Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("1. Dual-Tone Theme Invariants", () => {
    it("includes cyber-gold as the primary/default dual-tone theme with Royal Gold (#fbbf24)", () => {
      const cyberGold = DUAL_TONE_THEMES.find((t) => t.id === "cyber-gold");
      expect(cyberGold).toBeDefined();
      expect(cyberGold?.primaryTone).toBe("#00f0ff");
      expect(cyberGold?.secondaryTone).toBe("#fbbf24");
      expect(cyberGold?.nameKhmer).toContain("មាសរាជវង្ស");
    });

    it("has 5 distinct modern dual-tone themes", () => {
      expect(DUAL_TONE_THEMES).toHaveLength(5);
      const ids = DUAL_TONE_THEMES.map((t) => t.id);
      expect(ids).toContain("cyber-gold");
      expect(ids).toContain("sapphire-amber");
      expect(ids).toContain("emerald-gold");
      expect(ids).toContain("amethyst-rose");
      expect(ids).toContain("clean-dual-light");
    });

    it("getSavedDualToneTheme defaults to cyber-gold when localStorage is empty", () => {
      const theme = getSavedDualToneTheme();
      expect(theme).toBe("cyber-gold");
    });

    it("applyDualToneTheme sets data-theme attribute on documentElement", () => {
      if (typeof document !== "undefined") {
        applyDualToneTheme("emerald-gold");
        expect(document.documentElement.getAttribute("data-theme")).toBe("emerald-gold");
        // Reset back to cyber-gold
        applyDualToneTheme("cyber-gold");
        expect(document.documentElement.getAttribute("data-theme")).toBe("cyber-gold");
      }
    });
  });

  describe("2. Secondary API Key Resolution & Environment Invariants", () => {
    it("resolves primary Gemini key and ignores placeholder keys", () => {
      process.env.GEMINI_API_KEY = "your_gemini_api_key_here";
      expect(getPrimaryGeminiKey()).toBe("");

      process.env.GEMINI_API_KEY = "AIzaSyPrimaryValidKey123456789";
      expect(getPrimaryGeminiKey()).toBe("AIzaSyPrimaryValidKey123456789");
    });

    it("resolves secondary Gemini key from GEMINI_API_KEY_SECONDARY", () => {
      process.env.GEMINI_API_KEY = "AIzaSyPrimaryValidKey123456789";
      process.env.GEMINI_API_KEY_SECONDARY = "AIzaSySecondaryKey987654321";
      delete process.env.SECONDARY_GEMINI_API_KEY;
      delete process.env.BACKUP_GEMINI_API_KEY;

      const secondary = getSecondaryGeminiKey();
      expect(secondary.isDistinct).toBe(true);
      expect(secondary.key).toBe("AIzaSySecondaryKey987654321");
    });

    it("resolves secondary Gemini key from SECONDARY_GEMINI_API_KEY", () => {
      delete process.env.GEMINI_API_KEY_SECONDARY;
      process.env.SECONDARY_GEMINI_API_KEY = "AIzaSyAlternateSecondaryKey456";

      const secondary = getSecondaryGeminiKey();
      expect(secondary.isDistinct).toBe(true);
      expect(secondary.key).toBe("AIzaSyAlternateSecondaryKey456");
    });

    it("resolves secondary Gemini key from BACKUP_GEMINI_API_KEY", () => {
      delete process.env.GEMINI_API_KEY_SECONDARY;
      delete process.env.SECONDARY_GEMINI_API_KEY;
      process.env.BACKUP_GEMINI_API_KEY = "AIzaSyBackupKey7890123456";

      const secondary = getSecondaryGeminiKey();
      expect(secondary.isDistinct).toBe(true);
      expect(secondary.key).toBe("AIzaSyBackupKey7890123456");
    });

    it("correctly masks sensitive API keys for safe UI status reporting", () => {
      const masked = maskApiKey("AIzaSyABCDEF1234567890XYZ");
      expect(masked).toBe("AIza••••••••0XYZ");
      expect(masked).not.toContain("ABCDEF");
      expect(maskApiKey("short")).toBeNull();
    });

    it("reports dual API configuration status accurately", () => {
      process.env.GEMINI_API_KEY = "AIzaSyPrimary1111111111";
      process.env.GEMINI_API_KEY_SECONDARY = "AIzaSySecondary22222222";

      const status = getDualApiConfigStatus();
      expect(status.primaryConfigured).toBe(true);
      expect(status.secondaryConfigured).toBe(true);
      expect(status.isDistinctSecondary).toBe(true);
      expect(status.activeMode).toBe("dual_independent_keys");
      expect(status.candidateModels.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("3. Dual-API Failover Execution & Background Dispatch", () => {
    it("fails over to secondary key when primary encounters 429 quota exhaustion", async () => {
      process.env.GEMINI_API_KEY = "AIzaSyPrimary1111111111";
      process.env.GEMINI_API_KEY_SECONDARY = "AIzaSySecondary22222222";

      const mockExecutor = vi.fn().mockImplementation(async (_client, _model, isSecondary) => {
        if (!isSecondary) {
          throw new Error("429 Resource has been exhausted (quota limit reached)");
        }
        return { success: true, fromSecondary: true };
      });

      const outcome = await executeWithDualApiFailover(mockExecutor, {
        requestId: "req-test-failover-001",
        moduleName: "test-module",
        candidateModels: ["gemini-flash-lite-latest"],
        overallBudgetMs: 5000,
      });

      expect(outcome.usedSecondaryKey).toBe(true);
      expect(outcome.result).toEqual({ success: true, fromSecondary: true });
      expect(mockExecutor).toHaveBeenCalledTimes(2);
    });

    it("dispatches non-blocking background sync without throwing or blocking", async () => {
      let taskRan = false;
      dispatchBackgroundSync("test-bg-task", async () => {
        taskRan = true;
      });

      // Allow microtask tick
      await new Promise((r) => setTimeout(r, 50));
      expect(taskRan).toBe(true);
    });

    it("silently catches errors inside dispatchBackgroundSync without throwing unhandled exceptions", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => {
        dispatchBackgroundSync("failing-task", async () => {
          throw new Error("Simulated background Drive failure");
        });
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 50));
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });
});
