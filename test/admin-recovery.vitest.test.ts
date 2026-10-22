import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { UserStore } from "@/lib/user-store";
import { AuditLogger } from "@/lib/audit-logger";
import {
  GET as recoveryGet,
  POST as recoveryPost,
  stageOneTimePasswordReset,
  __resetEphemeralRecovery,
} from "@/app/api/auth/admin-recovery/route";

describe("Admin Account Recovery Flow (ADMIN_RECOVERY_KEY)", () => {
  beforeEach(async () => {
    UserStore.__resetTestStore();
    AuditLogger.__resetTestEvents();
    __resetEphemeralRecovery();
    vi.unstubAllEnvs();

    // Seed target account dayuth
    await UserStore.createUser({
      username: "dayuth",
      email: "dayuth@dyt-ecosystem.local",
      displayName: "Dayuth Admin",
      passwordHash: bcrypt.hashSync("OldPass2026!Strong", 10),
      role: "ADMIN",
      status: "ACTIVE",
    });
  });

  it("1. GET /api/auth/admin-recovery returns enabled: false when secret is not configured", async () => {
    const res = await recoveryGet();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.enabled).toBe(false);
    expect(data.targetUsername).toBe("dayuth");
  });

  it("2. GET /api/auth/admin-recovery returns enabled: true when secret is configured", async () => {
    vi.stubEnv("ADMIN_RECOVERY_KEY", "SuperSecretRecoveryKey2026!Alpha");
    const res = await recoveryGet();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.enabled).toBe(true);
    expect(data.targetUsername).toBe("dayuth");
  });

  it("3. POST returns 403 Forbidden when ADMIN_RECOVERY_KEY is not configured", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/admin-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryKey: "AnyKey123" }),
    });

    const res = await recoveryPost(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("disabled");
  });

  it("4. POST returns 401 Unauthorized when invalid recovery key is entered", async () => {
    vi.stubEnv("ADMIN_RECOVERY_KEY", "CorrectRecoverySecretKey2026!XYZ");
    const req = new NextRequest("http://localhost:3000/api/auth/admin-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryKey: "WrongSecretKey123" }),
    });

    const res = await recoveryPost(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Invalid recovery key");
  });

  it("5. POST succeeds with correct recovery key: sets mustChangePassword=true, generates compliant temp password, writes audit event", async () => {
    const secret = "CorrectRecoverySecretKey2026!XYZ";
    vi.stubEnv("ADMIN_RECOVERY_KEY", secret);

    const req = new NextRequest("http://localhost:3000/api/auth/admin-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryKey: secret, targetUsername: "dayuth" }),
    });

    const res = await recoveryPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.username).toBe("dayuth");
    expect(typeof data.temporaryPassword).toBe("string");
    expect(data.temporaryPassword.length).toBeGreaterThanOrEqual(10);

    // Verify user in store was updated with mustChangePassword = true
    const updated = await UserStore.getUserByUsernameOrEmail("dayuth");
    expect(updated).not.toBeNull();
    expect(updated?.mustChangePassword).toBe(true);
    expect(updated?.role).toBe("ADMIN");
    expect(updated?.status).toBe("ACTIVE");

    // Verify passwordHash matches the returned temporary password
    expect(bcrypt.compareSync(data.temporaryPassword, updated!.passwordHash)).toBe(true);

    // Verify audit event
    const events = await AuditLogger.getRecentEvents(10);
    const resetEvent = events.find((e) => e.type === "PASSWORD_RESET" && e.targetUsername === "dayuth");
    expect(resetEvent).toBeDefined();
    expect(resetEvent?.details?.method).toBe("ADMIN_RECOVERY_KEY");
  });

  it("6. APP_GATE_ADMIN_RECOVERY_KEY is recognized as a valid recovery secret", async () => {
    vi.stubEnv("APP_GATE_ADMIN_RECOVERY_KEY", "RecoverySecret2026!AppGate");
    const res = await recoveryGet();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.enabled).toBe(true);
    expect(data.targetUsername).toBe("dayuth");
  });

  it("7. stageOneTimePasswordReset updates dayuth and delivers via GET with burn-on-read single-use semantics", async () => {
    const stageRes = await stageOneTimePasswordReset("dayuth");
    expect(stageRes.success).toBe(true);

    // Verify account state in store
    const user = await UserStore.getUserByUsernameOrEmail("dayuth");
    expect(user?.role).toBe("ADMIN");
    expect(user?.status).toBe("ACTIVE");
    expect(user?.mustChangePassword).toBe(true);

    // First GET retrieves the temporary password for UI display
    const firstGet = await recoveryGet();
    const firstData = await firstGet.json();
    expect(firstGet.status).toBe(200);
    expect(firstData.enabled).toBe(true);
    expect(typeof firstData.oneTimeTemporaryPassword).toBe("string");
    expect(firstData.oneTimeTemporaryPassword.length).toBeGreaterThanOrEqual(10);
    expect(bcrypt.compareSync(firstData.oneTimeTemporaryPassword, user!.passwordHash)).toBe(true);

    // Second GET has burned the credential and never returns it again
    const secondGet = await recoveryGet();
    const secondData = await secondGet.json();
    expect(secondData.oneTimeTemporaryPassword).toBeUndefined();

    // Verify audit log
    const events = await AuditLogger.getRecentEvents(10);
    const resetEvent = events.find((e) => e.type === "PASSWORD_RESET" && e.targetUsername === "dayuth");
    expect(resetEvent).toBeDefined();
    expect(resetEvent?.details?.method).toBe("ONE_TIME_SECURE_FLOW");
  });
});
