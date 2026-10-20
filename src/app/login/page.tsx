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
          "ការប៉ុនប៉ងមិនត្រឹមត្រូវច្រើនដង។ ប្រព័ន្ធត្រូវបានចាក់សោបណ្តោះអាសន្ន 30 នាទី (Too many failed attempts. Locked for 30 minutes)"
        );
        setPassword("");
        return;
      }

      if (!res.ok || !data.success) {
        setError(
          "ពាក្យសម្ងាត់មិនត្រឹមត្រូវ សូមព្យាយាមម្តងទៀត (Invalid credentials)"
        );
        setPassword("");
        return;
      }

      // Success: Navigate to sanitized internal destination
      router.push(fromPath);
      router.refresh();
    } catch {
      setError("បញ្ហាតភ្ជាប់ម៉ាស៊ីនមេ សូមព្យាយាមម្តងទៀត (Connection error)");
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
      {/* 1. Background Cybernetic Grid, Circuit Lines, Radar & Formulas (pointer-events: none) */}
      <div className="auth-gate-background" aria-hidden="true">
        {/* Radial Ambient Glows */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[650px] rounded-full bg-cyan-500/10 blur-[140px]" />
        <div className="absolute -bottom-40 right-1/4 h-[400px] w-[500px] rounded-full bg-blue-600/10 blur-[130px]" />

        {/* Perspective Cyber Grid Floor */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[linear-gradient(rgba(0,240,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [transform:perspective(500px)_rotateX(60deg)] [transform-origin:bottom_center] [mask-image:linear-gradient(to_top,rgba(0,0,0,0.85),transparent)]" />

        {/* Rotating Concentric Radar Rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] rounded-full border border-cyan-500/10 animate-radar" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] rounded-full border border-dashed border-cyan-400/15 animate-radar-reverse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full border border-cyan-500/10" />

        {/* Animated Circuit Tracks */}
        <svg
          className="absolute inset-0 w-full h-full opacity-25"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="gateCircuitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <path
            d="M 0 140 L 260 140 L 330 210 L 650 210"
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
            d="M 80 820 L 320 820 L 390 750 L 780 750"
            stroke="url(#gateCircuitGrad)"
            strokeWidth="1.5"
            fill="none"
            className="animate-circuit-trace"
          />
          <circle cx="330" cy="210" r="3" fill="#00f0ff" />
          <circle cx="890" cy="350" r="3" fill="#00f0ff" />
          <circle cx="390" cy="750" r="3" fill="#00f0ff" />
        </svg>

        {/* Horizontal Formula Streams */}
        <div className="absolute top-12 left-0 right-0 overflow-hidden opacity-25 text-cyan-400 font-mono text-xs select-none">
          <div className="animate-formula-rtl">
            {"∫ e^(-x²) dx = √π    ∇ × B = μ₀J    e^(iπ) + 1 = 0    ∑ 1/n² = π²/6    E = mc²    HΨ = EΨ    ∫ e^(-x²) dx = √π    ∇ × B = μ₀J"}
          </div>
        </div>
        <div className="absolute bottom-16 left-0 right-0 overflow-hidden opacity-25 text-blue-400 font-mono text-xs select-none">
          <div className="animate-formula-ltr">
            {"iℏ ∂Ψ/∂t = ĤΨ    f(x) = (1/σ√2π)e^(-(x-μ)²/2σ²)    ∮ B·dℓ = μ₀I    ∂ρ/∂t + ∇·j = 0    iℏ ∂Ψ/∂t = ĤΨ"}
          </div>
        </div>
      </div>

      {/* 2. Standalone Mechanical Cyber Card Content (z-10) */}
      <main className="auth-gate-content">
        <section className="auth-gate-card">
          {/* Header HUD */}
          <div className="flex flex-col items-center text-center space-y-3 mb-6">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 shadow-[0_0_20px_rgba(0,240,255,0.25)]">
              {isLocked ? (
                <AlertTriangle className="h-7 w-7 text-amber-400 animate-pulse" />
              ) : (
                <Lock className="h-7 w-7 text-cyan-400" />
              )}
              <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isLocked ? "bg-amber-400" : "bg-cyan-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isLocked ? "bg-amber-500" : "bg-cyan-500"
                    }`}
                  />
                </span>
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-[10px] font-mono tracking-widest text-cyan-300 uppercase mb-1.5">
                <Radio className="h-2.5 w-2.5 animate-pulse" />
                PLP MATH · DYT ECOSYSTEM
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Security Gateway
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                ប្រព័ន្ធការពារសុវត្ថិភាពចូលប្រើប្រាស់
              </p>
            </div>
          </div>

          {/* Lockout HUD Banner */}
          {isLocked && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/40 p-3.5 text-xs text-amber-200"
            >
              <Clock className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">
                  ការចូលប្រើត្រូវបានផ្អាកបណ្តោះអាសន្ន
                </p>
                <p className="text-[11px] text-amber-200/80">
                  Access is locked for 30 minutes due to 3 failed attempts.
                </p>
                <div className="text-sm font-mono font-bold text-amber-400 pt-1">
                  Retry in: {formatCountdown(retryAfterSeconds)}
                </div>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && !isLocked && (
            <div
              role="alert"
              className="mb-5 flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs text-rose-300"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <p>{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="gate-password"
                className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                <span>ពាក្យសម្ងាត់ (Access Password)</span>
                <span className="text-[10px] font-normal text-cyan-400/80 font-mono">
                  ENCRYPTED GATE
                </span>
              </label>

              <div className="relative">
                <input
                  id="gate-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || isLocked}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading || isLocked}
                  tabIndex={0}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
              className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-[0_0_25px_rgba(0,240,255,0.25)] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>ផ្ទៀងផ្ទាត់... (VERIFYING)</span>
                </>
              ) : isLocked ? (
                <>
                  <Clock className="h-4 w-4" />
                  <span>ចាក់សោ ({formatCountdown(retryAfterSeconds)})</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>ផ្ទៀងផ្ទាត់ និង ចូល (AUTHENTICATE)</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Hardware Diagnostics Indicator */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3 text-cyan-400/70" />
              NODE GATEWAY 2.4
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
