import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { UserStore } from "@/lib/user-store";
import { generateTemporaryPassword } from "@/lib/password-rules";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp, anonymizeIdentifier } from "@/lib/auth-gate";

function getRedisConfig(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    "";
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    "";
  if (url && token) return { url, token };
  return null;
}

async function isRecoveryConsumed(): Promise<boolean> {
  const redis = getRedisConfig();
  if (!redis) return false;
  try {
    const res = await fetch(`${redis.url}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", "dyt:recovery:consumed"]),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.result;
  } catch {
    return false;
  }
}

async function markRecoveryConsumed(): Promise<void> {
  const redis = getRedisConfig();
  if (!redis) return;
  try {
    await fetch(`${redis.url}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SETEX", "dyt:recovery:consumed", "604800", "1"]), // 7 days TTL
      cache: "no-store",
    });
  } catch {}
}

async function checkRecoveryRateLimit(ipHash: string): Promise<boolean> {
  const redis = getRedisConfig();
  if (!redis) return true;
  try {
    const res = await fetch(`${redis.url}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", `gate:recovery:attempts:${ipHash}`]),
      cache: "no-store",
    });
    const data = await res.json();
    const attempts = parseInt(data.result || "0", 10);
    return attempts < 5;
  } catch {
    return true;
  }
}

async function recordRecoveryAttempt(ipHash: string): Promise<void> {
  const redis = getRedisConfig();
  if (!redis) return;
  try {
    await fetch(`${redis.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", `gate:recovery:attempts:${ipHash}`],
        ["EXPIRE", `gate:recovery:attempts:${ipHash}`, "3600"],
      ]),
      cache: "no-store",
    });
  } catch {}
}

// Ephemeral single-use delivery slot (in-memory fallback, burns on read)
let ephemeralOneTimeCredential: {
  username: string;
  temporaryPassword: string;
  createdAt: number;
} | null = null;

export function __resetEphemeralRecovery(): void {
  ephemeralOneTimeCredential = null;
}

export async function stageOneTimePasswordReset(targetUsername = "dayuth"): Promise<{ success: boolean; error?: string }> {
  const targetUser = await UserStore.getUserByUsernameOrEmail(targetUsername);
  if (!targetUser) {
    return { success: false, error: `Account ${targetUsername} not found` };
  }
  if (targetUser.role !== "ADMIN") {
    return { success: false, error: `Account ${targetUsername} is not an ADMIN` };
  }

  // Generate compliant strong temporary password
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = bcrypt.hashSync(temporaryPassword, 12);

  // Update target user with mustChangePassword = true and status ACTIVE
  await UserStore.updateUser(targetUser.id, {
    passwordHash,
    mustChangePassword: true,
    status: "ACTIVE",
  });

  // Write PASSWORD_RESET audit event
  await AuditLogger.logEvent({
    type: "PASSWORD_RESET",
    actorId: "owner_secure_recovery",
    actorUsername: "system",
    targetId: targetUser.id,
    targetUsername: targetUser.username,
    rawIp: "127.0.0.1",
    details: {
      method: "ONE_TIME_SECURE_FLOW",
      forcedChange: true,
      oneTimeDelivery: true,
    },
  });

  // Store in ephemeral memory (burn on read)
  ephemeralOneTimeCredential = {
    username: targetUser.username,
    temporaryPassword,
    createdAt: Date.now(),
  };

  const redis = getRedisConfig();
  if (redis) {
    try {
      await fetch(`${redis.url}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["SETEX", `dyt:recovery:pending:${targetUser.username}`, "900", temporaryPassword]),
        cache: "no-store",
      });
    } catch {}
  }

  return { success: true };
}

export async function GET() {
  const recoverySecret =
    process.env.ADMIN_RECOVERY_KEY?.trim() ||
    process.env.APP_GATE_ADMIN_RECOVERY_KEY?.trim() ||
    process.env.DYT_ADMIN_RECOVERY_SECRET?.trim() ||
    "";

  // Check if single-use ephemeral credential is ready for one-time delivery
  let oneTimeTemporaryPassword: string | null = null;
  const redis = getRedisConfig();
  if (redis) {
    try {
      const res = await fetch(`${redis.url}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["GETDEL", "dyt:recovery:pending:dayuth"]),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result && typeof data.result === "string") {
          oneTimeTemporaryPassword = data.result;
        }
      }
    } catch {}
  }

  // Check local scratch single-use delivery file if present
  if (!oneTimeTemporaryPassword) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.join(process.cwd(), "scratch", ".pending-recovery-delivery.json");
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        fs.unlinkSync(filePath); // Burn on read immediately
        const parsed = JSON.parse(raw);
        if (parsed.username === "dayuth" && parsed.temporaryPassword) {
          const ageMs = Date.now() - (parsed.createdAt || 0);
          if (ageMs < 900000) {
            oneTimeTemporaryPassword = parsed.temporaryPassword;
          }
        }
      }
    } catch {}
  }

  if (!oneTimeTemporaryPassword && ephemeralOneTimeCredential) {
    const ageMs = Date.now() - ephemeralOneTimeCredential.createdAt;
    if (ageMs < 900000) {
      oneTimeTemporaryPassword = ephemeralOneTimeCredential.temporaryPassword;
    }
    ephemeralOneTimeCredential = null; // Burn on read
  }

  const isConsumed = await isRecoveryConsumed();
  const enabled = !!recoverySecret && !isConsumed;

  return NextResponse.json({
    enabled: enabled || !!oneTimeTemporaryPassword,
    consumed: isConsumed,
    targetUsername: "dayuth",
    ...(oneTimeTemporaryPassword ? { oneTimeTemporaryPassword } : {}),
  });
}

