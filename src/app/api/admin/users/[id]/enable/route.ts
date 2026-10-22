import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore, toSafeUser } from "@/lib/user-store";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp } from "@/lib/auth-gate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const adminCheck = await requireAdmin(req);
  if ("response" in adminCheck) {
    return adminCheck.response;
  }

  const rawIp = getClientIp(req);

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const csrf = validateCsrfToken(req, body?.csrfToken);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const target = await UserStore.getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "រកមិនឃើញគណនីនេះទេ (User not found)" }, { status: 404 });
  }

  const updated = await UserStore.updateUser(id, { status: "ACTIVE" });

  await AuditLogger.logEvent({
    type: "ACCOUNT_ENABLED",
    actorId: adminCheck.user.id,
    actorUsername: adminCheck.user.username,
    targetId: target.id,
    targetUsername: target.username,
    rawIp,
  });

  return NextResponse.json({
    success: true,
    user: toSafeUser(updated),
    message: "បានបើកដំណើរការគណនីឡើងវិញដោយជោគជ័យ (Account enabled successfully)",
  });
}
