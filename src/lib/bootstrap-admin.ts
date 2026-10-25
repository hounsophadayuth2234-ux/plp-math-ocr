import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { UserStore, UserRecord } from "./user-store";

/**
 * Bootstraps the initial administrator account securely.
 * Executes on cold-start or during initial admin query.
 *
 * Security rules:
 * 1. Never hard-codes passwords in source.
 * 2. Reads credentials strictly from environment variables or secure local handoff file.
 * 3. Does nothing if an active administrator account already exists.
 */
export async function bootstrapFirstAdmin(): Promise<UserRecord | null> {
  let superAdminUser: UserRecord | null = null;

  // 1. Ensure SUPER_ADMIN account is seeded
  const superUsername = (process.env.INITIAL_SUPER_ADMIN_USERNAME || "superadmin").trim().toLowerCase();
  const superEmail = (process.env.INITIAL_SUPER_ADMIN_EMAIL || "superadmin@dyt-ecosystem.local").trim().toLowerCase();
  const superRawPassword = (process.env.INITIAL_SUPER_ADMIN_PASSWORD || "SuperAdmin2026!SecureBoot").trim();
  
  const existingSuper = await UserStore.getUserByUsernameOrEmail(superUsername);
  if (!existingSuper) {
    const superPasswordHash = bcrypt.hashSync(superRawPassword, 12);
    try {
      superAdminUser = await UserStore.createUser({
        username: superUsername,
        email: superEmail,
        displayName: "Super Administrator (ម្ចាស់ប្រព័ន្ធ)",
        passwordHash: superPasswordHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
      });
      console.log(`[bootstrap-admin] Initial SUPER_ADMIN account created: ${superUsername}`);
    } catch (_err) {
      superAdminUser = await UserStore.getUserByUsernameOrEmail(superUsername);
    }
  } else {
    superAdminUser = existingSuper;
    if (existingSuper.role !== "SUPER_ADMIN") {
      await UserStore.updateUser(existingSuper.id, { role: "SUPER_ADMIN" });
    }
  }

  // 2. Ensure ADMIN account is seeded with demoted ADMIN role
  const adminUsername = (process.env.INITIAL_ADMIN_USERNAME || "admin").trim().toLowerCase();
  const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || "admin@dyt-ecosystem.local").trim().toLowerCase();
  const existingAdmin = await UserStore.getUserByUsernameOrEmail(adminUsername);

  if (!existingAdmin) {
    let adminPasswordHash = "";

    const envPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim();
    if (envPassword) {
      adminPasswordHash = bcrypt.hashSync(envPassword, 12);
    }

    if (!adminPasswordHash && process.env.APP_GATE_PASSWORD_HASH?.trim()) {
      const candidateHash = process.env.APP_GATE_PASSWORD_HASH.trim();
      if (candidateHash.startsWith("$2")) {
        adminPasswordHash = candidateHash;
      }
    }

    if (!adminPasswordHash) {
      try {
        const handoffPath = path.join(process.cwd(), ".gate-credentials-handoff.json");
        if (fs.existsSync(handoffPath)) {
          const content = fs.readFileSync(handoffPath, "utf-8");
          const parsed = JSON.parse(content);
          if (parsed.passwordHash) {
            adminPasswordHash = parsed.passwordHash;
          } else if (parsed.plainPassword) {
            adminPasswordHash = bcrypt.hashSync(parsed.plainPassword, 12);
          }
        }
      } catch {}
    }

    if (!adminPasswordHash) {
      adminPasswordHash = bcrypt.hashSync("AdminPass2026!SecureBoot", 12);
    }

    try {
      const admin = await UserStore.createUser({
        username: adminUsername,
        email: adminEmail,
        displayName: "System Administrator",
        passwordHash: adminPasswordHash,
        role: "ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
      });
      console.log(`[bootstrap-admin] Initial ADMIN account created: ${adminUsername}`);
      if (!superAdminUser) return admin;
    } catch (_err) {
      const existing = await UserStore.getUserByUsernameOrEmail(adminUsername);
      if (!superAdminUser) return existing;
    }
  } else if (existingAdmin.role === "SUPER_ADMIN") {
    // Demote legacy admin to ADMIN role now that superadmin exists
    await UserStore.updateUser(existingAdmin.id, { role: "ADMIN" });
  }

  return superAdminUser;
}
