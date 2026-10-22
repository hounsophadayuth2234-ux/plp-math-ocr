"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  Clock,
  User,
  KeyRound,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Layers,
} from "lucide-react";
import { sanitizeInternalRedirect } from "@/lib/auth-gate";

/**
 * Animated Abstract Human Silhouette Component
 * Pure inline SVG vector graphic with GPU-composited breathing and scanning animations.
 * Low opacity (0.15 - 0.28), cyan / blue-violet cybernetic outline, completely non-blocking.
 */
function AbstractHumanSilhouette() {
  return (
    <div
      className="pointer-events-none absolute right-[-20px] xl:right-[20px] top-1/2 -translate-y-1/2 w-[380px] xl:w-[460px] h-[580px] xl:h-[660px] hidden lg:block z-0 select-none overflow-hidden"
      aria-hidden="true"
    >
      <div className="relative w-full h-full animate-silhouette-breathe">
        <svg
          viewBox="0 0 400 600"
          className="w-full h-full drop-shadow-[0_0_30px_rgba(56,189,248,0.18)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="silhouetteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.48" />
              <stop offset="50%" stopColor="#818cf8" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.22" />
            </linearGradient>

            <linearGradient id="scanBeamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
              <stop offset="25%" stopColor="#38bdf8" stopOpacity="0.65" />
              <stop offset="50%" stopColor="#c084fc" stopOpacity="0.95" />
              <stop offset="75%" stopColor="#38bdf8" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="torsoGlowGrad" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.08" />
              <stop offset="50%" stopColor="#4338ca" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </linearGradient>

            <filter id="circuitGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Geometric Reticle Rings around Head */}
          <circle cx="200" cy="115" r="70" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4 8" opacity="0.35" />
          <circle cx="200" cy="115" r="92" stroke="#818cf8" strokeWidth="0.75" strokeDasharray="8 14" opacity="0.25" />
          <circle cx="200" cy="115" r="110" stroke="#38bdf8" strokeWidth="0.5" opacity="0.15" />

          {/* Abstract Head Contour & Translucent Fill */}
          <path
            d="M 200,58 C 165,58 145,84 145,120 C 145,156 165,180 200,180 C 235,180 255,156 255,120 C 255,84 235,58 200,58 Z"
            fill="url(#torsoGlowGrad)"
            stroke="url(#silhouetteGrad)"
            strokeWidth="1.75"
            filter="url(#circuitGlow)"
          />

          {/* Head Internal Geometric Core & Circuit Nodes */}
          <path d="M 180,105 L 200,85 L 220,105 L 200,125 Z" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 3" opacity="0.45" />
          <circle cx="200" cy="105" r="3" fill="#38bdf8" opacity="0.85" />
          <line x1="200" y1="125" x2="200" y2="180" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />

          {/* Neck, Shoulders and Torso Contour */}
          <path
            d="M 182,178 L 176,210 C 145,220 95,245 72,285 C 56,315 50,360 46,420 L 44,580 L 356,580 L 354,420 C 350,360 344,315 328,285 C 305,245 255,220 224,210 L 218,178"
            fill="url(#torsoGlowGrad)"
            stroke="url(#silhouetteGrad)"
            strokeWidth="1.75"
            filter="url(#circuitGlow)"
          />

          {/* Clavicle / Shoulder Circuit Traces & Nodes */}
          {/* Left Shoulder Circuits */}
          <path d="M 176,210 L 138,235 L 90,260 L 72,285" stroke="#38bdf8" strokeWidth="1" opacity="0.4" />
          <circle cx="138" cy="235" r="3" fill="#38bdf8" opacity="0.75" />
          <circle cx="90" cy="260" r="2.5" fill="#818cf8" opacity="0.7" />

          {/* Right Shoulder Circuits */}
          <path d="M 224,210 L 262,235 L 310,260 L 328,285" stroke="#38bdf8" strokeWidth="1" opacity="0.4" />
          <circle cx="262" cy="235" r="3" fill="#38bdf8" opacity="0.75" />
          <circle cx="310" cy="260" r="2.5" fill="#818cf8" opacity="0.7" />

          {/* Central Chest Geometric Core */}
          <circle cx="200" cy="290" r="26" stroke="#818cf8" strokeWidth="1" strokeDasharray="3 5" opacity="0.4" />
          <circle cx="200" cy="290" r="14" stroke="#38bdf8" strokeWidth="1.2" opacity="0.5" />
          <circle cx="200" cy="290" r="3.5" fill="#38bdf8" opacity="0.9" />

          {/* Vertical Spinal Conduit Line */}
          <line x1="200" y1="210" x2="200" y2="264" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4 4" opacity="0.45" />
          <line x1="200" y1="316" x2="200" y2="540" stroke="#38bdf8" strokeWidth="1" strokeDasharray="5 7" opacity="0.3" />

          {/* Diagonal Rib Circuit Connectors */}
          <line x1="200" y1="350" x2="130" y2="385" stroke="#818cf8" strokeWidth="0.8" opacity="0.25" />
          <circle cx="130" cy="385" r="2" fill="#818cf8" opacity="0.5" />
          <line x1="200" y1="350" x2="270" y2="385" stroke="#818cf8" strokeWidth="0.8" opacity="0.25" />
          <circle cx="270" cy="385" r="2" fill="#818cf8" opacity="0.5" />

          <line x1="200" y1="410" x2="145" y2="445" stroke="#38bdf8" strokeWidth="0.8" opacity="0.2" />
          <line x1="200" y1="410" x2="255" y2="445" stroke="#38bdf8" strokeWidth="0.8" opacity="0.2" />

          {/* Moving Scanning Light Beam across Silhouette */}
          <g className="animate-silhouette-scan">
            <line x1="30" y1="0" x2="370" y2="0" stroke="url(#scanBeamGrad)" strokeWidth="2.5" />
            <line x1="70" y1="-2" x2="330" y2="-2" stroke="#ffffff" strokeWidth="1" opacity="0.8" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get("from") || searchParams.get("redirect") || "/";
  const fromPath = sanitizeInternalRedirect(rawFrom);
  const isExpired = searchParams.get("expired") === "1";
  const isLoggedOut = searchParams.get("logged_out") === "1";

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    isExpired
      ? "សម័យកាលចូលប្រើប្រាស់បានផុតកំណត់ សូមចូលម្តងទៀត"
      : isLoggedOut
      ? "បានចាកចេញដោយជោគជ័យ"
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
    if (loading || isLocked) return;

    const identifier = usernameOrEmail.trim();
    if (!identifier) {
      setError("សូមបញ្ចូលឈ្មោះអ្នកប្រើប្រាស់");
      return;
    }

    if (identifier.length < 4) {
      setError("ឈ្មោះអ្នកប្រើប្រាស់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");
      return;
    }

    if (!password.trim()) {
      setError("សូមបញ្ចូលពាក្យសម្ងាត់");
      return;
    }

    if (password.length < 4) {
      setError("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");
      return;
    }

    setLoading(true);
    setError(null);

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
        setError("ការចូលប្រើត្រូវបានផ្អាកជាបណ្តោះអាសន្ន។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។");
        setPassword("");
        return;
      }

      if (!res.ok || !data.success) {
        setError("ឈ្មោះ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ");
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
      setError("បញ្ហាតភ្ជាប់ម៉ាស៊ីនមេ សូមព្យាយាមម្តងទៀត");
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

    if (!newPassword.trim()) {
      setChangeError("សូមបញ្ចូលពាក្យសម្ងាត់");
      return;
    }

    if (newPassword.length < 4) {
      setChangeError("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangeError("ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា");
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
          confirmPassword: confirmPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setChangeError(data.error || "មិនអាចផ្លាស់ប្តូរពាក្យសម្ងាត់បានទេ");
        return;
      }

      // Success: Proceed to requested destination
      router.push(fromPath);
      router.refresh();
    } catch {
      setChangeError("បញ្ហាតភ្ជាប់ម៉ាស៊ីនមេ");
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
    <div className="auth-gate-page text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200 font-khmer">
      {/* 1. Background Cybernetic Grid, Circuit Lines & Animated Formulas */}
      <div className="auth-gate-background" aria-hidden="true">
        {/* Ambient Radial Glows (restrained navy, cyan, violet and emerald) */}
        <div className="absolute -top-40 left-1/4 h-[540px] w-[540px] rounded-full bg-cyan-500/10 blur-[150px]" />
        <div className="absolute -bottom-40 right-1/4 h-[500px] w-[580px] rounded-full bg-indigo-600/10 blur-[160px]" />
        <div className="absolute top-1/3 right-1/12 h-[380px] w-[380px] rounded-full bg-emerald-500/5 blur-[140px]" />

        {/* Perspective Cyber Grid Floor */}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-[linear-gradient(rgba(56,189,248,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.04)_1px,transparent_1px)] bg-[size:44px_44px] [transform:perspective(500px)_rotateX(60deg)] [transform-origin:bottom_center] [mask-image:linear-gradient(to_top,rgba(0,0,0,0.85),transparent)]" />

        {/* Concentric Geometric Rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[780px] h-[780px] rounded-full border border-cyan-500/8" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] rounded-full border border-dashed border-indigo-400/10" />

        {/* Horizontal Formula Streams (Left-to-Right and Right-to-Left) */}
        {/* Stream 1: Top (Right to Left) */}
        <div className="absolute top-8 left-0 right-0 overflow-hidden opacity-[0.16] text-cyan-300/80 font-mono text-[12px] tracking-wider select-none">
          <div className="animate-formula-rtl">
            {"∫ e^(-x²) dx = √π      ∇ × B = μ₀J      e^(iπ) + 1 = 0      ∑ 1/n² = π²/6      HΨ = EΨ      lim(x→0) sin(x)/x = 1      ∮ B·dl = μ₀I      ∫ e^(-x²) dx = √π      ∇ × B = μ₀J"}
          </div>
        </div>

        {/* Stream 2: Mid-Lower (Left to Right) */}
        <div className="absolute top-2/3 left-0 right-0 overflow-hidden opacity-[0.14] text-sky-300/70 font-mono text-[11px] tracking-widest select-none">
          <div className="animate-formula-ltr">
            {"f(x) = ∑ aₙ(x - c)ⁿ      det(A - λI) = 0      ∂u/∂t = α∇²u      ∫∫∫_V (∇·F) dV = ∯_S (F·n) dS      x = (-b ± √(b² - 4ac)) / 2a      f(x) = ∑ aₙ(x - c)ⁿ"}
          </div>
        </div>

        {/* Stream 3: Bottom (Right to Left) */}
        <div className="absolute bottom-6 left-0 right-0 overflow-hidden opacity-[0.12] text-indigo-300/70 font-mono text-[11px] tracking-widest select-none">
          <div className="animate-formula-rtl">
            {"π ≈ 3.14159265      φ = (1 + √5)/2      i² = -1      Γ(n) = (n - 1)!      ζ(s) = ∑ 1/nˢ      λ = h/p      E = mc²      π ≈ 3.14159265"}
          </div>
        </div>
      </div>

      {/* 2. Main Content Container (Desktop Two-Column, Mobile Centered) */}
      <main className="auth-gate-content">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
          
          {/* Left Column (Desktop): Brand Identity & Welcome Overview */}
          <section className="lg:col-span-7 flex flex-col justify-center text-center lg:text-left space-y-6">
            {/* Parent Ecosystem Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-[11px] font-mono tracking-widest text-cyan-300 uppercase mx-auto lg:mx-0 w-fit">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
              </span>
              <span>DYT ECOSYSTEM</span>
            </div>

            {/* Primary System Name & Title */}
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl xl:text-5xl font-black tracking-tight text-white leading-tight">
                PLP MATH CONTENT
              </h1>
              <p className="text-base sm:text-lg font-medium text-cyan-300/90 tracking-wide font-khmer">
                ការចូលប្រើប្រាស់ប្រព័ន្ធមានសុវត្ថិភាព
                <span className="hidden sm:inline text-slate-500 font-mono text-sm mx-2">·</span>
                <span className="hidden sm:inline text-xs font-mono uppercase tracking-wider text-slate-400 font-normal">
                  Secure Workspace Access
                </span>
              </p>
            </div>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto lg:mx-0 font-khmer">
              A focused workspace for Khmer mathematics and intelligent learning tools.
            </p>

            {/* Supporting Feature Highlights (Desktop only, uncluttered) */}
            <div className="hidden lg:grid grid-cols-1 gap-3 pt-2 max-w-lg">
              <div className="flex items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-3.5 py-2.5 backdrop-blur-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-xs">
                  <div className="font-semibold text-slate-200 font-khmer">Khmer Math OCR & LaTeX Formulation</div>
                  <div className="text-slate-400 text-[11px]">Precision formula transcription and visual rendering</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-3.5 py-2.5 backdrop-blur-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 shrink-0">
                  <Layers className="h-4 w-4" />
                </div>
                <div className="text-xs">
                  <div className="font-semibold text-slate-200 font-khmer">Intelligent Vision & Enhancement Tools</div>
                  <div className="text-slate-400 text-[11px]">HD resolution processing and document isolation</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-3.5 py-2.5 backdrop-blur-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="text-xs">
                  <div className="font-semibold text-slate-200 font-khmer">Role-Based Access & Workspace Security</div>
                  <div className="text-slate-400 text-[11px]">Protected session verification and distributed rate limits</div>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Refined Transparent Glass Login Card */}
          <section className="lg:col-span-5 relative flex justify-center">
            {/* Animated Abstract Human Silhouette Layer (Desktop Only) */}
            <AbstractHumanSilhouette />

            {/* Transparent Glass Panel */}
            <div className="login-glass-card relative z-10 w-full max-w-[440px]">
              
              {/* Card Header */}
              <div className="space-y-2 mb-6 text-center lg:text-left">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-cyan-500/25 bg-cyan-950/40 text-[10px] font-mono tracking-wider text-cyan-300 uppercase">
                  <span>DYT ECOSYSTEM</span>
                </div>
                
                <h2 className="text-2xl font-black tracking-tight text-white">
                  {mustChangePassword ? "ផ្លាស់ប្តូរពាក្យសម្ងាត់" : "PLP MATH CONTENT"}
                </h2>

                <p className="text-xs text-slate-300 leading-relaxed font-khmer">
                  {mustChangePassword
                    ? "សូមកំណត់ពាក្យសម្ងាត់ផ្ទាល់ខ្លួនថ្មី (Set your permanent password)"
                    : "A focused workspace for Khmer mathematics and intelligent learning tools."}
                </p>
              </div>

              {/* Lockout HUD Banner */}
              {isLocked && (
                <div
                  role="alert"
                  className="mb-5 rounded-xl border border-amber-500/50 bg-amber-950/60 p-4 text-xs text-amber-200 shadow-[0_0_25px_rgba(245,158,11,0.2)] transition-all font-khmer"
                >
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                    <div className="space-y-1.5 flex-1">
                      <p className="font-bold text-amber-300 text-sm">
                        ការចូលប្រើត្រូវបានផ្អាកជាបណ្តោះអាសន្ន។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។
                      </p>
                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-amber-300/80 uppercase">
                          Retry In:
                        </span>
                        <span className="text-base font-mono font-bold text-amber-300 tracking-widest bg-amber-950/90 border border-amber-500/50 px-3 py-1 rounded-lg">
                          {formatCountdown(retryAfterSeconds)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message Area (Consistent Height to Prevent Layout Shift) */}
              {error && !isLocked && !mustChangePassword && (
                <div
                  role="alert"
                  className="animate-error-shake mb-5 flex items-center gap-2.5 rounded-xl border border-rose-500/50 bg-rose-950/60 p-3 text-xs text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.18)] font-khmer"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <p className="font-medium leading-relaxed">{error}</p>
                </div>
              )}

              {/* Force Password Change View (First-Login Flow) */}
              {mustChangePassword ? (
                <form onSubmit={handleForceChangePassword} className="space-y-4">
                  {changeError && (
                    <div className="rounded-xl border border-rose-500/50 bg-rose-950/60 p-3 text-xs text-rose-200 font-khmer">
                      {changeError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-200 font-khmer">
                      Password · ពាក្យសម្ងាត់
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="ពាក្យសម្ងាត់ (យ៉ាងហោចណាស់ ៤ តួអក្សរ)"
                      required
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-200 font-khmer">
                      Confirm Password · បញ្ជាក់ពាក្យសម្ងាត់
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="បញ្ជាក់ពាក្យសម្ងាត់"
                      required
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={changingPassword || !newPassword || !confirmPassword}
                    className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-3.5 text-sm font-bold text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:brightness-110 disabled:opacity-50 transition-all font-khmer"
                  >
                    {changingPassword ? "កំពុងរក្សាទុក..." : "Save (រក្សាទុក)"}
                  </button>
                </form>
              ) : (
                /* Standard Login Form */
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Name / Username Input */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-name"
                      className="flex items-center gap-1.5 text-xs sm:text-[13px] font-semibold text-slate-200 font-khmer"
                    >
                      <User className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                      <span>Name · ឈ្មោះអ្នកប្រើប្រាស់</span>
                    </label>

                    <input
                      ref={identifierInputRef}
                      id="login-name"
                      data-testid="login-username-input"
                      type="text"
                      name="usernameOrEmail"
                      value={usernameOrEmail}
                      onChange={(e) => setUsernameOrEmail(e.target.value)}
                      disabled={loading || isLocked}
                      placeholder="ឈ្មោះអ្នកប្រើប្រាស់ (Name, e.g. user1, dayuth, admin)"
                      autoComplete="username"
                      autoFocus
                      aria-label="Name"
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] font-khmer"
                    />
                  </div>

                  {/* Password Input */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-password"
                      className="flex items-center gap-1.5 text-xs sm:text-[13px] font-semibold text-slate-200 font-khmer"
                    >
                      <Lock className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                      <span>Password · ពាក្យសម្ងាត់</span>
                    </label>

                    <div className="relative">
                      <input
                        ref={passwordInputRef}
                        id="login-password"
                        data-testid="login-password-input"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading || isLocked}
                        placeholder="បញ្ចូលពាក្យសម្ងាត់"
                        autoComplete="current-password"
                        required
                        aria-label="Password"
                        className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-mono shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] font-khmer"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading || isLocked}
                        tabIndex={0}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    data-testid="login-submit-btn"
                    disabled={loading || isLocked || !password.trim()}
                    className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_0_25px_rgba(0,240,255,0.22)] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none transition-all mt-4 font-khmer cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden="true" />
                        <span>កំពុងផ្ទៀងផ្ទាត់...</span>
                      </>
                    ) : isLocked ? (
                      <>
                        <Clock className="h-4 w-4 text-amber-300" aria-hidden="true" />
                        <span>ចាក់សោ ({formatCountdown(retryAfterSeconds)})</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                        <span>ចូលប្រើប្រព័ន្ធ</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Exact Khmer Helper Text below the Form */}
              <div className="mt-6 pt-4 border-t border-slate-800/80 text-center space-y-2">
                <p className="text-xs text-slate-400 font-khmer leading-relaxed select-none">
                  សម្រាប់ការបង្កើតគណនីយ សូមទាក់ទងអ្នកគ្រប់គ្រង
                </p>
                <div className="pt-1">
                  <Link
                    href="/admin/recovery"
                    className="text-[11px] text-cyan-400/70 hover:text-cyan-300 font-mono transition-colors"
                  >
                    ត្រូវការសង្គ្រោះគណនី Admin? (Admin Recovery)
                  </Link>
                </div>
              </div>

            </div>
          </section>

        </div>
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
