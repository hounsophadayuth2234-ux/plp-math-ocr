import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore, toSafeUser, toAdminSafeUser } from "@/lib/user-store";
import { encryptManagedPassword } from "@/lib/managed-credential-vault";
import {
  validateUsername,
  validateEmail,
  validateDisplayName,
  validateRole,
  validateStatus,
} from "@/lib/auth-validators";
import {
  validateAdminManagedPassword,
  generateTemporaryPassword,
} from "@/lib/password-rules";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp } from "@/lib/auth-gate";

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if ("response" in adminCheck) {
    return adminCheck.response;
  }

  const users = await UserStore.listUsers();
  const safeUsers = users.map(toAdminSafeUser);

  return NextResponse.json({
    success: true,
    users: safeUsers,
    total: safeUsers.length,
  });
}

export async function POST(req: NextRequest) {
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

  // Validate fields
  const usernameVal = validateUsername(body?.username);
  if (!usernameVal.valid) {
    return NextResponse.json({ error: usernameVal.error }, { status: 400 });
  }

  const rawEmail = typeof body?.email === "string" && body.email.trim()
    ? body.email.trim()
    : `${usernameVal.value}@dyt.local`;
  const emailVal = validateEmail(rawEmail);
  if (!emailVal.valid) {
    return NextResponse.json({ error: emailVal.error }, { status: 400 });
  }

  const rawDisplayName = typeof body?.displayName === "string" && body.displayName.trim()
    ? body.displayName.trim()
    : usernameVal.value;
  const nameVal = validateDisplayName(rawDisplayName);
  if (!nameVal.valid) {
    return NextResponse.json({ error: nameVal.error }, { status: 400 });
  }

  const roleVal = validateRole(body?.role || "USER");
  if (!roleVal.valid) {
    return NextResponse.json({ error: roleVal.error }, { status: 400 });
  }

  const statusVal = validateStatus(body?.status || "ACTIVE");
  if (!statusVal.valid) {
    return NextResponse.json({ error: statusVal.error }, { status: 400 });
  }

  // Check uniqueness before proceeding
  const existingUser = await UserStore.getUserByUsernameOrEmail(usernameVal.value!);
  if (existingUser) {
    return NextResponse.json(
      { error: "ឈ្មោះអ្នកប្រើប្រាស់នេះមានរួចហើយ (Username already taken)" },
      { status: 400 }
    );
  }

  const existingEmail = await UserStore.getUserByUsernameOrEmail(emailVal.value!);
  if (existingEmail) {
    return NextResponse.json(
      { error: "អ៊ីមែលនេះមានរួចហើយ (Email already registered)" },
      { status: 400 }
    );
  }

  // Password handling: initial or auto-generated temporary
  let plainPassword = typeof body?.password === "string" ? body.password.trim() : "";
  let isTemporary = false;

  if (!plainPassword) {
    plainPassword = generateTemporaryPassword();
    isTemporary = true;
  } else {
    const strength = validateAdminManagedPassword(
      plainPassword,
      usernameVal.value,
      typeof body?.confirmPassword === "string" ? body.confirmPassword.trim() : undefined
    );
    if (!strength.valid) {
      return NextResponse.json(
        { error: strength.errors[0] || "Invalid password", details: strength.errors },
        { status: 400 }
      );
    }
  }

  const passwordHash = bcrypt.hashSync(plainPassword, 12);

  const newUser = await UserStore.createUser({
    username: usernameVal.value!,
    email: emailVal.value!,
    displayName: nameVal.value!,
    passwordHash,
    role: roleVal.value!,
    status: statusVal.value!,
    mustChangePassword: isTemporary,
  });

  await AuditLogger.logEvent({
    type: "ACCOUNT_CREATED",
    actorId: adminCheck.user.id,
    actorUsername: adminCheck.user.username,
    targetId: newUser.id,
    targetUsername: newUser.username,
    rawIp,
    details: {
      role: newUser.role,
      status: newUser.status,
      temporaryPasswordAssigned: isTemporary,
    },
  });

  return NextResponse.json(
    {
      success: true,
      user: toSafeUser(newUser),
      temporaryPassword: plainPassword,
      message: "បានបង្កើតគណនីថ្មីដោយជោគជ័យ (Account created successfully)",
    },
    { status: 201 }
  );
}
