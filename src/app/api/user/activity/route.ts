import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-session";
import { ActivityTracker } from "@/lib/activity-tracker";

/**
 * POST /api/user/activity
 * Silent background telemetry endpoint for authenticated users.
 * Automatically records actual user operations (upload, solve, generate, edit).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { module, action, title, details } = body || {};

    if (!module || !action) {
      return NextResponse.json({ error: "Missing module or action" }, { status: 400 });
    }

    await ActivityTracker.recordActivity({
      userId: auth.user.id,
      username: auth.user.username,
      displayName: auth.user.displayName,
      role: auth.user.role,
      module: String(module),
      action: String(action),
      title: String(title || "Action performed"),
      details: details || {},
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Failed to record activity", details: String(err) },
      { status: 500 }
    );
  }
}
