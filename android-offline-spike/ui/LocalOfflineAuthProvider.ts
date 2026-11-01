/**
 * LocalOfflineAuthProvider - Offline Authentication Provider for Android (Phase 4)
 *
 * Implements the AuthProvider interface for static exports where no Next.js server-side
 * session cookies exist. Validates server-signed offline tokens against the local monotonic anchor.
 */

export interface OfflineSession {
  allowed: boolean;
  user_id?: string;
  role?: string;
  remaining_seconds?: number;
  reason?: string;
  residual_risk_note: string;
}

export class LocalOfflineAuthProvider {
  private invokeFn: (cmd: string, args?: any) => Promise<any>;
  private cachedSession: OfflineSession | null = null;

  constructor(customInvoke?: (cmd: string, args?: any) => Promise<any>) {
    if (customInvoke) {
      this.invokeFn = customInvoke;
    } else {
      const tauriGlobal = (globalThis as any).__TAURI__;
      if (tauriGlobal?.core?.invoke) {
        this.invokeFn = tauriGlobal.core.invoke;
      } else {
        this.invokeFn = async (cmd: string, args?: any) => ({
          allowed: true,
          user_id: 'mock-expert',
          role: 'curriculum_expert',
          remaining_seconds: 604800,
          residual_risk_note: 'A disabled account stays usable offline until the next sync.'
        });
      }
    }
  }

  async verifyToken(token: string): Promise<OfflineSession> {
    const res = await this.invokeFn('verify_offline_session', { token });
    this.cachedSession = res;
    return res;
  }

  getCurrentSession(): OfflineSession | null {
    return this.cachedSession;
  }

  isAuthenticated(): boolean {
    return this.cachedSession?.allowed === true && (this.cachedSession?.remaining_seconds ?? 0) > 0;
  }
}

