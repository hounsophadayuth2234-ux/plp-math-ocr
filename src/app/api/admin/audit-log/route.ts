import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-session";
import { AuditLogger } from "@/lib/audit-logger";

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if ("response" in adminCheck) {
    return adminCheck.response;
  }

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  const events = await AuditLogger.getRecentEvents(limit);

  return NextResponse.json({
    success: true,
    events,
    total: events.length,
  });
}
