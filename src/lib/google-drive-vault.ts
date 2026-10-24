import crypto from "crypto";

export interface GoogleDriveOAuthTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
  email?: string | null;
}

/**
 * Derives a consistent 32-byte AES-256 key for Google Drive token encryption at rest.
 * Uses GOOGLE_TOKEN_ENCRYPTION_KEY or derives from APP_GATE_SESSION_SECRET.
 */
function getDriveEncryptionKey(): Buffer {
  const secretCandidate =
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.APP_GATE_SESSION_SECRET?.trim() ||
    process.env.APP_MANAGED_VAULT_SECRET?.trim() ||
    "dyt-plp-google-drive-oauth-token-vault-key-2026";

  return crypto.createHash("sha256").update(secretCandidate).digest();
}

/**
 * Encrypts Google Drive OAuth tokens at rest using AES-256-GCM.
 * Output format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptGoogleDriveTokens(tokens: GoogleDriveOAuthTokens): string {
  const plainText = JSON.stringify(tokens);
  const key = getDriveEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypts AES-256-GCM encrypted Google Drive OAuth tokens.
 * Returns null if token is missing, invalid, or tampered.
 */
export function decryptGoogleDriveTokens(
  cipherText?: string | null
): GoogleDriveOAuthTokens | null {
  if (!cipherText || typeof cipherText !== "string") {
    return null;
  }

  const parts = cipherText.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;

  try {
    const key = getDriveEncryptionKey();
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64")),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8")) as GoogleDriveOAuthTokens;
  } catch (err) {
    console.warn("[GoogleDriveVault] Token decryption failed (invalid tag or tampered):", err instanceof Error ? err.message : String(err));
    return null;
  }
}
