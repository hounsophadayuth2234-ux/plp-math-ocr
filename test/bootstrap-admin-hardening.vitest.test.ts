import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bootstrapFirstAdmin } from "@/lib/bootstrap-admin";
import { UserStore } from "@/lib/user-store";

describe("Bootstrap Admin Hardening & Invariants", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ALLOW_ADMIN_BOOTSTRAP;
    delete process.env.NEXT_PHASE;
    delete process.env.INITIAL_SUPERADMIN_PASSWORD;
    delete process.env.INITIAL_SUPER_ADMIN_PASSWORD;
    delete process.env.INITIAL_ADMIN_PASSWORD;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("1. Does nothing and returns null if ALLOW_ADMIN_BOOTSTRAP is not 'true'", async () => {
    process.env.ALLOW_ADMIN_BOOTSTRAP = "false";
    process.env.INITIAL_SUPERADMIN_PASSWORD = "ValidPass2026!Test";
    process.env.INITIAL_ADMIN_PASSWORD = "ValidPass2026!Test";

    const createSpy = vi.spyOn(UserStore, "createUser");
    const result = await bootstrapFirstAdmin();

    expect(result).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("2. Does nothing and returns null during Next.js production build phase", async () => {
    process.env.ALLOW_ADMIN_BOOTSTRAP = "true";
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.INITIAL_SUPERADMIN_PASSWORD = "ValidPass2026!Test";
    process.env.INITIAL_ADMIN_PASSWORD = "ValidPass2026!Test";

    const createSpy = vi.spyOn(UserStore, "createUser");
    const result = await bootstrapFirstAdmin();

    expect(result).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("3. Skips SUPER_ADMIN creation when INITIAL_SUPERADMIN_PASSWORD is absent and logs warning without secrets", async () => {
    process.env.ALLOW_ADMIN_BOOTSTRAP = "true";
    delete process.env.INITIAL_SUPERADMIN_PASSWORD;
    delete process.env.INITIAL_SUPER_ADMIN_PASSWORD;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.spyOn(UserStore, "getUserByUsernameOrEmail").mockResolvedValue(null);
    const createSpy = vi.spyOn(UserStore, "createUser");

    await bootstrapFirstAdmin();

    expect(createSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("INITIAL_SUPERADMIN_PASSWORD not set in environment")
    );

    // Verify no secret leakage in warnings or logs
    for (const call of [...warnSpy.mock.calls, ...logSpy.mock.calls]) {
      const msg = call.join(" ");
      expect(msg).not.toContain("password");
      expect(msg).not.toContain("Secret");
    }
  });

  it("4. Skips ADMIN creation when INITIAL_ADMIN_PASSWORD is absent and logs warning without secrets", async () => {
    process.env.ALLOW_ADMIN_BOOTSTRAP = "true";
    process.env.INITIAL_SUPERADMIN_PASSWORD = "SuperSecurePassword2026!";
    delete process.env.INITIAL_ADMIN_PASSWORD;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(UserStore, "getUserByUsernameOrEmail").mockResolvedValue(null);
    vi.spyOn(UserStore, "createUser").mockImplementation(async (data) => ({
      ...data,
      id: "usr_mock_super",
      status: data.status || "ACTIVE",
      mustChangePassword: data.mustChangePassword ?? true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    await bootstrapFirstAdmin();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("INITIAL_ADMIN_PASSWORD not set in environment")
    );
  });

  it("5. Sets mustChangePassword: true upon creation and never logs passwords", async () => {
    process.env.ALLOW_ADMIN_BOOTSTRAP = "true";
    process.env.INITIAL_SUPERADMIN_PASSWORD = "SuperAdminPassword2026!Real";
    process.env.INITIAL_ADMIN_PASSWORD = "AdminPassword2026!Real";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(UserStore, "getUserByUsernameOrEmail").mockResolvedValue(null);
    const createdUsers: any[] = [];
    vi.spyOn(UserStore, "createUser").mockImplementation(async (data) => {
      createdUsers.push(data);
      return {
        ...data,
        id: `usr_${data.username}`,
        status: data.status || "ACTIVE",
        mustChangePassword: data.mustChangePassword ?? true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });

    await bootstrapFirstAdmin();

    expect(createdUsers.length).toBe(2);
    expect(createdUsers[0].role).toBe("SUPER_ADMIN");
    expect(createdUsers[0].mustChangePassword).toBe(true);
    expect(createdUsers[1].role).toBe("ADMIN");
    expect(createdUsers[1].mustChangePassword).toBe(true);

    // Password values must NEVER be logged
    for (const call of logSpy.mock.calls) {
      const msg = call.join(" ");
      expect(msg).not.toContain("SuperAdminPassword2026!Real");
      expect(msg).not.toContain("AdminPassword2026!Real");
    }
  });

  it("6. Never overwrites or resets credentials of existing accounts", async () => {
    process.env.ALLOW_ADMIN_BOOTSTRAP = "true";
    process.env.INITIAL_SUPERADMIN_PASSWORD = "NewPasswordAttempt";
    process.env.INITIAL_ADMIN_PASSWORD = "NewPasswordAttempt";

    const existingUser = {
      id: "usr_existing_superadmin",
      username: "superadmin",
      email: "superadmin@dyt-ecosystem.local",
      displayName: "Original Super Admin",
      passwordHash: "$2b$12$OriginalUnchangedHash",
      role: "SUPER_ADMIN" as const,
      status: "ACTIVE" as const,
      mustChangePassword: false,
      createdAt: 1000,
      updatedAt: 1000,
    };

    vi.spyOn(UserStore, "getUserByUsernameOrEmail").mockResolvedValue(existingUser);
    const createSpy = vi.spyOn(UserStore, "createUser");
    const updateSpy = vi.spyOn(UserStore, "updateUser");

    const result = await bootstrapFirstAdmin();

    expect(result).toEqual(existingUser);
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
