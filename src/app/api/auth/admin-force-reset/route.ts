import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth, createSessionToken, setSessionCookie } from "@/lib/auth-session";
import { validateCsrfToken, generateCsrfToken, setCsrfCookie } from "@/lib/auth-csrf";
import { UserStore, toSafeUser } from "@/lib/user-store";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp } from "@/lib/auth-gate";

/**
 * POST /api/auth/admin-force-reset
 * Direct password reset endpoint for authenticated administrators without requiring the old password.
 * Hashes the incoming password securely using bcrypt and updates the Upstash Redis database.
 */
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
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // Validate CSRF token if sent
  if (body?.csrfToken) {
    const csrf = validateCsrfToken(req, body.csrfToken);
    if (!csrf.valid) {
      return NextResponse.json({ error: csrf.error }, { status: 403 });
    }
  }

  const { newPassword } = body || {};
  if (!newPassword || typeof newPassword !== "string" || !newPassword.trim()) {
    return NextResponse.json(
      { error: "New password is required" },
      { status: 400 }
    );
  }

  const fullUser = await UserStore.getUserById(auth.user.id);
  if (!fullUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (fullUser.role !== "ADMIN" && fullUser.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Administrator privileges required." },
      { status: 403 }
    );
  }

  // Hash with bcrypt work factor 12
  const newHash = bcrypt.hashSync(newPassword.trim(), 12);
  const now = Date.now();

  const updatedUser = await UserStore.updateUser(fullUser.id, {
    passwordHash: newHash,
    mustChangePassword: false,
    passwordChangedAt: now,
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
    details: { adminDirectReset: true },
  });

  const response = NextResponse.json({
    success: true,
    user: safeUser,
    message: "Password successfully updated in Upstash Redis.",
    csrfToken: newCsrfToken,
  });

  setSessionCookie(response, newSessionToken);
  setCsrfCookie(response, newCsrfToken);

  return response;
}
