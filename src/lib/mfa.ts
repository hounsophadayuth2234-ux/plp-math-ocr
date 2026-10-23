/**
 * Standard RFC 6238 TOTP Multi-Factor Authentication (MFA) & Recovery System
 *
 * Implements:
 * - RFC 6238 Time-Based One-Time Password (TOTP) algorithm using HMAC-SHA1
 * - Base32 secret generation and decoding
 * - Standalone SVG QR Code matrix generation (Zero external runtime dependencies)
 * - Single-use recovery codes with SHA-256 hashing
 * - Authenticated AES-256-GCM encryption of stored secrets via ManagedCredentialVault
 */

import crypto from "crypto";
import {
  encryptManagedPassword,
  decryptManagedPassword,
} from "./managed-credential-vault";

// Base32 RFC 4648 character set
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateBase32Secret(byteLength: number = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32ToBuffer(base32Str: string): Buffer {
  const clean = base32Str.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_CHARS.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Computes the 6-digit TOTP code for a given timestamp step.
 */
export function generateTotpCode(
  secret: string,
  timeStep: number = Math.floor(Date.now() / 1000 / 30)
): string {
  const key = base32ToBuffer(secret);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac("sha1", key);
  hmac.update(timeBuffer);
  const digest = hmac.digest();

  // Dynamic Truncation
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

/**
 * Verifies a 6-digit TOTP code with standard clock-drift tolerance (+/- 1 step).
 * Supports either plaintext Base32 secret or AES-256-GCM encrypted secret.
 */
export function verifyTotpCode(
  secretOrEncrypted: string,
  candidateCode: string,
  window: number = 1
): boolean {
  if (!candidateCode || typeof candidateCode !== "string") return false;
  const cleanCode = candidateCode.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanCode)) return false;

  let plainSecret = secretOrEncrypted;
  // If it's an encrypted secret (contains iv:tag:data), decrypt it first
  if (secretOrEncrypted.includes(":")) {
    const decrypted = decryptMfaSecret(secretOrEncrypted);
    if (!decrypted) return false;
    plainSecret = decrypted;
  }

  const currentStep = Math.floor(Date.now() / 1000 / 30);

  for (let offset = -window; offset <= window; offset++) {
    const expected = generateTotpCode(plainSecret, currentStep + offset);
    if (crypto.timingSafeEqual(Buffer.from(cleanCode), Buffer.from(expected))) {
      return true;
    }
  }

  return false;
}

/**
 * Generates high-level setup payload for Admin MFA setup:
 * - 32-character Base32 secret
 * - AES-256-GCM encrypted secret
 * - otpauth:// URI
 * - Standalone SVG QR Code
 */
import QRCode from "qrcode";

export async function generateTotpSetup(
  username: string,
  issuer: string = "DYT Ecosystem"
): Promise<{
  plainSecret: string;
  encryptedSecret: string;
  otpauthUrl: string;
  qrSvg: string;
  qrPngDataUrl: string;
  issuer: string;
  account: string;
}> {
  const plainSecret = generateBase32Secret(20);
  const encryptedSecret = encryptMfaSecret(plainSecret);
  const otpauthUrl = buildOtpauthUri(username, plainSecret, issuer);
  const qrSvg = await generateQrCodeSvg(otpauthUrl, 280, "M");
  const qrPngDataUrl = await generateQrCodeDataUrl(otpauthUrl, 280, "M");

  return {
    plainSecret,
    encryptedSecret,
    otpauthUrl,
    qrSvg,
    qrPngDataUrl,
    issuer,
    account: username,
  };
}

/**
 * Generates standard RFC 6238 otpauth:// URI compatible with Google Authenticator,
 * Microsoft Authenticator, 1Password, Authy, etc.
 * Format: otpauth://totp/{issuer}:{account}?secret={BASE32}&issuer={issuer}&algorithm=SHA1&digits=6&period=30
 */
export function buildOtpauthUri(
  account: string,
  secret: string,
  issuer: string = "DYT Ecosystem"
): string {
  const cleanIssuer = issuer.trim();
  const cleanAccount = account.trim();
  const cleanSecret = secret.trim().replace(/\s+/g, "").toUpperCase();
  const encIssuer = encodeURIComponent(cleanIssuer);
  const encAccount = encodeURIComponent(cleanAccount);
  const encSecret = encodeURIComponent(cleanSecret);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${encSecret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generate N single-use alphanumeric recovery codes.
 * Returns array of plain formatted codes (e.g. "A1B2C3-D4E5F6").
 */
export function generateRecoveryCodes(count: number = 8): string[] {
  const plainCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(3).toString("hex").toUpperCase();
    plainCodes.push(`${part1}-${part2}`);
  }

  return plainCodes;
}

export function hashRecoveryCode(code: string): string {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return crypto.createHash("sha256").update(clean).digest("hex");
}

export function hashRecoveryCodes(codes: string[]): string[] {
  return codes.map(hashRecoveryCode);
}

/**
 * Verifies and burns a single-use recovery code.
 * Accepts either (hashedCodes, candidateCode) or (candidateCode, hashedCodes).
 */
export function verifyAndConsumeRecoveryCode(
  arg1: string | string[],
  arg2: string | string[]
): { valid: boolean; remainingHashedCodes: string[] } {
  const candidateCode = typeof arg1 === "string" ? arg1 : typeof arg2 === "string" ? arg2 : "";
  const hashedCodes = Array.isArray(arg1) ? arg1 : Array.isArray(arg2) ? arg2 : [];

  if (!candidateCode || hashedCodes.length === 0) {
    return { valid: false, remainingHashedCodes: hashedCodes };
  }

  const candidateHash = hashRecoveryCode(candidateCode);
  const matchIdx = hashedCodes.findIndex((h) => h === candidateHash);

  if (matchIdx === -1) {
    return { valid: false, remainingHashedCodes: hashedCodes };
  }

  // Code is valid: burn it (remove from array)
  const remaining = [...hashedCodes];
  remaining.splice(matchIdx, 1);
  return { valid: true, remainingHashedCodes: remaining };
}

/**
 * AES-256-GCM encryption for TOTP secrets before DB storage.
 */
export function encryptMfaSecret(secret: string): string {
  return encryptManagedPassword(secret);
}

export function decryptMfaSecret(encryptedSecret?: string | null): string | null {
  return decryptManagedPassword(encryptedSecret);
}

/**
 * Production-grade QR Code SVG Generator using standard `qrcode` library.
 * - Error correction level: M (or H)
 * - Quiet-zone margin: at least 4 modules
 * - Clean white background (#ffffff), crisp black modules (#000000), zero decorative overlays.
 */
export async function generateQrCodeSvg(
  text: string,
  size: number = 280,
  errorCorrectionLevel: "M" | "H" = "M"
): Promise<string> {
  return await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel,
    margin: 4,
    width: size,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}

/**
 * Production-grade QR Code Data URL Generator for PNG export/download.
 */
export async function generateQrCodeDataUrl(
  text: string,
  size: number = 280,
  errorCorrectionLevel: "M" | "H" = "M"
): Promise<string> {
  return await QRCode.toDataURL(text, {
    errorCorrectionLevel,
    margin: 4,
    width: size,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}

