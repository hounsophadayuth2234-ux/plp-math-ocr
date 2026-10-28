import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function resolveSessionSecret() {
  if (process.env.APP_GATE_SESSION_SECRET?.trim()) {
    return process.env.APP_GATE_SESSION_SECRET.trim();
  }
  try {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, 'utf8');
      const match = content.match(/^APP_GATE_SESSION_SECRET=(.+)$/m);
      if (match && match[1]) {
        return match[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
  try {
    const handoffPath = path.resolve(process.cwd(), '.gate-credentials-handoff.json');
    if (fs.existsSync(handoffPath)) {
      const content = fs.readFileSync(handoffPath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed.sessionSecret) {
        return parsed.sessionSecret.trim();
      }
    }
  } catch {}
  return 'test-isolated-session-secret-for-e2e-fixtures-only';
}

export const DEFAULT_SESSION_SECRET = resolveSessionSecret();

import { resolveE2ECredentials } from './test-credentials-resolver.js';
const dynamicCreds = resolveE2ECredentials();

export const MOCK_SUPERADMIN = {
  id: 'usr_t33rx0x6mvs5qy0a',
  username: dynamicCreds.superadmin.username,
  role: 'SUPER_ADMIN',
  displayName: 'System Owner Super Admin',
};

export const MOCK_NORMALUSER = {
  id: 'usr_c6gqttx7mvs5qy6q',
  username: dynamicCreds.user.username,
  role: 'USER',
  displayName: 'Normal User',
};

/**
 * Creates a signed HMAC-SHA256 session token identical to the production auth engine.
 */
export function generateTestSessionToken(user = MOCK_SUPERADMIN) {
  const secret = DEFAULT_SESSION_SECRET;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'dyt-cyber-gate',
    userId: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
    iat: now,
    exp: now + 86400 * 7,
    jti: Math.random().toString(36).substring(2) + Date.now().toString(36),
    mustChangePassword: false,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadB64);
  const sigB64 = hmac.digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

export async function injectAuthenticatedSession(context, baseUrl, user = MOCK_SUPERADMIN) {
  try {
    await context.clearCookies();
  } catch {}

  const token = generateTestSessionToken(user);
  const parsed = new URL(baseUrl);
  const domain = parsed.hostname;
  const isSecure = baseUrl.startsWith('https://');

  const cookies = [
    {
      name: 'dyt_gate_session',
      value: token,
      domain,
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'Lax',
    },
    {
      name: '__Secure-dyt_gate_session',
      value: token,
      domain,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ];

  await context.addCookies(cookies);
  return token;
}
