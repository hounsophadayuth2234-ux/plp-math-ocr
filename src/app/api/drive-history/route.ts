import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { DriveHistoryStore } from "@/lib/drive-history-store";

/**
 * GET /api/drive-history
 * Returns safe metadata records of uploaded files.
 * Enforces RBAC user isolation:
 * - ADMIN accounts may view all upload records.
 * - USER accounts may only view records belonging to their own userId.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: សូមចូលគណនីជាមុនសិន (Please log in first)." },
      { status: 401 }
    );
  }

  try {
    const records =
      user.role === "ADMIN"
        ? await DriveHistoryStore.listAllRecords()
        : await DriveHistoryStore.listRecordsForUser(user.id);

    return NextResponse.json({
      success: true,
      role: user.role,
      count: records.length,
      records,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DriveHistory] Error listing history records:", message);
    return NextResponse.json(
      { error: "Failed to load upload history", details: message },
      { status: 500 }
    );
  }
}
