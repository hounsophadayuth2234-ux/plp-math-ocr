import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore } from "@/lib/user-store";
import { validatePasswordStrength } from "@/lib/password-rules";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp } from "@/lib/auth-gate";
import { encryptManagedPassword } from "@/lib/managed-credential-vault";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  const rawIp = getClientIp(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "ទម្រង់ទិន្នន័យមិនត្រឹមត្រូវ (Invalid JSON payload)" },
      { status: 400 }
    );
  }

  // Validate CSRF
  const csrf = validateCsrfToken(req, body?.csrfToken);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const { currentPassword, newPassword } = body || {};

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "សូមបញ្ចូលពាក្យសម្ងាត់បច្ចុប្បន្ន និងពាក្យសម្ងាត់ថ្មី (Current password and new password are required)" },
      { status: 400 }
    );
  }

  // Fetch full user record including password hash
  const fullUser = await UserStore.getUserById(auth.user.id);
  if (!fullUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, fullUser.passwordHash);
  if (!isMatch) {
    return NextResponse.json(
      { error: "ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវទេ (Current password does not match)" },
      { status: 400 }
    );
  }

  // Validate new password strength
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return NextResponse.json(
      {
        error: strength.errors[0] || "ពាក្យសម្ងាត់មិនស្របតាមស្តង់ដារសុវត្ថិភាព (Password does not meet complexity requirements)",
        details: strength.errors,
      },
      { status: 400 }
    );
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  const managedPasswordEncrypted = encryptManagedPassword(newPassword);
  const now = Date.now();

  await UserStore.updateUser(fullUser.id, {
    passwordHash: newHash,
    managedPasswordEncrypted,
    mustChangePassword: false,
    passwordChangedAt: now,
  });

  await AuditLogger.logEvent({
    type: "PASSWORD_CHANGED",
    actorId: fullUser.id,
    actorUsername: fullUser.username,
    targetId: fullUser.id,
    rawIp,
  });

  return NextResponse.json({
    success: true,
    message: "បានផ្លាស់ប្តូរពាក្យសម្ងាត់ដោយជោគជ័យ (Password changed successfully)",
  });
}
