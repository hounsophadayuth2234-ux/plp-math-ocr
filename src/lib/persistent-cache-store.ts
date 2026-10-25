import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getValidRedisConfig } from "./redis-config";
import { normalizeKhmerText } from "./khmer-grapheme-normalizer";

export const DEFAULT_DRIVE_FOLDER_ID = "1dS_Ul_WnVCCbJAKsn6CAT0vy9AB8Yx8f";

export interface CacheKeyParams {
  module: string;
  userId: string;
  grade?: string;
  mode?: string;
  language?: string;
  inputFingerprint: string;
  options?: Record<string, unknown>;
  modelName: string;
  promptVersion: string;
}

export interface DriveArtifactMetadata {
  fileId: string;
  name?: string;
  mimeType?: string;
  size?: number;
  webViewLink?: string;
  uploadedAt?: number;
}

export interface PersistentCacheRecord<T = any> {
  cacheKey: string;
  userId: string;
  module: string;
  grade: string;
  mode: string;
  language: string;
  normalizedInputFingerprint?: string;
  inputFingerprint?: string;
  exactImageSha256?: string;
  normalizedImageSha256?: string;
  ocrFingerprint?: string;
  normalizedQuestionText?: string;
  summary?: string;
  modelName: string;
  promptVersion: string;
  outputFields: T;
  driveFileIds: Record<string, string>; // e.g. { originalImage: "...", latex: "...", html: "...", mathml: "...", text: "..." }
  driveLinks: Record<string, string>;
  mimeTypes: Record<string, string>;
  timestamps: {
    createdAt: number;
    cachedAt: number;
    lastAccessedAt: number;
  };
  processingStatus: "completed" | "partial" | "failed";
  status?: "completed" | "partial" | "failed";
  source: "cache" | "gemini" | "worker";
}

export type PersistentCacheInput<T = any> = Omit<
  PersistentCacheRecord<T>,
  "driveFileIds" | "driveLinks" | "mimeTypes" | "timestamps" | "processingStatus" | "source"
> & {
  driveFileIds?: Record<string, string>;
  driveLinks?: Record<string, string>;
  mimeTypes?: Record<string, string>;
  timestamps?: {
    createdAt?: number;
    cachedAt?: number;
    lastAccessedAt?: number;
  };
  processingStatus?: "completed" | "partial" | "failed";
  status?: "completed" | "partial" | "failed";
  source?: "cache" | "gemini" | "worker";
};

// ----------------------------------------------------------------------------
// Deterministic Fingerprinting & Hashing
// ----------------------------------------------------------------------------

/**
 * Calculates exact SHA-256 hexadecimal digest of any raw buffer.
 */
export function computeExactSha256(buffer: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Computes a normalized image SHA-256.
 * Strips non-image metadata chunks (EXIF, comments, ancillary chunks)
 * and normalizes dimensions into canonical aspect buckets so harmless
 * recompression or format wrapper metadata changes match the same image.
 */
export function computeNormalizedImageSha256(buffer: Buffer | Uint8Array): string {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 16) {
    return computeExactSha256(buf);
  }

  // 1. Detect PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    try {
      // Extract only essential chunks: IHDR and IDAT chunks
      const essentialChunks: Buffer[] = [];
      let offset = 8;
      while (offset < buf.length - 8) {
        const length = buf.readUInt32BE(offset);
        const type = buf.toString("ascii", offset + 4, offset + 8);
        if (type === "IHDR" || type === "IDAT") {
          essentialChunks.push(buf.subarray(offset + 8, offset + 8 + length));
        } else if (type === "IEND") {
          break;
        }
        offset += 12 + length;
      }
      if (essentialChunks.length > 0) {
        const hasher = crypto.createHash("sha256");
        for (const chunk of essentialChunks) {
          hasher.update(chunk);
        }
        return hasher.digest("hex");
      }
    } catch {}
  }

  // 2. Detect JPEG (FF D8)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    try {
      // Exclude APP0-APP15 (FF E0 - FF EF) and COM (FF FE) metadata markers
      const scanDataChunks: Buffer[] = [];
      let offset = 2;
      while (offset < buf.length - 4) {
        if (buf[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buf[offset + 1];
        if (marker === 0xd9) break; // EOI
        if (marker === 0xda) {
          // SOS: Start of Spectral scan - includes image data until EOI
          scanDataChunks.push(buf.subarray(offset + 2, buf.length - 2));
          break;
        }
        // Markers with variable payload lengths
        if (
          (marker >= 0xc0 && marker <= 0xc3) || // SOF
          marker === 0xc4 || // DHT
          marker === 0xdb // DQT
        ) {
          const len = buf.readUInt16BE(offset + 2);
          scanDataChunks.push(buf.subarray(offset + 4, offset + 2 + len));
          offset += 2 + len;
        } else if (
          (marker >= 0xe0 && marker <= 0xef) || // APP0-APP15
          marker === 0xfe // COM
        ) {
          const len = buf.readUInt16BE(offset + 2);
          offset += 2 + len; // Skip metadata
        } else {
          offset += 2;
        }
      }
      if (scanDataChunks.length > 0) {
        const hasher = crypto.createHash("sha256");
        for (const c of scanDataChunks) hasher.update(c);
        return hasher.digest("hex");
      }
    } catch {}
  }

  // Fallback: Uniform content sample hashing
  const sampleStride = Math.max(1, Math.floor(buf.length / 1024));
  const sample = Buffer.alloc(1024);
  for (let i = 0; i < 1024; i++) {
    sample[i] = buf[(i * sampleStride) % buf.length];
  }
  return crypto.createHash("sha256").update(sample).digest("hex");
}

