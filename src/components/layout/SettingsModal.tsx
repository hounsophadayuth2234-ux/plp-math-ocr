"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  KeyRound,
  X,
  Check,
  Save,
  ExternalLink,
  AlertCircle,
  Info,
} from "lucide-react";
import { MotionSpeedControl } from "@/components/layout/MotionSpeedControl";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [geminiKey, setGeminiKey] = useState("");
  const [replicateToken, setReplicateToken] = useState("");
  const [removeBgKey, setRemoveBgKey] = useState("");
  const [huggingFaceKey, setHuggingFaceKey] = useState("");
  const [rembgSpaceUrl, setRembgSpaceUrl] = useState("");
  const [upscalerWorkerUrl, setUpscalerWorkerUrl] = useState("");
  const [imageWorkerUrl, setImageWorkerUrl] = useState("");

  const [status, setStatus] = useState<{
    isProduction?: boolean;
    geminiKeySet: boolean;
    geminiMasked: string | null;
    replicateTokenSet: boolean;
    replicateMasked: string | null;
    removeBgKeySet: boolean;
    removeBgMasked: string | null;
    huggingFaceKeySet?: boolean;
    huggingFaceMasked?: string | null;
    rembgSpaceUrlSet?: boolean;
    rembgSpaceUrl?: string | null;
    upscalerWorkerUrlSet?: boolean;
    upscalerWorkerUrl?: string | null;
    imageWorkerUrlSet?: boolean;
    imageWorkerUrl?: string | null;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch current status
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.rembgSpaceUrl) setRembgSpaceUrl(data.rembgSpaceUrl);
        if (data.upscalerWorkerUrl)
          setUpscalerWorkerUrl(data.upscalerWorkerUrl);
        if (data.imageWorkerUrl) setImageWorkerUrl(data.imageWorkerUrl);
      }
    } catch (e) {
      console.warn("Could not load settings status:", e);
    }
  };

  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
      return;
    }

    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      previousActiveElementRef.current = document.activeElement;
    }

    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) {
        fetchStatus();
        setSaveSuccess(false);
        setNotice(null);
        setError(null);
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable && focusable.length > 0) {
          focusable[0].focus();
        }
      }
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiKey: geminiKey || undefined,
          replicateToken: replicateToken || undefined,
          removeBgKey: removeBgKey || undefined,
          huggingFaceKey: huggingFaceKey || undefined,
          rembgSpaceUrl: rembgSpaceUrl || undefined,
          upscalerWorkerUrl: upscalerWorkerUrl || undefined,
          imageWorkerUrl: imageWorkerUrl || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to update settings.");
      }

      if (data.isProduction) {
        setNotice(data.message);
      } else {
        setSaveSuccess(true);
      }

      // Notify other active pages (e.g. /bg-remover) to instantly re-check worker status
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("app:settings-updated", { detail: data })
        );
      }

      setGeminiKey("");
      setReplicateToken("");
      setRemoveBgKey("");
      setHuggingFaceKey("");
      await fetchStatus();
      if (!data.isProduction) {
        setTimeout(() => setSaveSuccess(false), 3500);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm font-mono"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h3 id="settings-modal-title" className="text-sm font-bold text-white">
                SYSTEM CONFIGURATION
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">
                Manage AI endpoints, cloud tokens &amp; local workers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSave}
          className="space-y-4 p-6 overflow-y-auto text-xs"
        >
          {status?.isProduction && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">
              <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-amber-300">
                  Production Deployment (Vercel)
                </div>
                <div className="text-[11px] text-amber-200/80 leading-relaxed font-sans">
                  On Vercel, persistent configuration requires adding environment
                  variables in <strong>Vercel Project Settings &gt; Environment Variables</strong> and triggering a new deployment.
                </div>
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3.5 py-2.5 text-xs text-emerald-300">
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Settings saved successfully to .env.local!</span>
            </div>
          )}

          {notice && (
            <div className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-950/30 px-3.5 py-2.5 text-xs text-blue-200">
              <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
              <span className="leading-relaxed">{notice}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Module 02: Rembg Worker / Space URL */}
          <div className="space-y-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <span>1. Module 02 Worker URL (BACKGROUND_REMOVAL_WORKER_URL)</span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                  OPTIONAL
                </span>
              </label>
            </div>
            <input
              type="text"
              placeholder={
                status?.rembgSpaceUrlSet
                  ? status.rembgSpaceUrl || "Configured"
                  : "https://your-worker.up.railway.app or http://localhost:8000"
              }
              value={rembgSpaceUrl}
              onChange={(e) => setRembgSpaceUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 font-sans">
              Targets the external Python FastAPI + rembg worker (`/remove` &amp; `/health`). Browser AI runs locally for free without any worker.
            </p>
          </div>

          {/* Module 03: Upscaler Worker URL */}
          <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <span>2. Module 03 Local Upscaler URL</span>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-300">
                  WORKER
                </span>
              </label>
            </div>
            <input
              type="text"
              placeholder={
                status?.upscalerWorkerUrlSet
                  ? status.upscalerWorkerUrl || "Configured"
                  : "http://localhost:8188 (ComfyUI / Real-ESRGAN)"
              }
              value={upscalerWorkerUrl}
              onChange={(e) => setUpscalerWorkerUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 font-sans">
              Local worker endpoint for Real-ESRGAN super-resolution. Browser 2× mode works without any worker.
            </p>
          </div>

          {/* Module 04: Local Image Generation Worker URL */}
          <div className="space-y-1.5 rounded-xl border border-pink-500/30 bg-pink-950/20 p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <span>3. Module 04 Local Image Gen URL</span>
                <span className="rounded bg-pink-500/20 px-1.5 py-0.2 text-[9px] font-bold text-pink-300">
                  WORKER
                </span>
              </label>
            </div>
            <input
              type="text"
              placeholder={
                status?.imageWorkerUrlSet
                  ? status.imageWorkerUrl || "Configured"
                  : "http://localhost:7860 (SD-WebUI / ComfyUI)"
              }
              value={imageWorkerUrl}
              onChange={(e) => setImageWorkerUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-pink-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 font-sans">
              Local worker endpoint for text-to-image synthesis (ComfyUI / Automatic1111).
            </p>
          </div>

          {/* Replicate Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                4. Replicate API Token (Cloud Provider)
              </label>
              <a
                href="https://replicate.com/account/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-sans"
              >
                Get Token <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <input
              type="password"
              placeholder={
                status?.replicateTokenSet
                  ? `Configured (${status.replicateMasked})`
                  : "r8_..."
              }
              value={replicateToken}
              onChange={(e) => setReplicateToken(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 font-sans">
              Optional cloud GPU fallback for Real-ESRGAN and Flux Schnell.
            </p>
          </div>

          {/* Gemini Key Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                5. Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-sans"
              >
                Get Free Key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <input
              type="password"
              placeholder={
                status?.geminiKeySet
                  ? `Configured (${status.geminiMasked})`
                  : "AIzaSy..."
              }
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 font-sans">
              Powers Module 01 (Math OCR &amp; LaTeX). Usage limits and quotas depend on your Google AI Studio plan and tier.
            </p>
          </div>

          {/* Background Motion Speed Preference */}
          <div className="pt-2 border-t border-slate-800/80">
            <MotionSpeedControl compact={false} />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || Boolean(status?.isProduction)}
              title={
                status?.isProduction
                  ? "Settings are managed via Vercel Project Settings in production"
                  : "Save settings to local .env.local"
              }
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg hover:brightness-110 disabled:opacity-50 transition-all disabled:cursor-not-allowed"
            >
              <Save className="h-3.5 w-3.5" />
              {saving
                ? "Saving…"
                : status?.isProduction
                ? "Managed via Vercel (Read-Only)"
                : "Save Settings to .env.local"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
