import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-session";
import { ActivityTracker } from "@/lib/activity-tracker";

/**
 * GET /api/admin/activity-tracking
 * Returns team activity metrics, user drill-down history, and silent logs.
 * Accessible to ADMIN and SUPER_ADMIN.
 */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if ("response" in adminCheck) {
    return adminCheck.response;
  }

  const { searchParams } = req.nextUrl;
  const userId = searchParams.get("userId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  if (userId) {
    const userLogs = await ActivityTracker.getUserActivities(userId, limit);
    return NextResponse.json({
      success: true,
      userId,
      activities: userLogs,
      total: userLogs.length,
    });
  }

  const overview = await ActivityTracker.getActivityOverview();
  return NextResponse.json({
    success: true,
    ...overview,
  });
}