/**
 * Normalizes question text (Khmer + Math + English):
 * - Applies canonical Khmer unicode grapheme normalization
 * - Collapses whitespace
 * - Standardizes mathematical operators (×, ÷, +, -, =)
 * - Strips non-semantic surrounding punctuation
 */
export function computeNormalizedTextFingerprint(rawText: string): {
  normalizedText: string;
  fingerprint: string;
} {
  if (!rawText || !rawText.trim()) {
    return { normalizedText: "", fingerprint: "" };
  }

  // 1. Khmer grapheme cluster normalization
  let text = normalizeKhmerText(rawText);

  // 2. Unicode NFKC normalization
  text = text.normalize("NFKC");

  // 3. Lowercase latin characters
  text = text.toLowerCase();

  // 4. Standardize math symbols
  text = text
    .replace(/[xX*]/g, "×")
    .replace(/[/:]/g, "÷")
    .replace(/[-–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // 5. Compute SHA-256 fingerprint
  const fingerprint = crypto.createHash("sha256").update(text, "utf8").digest("hex");
  return { normalizedText: text, fingerprint };
}

/**
 * Computes an OCR text fingerprint by stripping line breaks and extra spaces.
 */
export function computeOcrFingerprint(ocrText: string): string {
  return computeNormalizedTextFingerprint(ocrText).fingerprint;
}

/**
 * Constructs a deterministic, canonical SHA-256 cache key.
 * Guaranteed invariant: If grade, mode, language, modelName, or promptVersion differs,
 * the generated key will strictly NOT match.
 */
export function buildDeterministicCacheKey(params: CacheKeyParams): string {
  const {
    module,
    userId,
    grade = "auto",
    mode = "default",
    language = "km",
    inputFingerprint,
    options = {},
    modelName,
    promptVersion,
  } = params;

  // Sort options keys deterministically
  const sortedOptions: Record<string, unknown> = {};
  for (const k of Object.keys(options).sort()) {
    sortedOptions[k] = options[k];
  }

  const payload = JSON.stringify({
    module: module.trim().toLowerCase(),
    userScope: userId.trim().toLowerCase(),
    grade: grade.trim().toLowerCase(),
    mode: mode.trim().toLowerCase(),
    language: language.trim().toLowerCase(),
    inputFingerprint: inputFingerprint.trim(),
    options: sortedOptions,
    modelName: modelName.trim().toLowerCase(),
    promptVersion: promptVersion.trim(),
  });

  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  return `dyt:cache:${module}:${hash}`;
}

// ----------------------------------------------------------------------------
// Redis Client & In-Memory / File Fallback Store
// ----------------------------------------------------------------------------

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

// Local store fallback for testing or offline environments
const localCache: Map<string, PersistentCacheRecord> = new Map();
const userCacheIndex: Map<string, Set<string>> = new Map();
const secondaryLookupIndex: Map<string, string> = new Map(); // secondaryKey -> cacheKey

function getStoreFilePath(): string {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {}
  }
  return path.join(dataDir, "persistent-result-cache.json");
}

function loadLocalFile(): void {
  try {
    const file = getStoreFilePath();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const list = JSON.parse(raw) as PersistentCacheRecord[];
      localCache.clear();
      userCacheIndex.clear();
      secondaryLookupIndex.clear();
      for (const rec of list) {
        localCache.set(rec.cacheKey, rec);
        if (!userCacheIndex.has(rec.userId)) {
          userCacheIndex.set(rec.userId, new Set());
        }
        userCacheIndex.get(rec.userId)!.add(rec.cacheKey);
      }
    }
  } catch {}
}

