import fs from "fs";
import path from "path";
import { getValidRedisConfig } from "./redis-config";

export interface DriveUploadRecord {
  id: string; // "dru_..."
  userId: string;
  module: string;
  originalDriveFileId?: string;
  resultDriveFileId?: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
  status: "pending" | "uploaded" | "failed";
  folderId: string;
  webViewLink?: string;
  errorMessage?: string;
}

// Local in-memory and file-based fallback store
const localHistory: Map<string, DriveUploadRecord> = new Map();
const userIndex: Map<string, Set<string>> = new Map();

function getStoreFilePath(): string {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {}
  }
  return path.join(dataDir, "drive-history-store.json");
}

function loadLocalFile(): void {
  try {
    const file = getStoreFilePath();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const list = JSON.parse(raw) as DriveUploadRecord[];
      localHistory.clear();
      userIndex.clear();
      for (const rec of list) {
        localHistory.set(rec.id, rec);
        if (!userIndex.has(rec.userId)) {
          userIndex.set(rec.userId, new Set());
        }
        userIndex.get(rec.userId)!.add(rec.id);
      }
    }
  } catch {}
}

function saveLocalFile(): void {
  try {
    const file = getStoreFilePath();
    const list = Array.from(localHistory.values());
    fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
  } catch {}
}

loadLocalFile();

function getRedisConfig(): { url: string; token: string } | null {
  return getValidRedisConfig();
}

async function redisCommand<T = unknown>(command: any[]): Promise<T | null> {
  const redis = getRedisConfig();
  if (!redis) return null;
  try {
    const res = await fetch(redis.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result as T;
  } catch {
    return null;
  }
}

async function redisPipeline(commands: any[][]): Promise<any[] | null> {
  const redis = getRedisConfig();
  if (!redis) return null;
  try {
    const res = await fetch(`${redis.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.map((d: any) => d.result);
  } catch {
    return null;
  }
}

export class DriveHistoryStore {
  /**
   * Adds an upload metadata record.
   */
  static async addRecord(
    params: Omit<DriveUploadRecord, "id" | "createdAt">
  ): Promise<DriveUploadRecord> {
    const now = Date.now();
    const id = `dru_${Math.random().toString(36).substring(2, 9)}_${now.toString(36)}`;

    const record: DriveUploadRecord = {
      ...params,
      id,
      createdAt: now,
    };

    const redis = getRedisConfig();
    if (redis) {
      await redisPipeline([
        ["SET", `dyt:drive_record:${id}`, JSON.stringify(record)],
        ["SADD", `dyt:drive_user_records:${record.userId}`, id],
        ["SADD", "dyt:drive_records:all", id],
      ]);
    }

    localHistory.set(id, record);
    if (!userIndex.has(record.userId)) {
      userIndex.set(record.userId, new Set());
    }
    userIndex.get(record.userId)!.add(id);
    saveLocalFile();

    return record;
  }

  /**
   * Lists records for a specific user.
   */
  static async listRecordsForUser(userId: string): Promise<DriveUploadRecord[]> {
    const redis = getRedisConfig();
    if (redis) {
      const ids = await redisCommand<string[]>([
        "SMEMBERS",
        `dyt:drive_user_records:${userId}`,
      ]);
      if (Array.isArray(ids) && ids.length > 0) {
        const pipeline = ids.map((id) => ["GET", `dyt:drive_record:${id}`]);
        const results = await redisPipeline(pipeline);
        if (results) {
          const list: DriveUploadRecord[] = [];
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

    const set = userIndex.get(userId);
    if (!set) return [];
    const list: DriveUploadRecord[] = [];
    for (const id of set) {
      const rec = localHistory.get(id);
      if (rec) list.push(rec);
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Lists all records across all users (ADMIN only).
   */
  static async listAllRecords(): Promise<DriveUploadRecord[]> {
    const redis = getRedisConfig();
    if (redis) {
      const ids = await redisCommand<string[]>(["SMEMBERS", "dyt:drive_records:all"]);
      if (Array.isArray(ids) && ids.length > 0) {
        const pipeline = ids.map((id) => ["GET", `dyt:drive_record:${id}`]);
        const results = await redisPipeline(pipeline);
        if (results) {
          const list: DriveUploadRecord[] = [];
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

    return Array.from(localHistory.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
}
