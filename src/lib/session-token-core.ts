/**
 * Edge Runtime Compatible Session Token Engine
 * Uses Web Crypto (crypto.subtle) so it runs cleanly on Vercel Edge Middleware and Node.js.
 */

export const SESSION_COOKIE_NAME = "dyt_gate_session";
export const SESSION_MAX_AGE_SECONDS = 86400 * 7; // 7 days

export interface SessionTokenPayload {
  userId: string;
  username: string;
  role: "ADMIN" | "USER";
  displayName: string;
  iat: number;
  exp: number;
  jti: string;
  iss?: string;
  mustChangePassword?: boolean;
}

function getSessionSecret(): string {
  const secret = process.env.APP_GATE_SESSION_SECRET?.trim();
  if (secret && secret.length >= 16) {
    return secret;
  }
  return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Creates a signed HMAC-SHA256 session token using Web Crypto.
 */
export async function createSessionToken(params: {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  displayName: string;
  mustChangePassword?: boolean;
}): Promise<string> {
  const secret = getSessionSecret();
  const key = await getHmacKey(secret);

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionTokenPayload = {
    iss: "dyt-cyber-gate",
    userId: params.id,
    username: params.username,
    role: params.role,
    displayName: params.displayName,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    jti: Math.random().toString(36).substring(2) + Date.now().toString(36),
    mustChangePassword: params.mustChangePassword === true,
  };

  const enc = new TextEncoder();
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(enc.encode(payloadJson));

  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuffer));

  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies a session token using Web Crypto (constant-time verification).
 */
export async function verifySessionToken(
  token: string
): Promise<{ valid: boolean; payload?: SessionTokenPayload; error?: string }> {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Missing token" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid token structure" };
  }

  const [payloadB64, sigB64] = parts;
  const secret = getSessionSecret();

  try {
    const key = await getHmacKey(secret);
    const enc = new TextEncoder();
    const sigBytes = base64UrlDecode(sigB64);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as BufferSource,
      enc.encode(payloadB64)
    );

    if (!isValid) {
      return { valid: false, error: "Invalid signature" };
    }

    const payloadBytes = base64UrlDecode(payloadB64);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload: SessionTokenPayload = JSON.parse(payloadStr);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: "Session expired" };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: "Token verification failed" };
  }
}
