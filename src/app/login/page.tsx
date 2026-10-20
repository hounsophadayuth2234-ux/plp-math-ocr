"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  Cpu,
  Radio,
  Terminal,
  Clock,
} from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPath = searchParams.get("from") || "/";
  const isExpired = searchParams.get("expired") === "1";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    isExpired ? "សម័យកាលចូលប្រើប្រាស់បានផុតកំណត់ សូមបញ្ចូលពាក្យសម្ងាត់ម្តងទៀត (Session expired)" : null
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
        setError("ការប៉ុនប៉ងមិនត្រឹមត្រូវច្រើនដង។ ប្រព័ន្ធត្រូវបានចាក់សោបណ្តោះអាសន្ន (Too many failed attempts)");
        setPassword("");
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.error || "ពាក្យសម្ងាត់មិនត្រឹមត្រូវ សូមព្យាយាមម្តងទៀត (Invalid credentials)");
        setPassword("");
        return;
      }

      // Success: Navigate to destination
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
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950 font-sans text-slate-100 flex items-center justify-center p-4 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. Background Cybernetic Grid & Decorative Animations (z-0, pointer-events-none) */}
      <div
        className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Radial Ambient Glow */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[650px] rounded-full bg-cyan-500/10 blur-[140px]" />
        <div className="absolute -bottom-40 right-1/4 h-[400px] w-[500px] rounded-full bg-blue-600/10 blur-[130px]" />

        {/* Perspective Grid Floor */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(rgba(0,240,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.06)_1px,transparent_1px)] bg-[size:48px_48px] [transform:perspective(500px)_rotateX(60deg)] [transform-origin:bottom_center] [mask-image:linear-gradient(to_top,rgba(0,0,0,0.8),transparent)]" />

        {/* Rotating Mechanical Radar Gyro */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-cyan-500/10 motion-safe:animate-[spin_40s_linear_infinite]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full border border-dashed border-cyan-400/10 motion-safe:animate-[spin_25s_linear_infinite_reverse]" />
      </div>

      {/* 2. Glassmorphic Central Authentication Panel (z-10) */}
      <div className="relative z-10 w-full max-w-[440px] rounded-2xl border border-cyan-500/30 bg-[#071326]/75 backdrop-blur-xl shadow-[0_0_50px_rgba(0,240,255,0.12)] p-6 sm:p-8 transition-all">
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
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isLocked ? "bg-amber-400" : "bg-cyan-400"}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLocked ? "bg-amber-500" : "bg-cyan-500"}`} />
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
            className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs text-amber-200"
          >
            <Clock className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-300">
                ការចូលប្រើត្រូវបានផ្អាកបណ្តោះអាសន្ន
              </p>
              <p className="text-[11px] text-amber-200/80">
                Access is locked due to consecutive failed attempts.
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
            className="mb-5 flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <p>{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="gate-password"
              className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              <span>ពាក្យសម្ងាត់ (Access Password)</span>
              <span className="text-[10px] font-normal text-cyan-400/80 font-mono">
                ENCRYPTED HUD
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
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <LoginContent />
    </React.Suspense>
  );
}
