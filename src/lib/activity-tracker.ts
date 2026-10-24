import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface ActivityRecord {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  module: string; // e.g. "01_math_ocr" | "02_canvas_cutout" | "03_hd_upscale" | "04_math_solver" | "05_lesson_studio" | "drive_storage" | "profile"
  action: string; // e.g. "upload_image" | "transcribe_ocr" | "solve_problem" | "generate_lesson" | "remove_background" | "upscale_image" | "save_drive"
  title: string; // File name, problem statement, or subject summary
  details?: Record<string, any>;
  timestamp: number;
}

export interface UserActivitySummary {
  userId: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  totalActions: number;
  lastActiveAt: number;
  moduleBreakdown: Record<string, number>;
}

export interface ActivityDashboardOverview {
  totalActivities: number;
  totalActiveUsers: number;
  userSummaries: UserActivitySummary[];
  recentActivities: ActivityRecord[];
}

// In-Memory Storage
const localActivities: ActivityRecord[] = [];
const MAX_IN_MEMORY_ACTIVITIES = 2000;

function getStoreFilePath(): string {
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, "activity-tracking.json");
}

function loadLocalFile(): void {
  try {
    const file = getStoreFilePath();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        localActivities.length = 0;
        localActivities.push(...list.slice(-MAX_IN_MEMORY_ACTIVITIES));
      }
    }
  } catch {}
}

function saveLocalFile(): void {
  try {
    const file = getStoreFilePath();
    fs.writeFileSync(file, JSON.stringify(localActivities.slice(-MAX_IN_MEMORY_ACTIVITIES), null, 2), "utf-8");
  } catch {}
}

// Load on cold start
loadLocalFile();

export class ActivityTracker {
  /**
   * Resets activities for test isolation.
   */
  static __resetTestActivities(): void {
    localActivities.length = 0;
    saveLocalFile();
  }

  /**
   * Silent background recording of user actions.
   * Does not throw or block the main execution thread.
   */
  static async recordActivity(entry: {
    userId: string;
    username: string;
    displayName: string;
    role: "SUPER_ADMIN" | "ADMIN" | "USER";
    module: string;
    action: string;
    title: string;
    details?: Record<string, any>;
    timestamp?: number;
  }): Promise<ActivityRecord> {
    const record: ActivityRecord = {
      id: `act_${crypto.randomUUID()}`,
      userId: entry.userId,
      username: entry.username.toLowerCase(),
      displayName: entry.displayName || entry.username,
      role: entry.role,
      module: entry.module,
      action: entry.action,
      title: entry.title.slice(0, 300),
      details: entry.details || {},
      timestamp: entry.timestamp || Date.now(),
    };

    localActivities.unshift(record);
    if (localActivities.length > MAX_IN_MEMORY_ACTIVITIES) {
      localActivities.pop();
    }

    // Persist asynchronously
    setImmediate(() => {
      saveLocalFile();
    });

    return record;
  }

  /**
   * Aggregates activity overview: total active members, per-member counts, module breakdown.
   */
  static async getActivityOverview(): Promise<ActivityDashboardOverview> {
    const userMap = new Map<string, UserActivitySummary>();

    for (const act of localActivities) {
      const existing = userMap.get(act.userId);
      if (!existing) {
        userMap.set(act.userId, {
          userId: act.userId,
          username: act.username,
          displayName: act.displayName,
          role: act.role,
          totalActions: 1,
          lastActiveAt: act.timestamp,
          moduleBreakdown: { [act.module]: 1 },
        });
      } else {
        existing.totalActions += 1;
        if (act.timestamp > existing.lastActiveAt) {
          existing.lastActiveAt = act.timestamp;
        }
        existing.moduleBreakdown[act.module] = (existing.moduleBreakdown[act.module] || 0) + 1;
      }
    }

    const userSummaries = Array.from(userMap.values()).sort(
      (a, b) => b.totalActions - a.totalActions || b.lastActiveAt - a.lastActiveAt
    );

    return {
      totalActivities: localActivities.length,
      totalActiveUsers: userSummaries.length,
      userSummaries,
      recentActivities: localActivities.slice(0, 100),
    };
  }

  /**
   * Retrieves individual member drill-down activity logs.
   */
  static async getUserActivities(userId: string, limit = 100): Promise<ActivityRecord[]> {
    return localActivities
      .filter((act) => act.userId === userId || act.username.toLowerCase() === userId.toLowerCase())
      .slice(0, limit);
  }
}
