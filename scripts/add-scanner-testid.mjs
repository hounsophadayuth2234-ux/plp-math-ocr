import fs from 'fs';

let page = fs.readFileSync('src/app/bg-remover/page.tsx', 'utf8');
page = page.replace(
  '{isProcessing && (\n            <div className="relative overflow-hidden',
  '{isProcessing && (\n            <div data-testid="processing-scanner" className="relative overflow-hidden'
);
page = page.replace(
  '{isProcessing && (\r\n            <div className="relative overflow-hidden',
  '{isProcessing && (\r\n            <div data-testid="processing-scanner" className="relative overflow-hidden'
);
fs.writeFileSync('src/app/bg-remover/page.tsx', page, 'utf8');
console.log('Added data-testid="processing-scanner"');
