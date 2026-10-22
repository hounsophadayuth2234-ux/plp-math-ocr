import fs from "fs";
import path from "path";

export type UserRole = "ADMIN" | "USER";
export type UserStatus = "ACTIVE" | "DISABLED";

export interface UserRecord {
  id: string; // "usr_..."
  username: string; // lowercase
  email: string; // lowercase
  displayName: string;
  passwordHash: string; // bcrypt hash
  managedPasswordEncrypted?: string; // AES-256-GCM reversible encrypted password
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  passwordChangedAt?: number;
  sessionRevokedAt?: number;
  activeSessionsCount?: number;
}

export type SafeUser = Omit<UserRecord, "passwordHash" | "managedPasswordEncrypted"> & {
  visiblePassword?: string | null;
};

export function toSafeUser(user: UserRecord): SafeUser {
  const { passwordHash: _hash, managedPasswordEncrypted: _enc, ...safe } = user;
  return safe;
}

export function toAdminSafeUser(user: UserRecord): SafeUser {
  return toSafeUser(user);
}

// ============================================================================
// Upstash Redis / Vercel KV REST Client
// ============================================================================

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

async function redisCommand<T = any>(command: any[]): Promise<T | null> {
  const cfg = getRedisConfig();
  if (!cfg) return null;

  try {
    const res = await fetch(`${cfg.url}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[user-store] Redis command failed with status ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.result as T;
  } catch (err) {
    console.warn("[user-store] Redis command network error:", err);
    return null;
  }
}

async function redisPipeline(commands: any[][]): Promise<any[] | null> {
  const cfg = getRedisConfig();
  if (!cfg) return null;

  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.map((d: any) => d.result);
  } catch (err) {
    console.warn("[user-store] Redis pipeline error:", err);
    return null;
  }
}

// ============================================================================
// Local Persistent Fallback (Used during offline tests or when Redis unconfigured)
// ============================================================================

const localMemoryUsers = new Map<string, UserRecord>();
const localUsernameIndex = new Map<string, string>(); // username -> id
const localEmailIndex = new Map<string, string>(); // email -> id

function getLocalStoreFilePath(): string {
  const dir = path.join(process.cwd(), "scratch");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, "users-persistent.json");
}

function loadLocalFileStore(): void {
  try {
    const file = getLocalStoreFilePath();
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, "utf-8");
      const list: UserRecord[] = JSON.parse(content);
      localMemoryUsers.clear();
      localUsernameIndex.clear();
      localEmailIndex.clear();
      for (const u of list) {
        localMemoryUsers.set(u.id, u);
        localUsernameIndex.set(u.username.toLowerCase(), u.id);
        localEmailIndex.set(u.email.toLowerCase(), u.id);
      }
    }
  } catch {}
}

function saveLocalFileStore(): void {
  try {
    const file = getLocalStoreFilePath();
    const list = Array.from(localMemoryUsers.values());
    fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf-8");
  } catch {}
}

// Initial sync
loadLocalFileStore();

// ============================================================================
// User Store Public APIs
// ============================================================================

export class UserStore {
  /**
   * Resets test isolation in-memory structures (used only in test environments).
   */
  static __resetTestStore(): void {
    localMemoryUsers.clear();
    localUsernameIndex.clear();
    localEmailIndex.clear();
  }

  /**
   * Retrieves a user by their unique ID.
   */
  static async getUserById(id: string): Promise<UserRecord | null> {
    const redis = getRedisConfig();
    if (redis) {
      const raw = await redisCommand<string>(["GET", `dyt:user:${id}`]);
      if (raw) {
        try {
          return typeof raw === "string" ? JSON.parse(raw) : (raw as UserRecord);
        } catch {
          return null;
        }
      }
    }

    return localMemoryUsers.get(id) || null;
  }

  /**
   * Retrieves a user by either username or email (case-insensitive).
   */
  static async getUserByUsernameOrEmail(identifier: string): Promise<UserRecord | null> {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();

    const redis = getRedisConfig();
    if (redis) {
      // 1. Try username index
      let userId = await redisCommand<string>(["GET", `dyt:user:lookup:username:${clean}`]);
      // 2. If not found, try email index
      if (!userId) {
        userId = await redisCommand<string>(["GET", `dyt:user:lookup:email:${clean}`]);
      }

      if (userId) {
        return this.getUserById(userId);
      }
    }

    const localId = localUsernameIndex.get(clean) || localEmailIndex.get(clean);
    if (localId) {
      return localMemoryUsers.get(localId) || null;
    }

    return null;
  }

  /**
   * Creates a new user record. Enforces unique username and email.
   */
  static async createUser(params: {
    username: string;
    email: string;
    displayName: string;
    passwordHash: string;
    managedPasswordEncrypted?: string;
    role: UserRole;
    status?: UserStatus;
    mustChangePassword?: boolean;
  }): Promise<UserRecord> {
    const username = params.username.trim().toLowerCase();
    const email = params.email.trim().toLowerCase();

    // Check uniqueness
    const existing = await this.getUserByUsernameOrEmail(username);
    if (existing) {
      throw new Error(`Username "${username}" is already in use.`);
    }
    const existingEmail = await this.getUserByUsernameOrEmail(email);
    if (existingEmail) {
      throw new Error(`Email "${email}" is already in use.`);
    }

    const now = Date.now();
    const id = `usr_${Math.random().toString(36).substring(2, 10)}${now.toString(36)}`;

    const user: UserRecord = {
      id,
      username,
      email,
      displayName: params.displayName.trim(),
      passwordHash: params.passwordHash,
      managedPasswordEncrypted: params.managedPasswordEncrypted,
      role: params.role,
      status: params.status || "ACTIVE",
      mustChangePassword: params.mustChangePassword ?? false,
      createdAt: now,
      updatedAt: now,
      passwordChangedAt: now,
      sessionRevokedAt: undefined,
      activeSessionsCount: 0,
    };

    const redis = getRedisConfig();
    if (redis) {
      const userJson = JSON.stringify(user);
      await redisPipeline([
        ["SET", `dyt:user:${id}`, userJson],
        ["SET", `dyt:user:lookup:username:${username}`, id],
        ["SET", `dyt:user:lookup:email:${email}`, id],
        ["SADD", "dyt:users:all", id],
      ]);
    }

    // Also update local store
    localMemoryUsers.set(id, user);
    localUsernameIndex.set(username, id);
    localEmailIndex.set(email, id);
    saveLocalFileStore();

    return user;
  }

  /**
   * Updates an existing user record.
   */
  static async updateUser(
    id: string,
    updates: Partial<Omit<UserRecord, "id" | "createdAt">>
  ): Promise<UserRecord> {
    const existing = await this.getUserById(id);
    if (!existing) {
      throw new Error(`User with ID ${id} not found.`);
    }

    const now = Date.now();
    const updated: UserRecord = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    // If username changed, update lookup index
    const usernameChanged = updates.username && updates.username.toLowerCase() !== existing.username;
    const emailChanged = updates.email && updates.email.toLowerCase() !== existing.email;

    const redis = getRedisConfig();
    if (redis) {
      const commands: any[][] = [
        ["SET", `dyt:user:${id}`, JSON.stringify(updated)],
      ];

      if (usernameChanged) {
        commands.push(["DEL", `dyt:user:lookup:username:${existing.username}`]);
        commands.push(["SET", `dyt:user:lookup:username:${updated.username.toLowerCase()}`, id]);
      }

      if (emailChanged) {
        commands.push(["DEL", `dyt:user:lookup:email:${existing.email}`]);
        commands.push(["SET", `dyt:user:lookup:email:${updated.email.toLowerCase()}`, id]);
      }

      await redisPipeline(commands);
    }

    if (usernameChanged) {
      localUsernameIndex.delete(existing.username);
      localUsernameIndex.set(updated.username.toLowerCase(), id);
    }
    if (emailChanged) {
      localEmailIndex.delete(existing.email);
      localEmailIndex.set(updated.email.toLowerCase(), id);
    }

    localMemoryUsers.set(id, updated);
    saveLocalFileStore();

    return updated;
  }

  /**
   * Deletes a user record.
   * Invariant: Cannot delete the last active administrator.
   */
  static async deleteUser(id: string): Promise<boolean> {
    const existing = await this.getUserById(id);
    if (!existing) return false;

    // Guard final active admin
    if (existing.role === "ADMIN" && existing.status === "ACTIVE") {
      const activeAdmins = await this.countActiveAdmins();
      if (activeAdmins <= 1) {
        throw new Error("Cannot delete the final active administrator account.");
      }
    }

    const redis = getRedisConfig();
    if (redis) {
      await redisPipeline([
        ["DEL", `dyt:user:${id}`],
        ["DEL", `dyt:user:lookup:username:${existing.username}`],
        ["DEL", `dyt:user:lookup:email:${existing.email}`],
        ["SREM", "dyt:users:all", id],
      ]);
    }

    localUsernameIndex.delete(existing.username);
    localEmailIndex.delete(existing.email);
    localMemoryUsers.delete(id);
    saveLocalFileStore();

    return true;
  }

  /**
   * Lists all registered users.
   */
  static async listUsers(): Promise<UserRecord[]> {
    const redis = getRedisConfig();
    if (redis) {
      const ids = await redisCommand<string[]>(["SMEMBERS", "dyt:users:all"]);
      if (Array.isArray(ids) && ids.length > 0) {
        const pipeline = ids.map((id) => ["GET", `dyt:user:${id}`]);
        const results = await redisPipeline(pipeline);
        if (results) {
          const list: UserRecord[] = [];
          for (const raw of results) {
            if (raw) {
              try {
                list.push(typeof raw === "string" ? JSON.parse(raw) : raw);
              } catch {}
            }
          }
          return list.sort((a, b) => b.createdAt - a.createdAt);
        }
      }
    }

    return Array.from(localMemoryUsers.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Counts active administrators.
   */
  static async countActiveAdmins(): Promise<number> {
    const users = await this.listUsers();
    return users.filter((u) => u.role === "ADMIN" && u.status === "ACTIVE").length;
  }

  /**
   * Revokes all active sessions for a user immediately.
   */
  static async revokeSessions(id: string): Promise<UserRecord> {
    const now = Date.now();
    return this.updateUser(id, {
      sessionRevokedAt: now,
      activeSessionsCount: 0,
    });
  }
}
