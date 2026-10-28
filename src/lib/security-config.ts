/**
 * Centralized Server-Side Security & Rate-Limit Policy Configuration
 *
 * Defines explicit rate limits, window durations, failure-mode behavior,
 * and payload constraints across all sensitive API routes.
 */

export type RateLimitCategory =
  | "login"
  | "admin_recovery"
  | "change_password"
  | "admin_force_reset"
  | "profile_update"
  | "user_management"
  | "history_mutation"
  | "math_ocr"
  | "math_solver"
  | "remove_bg"
  | "upscale"
  | "generate_image"
  | "lesson_studio"
  | "web_scraper"
  | "drive_upload"
  | "settings"
  | "auth_gate";

export interface EndpointSecurityPolicy {
  category: RateLimitCategory;
  limit: number; // Max allowed requests in sliding window
  windowSeconds: number; // Sliding window size in seconds
  failClosed: boolean; // If Redis fails, fail closed (reject) vs documented memory fallback
  maxPayloadBytes?: number; // Maximum allowed request body size in bytes
  description: string;
}

export const SECURITY_POLICIES: Record<RateLimitCategory, EndpointSecurityPolicy> = {
  // 1. Critical Authentication & Recovery Endpoints (Fail Closed)
  login: {
    category: "login",
    limit: 5,
    windowSeconds: 60,
    failClosed: true,
    maxPayloadBytes: 8192,
    description: "User authentication gate (5 req/min per IP/account)",
  },
  admin_recovery: {
    category: "admin_recovery",
    limit: 5,
    windowSeconds: 3600,
    failClosed: true,
    maxPayloadBytes: 4096,
    description: "Emergency Administrator Recovery (5 req/hour per IP)",
  },
  change_password: {
    category: "change_password",
    limit: 5,
    windowSeconds: 60,
    failClosed: true,
    maxPayloadBytes: 8192,
    description: "Account password change (5 req/min per user)",
  },
  admin_force_reset: {
    category: "admin_force_reset",
    limit: 5,
    windowSeconds: 60,
    failClosed: true,
    maxPayloadBytes: 8192,
    description: "Direct admin credential reset (5 req/min per admin)",
  },
  auth_gate: {
    category: "auth_gate",
    limit: 5,
    windowSeconds: 60,
    failClosed: true,
    maxPayloadBytes: 4096,
    description: "Legacy cyber gate entry (5 req/min)",
  },

  // 2. Account & Profile Mutations
  profile_update: {
    category: "profile_update",
    limit: 15,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 5 * 1024 * 1024, // 5MB for base64 avatar
    description: "Profile, username, and avatar updates (15 req/min)",
  },
  user_management: {
    category: "user_management",
    limit: 20,
    windowSeconds: 60,
    failClosed: true,
    maxPayloadBytes: 16384,
    description: "Administrative user creation, editing, and deletion (20 req/min)",
  },
  history_mutation: {
    category: "history_mutation",
    limit: 20,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 32768,
    description: "History deletion and drive retry operations (20 req/min)",
  },

  // 3. Expensive AI & Processing Endpoints
  math_ocr: {
    category: "math_ocr",
    limit: 10,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 12 * 1024 * 1024,
    description: "Gemini Vision Math OCR (10 req/min)",
  },
  math_solver: {
    category: "math_solver",
    limit: 8,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 12 * 1024 * 1024,
    description: "Gemini Math Step-by-Step Solver (8 req/min)",
  },
  remove_bg: {
    category: "remove_bg",
    limit: 5,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 12 * 1024 * 1024,
    description: "AI Background Removal (5 req/min)",
  },
  upscale: {
    category: "upscale",
    limit: 3,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 10 * 1024 * 1024,
    description: "Super-Resolution Upscaling (3 req/min)",
  },
  generate_image: {
    category: "generate_image",
    limit: 3,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 8192,
    description: "Text-to-Image Generation (3 req/min)",
  },
  lesson_studio: {
    category: "lesson_studio",
    limit: 8,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 12 * 1024 * 1024,
    description: "Lesson Studio Generation (8 req/min)",
  },
  web_scraper: {
    category: "web_scraper",
    limit: 20,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 16384,
    description: "Web scraper & parser (20 req/min)",
  },
  drive_upload: {
    category: "drive_upload",
    limit: 20,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 25 * 1024 * 1024,
    description: "Google Drive OAuth Storage (20 req/min)",
  },
  settings: {
    category: "settings",
    limit: 60,
    windowSeconds: 60,
    failClosed: false,
    maxPayloadBytes: 16384,
    description: "System settings read/write (60 req/min)",
  },
};
