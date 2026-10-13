"use client";

import React, { useState, useEffect } from "react";
import { KeyRound, X, Check, Save, ExternalLink, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [geminiKey, setGeminiKey] = useState("");
  const [replicateToken, setReplicateToken] = useState("");
  const [removeBgKey, setRemoveBgKey] = useState("");
  const [status, setStatus] = useState<{
    geminiKeySet: boolean;
    geminiMasked: string | null;
    replicateTokenSet: boolean;
    replicateMasked: string | null;
    removeBgKeySet: boolean;
    removeBgMasked: string | null;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current status
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.warn("Could not load settings status:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setSaveSuccess(false);
      setError(null);
    }
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiKey: geminiKey || undefined,
          replicateToken: replicateToken || undefined,
          removeBgKey: removeBgKey || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update API keys.");
      }

      setSaveSuccess(true);
      setGeminiKey("");
      setReplicateToken("");
      setRemoveBgKey("");
      await fetchStatus();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">API Key Configuration</h3>
              <p className="text-[11px] text-slate-400">Manage credentials for the 4-person team</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Note */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs text-indigo-200">
            <span className="font-semibold text-white">Interactive Demo Mode Active:</span> All 5 tools can be tested immediately even without API keys! Paste your keys below whenever you want to switch to live production APIs.
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300">
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
              API keys saved successfully to .env.local!
            </div>
          )}

          {/* Gemini Key Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                1. Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
              >
                Get Free Key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <input
              type="password"
              placeholder={status?.geminiKeySet ? `Configured (${status.geminiMasked})` : "AIzaSy..."}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400">
              Powers Module 01 (Math OCR & LaTeX/Jodit HTML generation). Free tier: 1,500 req/day.
            </p>
          </div>

          {/* Replicate Token Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                2. Replicate API Token
              </label>
              <a
                href="https://replicate.com/account/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300"
              >
                Get Free Token <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <input
              type="password"
              placeholder={status?.replicateTokenSet ? `Configured (${status.replicateMasked})` : "r8_..."}
              value={replicateToken}
              onChange={(e) => setReplicateToken(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400">
              Powers Module 03 (Real-ESRGAN Upscaling) & Module 04 (Flux Schnell Text-to-Image).
            </p>
          </div>

          {/* Optional Remove.bg Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                3. Remove.bg Key (Optional)
              </label>
              <a
                href="https://www.remove.bg/api"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300"
              >
                Get Key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <input
              type="password"
              placeholder={status?.removeBgKeySet ? `Configured (${status.removeBgMasked})` : "Optional (free fallback active)"}
              value={removeBgKey}
              onChange={(e) => setRemoveBgKey(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400">
              Powers Module 02. If left empty, the built-in free cutout fallback is used.
            </p>
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
              disabled={saving || (!geminiKey && !replicateToken && !removeBgKey)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-2 text-xs font-semibold text-white shadow-lg hover:brightness-110 disabled:opacity-50 transition-all"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save Keys to .env.local"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
