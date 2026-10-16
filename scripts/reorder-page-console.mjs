import fs from 'fs';

const filePath = 'src/app/bg-remover/page.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// Find boundaries of left console
const startMarker = '{/* ── LEFT: Control Deck & Tactical Switches ── */}';
const endMarker = '{/* ── RIGHT: Preview & Interactive Mask Studio Deck ── */}';

const sIdx = code.indexOf(startMarker);
const eIdx = code.indexOf(endMarker);

if (sIdx === -1 || eIdx === -1) {
  console.error('Markers not found!');
  process.exit(1);
}

const newLeftConsole = `{/* ── LEFT: Control Deck & Tactical Switches ── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* Accessible Screen Reader Status Announcement */}
          <div role="status" aria-live="polite" className="sr-only">
            {isProcessing ? "កំពុងដំណើរការកាត់រូបភាព..." : cachedResult ? "ដំណើរការកាត់រូបភាពរួចរាល់" : error ? \`កំហុស: \${error}\` : "ត្រៀមរួចរាល់"}
          </div>

          <div className="rounded-none border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xs font-bold tracking-wider text-slate-200">
                {"// SEGMENTATION_CONFIG"}
              </h2>
              <span className="text-[10px] text-cyan-400 font-semibold font-mono">MODULE 02</span>
            </div>

            {/* ── ជំហានទី ១ ៖ ជ្រើសរើសរូបភាព (STEP 1: UPLOAD IMAGE) ── */}
            <div>
              <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider mb-1.5">
                <span>ជំហានទី ១ ៖ ជ្រើសរើសរូបភាព</span>
                <span className="text-cyan-400 font-bold">SOURCE_IMAGE</span>
              </div>
              <BgUploadZone
                onFileSelect={handleFileSelect}
                selectedFile={imageFile}
                disabled={isProcessing}
                label="SOURCE INPUT"
                hint="PNG · JPG · WEBP (MAX 12MB)"
              />
            </div>

            {/* ── ជំហានទី ២ ៖ ជ្រើសរើសប្រភេទរូបភាពដែលចង់បាន (STEP 2: OUTPUT PURPOSE) ── */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider">
                <span>ជំហានទី ២ ៖ ប្រភេទរូបភាព</span>
                <span className="text-cyan-400 font-bold">PURPOSE</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    cyberAudio.playClick();
                    setSelectedPurpose("white");
                  }}
                  className={\`min-h-[44px] flex flex-col items-center justify-center p-2 rounded-none border text-center transition-all \${
                    selectedPurpose === "white"
                      ? "border-cyan-400 bg-cyan-950/60 text-white font-bold ring-1 ring-cyan-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                  }\`}
                >
                  <span className="h-2.5 w-2.5 bg-white border border-slate-400 mb-1" />
                  <span className="text-[11px] leading-tight font-bold text-white">រូបសំណួរ (ស)</span>
                  <span className="text-[9px] text-slate-400 font-mono">#FFFFFF</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    cyberAudio.playClick();
                    setSelectedPurpose("pink");
                  }}
                  className={\`min-h-[44px] flex flex-col items-center justify-center p-2 rounded-none border text-center transition-all \${
                    selectedPurpose === "pink"
                      ? "border-pink-400 bg-pink-950/60 text-white font-bold ring-1 ring-pink-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                  }\`}
                >
                  <span className="h-2.5 w-2.5 border border-pink-400 mb-1" style={{ backgroundColor: "#FFF0F5" }} />
                  <span className="text-[11px] leading-tight font-bold text-white">ដំណោះស្រាយ</span>
                  <span className="text-[9px] text-pink-300 font-mono">#FFF0F5</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    cyberAudio.playClick();
                    setSelectedPurpose("transparent");
                  }}
                  className={\`min-h-[44px] flex flex-col items-center justify-center p-2 rounded-none border text-center transition-all \${
                    selectedPurpose === "transparent"
                      ? "border-indigo-400 bg-indigo-950/60 text-white font-bold ring-1 ring-indigo-400/40"
                      : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                  }\`}
                >
                  <span className="text-[11px] mb-0.5">🏁</span>
                  <span className="text-[11px] leading-tight font-bold text-white">រូបថ្លា</span>
                  <span className="text-[9px] text-indigo-300 font-mono">PNG Alpha</span>
                </button>
              </div>
            </div>

            {/* ── ជំហានទី ៣ ៖ ដំណើរការកាត់រូបភាព (STEP 3: PROCESS EXECUTION) ── */}
            <div className="space-y-2 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[11px] uppercase text-slate-300 font-mono tracking-wider">
                <span>ជំហានទី ៣ ៖ ដំណើរការ AI</span>
                <span className="text-cyan-400 font-bold">EXECUTION</span>
              </div>

              {/* Primary: Fast Preview (Highlighted Default) */}
              <button
                type="button"
                onClick={() => handleRunSegmentation("preview")}
                disabled={!imageFile || isProcessing}
                className={\`min-h-[48px] group relative w-full overflow-hidden rounded-none border p-3 text-left transition-all duration-200 active:scale-[0.98] font-mono \${
                  isProcessing && processingMode === "preview"
                    ? "pointer-events-none opacity-80 border-cyan-400 bg-cyan-950/50"
                    : !imageFile
                    ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50"
                    : "border-cyan-400 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 shadow-[0_0_20px_rgba(0,240,255,0.2)] hover:border-cyan-300 ring-1 ring-cyan-400/40"
                }\`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-cyan-400 bg-slate-950 text-cyan-400">
                      <Zap className="h-4 w-4 text-cyan-400" />
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-white font-mono flex items-center gap-2">
                        <span>ដំណើរការលឿន (FAST PREVIEW)</span>
                        <span className="text-[9px] rounded-none bg-cyan-950 border border-cyan-500/40 text-cyan-300 px-1 py-0.2">
                          លំនាំដើម
                        </span>
                      </div>
                      <span className="text-[10px] text-cyan-300/80 font-mono">
                        ដំណើរការក្នុង Browser ភ្លាមៗ · ឥតគិតថ្លៃ · រក្សាភាពឯកជន
                      </span>
                    </div>
                  </div>
                  {isProcessing && processingMode === "preview" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  ) : (
                    <span className="text-[10px] font-bold text-cyan-400 font-mono">[START]</span>
                  )}
                </div>
              </button>

              {/* Secondary: Clean Cut (Optional High-Quality Enhancement) */}
              <button
                type="button"
                onClick={() => handleRunSegmentation("final")}
                disabled={!imageFile || isProcessing}
                className={\`min-h-[44px] group relative w-full overflow-hidden rounded-none border p-3 text-left transition-all duration-200 active:scale-[0.98] font-mono \${
                  isProcessing && processingMode === "final"
                    ? "pointer-events-none opacity-80 border-emerald-400 bg-emerald-950/50"
                    : !imageFile
                    ? "cursor-not-allowed opacity-40 border-slate-800 bg-slate-900/50"
                    : "border-emerald-500/40 bg-slate-900/70 hover:border-emerald-400 text-slate-200"
                }\`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-emerald-500/40 bg-slate-950 text-emerald-400">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                        កាត់ច្បាស់គុណភាពខ្ពស់ (CLEAN CUT)
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        សម្រាប់រូបភាពធំ ឬត្រូវការគែមច្បាស់ល្អិតល្អន់
                      </span>
                    </div>
                  </div>
                  {isProcessing && processingMode === "final" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-400 font-mono">[HD]</span>
                  )}
                </div>
              </button>
            </div>

            {/* Multi-Stage Loading Telemetry Banner */}
            {isProcessing && (
              <div className="space-y-2.5 rounded-none border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs shadow-[0_0_15px_rgba(245,158,11,0.15)] font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-300">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                    <span className="font-bold uppercase tracking-wider">
                      {progressInfo?.stage || "SEGMENTING FOREGROUND..."}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="min-h-[44px] flex items-center gap-1 rounded-none border border-rose-500/40 bg-rose-950/60 px-2.5 py-1 text-[10px] font-mono text-rose-300 hover:bg-rose-900/60 transition-colors uppercase"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    CANCEL
                  </button>
                </div>

                {progressInfo && (
                  <div className="space-y-2 pt-1 font-mono">
                    {/* Model Loading Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-cyan-400">
                        <span>Model Loading</span>
                        <span>
                          {progressInfo.modelLoadingPercent ??
                            (progressInfo.stage === "Loading model" ? progressInfo.percent : 100)}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-none bg-slate-800">
                        <div
                          className="h-full bg-cyan-400 transition-all duration-300"
                          style={{
                            width: \`\${
                              progressInfo.modelLoadingPercent ??
                              (progressInfo.stage === "Loading model" ? progressInfo.percent : 100)
                            }%\`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Processing / Segmentation Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-emerald-400">
                        <span>Inference &amp; Processing</span>
                        <span>
                          {progressInfo.processingPercent ??
                            (progressInfo.stage === "Segmenting" ? progressInfo.percent : 0)}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-none bg-slate-800">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-300"
                          style={{
                            width: \`\${
                              progressInfo.processingPercent ??
                              (progressInfo.stage === "Segmenting" ? progressInfo.percent : 0)
                            }%\`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {slowNotice && (
                  <div className="rounded-none border border-amber-500/30 bg-amber-950/40 p-2 text-[10px] text-amber-300 font-mono">
                    {slowNotice}
                  </div>
                )}
              </div>
            )}

            {/* ── ការកំណត់កម្រិតខ្ពស់ & Remote Worker (ADVANCED COLLAPSIBLE SECTION) ── */}
            <details className="group rounded-none border border-slate-800 bg-slate-950/60 p-3 font-mono">
              <summary className="min-h-[44px] flex items-center justify-between cursor-pointer text-xs font-bold text-slate-400 hover:text-cyan-300 select-none">
                <span className="flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-cyan-400" />
                  <span>ការកំណត់កម្រិតខ្ពស់ (ADVANCED SETTINGS)</span>
                </span>
                <span className="text-[10px] text-cyan-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>

              <div className="space-y-3 pt-3 border-t border-slate-800/80 mt-2 text-xs">
                {/* Remote Worker Status */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] uppercase text-slate-400 font-mono">
                    <span>REMOTE WORKER SERVICE</span>
                    {isWorkerConfigured ? (
                      <span className="text-emerald-400">ONLINE</span>
                    ) : (
                      <span className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5 border border-slate-700">
                        🔒 NOT CONFIGURED
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!isWorkerConfigured || isProcessing}
                    onClick={() => {
                      if (!isWorkerConfigured) {
                        setRemoteNoticeOpen(true);
                        return;
                      }
                      handleRunSegmentation("worker");
                    }}
                    className={\`min-h-[44px] w-full flex items-center justify-between border p-2 text-left transition-all \${
                      !isWorkerConfigured
                        ? "opacity-50 cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-500"
                        : "border-purple-400/60 bg-purple-950/30 text-purple-200 hover:bg-purple-950/60"
                    }\`}
                  >
                    <span className="text-[11px] font-mono">
                      {isWorkerConfigured ? "RUN REMOTE WORKER" : "Remote Worker (មិនទាន់កំណត់)"}
                    </span>
                    <Server className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                  <p className="text-[9.5px] text-slate-500 leading-relaxed font-mono">
                    {!isWorkerConfigured
                      ? "Remote Worker មិនទាន់កំណត់ក្នុង Settings។ Browser AI ដំណើរការក្នុងម៉ាស៊ីនផ្ទាល់ដោយឥតគិតថ្លៃ និងមានសុវត្ថិភាពខ្ពស់។"
                      : "សេវាកម្ម Remote Worker ត្រូវបានកំណត់ក្នុង Settings។"}
                  </p>
                </div>

                {/* Manual Mask Mode Launcher */}
                <div className="pt-2 border-t border-slate-800/60">
                  <button
                    type="button"
                    onClick={handleOpenManualMode}
                    disabled={!imageFile || isProcessing}
                    className="min-h-[44px] w-full flex items-center justify-center gap-1.5 rounded-none border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white hover:border-cyan-400 transition-colors uppercase font-mono"
                  >
                    <span>OPEN MANUAL MASK MODE (គូរម៉ាសដោយដៃ)</span>
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>

        `;

