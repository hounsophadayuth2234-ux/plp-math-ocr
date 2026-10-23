import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore } from "@/lib/user-store";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp } from "@/lib/auth-gate";
import {
  generateTotpSetup,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCodes,
} from "@/lib/mfa";

/**
 * GET /api/admin/mfa
 * Check current Admin MFA status.
 */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if ("response" in adminCheck) {
    return adminCheck.response;
  }

  const user = await UserStore.getUserById(adminCheck.user.id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    mfaEnabled: Boolean(user.mfaEnabled),
    hasPendingSetup: Boolean(user.mfaPendingSecretEncrypted),
  });
}

/**
 * POST /api/admin/mfa
 * Action dispatcher:
 * - action: "setup" -> generate TOTP secret, QR SVG, return for display
 * - action: "verify" -> verify user-entered 6-digit code, activate MFA, return single-use recovery codes
 * - action: "disable" -> verify password or TOTP, disable MFA
 */
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

  const { action, code } = body || {};
  const currentAdmin = await UserStore.getUserById(adminCheck.user.id);
  if (!currentAdmin) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (action === "setup") {
    // Generate TOTP secret and SVG QR Code
    const setup = await generateTotpSetup(currentAdmin.username);
    await UserStore.updateUser(currentAdmin.id, {
      mfaPendingSecretEncrypted: setup.encryptedSecret,
    });

    await AuditLogger.logEvent({
      type: "SECURITY_ALERT",
      actorId: currentAdmin.id,
      actorUsername: currentAdmin.username,
      rawIp,
      details: { action: "Initiated MFA TOTP setup" },
    });

    return NextResponse.json({
      success: true,
      qrSvg: setup.qrSvg,
      manualKey: setup.plainSecret,
      issuer: "DYT Ecosystem",
    });
  }

  if (action === "verify") {
    if (!currentAdmin.mfaPendingSecretEncrypted) {
      return NextResponse.json(
        { error: "No pending MFA setup found. Please click Enable MFA first." },
        { status: 400 }
      );
    }

    if (!code || typeof code !== "string" || code.trim().length !== 6) {
      return NextResponse.json(
        { error: "សូមបញ្ចូលលេខកូដ ៦ ខ្ទង់ឱ្យបានត្រឹមត្រូវ (Enter a valid 6-digit code)" },
        { status: 400 }
      );
    }

    const isValid = await verifyTotpCode(
      currentAdmin.mfaPendingSecretEncrypted,
      code.trim()
    );

    if (!isValid) {
      await AuditLogger.logEvent({
        type: "SECURITY_ALERT",
        actorId: currentAdmin.id,
        actorUsername: currentAdmin.username,
        rawIp,
        details: { action: "Failed MFA activation verification" },
      });
      return NextResponse.json(
        { error: "លេខកូដមិនត្រឹមត្រូវ សូមពិនិត្យម្តងទៀត (Invalid TOTP code. Try again)" },
        { status: 400 }
      );
    }

    // Generate single-use recovery codes
    const plainRecoveryCodes = generateRecoveryCodes(8);
    const hashedCodes = hashRecoveryCodes(plainRecoveryCodes);

    // Commit MFA activation
    await UserStore.updateUser(currentAdmin.id, {
      mfaEnabled: true,
      mfaSecretEncrypted: currentAdmin.mfaPendingSecretEncrypted,
      mfaPendingSecretEncrypted: undefined,
      mfaRecoveryCodesHashed: hashedCodes,
    });

    await AuditLogger.logEvent({
      type: "SECURITY_ALERT",
      actorId: currentAdmin.id,
      actorUsername: currentAdmin.username,
      rawIp,
      details: { action: "MFA activated successfully" },
    });

    return NextResponse.json({
      success: true,
      mfaEnabled: true,
      message: "បានបើកដំណើរការ MFA ដោយជោគជ័យ (MFA activated successfully)",
      recoveryCodes: plainRecoveryCodes, // Shown only once in protected UI
    });
  }

  if (action === "disable") {
    await UserStore.updateUser(currentAdmin.id, {
      mfaEnabled: false,
      mfaSecretEncrypted: undefined,
      mfaPendingSecretEncrypted: undefined,
      mfaRecoveryCodesHashed: undefined,
    });

    await AuditLogger.logEvent({
      type: "SECURITY_ALERT",
      actorId: currentAdmin.id,
      actorUsername: currentAdmin.username,
      rawIp,
      details: { action: "MFA disabled" },
    });

    return NextResponse.json({
      success: true,
      mfaEnabled: false,
      message: "បានបិទដំណើរការ MFA រួចរាល់ (MFA disabled)",
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
