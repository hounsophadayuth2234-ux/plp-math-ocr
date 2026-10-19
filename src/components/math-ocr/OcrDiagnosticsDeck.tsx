"use client";

import React, { useState } from "react";
import {
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Edit2,
  Save,
  Check,
} from "lucide-react";
import {
  OcrRuntimeCapabilities,
  OcrStageTimings,
} from "@/lib/ocr-runtime-manager";
import { ImageQualityAssessment, OcrRegionResult } from "@/lib/math-image-analyzer";
import { MathematicalSyntaxValidation } from "@/lib/khmer-grapheme-normalizer";

interface OcrDiagnosticsDeckProps {
  capabilities?: OcrRuntimeCapabilities;
  timings?: OcrStageTimings;
  quality?: ImageQualityAssessment;
  syntax?: MathematicalSyntaxValidation;
  regions?: OcrRegionResult[];
  onUpdateTranscription?: (newText: string) => void;
  rawTranscription?: string;
  onRetryLowConfidence?: () => void;
  inferenceProvider?: string;
}

export function OcrDiagnosticsDeck({
  capabilities,
  timings,
  quality,
  syntax,
  regions,
  onUpdateTranscription,
  rawTranscription,
  onRetryLowConfidence,
  inferenceProvider = "Serverless Gemini Vision (gemini-flash-lite-latest)",
}: OcrDiagnosticsDeckProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(rawTranscription || "");
  const [saveToast, setSaveToast] = useState(false);

  const handleSaveEdit = () => {
    if (onUpdateTranscription) {
      onUpdateTranscription(editText);
      setIsEditing(false);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    }
  };

  return (
    <details
      data-testid="ocr-diagnostics-deck"
      className="cyber-glass-panel relative z-10 group border border-cyan-500/30 p-3 sm:p-4 font-mono text-xs transition-all duration-200 shadow-[0_10px_35px_rgba(0,0,0,0.6)]"
    >
      <summary className="cursor-pointer text-xs font-bold text-slate-300 hover:text-cyan-300 select-none flex items-center justify-between min-h-[44px]">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span className="uppercase tracking-wider font-bold">
            Runtime & Structure Diagnostics // ប្រព័ន្ធវិនិច្ឆ័យ
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">
            Execution Provider · Quality · Syntax · Timings
          </span>
          <ChevronDown className="h-4 w-4 text-cyan-400 group-open:rotate-180 transition-transform" />
        </div>
      </summary>

      <div className="pt-4 border-t border-slate-800/80 mt-2 space-y-4">
        {/* 2-Column Responsive Diagnostics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Browser Runtime & Execution Provider */}
          <div className="border border-slate-850 bg-slate-900/50 p-3 space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Cpu className="h-4 w-4 text-cyan-400 shrink-0" />
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">
                Execution Provider & Browser Runtime
              </h4>
            </div>

            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">Inference Provider:</span>
                <span className="font-bold px-1.5 py-0.5 bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 truncate max-w-[60%]">
                  {inferenceProvider}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">Client Preprocessing:</span>
                <span className="text-emerald-400 font-bold">
                  Browser Web Worker (Local)
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">WASM SIMD Capability:</span>
                <span className={`font-bold ${capabilities?.wasmSimd ? "text-emerald-400" : "text-slate-400"}`}>
                  {capabilities?.wasmSimd ? "Available (Hardware Accelerated)" : "Unavailable / CPU"}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">WebGPU Capability:</span>
                <span className={capabilities?.webGpuAvailable ? "text-emerald-400 font-bold" : "text-slate-400"}>
                  {capabilities?.webGpuAvailable ? "Detected" : "Not Present / Software"}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">Cross-Origin Isolated:</span>
                <span className={capabilities?.crossOriginIsolated ? "text-emerald-400 font-bold" : "text-amber-400"}>
                  {capabilities?.crossOriginIsolated ? "True" : "False (COOP/COEP disabled)"}
                </span>
              </div>

              <div className="border-t border-slate-900 pt-1 text-[9.5px] text-slate-400 leading-tight">
                ℹ️ Image decode, quality assessment, and region cropping run locally in browser worker. Full multimodal Khmer + Math transcription executes via high-speed serverless engine.
              </div>
            </div>
          </div>

          {/* Card 2: Image Quality Assessment */}
          <div className="border border-slate-850 bg-slate-900/50 p-3 space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Activity className="h-4 w-4 text-amber-400 shrink-0" />
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">
                Image Quality & Optical Telemetry
              </h4>
            </div>

            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">Sharpness / Blur Score:</span>
                <span className={`font-bold ${quality?.isBlurry ? "text-rose-400" : "text-emerald-400"}`}>
                  {quality ? `${quality.blurScore} (Laplacian)` : "Assessed in worker"}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">RMS Contrast:</span>
                <span className={`font-bold ${quality?.isLowContrast ? "text-amber-400" : "text-emerald-400"}`}>
                  {quality ? `${quality.contrastScore}%` : "Normal"}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">Mean Brightness:</span>
                <span className="text-slate-300">
                  {quality ? `${quality.brightnessScore} / 255` : "Optimal"}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 uppercase text-[9px]">Text Region Detected:</span>
                <span className="text-emerald-400 font-bold">
                  {quality?.hasUsableTextRegion !== false ? "Yes (Valid Strokes)" : "Weak Region"}
                </span>
              </div>

              {quality?.warningMessage && (
                <div className="text-[9.5px] text-amber-300 border-t border-slate-900 pt-1 leading-snug">
                  {quality.warningMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Mathematical Structure & Syntax Validation */}
        {syntax && (
          <div className="border border-slate-850 bg-slate-900/50 p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                {syntax.valid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">
                  Mathematical Syntax & Structure Verification
                </h4>
              </div>
              <span
                className={`text-[9.5px] font-bold px-2 py-0.5 border ${
                  syntax.valid
                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                    : "bg-amber-950/80 text-amber-300 border-amber-500/40"
                }`}
              >
                {syntax.valid ? "PASSED VALIDATION" : "SYNTAX WARNINGS"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className={`h-1.5 w-1.5 rounded-full ${syntax.balancedParentheses ? "bg-emerald-400" : "bg-rose-400"}`} />
                <span>Parentheses: {syntax.balancedParentheses ? "Balanced" : "Unbalanced"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className={`h-1.5 w-1.5 rounded-full ${syntax.balancedBraces ? "bg-emerald-400" : "bg-rose-400"}`} />
                <span>LaTeX Braces: {syntax.balancedBraces ? "Balanced" : "Unbalanced"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className={`h-1.5 w-1.5 rounded-full ${syntax.validFractions ? "bg-emerald-400" : "bg-rose-400"}`} />
                <span>Fractions (\frac): {syntax.validFractions ? "Valid" : "Malformed"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className={`h-1.5 w-1.5 rounded-full ${syntax.validScripts ? "bg-emerald-400" : "bg-rose-400"}`} />
                <span>Scripts (^ / _): {syntax.validScripts ? "Valid" : "Warning"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className={`h-1.5 w-1.5 rounded-full ${syntax.validRadicals ? "bg-emerald-400" : "bg-rose-400"}`} />
                <span>Radicals (\sqrt): {syntax.validRadicals ? "Valid" : "Malformed"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className={`h-1.5 w-1.5 rounded-full ${syntax.mathmlValid ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span>MathML XML: {syntax.mathmlValid ? "Well-Formed" : "Check Tags"}</span>
              </div>
            </div>

            {syntax.errors.length > 0 && (
              <div className="p-2 bg-rose-950/60 border border-rose-500/30 text-rose-300 text-[10px] space-y-1">
                {syntax.errors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Card 4: Stage Timings Breakdown */}
        {timings && (
          <div className="border border-slate-850 bg-slate-900/50 p-3 space-y-1.5 text-[10px]">
            <div className="text-[9.5px] font-bold uppercase text-slate-400 pb-1 border-b border-slate-800 flex justify-between">
              <span>Stage Duration Telemetry (performance.now)</span>
              <span className="text-cyan-400">Total: {timings.totalMs} ms</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300 pt-1">
              <div>Decode: <span className="text-cyan-300 font-bold">{timings.decodeMs} ms</span></div>
              <div>Preprocess: <span className="text-cyan-300 font-bold">{timings.preprocessMs} ms</span></div>
              <div>AI Inference: <span className="text-cyan-300 font-bold">{timings.inferenceMs} ms</span></div>
              <div>Postprocess: <span className="text-cyan-300 font-bold">{timings.postprocessMs} ms</span></div>
            </div>
            {timings.takingLongerThanUsual && (
              <div className="text-[9.5px] text-amber-300 pt-1">
                Notice: Pipeline took longer than 20s due to complex structure or cold-start asset fetch.
              </div>
            )}
          </div>
        )}

        {/* Card 5: User Correction & Region Confidence */}
        <div className="border border-slate-850 bg-slate-900/50 p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-cyan-400 shrink-0" />
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">
                Region Confidence & Correction // ការផ្ទៀងផ្ទាត់
              </h4>
            </div>
            {onRetryLowConfidence && (
              <button
                type="button"
                onClick={onRetryLowConfidence}
                className="inline-flex items-center gap-1 border border-cyan-500/50 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 px-2 py-0.5 text-[9.5px] uppercase font-bold transition-colors"
              >
                <span>⚡ Re-run Low-Confidence Khmer</span>
              </button>
            )}
          </div>

          {/* Region-by-Region Breakdown */}
          {regions && regions.length > 0 && (
            <div className="space-y-1.5 border-b border-slate-800 pb-2">
              <div className="text-[9px] text-slate-400 uppercase font-bold">
                Recognized Regions ({regions.length}):
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {regions.map((reg, idx) => (
                  <div
                    key={reg.regionId || idx}
                    className="flex items-center justify-between text-[10px] bg-slate-950/60 border border-slate-800/80 px-2 py-1 gap-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`px-1 py-0.2 text-[8.5px] font-bold uppercase rounded ${
                        reg.kind === "khmer_text"
                          ? "bg-purple-950 text-purple-300 border border-purple-500/40"
                          : reg.kind === "formula"
                          ? "bg-indigo-950 text-indigo-300 border border-indigo-500/40"
                          : "bg-cyan-950 text-cyan-300 border border-cyan-500/40"
                      }`}>
                        {reg.kind === "khmer_text" ? "Khmer Text" : reg.kind === "formula" ? "Formula" : "Other"}
                      </span>
                      <span className="text-slate-300 truncate max-w-[220px]">
                        {reg.normalizedText || reg.rawText}
                      </span>
                    </div>
                    <span className={`font-bold shrink-0 ${
                      reg.confidence >= 0.90 ? "text-emerald-400" : "text-amber-400"
                    }`}>
                      {Math.round(reg.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-400">
            You can directly edit the recognized transcription below. Edits are preserved and will not be overwritten by downstream re-renders.
          </p>

          {isEditing ? (
            <div className="space-y-2 pt-1">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-cyan-500/50 p-2 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="inline-flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 text-xs font-bold rounded-none"
                >
                  <Save className="h-3 w-3" />
                  <span>Apply Correction</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 text-xs rounded-none"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-1">
              <div className="text-[10.5px] text-slate-300 font-mono truncate max-w-[80%]">
                {rawTranscription || "No active transcription"}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditText(rawTranscription || "");
                  setIsEditing(true);
                }}
                className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 uppercase font-bold"
              >
                <Edit2 className="h-3 w-3" />
                <span>Edit</span>
              </button>
            </div>
          )}

          {saveToast && (
            <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 pt-1">
              <Check className="h-3 w-3" />
              <span>Correction applied and preserved.</span>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
