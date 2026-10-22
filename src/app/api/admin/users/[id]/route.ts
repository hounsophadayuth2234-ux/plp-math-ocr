import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore, toSafeUser, toAdminSafeUser } from "@/lib/user-store";
import { encryptManagedPassword } from "@/lib/managed-credential-vault";
import { validateAdminManagedPassword } from "@/lib/password-rules";
import {
  validateEmail,
  validateDisplayName,
  validateRole,
  validateStatus,
} from "@/lib/auth-validators";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp } from "@/lib/auth-gate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const adminCheck = await requireAdmin(req);
  if ("response" in adminCheck) {
    return adminCheck.response;
  }

  const rawIp = getClientIp(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const csrf = validateCsrfToken(req, body?.csrfToken);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const existing = await UserStore.getUserById(id);
  if (!existing) {
    return NextResponse.json({ error: "រកមិនឃើញគណនីនេះទេ (User not found)" }, { status: 404 });
  }

  const updates: any = {};

  if (body?.displayName !== undefined) {
    const nameVal = validateDisplayName(body.displayName);
    if (!nameVal.valid) return NextResponse.json({ error: nameVal.error }, { status: 400 });
    updates.displayName = nameVal.value;
  }

  if (body?.email !== undefined && body.email !== existing.email) {
    const emailVal = validateEmail(body.email);
    if (!emailVal.valid) return NextResponse.json({ error: emailVal.error }, { status: 400 });
    const duplicate = await UserStore.getUserByUsernameOrEmail(emailVal.value!);
    if (duplicate && duplicate.id !== id) {
      return NextResponse.json({ error: "អ៊ីមែលនេះមានរួចហើយ (Email already registered)" }, { status: 400 });
    }
    updates.email = emailVal.value;
  }

  if (body?.password !== undefined && typeof body.password === "string" && body.password.trim()) {
    const passwordVal = validateAdminManagedPassword(body.password.trim(), existing.username);
    if (!passwordVal.valid) {
      return NextResponse.json({ error: passwordVal.errors[0] || "Invalid password", details: passwordVal.errors }, { status: 400 });
    }
    updates.passwordHash = bcrypt.hashSync(body.password.trim(), 12);
    updates.managedPasswordEncrypted = encryptManagedPassword(body.password.trim());
    updates.passwordChangedAt = Date.now();
  }

  // Handle Role change with final active admin guard
  if (body?.role !== undefined && body.role !== existing.role) {
    const roleVal = validateRole(body.role);
    if (!roleVal.valid) return NextResponse.json({ error: roleVal.error }, { status: 400 });

    if (existing.role === "ADMIN" && roleVal.value === "USER") {
      const activeAdmins = await UserStore.countActiveAdmins();
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: "មិនអាចបញ្ចុះតួនាទីគណនី Admin ចុងក្រោយបានទេ (Cannot demote the final active administrator)" },
          { status: 400 }
        );
      }
    }
    updates.role = roleVal.value;
  }

  // Handle Status change with final active admin guard
  if (body?.status !== undefined && body.status !== existing.status) {
    const statusVal = validateStatus(body.status);
    if (!statusVal.valid) return NextResponse.json({ error: statusVal.error }, { status: 400 });

    if (existing.role === "ADMIN" && statusVal.value === "DISABLED") {
      const activeAdmins = await UserStore.countActiveAdmins();
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: "មិនអាចបិទដំណើរការគណនី Admin ចុងក្រោយបានទេ (Cannot disable the final active administrator)" },
          { status: 400 }
        );
      }
    }
    updates.status = statusVal.value;
  }

  const updatedUser = await UserStore.updateUser(id, updates);

  await AuditLogger.logEvent({
    type: updates.role ? "ROLE_CHANGED" : "ACCOUNT_EDITED",
    actorId: adminCheck.user.id,
    actorUsername: adminCheck.user.username,
    targetId: existing.id,
    targetUsername: existing.username,
    rawIp,
    details: updates,
  });

  return NextResponse.json({
    success: true,
    user: toAdminSafeUser(updatedUser),
    message: "បានកែប្រែគណនីដោយជោគជ័យ (Account updated successfully)",
  });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const adminCheck = await requireAdmin(req);
  if ("response" in adminCheck) {
    return adminCheck.response;
  }

  const rawIp = getClientIp(req);

  // Validate CSRF
  const csrf = validateCsrfToken(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const target = await UserStore.getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent self-deletion
  if (target.id === adminCheck.user.id) {
    return NextResponse.json(
      { error: "មិនអាចលុបគណនីផ្ទាល់ខ្លួនបានទេ (Cannot delete your own active administrator account)" },
      { status: 400 }
    );
  }

  // Final active admin guard
  if (target.role === "ADMIN" && target.status === "ACTIVE") {
    const activeAdmins = await UserStore.countActiveAdmins();
    if (activeAdmins <= 1) {
      return NextResponse.json(
        { error: "មិនអាចលុបគណនី Admin ចុងក្រោយបានទេ (Cannot delete the final active administrator)" },
        { status: 400 }
      );
    }
  }

  await UserStore.deleteUser(id);

  await AuditLogger.logEvent({
    type: "ACCOUNT_DELETED",
    actorId: adminCheck.user.id,
    actorUsername: adminCheck.user.username,
    targetId: target.id,
    targetUsername: target.username,
    rawIp,
  });

  return NextResponse.json({
    success: true,
    message: "បានលុបគណនីដោយជោគជ័យ (Account deleted successfully)",
  });
}
