import fs from 'fs';

const filePath = 'src/components/bg-remover/ColorStudio.tsx';
let code = fs.readFileSync(filePath, 'utf8');

const tComment = '{/* ── Manual Mask Refinement Studio Toolbar ── */}';
const pComment = '{/* ── Holographic Preview Deck with Transparent Checkerboard ── */}';
const dComment = '{/* ── Telemetry HUD & Download Actions ── */}';

const tIdx = code.indexOf(tComment);
const pIdx = code.indexOf(pComment);
const dIdx = code.indexOf(dComment);

if (tIdx === -1 || pIdx === -1 || dIdx === -1) {
  console.error('Markers missing:', { tIdx, pIdx, dIdx });
  process.exit(1);
}

const topPart = code.substring(0, tIdx).trimEnd();
const toolbarContent = code.substring(tIdx + tComment.length, pIdx).trim();
const previewDeck = code.substring(pIdx, dIdx).trim();

const newDownloadDeck = `{/* ── Telemetry HUD & Download Deck ── */}
      <div className="rounded-none border border-slate-800 bg-slate-900/80 p-4 space-y-3 font-mono">
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-300 border-b border-slate-800 pb-2">
          <span className="flex items-center gap-1.5">
            <span
              className={\`h-2 w-2 rounded-none \${
                activeChannel === "pink"
                  ? "bg-pink-400"
                  : activeChannel === "mask"
                  ? "bg-amber-400"
                  : activeChannel === "transparent"
                  ? "bg-indigo-400"
                  : "bg-cyan-400"
              }\`}
            />
            <span className="uppercase font-bold text-white">
              {activeChannel === "white"
                ? "រូបសំណួរ — ផ្ទៃស (#FFFFFF)"
                : activeChannel === "pink"
                ? "រូបដំណោះស្រាយ — ផ្ទៃផ្កាឈូក (#FFF0F5)"
                : activeChannel === "transparent"
                ? "រូបថ្លា — គ្មានផ្ទៃ (TRANSPARENT PNG)"
                : activeChannel === "mask"
                ? "ALPHA MASK DEBUG"
                : "ORIGINAL IMAGE"}
            </span>
          </span>
          <div className="flex items-center gap-3 text-slate-300">
            <span>
              Export: <strong className="text-white">{originalFile && (sourceWidth || sourceHeight) ? \`\${sourceWidth || width}×\${sourceHeight || height}px\` : \`\${width}×\${height}px\`}</strong>
            </span>
          </div>
        </div>

        {/* Primary Download Button for Current View */}
        <button
          type="button"
          data-testid="primary-download"
          onClick={() => handleDownload()}
          disabled={isCompositing}
          className={\`min-h-[48px] flex w-full items-center justify-center gap-2 rounded-none px-5 py-3.5 text-xs font-black tracking-wider uppercase text-white shadow-lg transition-all duration-200 active:scale-[0.98] font-mono \${
            activeChannel === "pink"
              ? "bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 shadow-pink-900/40 hover:shadow-pink-500/25 ring-1 ring-pink-400/40"
              : activeChannel === "transparent"
              ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 shadow-indigo-900/40 hover:shadow-indigo-500/25 ring-1 ring-indigo-400/40"
              : "bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 shadow-cyan-900/40 hover:shadow-cyan-500/25 ring-1 ring-cyan-400/40"
          }\`}
        >
          <Download className="h-4 w-4" />
          <span>
            {activeChannel === "transparent"
              ? "ទាញយករូបថ្លា — គ្មានផ្ទៃ (EXPORT TRANSPARENT PNG)"
              : activeChannel === "pink"
              ? "ទាញយករូបដំណោះស្រាយ — ផ្ទៃផ្កាឈូក (#FFF0F5)"
              : activeChannel === "mask"
              ? "ទាញយកម៉ាសអាល់ហ្វា (ALPHA MASK DEBUG)"
              : "ទាញយករូបសំណួរ — ផ្ទៃស (#FFFFFF)"}
          </span>
        </button>

        {/* Direct 3-Button Quick Download Row */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] text-slate-400 font-mono tracking-wider">
            ទាញយកភ្លាមៗតាមតម្រូវការ (1-CLICK QUICK DOWNLOAD):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono">
            <button
              type="button"
              onClick={() => handleDownload("white")}
              className="min-h-[44px] flex items-center justify-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100 hover:border-cyan-400 hover:text-white transition-colors"
            >
              <span className="h-2.5 w-2.5 bg-white border border-slate-400" />
              <span>ទាញយករូបសំណួរ (ស)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload("pink")}
              className="min-h-[44px] flex items-center justify-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100 hover:border-pink-400 hover:text-white transition-colors"
            >
              <span className="h-2.5 w-2.5 border border-pink-400" style={{ backgroundColor: "#FFF0F5" }} />
              <span>ទាញយករូបដំណោះស្រាយ (ផ្កាឈូក)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload("transparent")}
              className="min-h-[44px] flex items-center justify-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100 hover:border-indigo-400 hover:text-white transition-colors"
            >
              <Grid className="h-3.5 w-3.5 text-indigo-400" />
              <span>ទាញយករូបថ្លា (PNG)</span>
            </button>
          </div>
        </div>

        {/* Secondary Download Actions & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 font-mono border-t border-slate-800">
          <button
            type="button"
            onClick={handleExportTransparentPng}
            className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-cyan-500/40 bg-cyan-950/60 px-3.5 py-1.5 text-cyan-300 hover:bg-cyan-900/70 hover:text-white transition-colors shadow-[0_0_12px_rgba(0,240,255,0.2)] font-bold tracking-wider uppercase"
          >
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            <span>Export Transparent PNG</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="min-h-[44px] flex items-center gap-1.5 rounded-none border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-slate-400 hover:text-rose-300 hover:border-rose-500/30 transition-colors tracking-wider uppercase"
          >
            <RefreshCw className="h-3 w-3" />
            <span>កំណត់ឡើងវិញ (RESET HUD)</span>
          </button>
        </div>
      </div>`;

