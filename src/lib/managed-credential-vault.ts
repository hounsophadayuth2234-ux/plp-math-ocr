import crypto from "crypto";

/**
 * Derives a consistent 32-byte AES-256-GCM key from available system secrets.
 */
let ephemeralVaultKey: Buffer | null = null;

function getVaultEncryptionKey(): Buffer {
  const secretCandidate =
    process.env.APP_MANAGED_VAULT_SECRET?.trim() ||
    process.env.APP_GATE_SESSION_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim();

  if (secretCandidate && secretCandidate.length >= 16) {
    return crypto.createHash("sha256").update(secretCandidate).digest();
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CRITICAL SECURITY CONFIGURATION: APP_MANAGED_VAULT_SECRET or APP_GATE_SESSION_SECRET must be configured in production."
    );
  }

  if (!ephemeralVaultKey) {
    ephemeralVaultKey = crypto.randomBytes(32);
  }
  return ephemeralVaultKey;
}

/**
 * Encrypts a plain-text password using AES-256-GCM authenticated encryption.
 * Output format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptManagedPassword(plainText: string): string {
  if (!plainText || typeof plainText !== "string") {
    return "";
  }

  const key = getVaultEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypts an AES-256-GCM encrypted managed password.
 * Returns the decrypted plaintext, or null if invalid/corrupt/tampered.
 */
export function decryptManagedPassword(cipherText?: string | null): string | null {
  if (!cipherText || typeof cipherText !== "string") {
    return null;
  }

  const parts = cipherText.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;

  try {
    const key = getVaultEncryptionKey();
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");

    if (iv.length !== 12 || authTag.length !== 16) {
      return null;
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
