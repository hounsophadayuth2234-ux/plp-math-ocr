import bcrypt from "bcryptjs";
import { UserStore, UserRecord } from "./user-store";

/**
 * Bootstraps the initial administrator accounts securely.
 *
 * Mandatory security rules:
 * 1. Never hardcodes passwords in source code.
 * 2. Requires ALLOW_ADMIN_BOOTSTRAP="true" to execute.
 * 3. Never runs during Next.js production build (NEXT_PHASE === 'phase-production-build').
 * 4. Requires INITIAL_SUPERADMIN_PASSWORD and INITIAL_ADMIN_PASSWORD from environment;
 *    if missing, skips creation and logs a generic warning without secrets.
 * 5. Newly created accounts enforce mustChangePassword: true.
 * 6. Never overwrites or resets credentials of existing accounts.
 * 7. Never logs passwords, secrets, or credential tokens.
 */
export async function bootstrapFirstAdmin(): Promise<UserRecord | null> {
  // 1. Guard against running during Next.js production build phase
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return null;
  }

  // 2. Guard: Must be explicitly enabled via ALLOW_ADMIN_BOOTSTRAP="true"
  if (process.env.ALLOW_ADMIN_BOOTSTRAP !== "true") {
    return null;
  }

  let superAdminUser: UserRecord | null = null;

  // 3. Process SUPER_ADMIN account bootstrapping
  const superUsername = (
    process.env.INITIAL_SUPERADMIN_USERNAME ||
    process.env.INITIAL_SUPER_ADMIN_USERNAME ||
    "superadmin"
  ).trim().toLowerCase();
  const superEmail = (
    process.env.INITIAL_SUPERADMIN_EMAIL ||
    process.env.INITIAL_SUPER_ADMIN_EMAIL ||
    "superadmin@dyt-ecosystem.local"
  ).trim().toLowerCase();
  const superRawPassword = (
    process.env.INITIAL_SUPERADMIN_PASSWORD ||
    process.env.INITIAL_SUPER_ADMIN_PASSWORD
  )?.trim();

  const existingSuper = await UserStore.getUserByUsernameOrEmail(superUsername);

  if (existingSuper) {
    // Invariant: Never overwrite or reset existing account
    superAdminUser = existingSuper;
  } else if (!superRawPassword) {
    console.warn(
      "[bootstrap-admin] INITIAL_SUPERADMIN_PASSWORD not set in environment; skipping SUPER_ADMIN bootstrapping."
    );
  } else {
    const superPasswordHash = bcrypt.hashSync(superRawPassword, 12);
    try {
      superAdminUser = await UserStore.createUser({
        username: superUsername,
        email: superEmail,
        displayName: "Super Administrator (ម្ចាស់ប្រព័ន្ធ)",
        passwordHash: superPasswordHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        mustChangePassword: true,
      });
      console.log(`[bootstrap-admin] Initial SUPER_ADMIN account created: ${superUsername}`);
    } catch {
      superAdminUser = await UserStore.getUserByUsernameOrEmail(superUsername);
    }
  }

  // 4. Process ADMIN account bootstrapping
  const adminUsername = (process.env.INITIAL_ADMIN_USERNAME || "admin").trim().toLowerCase();
  const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || "admin@dyt-ecosystem.local").trim().toLowerCase();
  const adminRawPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim();

  const existingAdmin = await UserStore.getUserByUsernameOrEmail(adminUsername);

  if (!existingAdmin) {
    if (!adminRawPassword) {
      console.warn(
        "[bootstrap-admin] INITIAL_ADMIN_PASSWORD not set in environment; skipping ADMIN bootstrapping."
      );
    } else {
      const adminPasswordHash = bcrypt.hashSync(adminRawPassword, 12);
      try {
        const createdAdmin = await UserStore.createUser({
          username: adminUsername,
          email: adminEmail,
          displayName: "System Administrator",
          passwordHash: adminPasswordHash,
          role: "ADMIN",
          status: "ACTIVE",
          mustChangePassword: true,
        });
        console.log(`[bootstrap-admin] Initial ADMIN account created: ${adminUsername}`);
        if (!superAdminUser) return createdAdmin;
      } catch {
        const existing = await UserStore.getUserByUsernameOrEmail(adminUsername);
        if (!superAdminUser) return existing;
      }
    }
  }

  return superAdminUser;
}
