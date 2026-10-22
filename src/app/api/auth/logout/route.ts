import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, clearSessionCookie } from "@/lib/auth-session";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp } from "@/lib/auth-gate";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  const rawIp = getClientIp(req);

  if (user) {
    await AuditLogger.logEvent({
      type: "LOGOUT",
      actorId: user.id,
      actorUsername: user.username,
      rawIp,
    });
  }

  const response = NextResponse.json({
    success: true,
    message: "ចាកចេញដោយជោគជ័យ (Logged out successfully)",
  });

  clearSessionCookie(response);
  return response;
}
