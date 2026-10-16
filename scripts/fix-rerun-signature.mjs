import fs from 'fs';

// Update ColorStudio.tsx
let csCode = fs.readFileSync('src/components/bg-remover/ColorStudio.tsx', 'utf8');
csCode = csCode.replace('onRerunFinal?: () => void;', 'onRerunFinal?: (targetMaxDim?: number) => void;');
fs.writeFileSync('src/components/bg-remover/ColorStudio.tsx', csCode, 'utf8');

// Update page.tsx
let pageCode = fs.readFileSync('src/app/bg-remover/page.tsx', 'utf8');
pageCode = pageCode.replace('onRerunFinal={(dim) => handleRunSegmentation("final", dim)}', 'onRerunFinal={(dim?: number) => { handleRunSegmentation("final", dim); }}');
fs.writeFileSync('src/app/bg-remover/page.tsx', pageCode, 'utf8');

console.log('Fixed onRerunFinal signatures');
