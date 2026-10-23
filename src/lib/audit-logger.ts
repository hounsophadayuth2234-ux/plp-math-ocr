import { anonymizeIdentifier } from "./auth-gate";

export type AuditEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "ACCOUNT_CREATED"
  | "USER_CREATED"
  | "ADMIN_CREATED"
  | "ACCOUNT_EDITED"
  | "USER_UPDATED"
  | "ROLE_CHANGED"
  | "PASSWORD_RESET"
  | "USER_PASSWORD_RESET"
  | "ADMIN_PASSWORD_RESET"
  | "PASSWORD_CHANGED"
  | "ADMIN_SELF_PASSWORD_CHANGED"
  | "ACCOUNT_DISABLED"
  | "USER_DISABLED"
  | "ACCOUNT_ENABLED"
  | "USER_ENABLED"
  | "ACCOUNT_DELETED"
  | "USER_DELETED"
  | "SESSIONS_REVOKED"
  | "UNAUTHORIZED_ADMIN_ACCESS"
  | "SECURITY_ALERT"
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "MFA_VERIFIED"
  | "TELEGRAM_LINKED"
  | "TELEGRAM_UNLINKED"
  | "TELEGRAM_LOGIN_SUCCESS"
  | "TELEGRAM_LOGIN_REJECTED";

export interface AuditEventRecord {
  id: string;
  type: AuditEventType;
  actorId: string;
  actorUsername?: string;
  targetId?: string;
  targetUsername?: string;
  timestamp: number;
  ipHash: string;
  userAgent?: string;
  details?: Record<string, any>;
}

// Memory / local fallback for audit events
const localAuditEvents: AuditEventRecord[] = [];

function getRedisConfig(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    "";
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    "";

  if (url && token) {
    return { url, token };
  }
  return null;
}

export class AuditLogger {
  /**
   * Resets local test audit events.
   */
  static __resetTestEvents(): void {
    localAuditEvents.length = 0;
  }

  /**
   * Records a security audit event.
   * Invariant: Never writes raw passwords, hashes, or tokens to the audit store.
   */
  static async logEvent(params: {
    type: AuditEventType;
    actorId: string;
    actorUsername?: string;
    targetId?: string;
    targetUsername?: string;
    rawIp?: string;
    userAgent?: string;
    details?: Record<string, any>;
  }): Promise<AuditEventRecord> {
    const rawIp = params.rawIp || "127.0.0.1";
    const ipHash = await anonymizeIdentifier(rawIp);
    const now = Date.now();
    const id = `aud_${Math.random().toString(36).substring(2, 9)}${now.toString(36)}`;

    // Sanitize details to guarantee zero secret leakage
    const sanitizedDetails: Record<string, any> = {};
    if (params.details) {
      for (const [key, val] of Object.entries(params.details)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("password") ||
          lowerKey.includes("token") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("hash") ||
          lowerKey.includes("cookie") ||
          lowerKey.includes("csrf") ||
          lowerKey.includes("recovery") ||
          lowerKey.includes("bearer") ||
          lowerKey.includes("salt") ||
          lowerKey.includes("telegramid") ||
          lowerKey.includes("telegram_id") ||
          lowerKey.includes("payload") ||
          lowerKey.includes("bot") ||
          lowerKey.includes("signature")
        ) {
          sanitizedDetails[key] = "[REDACTED]";
        } else {
          sanitizedDetails[key] = val;
        }
      }
    }

    const record: AuditEventRecord = {
      id,
      type: params.type,
      actorId: params.actorId,
      actorUsername: params.actorUsername,
      targetId: params.targetId,
      targetUsername: params.targetUsername,
      timestamp: now,
      ipHash,
      userAgent: params.userAgent ? params.userAgent.slice(0, 100) : undefined,
      details: Object.keys(sanitizedDetails).length > 0 ? sanitizedDetails : undefined,
    };

    const redis = getRedisConfig();
    if (redis) {
      try {
        const payload = [
          ["LPUSH", "dyt:audit:events", JSON.stringify(record)],
          ["LTRIM", "dyt:audit:events", "0", "499"], // Keep most recent 500 events
        ];
        await fetch(`${redis.url}/pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${redis.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
      } catch (err) {
        console.warn("[audit-logger] Failed to push to Redis audit log:", err);
      }
    }

    // Keep in local cache
    localAuditEvents.unshift(record);
    if (localAuditEvents.length > 500) {
      localAuditEvents.pop();
    }

    return record;
  }

  /**
   * Retrieves the most recent audit events.
   */
  static async getRecentEvents(limit: number = 100): Promise<AuditEventRecord[]> {
    const redis = getRedisConfig();
    if (redis) {
      try {
        const res = await fetch(`${redis.url}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${redis.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(["LRANGE", "dyt:audit:events", "0", String(limit - 1)]),
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.result)) {
            return data.result.map((item: any) =>
              typeof item === "string" ? JSON.parse(item) : item
            );
          }
        }
      } catch (err) {
        console.warn("[audit-logger] Failed to fetch events from Redis:", err);
      }
    }

    return localAuditEvents.slice(0, limit);
  }
}