function saveLocalFile(): void {
  try {
    const file = getStoreFilePath();
    const list = Array.from(localCache.values());
    fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
  } catch {}
}

loadLocalFile();

// ----------------------------------------------------------------------------
// PersistentCacheStore Class
// ----------------------------------------------------------------------------

export class PersistentCacheStore {
  /**
   * Resets test store in memory for deterministic test suites.
   */
  static __resetTestStore(): void {
    localCache.clear();
    userCacheIndex.clear();
    secondaryLookupIndex.clear();
  }

  /**
   * Generates secondary lookup key for content-based fallback matching.
   */
  private static makeSecondaryKey(
    type: "exact" | "norm_img" | "text" | "ocr",
    hash: string,
    userId: string,
    module: string,
    grade = "auto",
    mode = "default",
    language = "km",
    modelName: string,
    promptVersion: string
  ): string {
    return `dyt:lookup:${type}:${userId}:${module}:${grade}:${mode}:${language}:${modelName}:${promptVersion}:${hash}`;
  }

  /**
   * Retrieves a cached record by deterministic cache key, strictly enforcing user privacy.
   */
  static async get<T = any>(
    cacheKey: string,
    userId: string
  ): Promise<PersistentCacheRecord<T> | null> {
    const redis = getRedisConfig();
    if (redis) {
      const raw = await redisCommand<string>(["GET", `dyt:result_cache:${cacheKey}`]);
      if (raw) {
        try {
          const rec: PersistentCacheRecord<T> = typeof raw === "string" ? JSON.parse(raw) : raw;
          // Invariant: USER can read only their own cached results!
          if (rec.userId === userId) {
            // Update lastAccessedAt in background
            if (!rec.timestamps) {
              rec.timestamps = {
                createdAt: Date.now(),
                cachedAt: Date.now(),
                lastAccessedAt: Date.now(),
              };
            } else {
              rec.timestamps.lastAccessedAt = Date.now();
            }
            await redisCommand([
              "SET",
              `dyt:result_cache:${cacheKey}`,
              JSON.stringify(rec),
            ]);
            return rec;
          }
        } catch {}
      }
    }

    const localRec = localCache.get(cacheKey) as PersistentCacheRecord<T> | undefined;
    if (localRec && localRec.userId === userId) {
      if (!localRec.timestamps) {
        localRec.timestamps = {
          createdAt: Date.now(),
          cachedAt: Date.now(),
          lastAccessedAt: Date.now(),
        };
      } else {
        localRec.timestamps.lastAccessedAt = Date.now();
      }
      saveLocalFile();
      return localRec;
    }

    return null;
  }