code = code.substring(0, sIdx) + newLeftConsole + code.substring(eIdx);

// Also enhance error banner with Retry at 1024px, Reset, and Dismiss
const oldErrorBanner = `<div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleRunSegmentation(processingMode)}
                  className="flex items-center gap-1.5 rounded-none border border-rose-500/50 bg-rose-900/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-900/70 transition-colors uppercase"
                >
                  <RefreshCw className="h-3 w-3" />
                  RETRY
                </button>
                <button
                  type="button"
                  onClick={handleOpenManualMode}
                  className="flex items-center gap-1.5 rounded-none border border-cyan-500/50 bg-cyan-950/60 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-900/60 transition-colors shadow-[0_0_12px_rgba(0,240,255,0.2)] uppercase"
                >
                  <span>OPEN MANUAL MASK MODE</span>
                </button>
              </div>`;

const newErrorBanner = `<div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleRunSegmentation(processingMode)}
                  className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-rose-500/50 bg-rose-900/60 px-3 py-2 text-xs font-bold text-white hover:bg-rose-900/90 transition-colors uppercase font-mono"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>ព្យាយាមម្តងទៀត (RETRY)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRunSegmentation("preview", 1024)}
                  className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-cyan-500/50 bg-cyan-950/60 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-900/70 transition-colors uppercase font-mono"
                >
                  <Zap className="h-3.5 w-3.5 text-cyan-400" />
                  <span>កម្រិត 1024PX (RETRY AT 1024PX)</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white transition-colors uppercase font-mono"
                >
                  <span>កំណត់ឡើងវិញ (RESET)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="min-h-[44px] flex items-center gap-1 rounded-none border border-slate-800 bg-slate-950 px-2.5 py-2 text-xs text-slate-400 hover:text-white transition-colors uppercase font-mono"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>បិទសារ</span>
                </button>
              </div>`;

code = code.replace(oldErrorBanner, newErrorBanner);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully reorganized left console in page.tsx!');
