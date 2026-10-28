import crypto from 'node:crypto';

export const DEFAULT_SESSION_SECRET =
  process.env.APP_GATE_SESSION_SECRET ||
  'adb35b7f1db66b2ba6f0a71ddd28113307a1d935a809e47c21b861b612b2b1b301c64208f228ac1fb2e32108dfee01594d55efc66af15e7382b04c4b96b1abc1';

export const MOCK_SUPERADMIN = {
  id: 'usr_t33rx0x6mvs5qy0a',
  username: 'superboss',
  role: 'SUPER_ADMIN',
  displayName: 'System Owner Super Admin',
};

export const MOCK_NORMALUSER = {
  id: 'usr_c6gqttx7mvs5qy6q',
  username: 'normaluser',
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

/**
 * Injects authenticated session cookies into the Playwright BrowserContext.
 */
export async function injectAuthenticatedSession(context, baseUrl, user = MOCK_SUPERADMIN) {
  const token = generateTestSessionToken(user);
  let domain = 'localhost';
  try {
    domain = new URL(baseUrl).hostname;
  } catch {}

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
  ];

  if (isSecure) {
    cookies.push({
      name: '__Secure-dyt_gate_session',
      value: token,
      domain,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    });
  }

  await context.addCookies(cookies);
  return token;
}
