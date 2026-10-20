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
} from "lucide-react";
import { sanitizeInternalRedirect } from "@/lib/auth-gate";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get("from");
  const fromPath = sanitizeInternalRedirect(rawFrom);
  const isExpired = searchParams.get("expired") === "1";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    isExpired
      ? "សម័យកាលចូលប្រើប្រាស់បានផុតកំណត់ សូមបញ្ចូលពាក្យសម្ងាត់ម្តងទៀត (Session expired)"
      : null
  );
  const [isLocked, setIsLocked] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

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
              passwordInputRef.current?.focus();
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
    if (!isLocked) {
      passwordInputRef.current?.focus();
    }
  }, [isLocked]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isLocked || !password.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const retrySec = data.retryAfter || 1800;
        setRetryAfterSeconds(retrySec);
        setError(
          "ការប៉ុនប៉ងមិនត្រឹមត្រូវ 3 ដង។ ប្រព័ន្ធត្រូវបានចាក់សោបណ្តោះអាសន្ន 30 នាទី (Too many failed attempts. Locked for 30 minutes)"
        );
        setPassword("");
        return;
      }

      if (!res.ok || !data.success) {
        setError(
          "ពាក្យសម្ងាត់មិនត្រឹមត្រូវ សូមព្យាយាមម្តងទៀត (Invalid credentials)"
        );
        setPassword("");
        // Return focus to password input immediately after invalid credentials
        setTimeout(() => {
          passwordInputRef.current?.focus();
        }, 50);
        return;
      }

      // Success: Navigate to sanitized internal destination
      router.push(fromPath);
      router.refresh();
    } catch {
      setError("បញ្ហាតភ្ជាប់ម៉ាស៊ីនមេ សូមព្យាយាមម្តងទៀត (Connection error)");
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="auth-gate-page text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. Background Cybernetic Grid, Circuit Lines, Radar & Animated Formulas (pointer-events: none, z-0) */}
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

        {/* Animated Circuit Board Tracks */}
        <svg
          className="absolute inset-0 w-full h-full opacity-30"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="gateCircuitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <path
            d="M 0 140 L 260 140 L 330 210 L 680 210"
            stroke="url(#gateCircuitGrad)"
            strokeWidth="1.5"
            fill="none"
            className="animate-circuit-trace"
          />
          <path
            d="M 1200 420 L 960 420 L 890 350 L 520 350"
            stroke="url(#gateCircuitGrad)"
            strokeWidth="1.5"
            fill="none"
            className="animate-circuit-trace"
          />
          <path
            d="M 80 820 L 320 820 L 390 750 L 800 750"
            stroke="url(#gateCircuitGrad)"
            strokeWidth="1.5"
            fill="none"
            className="animate-circuit-trace"
          />
          <circle cx="330" cy="210" r="3.5" fill="#00f0ff" />
          <circle cx="890" cy="350" r="3.5" fill="#00f0ff" />
          <circle cx="390" cy="750" r="3.5" fill="#00f0ff" />
        </svg>

        {/* Multi-Track Animated Formula Streams (Controlled Opacity 0.16–0.20) */}
        {/* Track 1: Top Right-to-Left */}
        <div className="absolute top-10 left-0 right-0 overflow-hidden opacity-[0.18] text-cyan-300 font-mono text-[13px] tracking-wider select-none">
          <div className="animate-formula-rtl">
            {"∫ e^(-x²) dx = √π    ∇ × B = μ₀J    e^(iπ) + 1 = 0    ∑ 1/n² = π²/6    E = mc²    HΨ = EΨ    ∫ e^(-x²) dx = √π    ∇ × B = μ₀J    e^(iπ) + 1 = 0"}
          </div>
        </div>

        {/* Track 2: Center Left-to-Right (behind card) */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 overflow-hidden opacity-[0.14] text-sky-400 font-mono text-xs tracking-widest select-none">
          <div className="animate-formula-ltr">
            {"[ 01000100 01011001 01010100 ] ··· HMAC-SHA256 ··· NODE GATEWAY 2.4 ··· FAIL-CLOSED LOCKOUT (30m) ··· STANDALONE CYBER SHIELD ··· [ 01000100 01011001 01010100 ]"}
          </div>
        </div>

        {/* Track 3: Bottom Right-to-Left */}
        <div className="absolute bottom-12 left-0 right-0 overflow-hidden opacity-[0.18] text-blue-300 font-mono text-[13px] tracking-wider select-none">
          <div className="animate-formula-ltr">
            {"iℏ ∂Ψ/∂t = ĤΨ    f(x) = (1/σ√2π)e^(-(x-μ)²/2σ²)    ∮ B·dℓ = μ₀I    ∂ρ/∂t + ∇·j = 0    iℏ ∂Ψ/∂t = ĤΨ    f(x) = (1/σ√2π)e^(-(x-μ)²/2σ²)"}
          </div>
        </div>
      </div>

      {/* 2. Standalone Mechanical Cyber Card Content (z-10, centered, max-w-[460px]) */}
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
                PLP MATH · DYT ECOSYSTEM
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Security Gateway
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-300 mt-1 tracking-wide leading-relaxed">
                ប្រព័ន្ធការពារសុវត្ថិភាពចូលប្រើប្រាស់
              </p>
            </div>
          </div>

          {/* Lockout HUD Banner (Clear Visual Countdown) */}
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
                    Access is locked for 30 minutes due to 3 consecutive failed attempts.
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

          {/* Invalid Credentials Error Alert with Micro-Shake */}
          {error && !isLocked && (
            <div
              role="alert"
              className="animate-error-shake mb-5 flex items-center gap-3 rounded-xl border border-rose-500/60 bg-rose-950/60 p-3.5 text-xs text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.22)]"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="gate-password"
                className="flex items-center justify-between text-xs sm:text-[13px] font-semibold tracking-wide text-slate-200"
              >
                <span>ពាក្យសម្ងាត់ (Access Password)</span>
                <span className="text-[10px] font-mono text-cyan-400/90 uppercase tracking-widest">
                  ENCRYPTED GATE
                </span>
              </label>

              <div className="relative">
                <input
                  ref={passwordInputRef}
                  id="gate-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || isLocked}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-4 py-3.5 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-mono shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
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

            <button
              type="submit"
              disabled={loading || isLocked || !password.trim()}
              className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 px-5 py-3.5 text-xs sm:text-sm font-bold text-white shadow-[0_0_25px_rgba(0,240,255,0.25)] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none transition-all"
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
                  <span>ផ្ទៀងផ្ទាត់ និង ចូល (AUTHENTICATE)</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Hardware Diagnostics Indicator */}
          <div className="mt-6 pt-4 border-t border-slate-800/90 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3 text-cyan-400/80" />
              NODE GATEWAY 2.4
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              STANDALONE SHIELD
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
