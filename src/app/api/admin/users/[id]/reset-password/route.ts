import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore } from "@/lib/user-store";
import {
  generateTemporaryPassword,
  validateAdminManagedPassword,
} from "@/lib/password-rules";
import { encryptManagedPassword } from "@/lib/managed-credential-vault";
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

  let chosenPassword = typeof body?.password === "string" ? body.password.trim() : "";
  let isTemporary = false;

  if (!chosenPassword) {
    chosenPassword = generateTemporaryPassword();
    isTemporary = true;
  } else {
    const validation = validateAdminManagedPassword(
      chosenPassword,
      target.username,
      typeof body?.confirmPassword === "string" ? body.confirmPassword.trim() : undefined
    );
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors[0] || "Invalid password", details: validation.errors },
        { status: 400 }
      );
    }
  }

  const passwordHash = bcrypt.hashSync(chosenPassword, 12);

  const now = Date.now();
  await UserStore.updateUser(id, {
    passwordHash,
    mustChangePassword: isTemporary || body?.mustChangePassword === true,
    passwordChangedAt: now,
    sessionRevokedAt: now,
    activeSessionsCount: 0,
  });

  await AuditLogger.logEvent({
    type: "PASSWORD_RESET",
    actorId: adminCheck.user.id,
    actorUsername: adminCheck.user.username,
    targetId: target.id,
    targetUsername: target.username,
    rawIp,
    details: {
      forcedChange: isTemporary || body?.mustChangePassword === true,
      customAdminSet: !isTemporary,
    },
  });

  return NextResponse.json({
    success: true,
    temporaryPassword: chosenPassword,
    message: isTemporary
      ? "បានបង្កើតពាក្យសម្ងាត់បណ្តោះអាសន្នដោយជោគជ័យ (Temporary password generated successfully)"
      : "បានកំណត់ពាក្យសម្ងាត់ថ្មីដោយជោគជ័យ (Password updated successfully)",
  });
}
