import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth, createSessionToken, setSessionCookie } from "@/lib/auth-session";
import { validateCsrfToken, generateCsrfToken, setCsrfCookie } from "@/lib/auth-csrf";
import { UserStore, toSafeUser } from "@/lib/user-store";
import { validatePasswordStrength } from "@/lib/password-rules";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp } from "@/lib/auth-gate";

import { enforceRateLimit } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  // Rate limiting (5 req/min per user)
  const rateLimitBlock = await enforceRateLimit(req, "change_password", { userId: auth.user.id });
  if (rateLimitBlock) {
    return rateLimitBlock;
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

  const { currentPassword, newPassword, confirmPassword } = body || {};

  if (!newPassword || typeof newPassword !== "string" || !newPassword.trim()) {
    return NextResponse.json(
      { error: "សូមបញ្ចូលពាក្យសម្ងាត់ថ្មី (New password is required)" },
      { status: 400 }
    );
  }

  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    return NextResponse.json(
      { error: "ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា (Passwords do not match)" },
      { status: 400 }
    );
  }

  // Fetch full user record including password hash
  const fullUser = await UserStore.getUserById(auth.user.id);
  if (!fullUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Verify current password for all accounts (unless account is flagged for mandatory first-time password setup)
  const requiresCurrentPassword = !fullUser.mustChangePassword;
  if (requiresCurrentPassword || currentPassword) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: "សូមបញ្ចូលពាក្យសម្ងាត់បច្ចុប្បន្ន (Current password is required)" },
        { status: 400 }
      );
    }
    const isMatch = await bcrypt.compare(currentPassword, fullUser.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { error: "ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវទេ (Current password does not match)" },
        { status: 400 }
      );
    }
  }

  // Validate new password strength
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return NextResponse.json(
      {
        error: strength.errors[0] || "ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ",
        details: strength.errors,
      },
      { status: 400 }
    );
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  const now = Date.now();

  const updatedUser = await UserStore.updateUser(fullUser.id, {
    passwordHash: newHash,
    mustChangePassword: false,
    passwordChangedAt: now,
    sessionRevokedAt: undefined,
  });

  const safeUser = toSafeUser(updatedUser);
  const newSessionToken = await createSessionToken(safeUser);
  const newCsrfToken = generateCsrfToken();

  await AuditLogger.logEvent({
    type: "PASSWORD_CHANGED",
    actorId: fullUser.id,
    actorUsername: fullUser.username,
    targetId: fullUser.id,
    rawIp,
  });

  const response = NextResponse.json({
    success: true,
    user: safeUser,
    csrfToken: newCsrfToken,
    message: "បានផ្លាស់ប្តូរពាក្យសម្ងាត់ដោយជោគជ័យ (Password changed successfully)",
  });

  setSessionCookie(response, newSessionToken);
  setCsrfCookie(response, newCsrfToken);

  return response;
}