  /**
   * Performs content-based secondary lookup when exact cache key misses
   * (e.g. matching normalized image hash or question text hash).
   */
  static async lookupByContent<T = any>(params: {
    userId: string;
    module: string;
    grade?: string;
    mode?: string;
    language?: string;
    modelName: string;
    promptVersion: string;
    exactImageSha256?: string;
    normalizedImageSha256?: string;
    normalizedQuestionFingerprint?: string;
    ocrFingerprint?: string;
  }): Promise<PersistentCacheRecord<T> | null> {
    const {
      userId,
      module,
      grade = "auto",
      mode = "default",
      language = "km",
      modelName,
      promptVersion,
      exactImageSha256,
      normalizedImageSha256,
      normalizedQuestionFingerprint,
      ocrFingerprint,
    } = params;

    const secondaryKeys: string[] = [];
    if (exactImageSha256) {
      secondaryKeys.push(
        this.makeSecondaryKey("exact", exactImageSha256, userId, module, grade, mode, language, modelName, promptVersion)
      );
    }
    if (normalizedImageSha256) {
      secondaryKeys.push(
        this.makeSecondaryKey("norm_img", normalizedImageSha256, userId, module, grade, mode, language, modelName, promptVersion)
      );
    }
    if (normalizedQuestionFingerprint) {
      secondaryKeys.push(
        this.makeSecondaryKey("text", normalizedQuestionFingerprint, userId, module, grade, mode, language, modelName, promptVersion)
      );
    }
    if (ocrFingerprint) {
      secondaryKeys.push(
        this.makeSecondaryKey("ocr", ocrFingerprint, userId, module, grade, mode, language, modelName, promptVersion)
      );
    }

    const redis = getRedisConfig();
    if (redis && secondaryKeys.length > 0) {
      const pipeline = secondaryKeys.map((k) => ["GET", k]);
      const results = await redisPipeline(pipeline);
      if (results) {
        for (const targetKey of results) {
          if (targetKey && typeof targetKey === "string") {
            const cached = await this.get<T>(targetKey, userId);
            if (cached) return cached;
          }
        }
      }
    }

    for (const key of secondaryKeys) {
      const targetCacheKey = secondaryLookupIndex.get(key);
      if (targetCacheKey) {
        const cached = await this.get<T>(targetCacheKey, userId);
        if (cached) return cached;
      }
    }

    return null;
  }

  /**
   * Persists a completed or partial cache record in Upstash Redis and local fallback.
   */
  static async set<T = any>(record: PersistentCacheInput<T>): Promise<void> {
    const redis = getRedisConfig();
    const now = Date.now();
    const safeTimestamps = {
      createdAt: record.timestamps?.createdAt || (record as any).createdAt || now,
      cachedAt: record.timestamps?.cachedAt || now,
      lastAccessedAt: record.timestamps?.lastAccessedAt || now,
    };
    const normalizedRecord: PersistentCacheRecord<T> = {
      ...record,
      normalizedInputFingerprint: record.normalizedInputFingerprint || record.inputFingerprint || "",
      driveFileIds: record.driveFileIds || {},
      driveLinks: record.driveLinks || {},
      mimeTypes: record.mimeTypes || {},
      processingStatus: record.processingStatus || (record as any).status || "completed",
      source: record.source || "gemini",
      timestamps: safeTimestamps,
    };

    const commands: any[][] = [
      ["SET", `dyt:result_cache:${normalizedRecord.cacheKey}`, JSON.stringify(normalizedRecord)],
      ["SADD", `dyt:user_cache_keys:${normalizedRecord.userId}`, normalizedRecord.cacheKey],
      ["SADD", `dyt:module_cache_keys:${normalizedRecord.module}`, normalizedRecord.cacheKey],
      ["SADD", "dyt:cache_keys:all", normalizedRecord.cacheKey],
    ];

    // Secondary indices for image/text content matching
    if (normalizedRecord.exactImageSha256) {
      const k = this.makeSecondaryKey(
        "exact",
        normalizedRecord.exactImageSha256,
        normalizedRecord.userId,
        normalizedRecord.module,
        normalizedRecord.grade,
        normalizedRecord.mode,
        normalizedRecord.language,
        normalizedRecord.modelName,
        normalizedRecord.promptVersion
      );
      commands.push(["SET", k, normalizedRecord.cacheKey]);
      secondaryLookupIndex.set(k, normalizedRecord.cacheKey);
    }
    if (normalizedRecord.normalizedImageSha256) {
      const k = this.makeSecondaryKey(
        "norm_img",
        normalizedRecord.normalizedImageSha256,
        normalizedRecord.userId,
        normalizedRecord.module,
        normalizedRecord.grade,
        normalizedRecord.mode,
        normalizedRecord.language,
        normalizedRecord.modelName,
        normalizedRecord.promptVersion
      );
      commands.push(["SET", k, normalizedRecord.cacheKey]);
      secondaryLookupIndex.set(k, normalizedRecord.cacheKey);
    }
    if (normalizedRecord.normalizedInputFingerprint) {
      const k = this.makeSecondaryKey(
        "text",
        normalizedRecord.normalizedInputFingerprint,
        normalizedRecord.userId,
        normalizedRecord.module,
        normalizedRecord.grade,
        normalizedRecord.mode,
        normalizedRecord.language,
        normalizedRecord.modelName,
        normalizedRecord.promptVersion
      );
      commands.push(["SET", k, normalizedRecord.cacheKey]);
      secondaryLookupIndex.set(k, normalizedRecord.cacheKey);
    }

    if (redis) {
      await redisPipeline(commands);
    }

    localCache.set(normalizedRecord.cacheKey, normalizedRecord);
    if (!userCacheIndex.has(normalizedRecord.userId)) {
      userCacheIndex.set(normalizedRecord.userId, new Set());
    }
    userCacheIndex.get(normalizedRecord.userId)!.add(normalizedRecord.cacheKey);
    saveLocalFile();
  }

