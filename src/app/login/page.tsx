"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  Cpu,
  Radio,
  Clock,
  User,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import { sanitizeInternalRedirect } from "@/lib/auth-gate";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get("from");
  const fromPath = sanitizeInternalRedirect(rawFrom);
  const isExpired = searchParams.get("expired") === "1";
  const isLoggedOut = searchParams.get("logged_out") === "1";

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    isExpired
      ? "សម័យកាលចូលប្រើប្រាស់បានផុតកំណត់ សូមចូលម្តងទៀត (Session expired. Please log in again)"
      : isLoggedOut
      ? "បានចាកចេញដោយជោគជ័យ (Logged out successfully)"
      : null
  );
  const [isLocked, setIsLocked] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  // Force Password Change state (for first-login temporary passwords)
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const identifierInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle countdown if locked out
  useEffect(() => {
    if (retryAfterSeconds > 0) {
      setIsLocked(true);
      countdownTimerRef.current = setInterval(() => {
        setRetryAfterSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current as NodeJS.Timeout);
            setIsLocked(false);
            setError(null);
            setTimeout(() => {
              identifierInputRef.current?.focus();
            }, 50);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [retryAfterSeconds]);

  // Initial focus on mount
  useEffect(() => {
    if (!isLocked && !mustChangePassword) {
      identifierInputRef.current?.focus();
    }
  }, [isLocked, mustChangePassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isLocked || !password.trim()) return;

    setLoading(true);
    setError(null);

    // If username is omitted, default to admin for seamless backwards compatibility
    const identifier = usernameOrEmail.trim() || "admin";

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: identifier,
          password: password.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const retrySec = data.retryAfter || 1800;
        setRetryAfterSeconds(retrySec);
        setError(
          "ការប៉ុនប៉ងមិនត្រឹមត្រូវច្រើនដង។ ប្រព័ន្ធត្រូវបានចាក់សោបណ្តោះអាសន្ន (Too many failed attempts. Account temporarily locked)"
        );
        setPassword("");
        return;
      }

      if (!res.ok || !data.success) {
        setError(
          data.error || "ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ (Invalid username or password)"
        );
        setPassword("");
        setTimeout(() => {
          passwordInputRef.current?.focus();
        }, 50);
        return;
      }

      // Check if user must change temporary password on first login
      if (data.user?.mustChangePassword) {
        setMustChangePassword(true);
        return;
      }

      // Success: Navigate to destination
      router.push(fromPath);
      router.refresh();
    } catch {
      setError("បញ្ហាតភ្ជាប់ម៉ាស៊ីនមេ សូមព្យាយាមម្តងទៀត (Connection error. Please try again)");
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
    } finally {
      setLoading(false);
    }
  };

  const handleForceChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changingPassword) return;

    if (newPassword !== confirmPassword) {
      setChangeError("ពាក្យសម្ងាត់ផ្ទៀងផ្ទាត់មិនដូចគ្នាទេ (Passwords do not match)");
      return;
    }

    if (newPassword.length < 10) {
      setChangeError("ពាក្យសម្ងាត់ត្រូវតែមានយ៉ាងតិច 10 តួអក្សរ (Password must be at least 10 characters)");
      return;
    }

    setChangingPassword(true);
    setChangeError(null);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: password.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setChangeError(data.error || "មិនអាចផ្លាស់ប្តូរពាក្យសម្ងាត់បានទេ (Failed to update password)");
        return;
      }

      // Success: Proceed to requested destination
      router.push(fromPath);
      router.refresh();
    } catch {
      setChangeError("បញ្ហាតភ្ជាប់ម៉ាស៊ីនមេ (Connection error)");
    } finally {
      setChangingPassword(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="auth-gate-page text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. Background Cybernetic Grid, Circuit Lines, Radar & Animated Formulas */}
      <div className="auth-gate-background" aria-hidden="true">
        {/* Radial Ambient Glows */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[680px] rounded-full bg-cyan-500/12 blur-[150px]" />
        <div className="absolute -bottom-40 right-1/4 h-[440px] w-[540px] rounded-full bg-blue-600/12 blur-[140px]" />

        {/* Perspective Cyber Grid Floor */}
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-[linear-gradient(rgba(0,240,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.06)_1px,transparent_1px)] bg-[size:44px_44px] [transform:perspective(500px)_rotateX(60deg)] [transform-origin:bottom_center] [mask-image:linear-gradient(to_top,rgba(0,0,0,0.9),transparent)]" />

        {/* Rotating Concentric Radar Rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[740px] h-[740px] rounded-full border border-cyan-500/10 animate-radar" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full border border-dashed border-cyan-400/15 animate-radar-reverse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-full border border-cyan-500/10" />

        {/* Multi-Track Animated Formula Streams */}
        <div className="absolute top-10 left-0 right-0 overflow-hidden opacity-[0.18] text-cyan-300 font-mono text-[13px] tracking-wider select-none">
          <div className="animate-formula-rtl">
            {"∫ e^(-x²) dx = √π    ∇ × B = μ₀J    e^(iπ) + 1 = 0    ∑ 1/n² = π²/6    E = mc²    HΨ = EΨ    ∫ e^(-x²) dx = √π"}
          </div>
        </div>

        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 overflow-hidden opacity-[0.14] text-sky-400 font-mono text-xs tracking-widest select-none">
          <div className="animate-formula-ltr">
            {"[ DYT ECOSYSTEM ] ··· ACCOUNT GATEWAY ··· RBAC (ADMIN | USER) ··· ARGON2ID / BCRYPT ··· AUDIT LOGGING ENABLED"}
          </div>
        </div>
      </div>

      {/* 2. Standalone Mechanical Cyber Card Content */}
      <main className="auth-gate-content">
        <section className="auth-gate-card relative overflow-hidden">
          {/* Top Neon Accent Line */}
          <div
            className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
            aria-hidden="true"
          />

          {/* Header HUD */}
          <div className="flex flex-col items-center text-center space-y-3 mb-6">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/25 to-blue-600/25 shadow-[0_0_24px_rgba(0,240,255,0.28)]">
              {isLocked ? (
                <AlertTriangle className="h-7 w-7 text-amber-400 animate-pulse" />
              ) : mustChangePassword ? (
                <KeyRound className="h-7 w-7 text-amber-300" />
              ) : (
                <Lock className="h-7 w-7 text-cyan-300" />
              )}
              <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isLocked ? "bg-amber-400" : "bg-cyan-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      isLocked ? "bg-amber-500" : "bg-cyan-400"
                    }`}
                  />
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-cyan-500/35 bg-cyan-950/50 text-[10px] font-mono tracking-widest text-cyan-300 uppercase">
                <Radio className="h-2.5 w-2.5 animate-pulse text-cyan-400" />
                DYT ECOSYSTEM · ACCOUNT GATEWAY
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {mustChangePassword ? "Update Password" : "Sign In to DYT Platform"}
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-300 mt-1 tracking-wide leading-relaxed">
                {mustChangePassword
                  ? "សូមកំណត់ពាក្យសម្ងាត់ផ្ទាល់ខ្លួនថ្មី (Set your permanent password)"
                  : "ប្រព័ន្ធចូលប្រើប្រាស់គណនីសុវត្ថិភាព (Authentication & Role Verification)"}
              </p>
            </div>
          </div>

          {/* Lockout HUD Banner */}
          {isLocked && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-amber-500/50 bg-amber-950/50 p-4 text-xs text-amber-200 shadow-[0_0_25px_rgba(245,158,11,0.2)] transition-all"
            >
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <p className="font-bold text-amber-300 text-sm">
                    ការចូលប្រើប្រាស់ត្រូវបានចាក់សោបណ្តោះអាសន្ន
                  </p>
                  <p className="text-[11px] text-amber-200/90 leading-snug">
                    Access is locked due to repeated failed attempts.
                  </p>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-amber-300/80 uppercase">
                      Retry Allowed In:
                    </span>
                    <span className="text-base sm:text-lg font-mono font-black text-amber-300 tracking-widest bg-amber-950/90 border border-amber-500/50 px-3 py-1 rounded-lg shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                      {formatCountdown(retryAfterSeconds)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && !isLocked && !mustChangePassword && (
            <div
              role="alert"
              className="animate-error-shake mb-5 flex items-center gap-3 rounded-xl border border-rose-500/60 bg-rose-950/60 p-3.5 text-xs text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.22)]"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {/* Force Change Password View */}
          {mustChangePassword ? (
            <form onSubmit={handleForceChangePassword} className="space-y-4">
              {changeError && (
                <div className="rounded-lg border border-rose-500/50 bg-rose-950/50 p-3 text-xs text-rose-200">
                  {changeError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  ពាក្យសម្ងាត់ថ្មី (New Password)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="យ៉ាងតិច 10 តួអក្សរ (Min 10 characters)"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  បញ្ជាក់ពាក្យសម្ងាត់ (Confirm Password)
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="វាយពាក្យសម្ងាត់ថ្មីម្តងទៀត"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={changingPassword || !newPassword || !confirmPassword}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 text-sm font-bold text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:brightness-110 disabled:opacity-50 transition-all font-mono"
              >
                {changingPassword ? "កំពុងរក្សាទុក... (SAVING)" : "រក្សាទុក និង បន្ត (SET PASSWORD & CONTINUE)"}
              </button>
            </form>
          ) : (
            /* Standard Login Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username or Email Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-identifier"
                  className="flex items-center justify-between text-xs sm:text-[13px] font-semibold tracking-wide text-slate-200"
                >
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-cyan-400" />
                    <span>ឈ្មោះគណនី ឬ អ៊ីមែល (Username or Email)</span>
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400/80 uppercase">
                    ID / EMAIL
                  </span>
                </label>

                <input
                  ref={identifierInputRef}
                  id="login-identifier"
                  data-testid="login-username-input"
                  type="text"
                  name="usernameOrEmail"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  disabled={loading || isLocked}
                  placeholder="admin ឬ yourname@domain.com"
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-mono shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="gate-password"
                  className="flex items-center justify-between text-xs sm:text-[13px] font-semibold tracking-wide text-slate-200"
                >
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-cyan-400" />
                    <span>ពាក្យសម្ងាត់ (Password)</span>
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400/80 uppercase">
                    BCRYPT SECURE
                  </span>
                </label>

                <div className="relative">
                  <input
                    ref={passwordInputRef}
                    id="gate-password"
                    data-testid="login-password-input"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading || isLocked}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-mono shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading || isLocked}
                    tabIndex={0}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                data-testid="login-submit-btn"
                disabled={loading || isLocked || !password.trim()}
                className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 px-5 py-3.5 text-xs sm:text-sm font-bold text-white shadow-[0_0_25px_rgba(0,240,255,0.25)] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none transition-all mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>ផ្ទៀងផ្ទាត់... (VERIFYING)</span>
                  </>
                ) : isLocked ? (
                  <>
                    <Clock className="h-4 w-4 text-amber-300" />
                    <span>ចាក់សោ ({formatCountdown(retryAfterSeconds)})</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 text-cyan-200" />
                    <span>ចូលប្រើប្រាស់ (SIGN IN)</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Hardware Diagnostics Indicator */}
          <div className="mt-6 pt-4 border-t border-slate-800/90 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3 text-cyan-400/80" />
              RBAC ENGINE 2.0
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              AUTHENTICATED GATE
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="auth-gate-page flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <LoginContent />
    </React.Suspense>
  );
}
