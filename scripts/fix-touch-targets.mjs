import fs from 'fs';

// 1. Update BgUploadZone.tsx remove button
let uploadZone = fs.readFileSync('src/components/bg-remover/BgUploadZone.tsx', 'utf8');
uploadZone = uploadZone.replace(
  'className="flex items-center gap-1 border border-slate-700 bg-slate-800/80 px-2 py-1 text-[10px] text-slate-300 hover:text-rose-400 hover:border-rose-500/40 transition-colors uppercase font-mono"',
  'className="min-h-[44px] flex items-center gap-1 border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-rose-400 hover:border-rose-500/40 transition-colors uppercase font-mono"'
);
fs.writeFileSync('src/components/bg-remover/BgUploadZone.tsx', uploadZone, 'utf8');

// 2. Update page.tsx audio button
let page = fs.readFileSync('src/app/bg-remover/page.tsx', 'utf8');
page = page.replace(
  'className="flex items-center gap-2 rounded-none border border-cyan-500/30 bg-slate-950/80 px-2.5 py-1 text-xs shadow-[0_0_10px_rgba(0,240,255,0.08)]"',
  'className="min-h-[44px] flex items-center gap-2 rounded-none border border-cyan-500/30 bg-slate-950/80 px-2.5 py-1 text-xs shadow-[0_0_10px_rgba(0,240,255,0.08)]"'
);
page = page.replace(
  'className="flex items-center gap-1.5 text-cyan-300 hover:text-cyan-100 transition-colors active:scale-[0.98]"',
  'className="min-h-[44px] flex items-center gap-1.5 text-cyan-300 hover:text-cyan-100 transition-colors active:scale-[0.98]"'
);
fs.writeFileSync('src/app/bg-remover/page.tsx', page, 'utf8');

console.log('Updated touch targets to >= 44px');
