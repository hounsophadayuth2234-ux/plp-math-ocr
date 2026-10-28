import "server-only";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { UserStore, SafeUser } from "@/lib/user-store";
import { AuditLogger, AuditEventRecord } from "@/lib/audit-logger";

export interface SanitizedRecentLogin {
  id: string;
  maskedIdentifier: string;
  eventType: "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "LOGOUT";
  outcome: "SUCCESS" | "FAILURE";
  maskedIp: string;
  timestamp: number;
  reason?: string;
}

export interface RateLimitPlaceholderData {
  readonly isPlaceholder: true;
  readonly notice: string;
  readonly schemaFields: string[];
  readonly backendRequirement: string;
}

export interface DashboardOverviewStats {
  totalUsers: number | null;
  activeSuperAdmins: number | null;
  activeAdmins: number | null;
  isAvailable: boolean;
}

/**
 * Masks an identifier (username or email) preserving minimal context without exposing PII.
 * Examples:
 *   "superadmin" -> "su***in"
 *   "user1" -> "u***1"
 *   "admin@dytcore.com" -> "ad***n@dytcore.com"
 */
export function maskIdentifier(identifier?: string | null): string {
  if (!identifier || typeof identifier !== "string") {
    return "anonymous";
  }

  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    const [localPart, domain] = trimmed.split("@");
    if (!localPart || localPart.length <= 2) {
      return `*@${domain || "masked"}`;
    }
    const maskedLocal = `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;
    return `${maskedLocal}@${domain || "masked"}`;
  }

  if (trimmed.length <= 2) {
    return `${trimmed[0]}*`;
  }
  if (trimmed.length <= 4) {
    return `${trimmed.slice(0, 1)}***${trimmed.slice(-1)}`;
  }
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

/**
 * Truncates an anonymized IP or IP-hash to hide granular network fingerprint.
 */
export function maskIpHash(ipHash?: string | null): string {
  if (!ipHash || typeof ipHash !== "string") {
    return "0.0.0.*";
  }
  // If IPv4 address format slipped through, mask the last octet
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipHash)) {
    const parts = ipHash.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  }
  // Hex hash
  return `${ipHash.slice(0, 8)}...`;
}

/**
 * Loads system user counts using efficient indexed list.
 * Guarantees zero Redis KEYS or unbounded SCAN loops.
 */
export async function getDashboardStats(verifiedUser?: SafeUser): Promise<DashboardOverviewStats> {
  if (!verifiedUser) {
    await requireSuperAdmin();
  }

  try {
    const users = await UserStore.listUsers();
    const activeSuperAdmins = users.filter((u) => u.role === "SUPER_ADMIN" && u.status === "ACTIVE").length;
    const activeAdmins = users.filter((u) => u.role === "ADMIN" && u.status === "ACTIVE").length;

    return {
      totalUsers: users.length,
      activeSuperAdmins,
      activeAdmins,
      isAvailable: true,
    };
  } catch (error) {
    console.error("[admin-queries] Failed to load dashboard user counts:", error);
    return {
      totalUsers: null,
      activeSuperAdmins: null,
      activeAdmins: null,
      isAvailable: false,
    };
  }
}

/**
 * Loads and sanitizes recent authentication events.
 * Extracts only login-related events and strictly masks identifiers and IP hashes.
 */
export async function getRecentLogins(
  verifiedUser?: SafeUser,
  limit: number = 10
): Promise<SanitizedRecentLogin[]> {
  if (!verifiedUser) {
    await requireSuperAdmin();
  }

  try {
    const rawEvents: AuditEventRecord[] = await AuditLogger.getRecentEvents(50);
    const loginEvents = rawEvents.filter(
      (ev) =>
        ev.type === "LOGIN_SUCCESS" ||
        ev.type === "LOGIN_FAILURE" ||
        ev.type === "LOGOUT" ||
        ev.type === "TELEGRAM_LOGIN_SUCCESS" ||
        ev.type === "TELEGRAM_LOGIN_REJECTED"
    );

    return loginEvents.slice(0, limit).map((ev) => {
      const isSuccess =
        ev.type === "LOGIN_SUCCESS" || ev.type === "TELEGRAM_LOGIN_SUCCESS";
      const normalizedType: "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "LOGOUT" =
        ev.type === "LOGOUT"
          ? "LOGOUT"
          : isSuccess
          ? "LOGIN_SUCCESS"
          : "LOGIN_FAILURE";

      return {
        id: ev.id,
        maskedIdentifier: maskIdentifier(ev.actorUsername || ev.actorId),
        eventType: normalizedType,
        outcome: isSuccess ? "SUCCESS" : "FAILURE",
        maskedIp: maskIpHash(ev.ipHash),
        timestamp: ev.timestamp,
        reason:
          ev.details && typeof ev.details.reason === "string"
            ? ev.details.reason.slice(0, 60)
            : undefined,
      };
    });
  } catch (error) {
    console.error("[admin-queries] Failed to load recent login events:", error);
    return [];
  }
}

/**
 * Returns strongly-typed placeholder metadata for rate limit violation events.
 * No fabricated data is generated in production.
 */
export async function getRateLimitEvents(
  verifiedUser?: SafeUser
): Promise<RateLimitPlaceholderData> {
  if (!verifiedUser) {
    await requireSuperAdmin();
  }

  return {
    isPlaceholder: true,
    notice: "Placeholder: data source not yet connected",
    schemaFields: [
      "id",
      "timestamp",
      "endpoint",
      "category",
      "maskedIp",
      "retryAfterSeconds",
      "violationCount",
    ],
    backendRequirement:
      "Rate limits are currently evaluated via sliding-window sorted sets in Redis without an appended violation stream. A Redis LPUSH or Redis Stream (e.g., 'dyt:ratelimit:violations') is required in src/lib/rate-limiter.ts to capture real-time throttled requests.",
  };
}
