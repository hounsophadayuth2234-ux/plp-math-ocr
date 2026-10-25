import { GoogleGenerativeAI } from "@google/generative-ai";
import { isTransientProviderError, getBackoffMs, setMathOcrDelayFunction } from "@/app/api/math-ocr/route";

export interface DualApiConfigStatus {
  primaryConfigured: boolean;
  secondaryConfigured: boolean;
  isDistinctSecondary: boolean;
  activeMode: "dual_independent_keys" | "auto_failover_pool";
  primaryMasked: string | null;
  secondaryMasked: string | null;
  candidateModels: string[];
}

/**
 * Retrieves the primary Gemini API Key from process environment.
 */
export function getPrimaryGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (key && !key.includes("your_gemini_api_key")) {
    return key;
  }
  return "";
}

/**
 * Retrieves the secondary Gemini API Key or auto-falls back to primary key.
 */
export function getSecondaryGeminiKey(): { key: string; isDistinct: boolean } {
  const secondaryKey = (
    process.env.GEMINI_API_KEY_SECONDARY ||
    process.env.SECONDARY_GEMINI_API_KEY ||
    process.env.BACKUP_GEMINI_API_KEY ||
    process.env.GEMINI_BACKUP_KEY
  )?.trim();

  if (secondaryKey && !secondaryKey.includes("your_") && secondaryKey.length > 10) {
    return { key: secondaryKey, isDistinct: true };
  }

  // Auto-reuse primary key with separate client & fallback model routing
  const primary = getPrimaryGeminiKey();
  return { key: primary, isDistinct: false };
}

/**
 * Masks an API key for safe public reporting (e.g. AIza••••••••8b9z).
 */
export function maskApiKey(key: string): string | null {
  if (!key || key.length < 8) return null;
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

/**
 * Returns current Dual-API Failover & Resilience status.
 */
export function getDualApiConfigStatus(): DualApiConfigStatus {
  const primary = getPrimaryGeminiKey();
  const secondary = getSecondaryGeminiKey();

  const candidateModels = [
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
  ];

  return {
    primaryConfigured: Boolean(primary),
    secondaryConfigured: Boolean(secondary.key),
    isDistinctSecondary: secondary.isDistinct,
    activeMode: secondary.isDistinct ? "dual_independent_keys" : "auto_failover_pool",
    primaryMasked: maskApiKey(primary),
    secondaryMasked: maskApiKey(secondary.key),
    candidateModels,
  };
}

export interface DualApiExecutionOptions {
  requestId: string;
  moduleName: string;
  candidateModels?: string[];
  overallBudgetMs?: number;
  perModelTimeoutMs?: number;
}

export interface DualApiExecutionResult<T> {
  result: T;
  selectedModel: string;
  usedSecondaryKey: boolean;
  totalAttempts: number;
  durationMs: number;
}

/**
 * Executes a generative AI request with seamless Dual-API failover:
 * 1. Executes with Primary API key and primary candidate model.
 * 2. On 429 (Rate Limit / Quota) or 503 (High Demand), automatically switches
 *    to Secondary API key / fallback model pool with jittered backoff.
 * 3. Returns structured output along with telemetry metadata.
 */
export async function executeWithDualApiFailover<T>(
  executor: (client: GoogleGenerativeAI, modelName: string, isSecondary: boolean) => Promise<T>,
  options: DualApiExecutionOptions
): Promise<DualApiExecutionResult<T>> {
  const startTime = Date.now();
  const primaryKey = getPrimaryGeminiKey();
  const secondary = getSecondaryGeminiKey();

  const apiKeyToUse = primaryKey || secondary.key;
  if (!apiKeyToUse) {
    throw new Error(
      "មិនទាន់កំណត់ API Key (No API Key Configured)៖ សូមកំណត់ GEMINI_API_KEY ក្នុង Settings ឬ Environment Variables។"
    );
  }

  const primaryClient = new GoogleGenerativeAI(primaryKey || secondary.key);
  const secondaryClient = new GoogleGenerativeAI(secondary.key || primaryKey);

  const candidateModels = options.candidateModels || [
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
  ];

  const overallBudget = options.overallBudgetMs || 38000;
  let totalAttempts = 0;
  let lastError: unknown = null;

  // Plan sequence of stages:
  // Phase 1: Try Primary Key with candidate models
  // Phase 2: If primary fails (especially 429/quota), failover to Secondary Key
  const stages: { client: GoogleGenerativeAI; isSecondary: boolean; models: string[] }[] = [
    { client: primaryClient, isSecondary: false, models: candidateModels.slice(0, 2) },
  ];

  if (secondary.isDistinct) {
    stages.push({
      client: secondaryClient,
      isSecondary: true,
      models: candidateModels,
    });
  } else {
    // If using single key, add secondary fallback models
    stages.push({
      client: primaryClient,
      isSecondary: false,
      models: candidateModels.slice(2),
    });
  }

  for (const stage of stages) {
    for (const modelName of stage.models) {
      if (Date.now() - startTime >= overallBudget) {
        break;
      }

      totalAttempts++;
      try {
        const res = await executor(stage.client, modelName, stage.isSecondary);
        return {
          result: res,
          selectedModel: modelName,
          usedSecondaryKey: stage.isSecondary,
          totalAttempts,
          durationMs: Date.now() - startTime,
        };
      } catch (err: unknown) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = isTransientProviderError(err);
        const isQuota = /\b(429|quota|resource exhausted|too many requests)\b/i.test(msg);

        console.warn(
          JSON.stringify({
            requestId: options.requestId,
            module: options.moduleName,
            event: "dual_api_attempt_failed",
            model: modelName,
            isSecondary: stage.isSecondary,
            isTransient,
            isQuota,
            error: msg.replace(/key=[A-Za-z0-9_.-]+/gi, "key=[REDACTED]").slice(0, 200),
            elapsedMs: Date.now() - startTime,
          })
        );

        // If rate limited on primary, immediately switch to next stage (secondary key)
        if (isQuota && !stage.isSecondary && secondary.isDistinct) {
          break; // jump to secondary stage immediately
        }

        if (isTransient) {
          const backoff = getBackoffMs(totalAttempts - 1);
          await new Promise((r) => setTimeout(r, Math.min(backoff, 1200)));
        } else {
          // If non-transient fatal error (e.g., bad client request syntax), break model loop
          break;
        }
      }
    }
  }

  throw lastError || new Error("Dual-API inference exhausted all candidate models and failover pools.");
}

/**
 * Dispatches non-blocking background synchronization (Google Drive & Upstash Redis)
 * without holding up the synchronous HTTP response or causing timeouts.
 */
export function dispatchBackgroundSync(taskName: string, task: () => Promise<unknown>): void {
  // Execute via Promise microtask in Node.js runtime
  Promise.resolve()
    .then(async () => {
      try {
        await task();
      } catch (err) {
        console.warn(`[BackgroundSync:${taskName}] Non-blocking task failed:`, err);
      }
    })
    .catch((err) => {
      console.warn(`[BackgroundSync:${taskName}] Unexpected rejection:`, err);
    });
}
