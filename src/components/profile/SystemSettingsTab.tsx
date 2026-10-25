"use client";

import React, { useState, useEffect } from "react";
import {
  KeyRound,
  Check,
  Save,
  ExternalLink,
  AlertCircle,
  Info,
  RefreshCw,
  Sliders,
  Cpu,
  Layers,
  Sparkles,
} from "lucide-react";

export function SystemSettingsTab() {
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
    dualApi?: { primaryConfigured: boolean; secondaryConfigured: boolean; statusMessage: string };
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.rembgSpaceUrl) setRembgSpaceUrl(data.rembgSpaceUrl);
        if (data.upscalerWorkerUrl) setUpscalerWorkerUrl(data.upscalerWorkerUrl);
        if (data.imageWorkerUrl) setImageWorkerUrl(data.imageWorkerUrl);
      }
    } catch (e) {
      console.warn("Could not load system settings status:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

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
        throw new Error(data.error || "Failed to update system settings.");
      }

      if (data.isProduction) {
        setNotice(data.message);
      } else {
        setSaveSuccess(true);
      }

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
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Header Banner */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders className="h-5 w-5 text-amber-400" />
            <span>ការកំណត់ប្រព័ន្ធ និង AI Endpoints (System Settings)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            គ្រប់គ្រង API Keys, Cloud Model Tokens និង Local Microservice Workers។ សិទ្ធិនេះអនុញ្ញាតតែ SUPER_ADMIN ប៉ុណ្ណោះ។
          </p>
        </div>
        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-300 hover:text-white text-xs font-mono transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-amber-400" : ""}`} />
          <span>Reload Status</span>
        </button>
      </div>

      {status?.isProduction && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200 backdrop-blur-md">
          <Info className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-amber-300">
              ប្រព័ន្ធកំពុងដំណើរការលើ Vercel Production Environment
            </div>
            <div className="text-[11px] text-amber-200/80 leading-relaxed font-sans">
              នៅលើ Vercel Production ការកែប្រែ Environment Variables តម្រូវឱ្យចូលកំណត់ក្នុងផ្ទាំង <strong>Vercel Project Settings &gt; Environment Variables</strong> រួចធ្វើ Redeployment ដើម្បីឱ្យមានប្រសិទ្ធភាពយូរអង្វែង។
            </div>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-300 backdrop-blur-md animate-in fade-in">
          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>ការកំណត់ត្រូវបានរក្សាទុកដោយជោគជ័យទៅក្នុង .env.local!</span>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-blue-500/40 bg-blue-950/30 px-4 py-3 text-xs text-blue-200 backdrop-blur-md">
          <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
          <span className="leading-relaxed">{notice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-300 backdrop-blur-md">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 1: AI Cloud API Keys */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-cyan-400" />
              <span>AI Cloud Providers &amp; Tokens</span>
            </h3>

            {/* Gemini Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 font-sans">
                  Google Gemini API Key
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-sans"
                >
                  <span>Get Free Key</span> <ExternalLink className="h-3 w-3" />
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
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-400 font-sans">
                ប្រើប្រាស់សម្រាប់ Module 01 (Math OCR), Module 04 (Khmer Solver) និង Lesson Studio។
              </p>
            </div>

            {/* Replicate API Token */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 font-sans">
                  Replicate API Token (Cloud GPU Fallback)
                </label>
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-sans"
                >
                  <span>Get Token</span> <ExternalLink className="h-3 w-3" />
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
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-400 font-sans">
                សម្រាប់ Cloud Fallback លើ Real-ESRGAN 4x Upscale និង Flux Schnell Text-to-Image។
              </p>
            </div>

            {/* Hugging Face Token */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 font-sans">
                  Hugging Face Access Token (HF Space)
                </label>
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 font-sans"
                >
                  <span>Get Token</span> <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <input
                type="password"
                placeholder={
                  status?.huggingFaceKeySet
                    ? `Configured (${status.huggingFaceMasked})`
                    : "hf_..."
                }
                value={huggingFaceKey}
                onChange={(e) => setHuggingFaceKey(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-400 font-sans">
                ប្រើប្រសិនបើរៀបចំ Hugging Face Space ជា Private Space។
              </p>
            </div>

            {/* remove.bg Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 font-sans">
                  remove.bg API Key (Cloud Fallback)
                </label>
                <a
                  href="https://www.remove.bg/api"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-sans"
                >
                  <span>Get Key</span> <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <input
                type="password"
                placeholder={
                  status?.removeBgKeySet
                    ? `Configured (${status.removeBgMasked})`
                    : "rmbg_..."
                }
                value={removeBgKey}
                onChange={(e) => setRemoveBgKey(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-400 font-sans">
                ជម្រើសបម្រុងសម្រាប់ Canvas Background Remover។
              </p>
            </div>
          </div>

          {/* Section 2: Local & Dedicated Worker Endpoints */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-400" />
              <span>Microservices &amp; Dedicated Workers</span>
            </h3>

            {/* Module 02 Worker */}
            <div className="space-y-1.5 rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 font-sans">
                  Module 02: Python Rembg Microservice URL
                </label>
                <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300 font-mono">
                  FASTAPI
                </span>
              </div>
              <input
                type="text"
                placeholder={
                  status?.rembgSpaceUrlSet
                    ? status.rembgSpaceUrl || "Configured"
                    : "https://rembg-worker-vercel.vercel.app"
                }
                value={rembgSpaceUrl}
                onChange={(e) => setRembgSpaceUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-400 font-sans">
                ដំណើរការ rembg service លើ external worker។ Browser In-Memory AI អាចដំណើរការដោយសេរីដោយមិនបាច់មាន Worker។
              </p>
            </div>

            {/* Module 03 Upscaler Worker */}
            <div className="space-y-1.5 rounded-xl border border-amber-500/20 bg-amber-950/10 p-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 font-sans">
                  Module 03: Upscaler Worker URL (Real-ESRGAN)
                </label>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 font-mono">
                  UPSCALER
                </span>
              </div>
              <input
                type="text"
                placeholder={
                  status?.upscalerWorkerUrlSet
                    ? status.upscalerWorkerUrl || "Configured"
                    : "http://localhost:8188"
                }
                value={upscalerWorkerUrl}
                onChange={(e) => setUpscalerWorkerUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-400 font-sans">
                Local ComfyUI ឬ Real-ESRGAN backend សម្រាប់បង្កើនគុណភាពរូបភាព 4x HD។
              </p>
            </div>

            {/* Module 04 Image Worker */}
            <div className="space-y-1.5 rounded-xl border border-pink-500/20 bg-pink-950/10 p-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 font-sans">
                  Module 04: Local Image Generation Worker URL
                </label>
                <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[9px] font-bold text-pink-300 font-mono">
                  SD-WEBUI
                </span>
              </div>
              <input
                type="text"
                placeholder={
                  status?.imageWorkerUrlSet
                    ? status.imageWorkerUrl || "Configured"
                    : "http://localhost:7860"
                }
                value={imageWorkerUrl}
                onChange={(e) => setImageWorkerUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-pink-500 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-400 font-sans">
                Local Stable Diffusion / Flux worker endpoint សម្រាប់បង្កើតរូបភាព។
              </p>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>កំពុងរក្សាទុកការកំណត់...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>រក្សាទុកការកំណត់ប្រព័ន្ធ (Save Configuration)</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
