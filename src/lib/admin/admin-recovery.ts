import bcrypt from "bcryptjs";
import { UserStore } from "@/lib/user-store";
import { generateTemporaryPassword } from "@/lib/password-rules";
import { AuditLogger } from "@/lib/audit-logger";

// Ephemeral single-use delivery slot (in-memory fallback, burns on read)
let ephemeralOneTimeCredential: {
  username: string;
  temporaryPassword: string;
  createdAt: number;
} | null = null;

export function __resetEphemeralRecovery(): void {
  ephemeralOneTimeCredential = null;
}

export function getEphemeralCredential(): { username: string; temporaryPassword: string; createdAt: number } | null {
  return ephemeralOneTimeCredential;
}

export function setEphemeralCredential(cred: { username: string; temporaryPassword: string; createdAt: number } | null): void {
  ephemeralOneTimeCredential = cred;
}

export async function stageOneTimePasswordReset(targetUsername = "dayuth"): Promise<{ success: boolean; error?: string; temporaryPassword?: string }> {
  const targetUser = await UserStore.getUserByUsernameOrEmail(targetUsername);
  if (!targetUser) {
    return { success: false, error: `Account ${targetUsername} not found` };
  }
  if (targetUser.role !== "ADMIN" && targetUser.role !== "SUPER_ADMIN") {
    return { success: false, error: `Account ${targetUsername} is not an Administrator` };
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

  return { success: true, temporaryPassword };
}