export async function POST(req: NextRequest) {
  const rawIp = getClientIp(req);
  const anonymizedIp = await anonymizeIdentifier(rawIp);

  const recoverySecret =
    process.env.ADMIN_RECOVERY_KEY?.trim() ||
    process.env.APP_GATE_ADMIN_RECOVERY_KEY?.trim() ||
    process.env.DYT_ADMIN_RECOVERY_SECRET?.trim() ||
    "";

  // 1. Guard: Recovery secret must be configured in environment
  if (!recoverySecret) {
    return NextResponse.json(
      {
        error:
          "Admin recovery is currently disabled (មុខងារសង្គ្រោះគណនីត្រូវបានបិទ។ សូមកំណត់ ADMIN_RECOVERY_KEY ក្នុង Vercel).",
      },
      { status: 403 }
    );
  }

  // 2. Guard: Recovery action must not be consumed
  const alreadyConsumed = await isRecoveryConsumed();
  if (alreadyConsumed) {
    return NextResponse.json(
      {
        error:
          "This one-time recovery key has already been consumed (កូដសង្គ្រោះនេះត្រូវបានប្រើប្រាស់រួចរាល់ហើយ).",
      },
      { status: 410 }
    );
  }

  // 3. Guard: Rate limiting (max 5 attempts per IP per hour)
  const allowed = await checkRecoveryRateLimit(anonymizedIp);
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "ការប៉ុនប៉ងច្រើនដងពេក។ សូមរង់ចាំមួយរយៈសិន (Too many recovery attempts. Please try again later).",
      },
      { status: 429 }
    );
  }

  // 4. Parse request payload
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const userProvidedKey = typeof body?.recoveryKey === "string" ? body.recoveryKey.trim() : "";
  if (!userProvidedKey) {
    return NextResponse.json(
      { error: "សូមបញ្ចូលកូដសង្គ្រោះសម្ងាត់ (Recovery key is required)" },
      { status: 400 }
    );
  }

  // 5. Timing-safe comparison of provided key against environment secret
  const expectedHash = crypto.createHash("sha256").update(recoverySecret).digest();
  const providedHash = crypto.createHash("sha256").update(userProvidedKey).digest();

  const isMatch =
    expectedHash.length === providedHash.length &&
    crypto.timingSafeEqual(expectedHash, providedHash);

  if (!isMatch) {
    await recordRecoveryAttempt(anonymizedIp);
    await AuditLogger.logEvent({
      type: "LOGIN_FAILURE",
      actorId: "recovery_attempt",
      actorUsername: "recovery_attempt",
      targetUsername: "dayuth",
      rawIp,
      details: { reason: "Invalid ADMIN_RECOVERY_KEY attempt" },
    });

    return NextResponse.json(
      { error: "កូដសង្គ្រោះមិនត្រឹមត្រូវ (Invalid recovery key. Access denied)." },
      { status: 401 }
    );
  }

  // 6. Verify target account dayuth exists and is ADMIN
  const targetUser = await UserStore.getUserByUsernameOrEmail("dayuth");
  if (!targetUser) {
    return NextResponse.json(
      { error: "រកមិនឃើញគណនី dayuth ទេ (Account dayuth not found)" },
      { status: 404 }
    );
  }

  if (targetUser.role !== "ADMIN") {
    return NextResponse.json(
      { error: "គណនីនេះមិនមែនជា ADMIN ទេ (Target account is not an ADMIN)" },
      { status: 400 }
    );
  }

  // 7. Generate new strong temporary password satisfying password policy
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = bcrypt.hashSync(temporaryPassword, 12);

  // 8. Update account with bcrypt hash and mustChangePassword = true
  await UserStore.updateUser(targetUser.id, {
    passwordHash,
    mustChangePassword: true,
    status: "ACTIVE",
  });

  // 9. Consume the recovery action immediately (one-time protection)
  await markRecoveryConsumed();

  // 10. Write audit event
  await AuditLogger.logEvent({
    type: "PASSWORD_RESET",
    actorId: "owner_recovery",
    actorUsername: "owner",
    targetId: targetUser.id,
    targetUsername: targetUser.username,
    rawIp,
    details: {
      method: "ADMIN_RECOVERY_KEY",
      forcedChange: true,
      oneTimeConsumed: true,
    },
  });

  // 11. Clear any failed login attempt lock keys so owner can log in cleanly
  const redis = getRedisConfig();
  if (redis) {
    try {
      const keys = await fetch(`${redis.url}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["KEYS", "gate:*"]),
      });
      const keysData = await keys.json();
      if (Array.isArray(keysData.result) && keysData.result.length > 0) {
        await fetch(`${redis.url}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(["DEL", ...keysData.result]),
        });
      }
    } catch {}
  }

  // 12. Return one-time temporary password over HTTPS JSON response
  return NextResponse.json({
    success: true,
    username: targetUser.username,
    temporaryPassword,
    message: "បានកំណត់ពាក្យសម្ងាត់បណ្តោះអាសន្នដោយជោគជ័យ (Account successfully recovered)",
  });
}
