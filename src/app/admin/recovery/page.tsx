"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  KeyRound,
  Shield,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  Lock,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";

export default function AdminRecoveryPage() {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isRecoveryEnabled, setIsRecoveryEnabled] = useState(false);
  const [isConsumed, setIsConsumed] = useState(false);
  const [targetUsername, setTargetUsername] = useState("dayuth");

  const [recoveryKey, setRecoveryKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One-time temporary password modal state
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);

  // Check server configuration status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/auth/admin-recovery");
        const data = await res.json();
        setIsRecoveryEnabled(!!data.enabled);
        setIsConsumed(!!data.consumed);
        if (data.targetUsername) setTargetUsername(data.targetUsername);
        if (data.oneTimeTemporaryPassword) {
          setTemporaryPassword(data.oneTimeTemporaryPassword);
        }
      } catch {
        setIsRecoveryEnabled(false);
      } finally {
        setCheckingStatus(false);
      }
    }
    checkStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !recoveryKey.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/admin-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recoveryKey: recoveryKey.trim(),
          targetUsername,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || "ការសង្គ្រោះគណនីបានបរាជ័យ (Recovery failed)");
      }

      // Display temporary password in protected modal
      setTemporaryPassword(data.temporaryPassword);
      setRecoveryKey(""); // Immediately clear the secret from input
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!temporaryPassword) return;
    navigator.clipboard.writeText(temporaryPassword);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleConfirmCopied = () => {
    // Wipe plain password from component memory immediately
    setTemporaryPassword(null);
    setDeliveryConfirmed(true);
  };

  return (
    <div className="relative min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-cyan-500/30">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(6,182,212,0.12),transparent_70%)] pointer-events-none" />

      <div className="relative w-full max-w-lg">
        {/* Header Branding */}
        <div className="text-center mb-6 space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3 py-1 text-xs font-mono text-cyan-300 backdrop-blur-sm shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <Shield className="h-3.5 w-3.5 text-cyan-400" />
            <span>DYT ECOSYSTEM · SECURITY PORTAL</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white font-sans">
            PLP MATH CONTENT
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Admin Account Recovery Flow · ការសង្គ្រោះគណនី Admin
          </p>
        </div>

        {/* Main Card */}
        <div className="relative rounded-2xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-cyan-950/30">
          {checkingStatus ? (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mx-auto" />
              <p className="text-xs text-slate-400 font-mono">
                កំពុងពិនិត្យស្ថានភាពសុវត្ថិភាពម៉ាស៊ីនមេ...
              </p>
            </div>
          ) : deliveryConfirmed ? (
            /* Post-Confirmation Success View */
            <div className="text-center py-6 space-y-5">
              <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-white">
                  ការសង្គ្រោះត្រូវបានបញ្ចប់ដោយជោគជ័យ
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                  One-time credential delivery confirmed. The recovery key has been consumed and invalidated.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Username:</span>
                  <span className="text-white font-bold">@{targetUsername}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Role:</span>
                  <span className="text-cyan-400 font-bold">ADMIN</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Must Change Password:</span>
                  <span className="text-amber-400 font-bold">TRUE</span>
                </div>
              </div>

              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:brightness-110 transition-all font-mono"
              >
                <span>Proceed to Login (ចូលប្រើប្រព័ន្ធ)</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : !isRecoveryEnabled ? (
            /* Recovery Disabled or Already Consumed View */
            <div className="text-center py-6 space-y-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                <Lock className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-white">
                  {isConsumed
                    ? "កូដសង្គ្រោះនេះត្រូវបានប្រើប្រាស់រួចហើយ (Recovery Key Consumed)"
                    : "មុខងារសង្គ្រោះមិនទាន់ត្រូវបានបើកដំណើរការទេ (Recovery Disabled)"}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                  {isConsumed
                    ? "The one-time recovery key has already been used and invalidated for security."
                    : "To enable recovery, the account owner must configure the ADMIN_RECOVERY_KEY environment secret in the Vercel Production dashboard."}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left space-y-2 text-[11px] font-mono text-slate-300">
                <div className="flex items-center gap-2 text-amber-300 font-bold">
                  <HelpCircle className="h-4 w-4" />
                  <span>How to enable in Vercel:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                  <li>Go to Vercel Dashboard → Project Settings</li>
                  <li>Open Environment Variables</li>
                  <li>Add Key: <code className="text-cyan-300 font-bold">ADMIN_RECOVERY_KEY</code></li>
                  <li>Enter your private secret value & Save to Production</li>
                  <li>Redeploy latest commit to activate</li>
                </ol>
              </div>

              <div className="pt-2">
                <Link
                  href="/login"
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-mono transition-colors"
                >
                  ← Back to Login (ត្រឡប់ទៅទំព័រចូល)
                </Link>
              </div>
            </div>
          ) : (
            /* Active Recovery Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase text-cyan-400 font-semibold tracking-wider">
                    Target Administrator Account
                  </div>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">
                    @{targetUsername}
                  </div>
                </div>
                <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-300 border border-indigo-500/40">
                  ADMIN
                </span>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-mono flex items-center justify-between">
                  <span>Enter Secret Recovery Key (កូដសង្គ្រោះសម្ងាត់)</span>
                  <span className="text-[10px] text-slate-400">ADMIN_RECOVERY_KEY</span>
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    placeholder="Enter the secret key configured in Vercel"
                    required
                    autoFocus
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-4 py-2.5 pr-10 text-xs font-mono text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Never share or send this secret in chat. Enter it directly here.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || !recoveryKey.trim()}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-xs font-bold font-mono text-white shadow hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>កំពុងផ្ទៀងផ្ទាត់ និងបង្កើតពាក្យសម្ងាត់...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      <span>Verify Secret & Generate Temporary Password</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="text-xs text-slate-400 hover:text-slate-300 font-mono transition-colors"
                >
                  Cancel and return to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* One-Time Temporary Password Display Modal */}
      {temporaryPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/50 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <KeyRound className="h-6 w-6" />
              <h3 className="font-bold text-base font-sans text-white">
                Temporary Password Generated · ពាក្យសម្ងាត់បណ្តោះអាសន្ន
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              ពាក្យសម្ងាត់បណ្តោះអាសន្នសម្រាប់គណនី{" "}
              <strong className="text-cyan-300 font-mono">@{targetUsername}</strong>{" "}
              ត្រូវបានបង្កើតឡើង។ សូមចម្លងទុកឥឡូវនេះ ព្រោះវានឹងមិនត្រូវបានបង្ហាញម្តងទៀតទេ (This credential is shown only once):
            </p>

            <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-950/30 p-3">
              <code className="text-sm font-mono font-bold text-amber-200 select-all tracking-wider">
                {temporaryPassword}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-900/40 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-800/60 transition-colors"
              >
                {isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 text-[11px] text-slate-400 font-mono space-y-1">
              <div>• Minimum 10 characters (satisfies enterprise policy)</div>
              <div>• mustChangePassword flag activated</div>
              <div>• Valid for immediate sign-in at /login</div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleConfirmCopied}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-xs font-bold font-mono text-slate-950 shadow hover:brightness-110 transition-all flex items-center gap-2"
              >
                <Check className="h-4 w-4" />
                <span>I have copied this password (ខ្ញុំបានចម្លងរួចរាល់)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