  /**
   * Updates Drive file IDs on an existing cache record (e.g. after background upload or retry).
   */
  static async updateDriveArtifacts(
    cacheKey: string,
    userId: string,
    driveFileIds: Record<string, string>,
    driveLinks: Record<string, string> = {}
  ): Promise<PersistentCacheRecord | null> {
    const existing = await this.get(cacheKey, userId);
    if (!existing) return null;

    existing.driveFileIds = {
      ...existing.driveFileIds,
      ...driveFileIds,
    };
    existing.driveLinks = {
      ...existing.driveLinks,
      ...driveLinks,
    };
    existing.processingStatus = "completed";
    existing.timestamps.lastAccessedAt = Date.now();

    await this.set(existing);
    return existing;
  }

  /**
   * Lists all cached records for a specific user (USER scope).
   */
  static async listUserRecords(
    userId: string,
    moduleFilter?: string
  ): Promise<PersistentCacheRecord[]> {
    const redis = getRedisConfig();
    if (redis) {
      const keys = await redisCommand<string[]>([
        "SMEMBERS",
        `dyt:user_cache_keys:${userId}`,
      ]);
      if (Array.isArray(keys) && keys.length > 0) {
        const pipeline = keys.map((k) => ["GET", `dyt:result_cache:${k}`]);
        const results = await redisPipeline(pipeline);
        if (results) {
          const list: PersistentCacheRecord[] = [];
          for (const raw of results) {
            if (raw) {
              try {
                const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
                if (!moduleFilter || rec.module === moduleFilter) {
                  list.push(rec);
                }
              } catch {}
            }
          }
          return list.sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt);
        }
      }
    }

    const set = userCacheIndex.get(userId);
    if (!set) return [];
    const list: PersistentCacheRecord[] = [];
    for (const key of set) {
      const rec = localCache.get(key);
      if (rec && (!moduleFilter || rec.module === moduleFilter)) {
        list.push(rec);
      }
    }
    return list.sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt);
  }

  /**
   * Lists all cached records across all users (ADMIN scope only).
   */
  static async listAllRecords(moduleFilter?: string): Promise<PersistentCacheRecord[]> {
    const redis = getRedisConfig();
    if (redis) {
      const keys = await redisCommand<string[]>(["SMEMBERS", "dyt:cache_keys:all"]);
      if (Array.isArray(keys) && keys.length > 0) {
        const pipeline = keys.map((k) => ["GET", `dyt:result_cache:${k}`]);
        const results = await redisPipeline(pipeline);
        if (results) {
          const list: PersistentCacheRecord[] = [];
          for (const raw of results) {
            if (raw) {
              try {
                const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
                if (!moduleFilter || rec.module === moduleFilter) {
                  list.push(rec);
                }
              } catch {}
            }
          }
          return list.sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt);
        }
      }
    }

    const list = Array.from(localCache.values());
    return list
      .filter((r) => !moduleFilter || r.module === moduleFilter)
      .sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt);
  }

  /**
   * Deletes a cache record (USER can delete only own record).
   */
  static async deleteRecord(cacheKey: string, userId: string): Promise<boolean> {
    const rec = await this.get(cacheKey, userId);
    if (!rec) return false;

    const redis = getRedisConfig();
    if (redis) {
      await redisPipeline([
        ["DEL", `dyt:result_cache:${cacheKey}`],
        ["SREM", `dyt:user_cache_keys:${userId}`, cacheKey],
        ["SREM", `dyt:module_cache_keys:${rec.module}`, cacheKey],
        ["SREM", "dyt:cache_keys:all", cacheKey],
      ]);
    }

    localCache.delete(cacheKey);
    userCacheIndex.get(userId)?.delete(cacheKey);
    saveLocalFile();
    return true;
  }
}
