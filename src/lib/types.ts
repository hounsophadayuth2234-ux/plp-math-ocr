/**
 * Standardized Processing Status Labels & Shared Types
 * Strictly enforced across Modules 02, 03, and 04.
 */

export type ProcessingStatusLabel =
  | "Browser AI result"
  | "Manual mask result"
  | "Local worker result"
  | "Cloud API result"
  | "Demo preview"
  | "Enhanced resize — not AI super-resolution"
  | "Document Safe Mode (AI Matte Disabled)"
  | "Studio Super-Resolution Engine"
  | "HD Resize & Sharpen";

export interface AppError {
  code:
    | "VALIDATION_ERROR"
    | "TIMEOUT"
    | "ABORTED"
    | "WORKER_UNREACHABLE"
    | "NOT_CONFIGURED"
    | "INFERENCE_ERROR"
    | "OUT_OF_MEMORY"
    | "NETWORK_ERROR";
  message: string;
  userMessage: string;
  retryable: boolean;
  details?: string;
  suggestedAction?: "SWITCH_TO_BROWSER" | "OPEN_SETTINGS" | "ENABLE_DEMO" | "RETRY";
}

export interface ServiceCapabilities {
  bgRemoval: {
    browserAiSupported: boolean;
    workerConfigured: boolean;
    workerUrlMasked?: string | null;
  };
  upscaler: {
    browserEnhanceSupported: boolean;
    workerConfigured: boolean;
    replicateConfigured: boolean;
  };
  imageGen: {
    workerConfigured: boolean;
    replicateConfigured: boolean;
  };
}
