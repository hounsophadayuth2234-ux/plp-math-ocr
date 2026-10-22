import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore } from "@/lib/user-store";
import { generateTemporaryPassword } from "@/lib/password-rules";
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

  // Generate strong random temporary password
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = bcrypt.hashSync(temporaryPassword, 12);

  await UserStore.updateUser(id, {
    passwordHash,
    mustChangePassword: true,
  });

  await AuditLogger.logEvent({
    type: "PASSWORD_RESET",
    actorId: adminCheck.user.id,
    actorUsername: adminCheck.user.username,
    targetId: target.id,
    targetUsername: target.username,
    rawIp,
    details: { forcedChange: true },
  });

  return NextResponse.json({
    success: true,
    temporaryPassword,
    message: "បានកំណត់ពាក្យសម្ងាត់បណ្តោះអាសន្នដោយជោគជ័យ (Temporary password generated successfully)",
  });
}