const newAdvancedSection = `{/* ── Collapsible Advanced Disclosure: Manual Mask Studio & Diagnostic Views ── */}
      <div className="rounded-none border border-slate-800 bg-slate-950 p-3.5 text-xs shadow-inner font-mono">
        <button
          type="button"
          onClick={() => {
            cyberAudio.playClick();
            setIsAdvancedOpen(!isAdvancedOpen);
          }}
          className="min-h-[44px] w-full flex items-center justify-between text-xs text-slate-300 hover:text-cyan-300 font-bold tracking-wider py-1 font-mono"
        >
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-cyan-400" />
            <span>កែគែមដោយដៃ និងឧបករណ៍កម្រិតខ្ពស់ (MANUAL EDGE CORRECTION &amp; ADVANCED TOOLS)</span>
          </div>
          <span className="text-[11px] text-cyan-400">{isAdvancedOpen ? "[-] បិទ (COLLAPSE)" : "[+] បើក (EXPAND)"}</span>
        </button>

        {isAdvancedOpen && (
          <div className="flex flex-col gap-3 pt-3 border-t border-slate-800 mt-2">
            {/* Diagnostic View Toggles */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">របៀបពិនិត្យម៉ាស:</span>
              <button
                type="button"
                onClick={() => handleSelectChannel("mask")}
                className={\`min-h-[44px] flex items-center gap-1.5 rounded-none px-3 py-1.5 text-xs transition-all tracking-wider \${
                  activeChannel === "mask"
                    ? "bg-slate-900 border border-amber-400 text-white font-bold"
                    : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white"
                }\`}
              >
                <Eye className="h-3.5 w-3.5 text-amber-400" />
                <span>ពិនិត្យម៉ាសអាល់ហ្វា (MASK DEBUG)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectChannel("split")}
                className={\`min-h-[44px] flex items-center gap-1.5 rounded-none px-3 py-1.5 text-xs transition-all tracking-wider \${
                  activeChannel === "split"
                    ? "bg-slate-900 border border-emerald-400 text-white font-bold"
                    : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white"
                }\`}
              >
                <Sliders className="h-3.5 w-3.5 text-emerald-400" />
                <span>ស្លាយប្រៀបធៀបរូបដើម (SPLIT SLIDER)</span>
              </button>
            </div>

            {/* Manual Mask Refinement Studio Toolbar */}
` + toolbarContent + `
          </div>
        )}
      </div>`;

const finalFileContent = topPart + '\n\n      ' + previewDeck + '\n\n      ' + newDownloadDeck + '\n\n      ' + newAdvancedSection + '\n    </div>\n  );\n}\n';

fs.writeFileSync(filePath, finalFileContent, 'utf8');
console.log('Successfully reorganized ColorStudio.tsx!');
